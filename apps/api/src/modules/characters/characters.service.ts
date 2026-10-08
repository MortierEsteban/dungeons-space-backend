import { randomUUID } from 'node:crypto';
import {
  abilityModifier,
  applyCustomClass,
  applyDamage,
  applyHealing,
  getRuleset,
  levelUp,
  longRest,
  rollDice,
  setTempHp,
  shortRest,
  spendResource,
  systemRng,
  type ClassDef,
  type DerivedSheet,
  type Dnd5eSheet,
} from '@ds/rules';
import {
  creationToClass,
  type characterActionSchema,
  type CharacterDto,
  type CharacterSummaryDto,
  type createCharacterSchema,
  type noteSchema,
  type NoteDto,
  type NpcData,
  type updateCharacterSchema,
} from '@ds/shared';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, forbidden, notFound } from '../../kernel/errors';
import { isUuid, type CampaignAccess, type SessionClock, type Viewer } from '../campaigns/access';
import { campaigns, memberships } from '../campaigns/campaigns.tables';
import type { AppendEvent, ChronicleService } from '../chronicle/chronicle.service';
import type { ConstellationService } from '../constellation/constellation.service';
import { creations } from '../compendium/compendium.tables';
import { users } from '../identity/identity.tables';
import { characters, notes } from './characters.tables';

type CharacterRow = typeof characters.$inferSelect;
type Action = z.infer<typeof characterActionSchema>;

/** Événement de Chronique produit par une action sur la fiche. */
type ActionEvent = Pick<AppendEvent, 'type' | 'title' | 'text' | 'importance' | 'payload'>;

export class CharactersService {
  constructor(
    private readonly db: Db,
    private readonly access: CampaignAccess,
    private readonly chronicle: ChronicleService,
    private readonly constellation: ConstellationService,
    private readonly realtime: Realtime,
    private readonly clock: SessionClock,
  ) {}

  // ───────────────────────────── Projections ─────────────────────────────

  private canEdit(row: CharacterRow, viewer: Viewer): boolean {
    return viewer.role === 'gm' || (row.kind === 'pc' && row.ownerId === viewer.userId);
  }

  private canSee(row: CharacterRow, viewer: Viewer): boolean {
    return viewer.role === 'gm' || row.kind === 'pc' || row.visibleToPlayers;
  }

  private sheetOf(row: CharacterRow): Dnd5eSheet | null {
    return row.kind === 'pc' && row.sheet ? (row.sheet as unknown as Dnd5eSheet) : null;
  }

  private summary(row: CharacterRow, viewer: Viewer, campaignName: string, ownerName: string | null): CharacterSummaryDto {
    const sheet = this.sheetOf(row);
    const npc = row.npc;
    return {
      id: row.id,
      campaignId: row.campaignId,
      campaignName,
      kind: row.kind,
      name: row.name,
      ownerId: row.ownerId,
      ownerName,
      portraitUrl: row.portraitUrl,
      modelUrl: row.modelUrl,
      subtitle: sheet ? `${sheet.species} · ${sheet.className} ${sheet.level}` : [npc?.species, npc?.job].filter(Boolean).join(' · '),
      level: sheet?.level ?? null,
      hp: sheet ? { current: sheet.hp.current, max: sheet.hp.max } : null,
      canEdit: this.canEdit(row, viewer),
    };
  }

  private async dto(row: CharacterRow, viewer: Viewer): Promise<CharacterDto> {
    const campaign = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, row.campaignId), columns: { name: true } });
    const owner = row.ownerId ? await this.db.query.users.findFirst({ where: eq(users.id, row.ownerId), columns: { displayName: true } }) : null;
    const sheet = this.sheetOf(row);
    const ruleset = getRuleset(row.rulesetId);
    const npc: NpcData | null = row.npc ? { ...row.npc, secret: viewer.role === 'gm' ? row.npc.secret : '', notes: viewer.role === 'gm' ? row.npc.notes : '' } : null;
    return {
      ...this.summary(row, viewer, campaign?.name ?? '', owner?.displayName ?? null),
      rulesetId: row.rulesetId,
      sheet,
      derived: sheet ? (ruleset.derive(sheet) as DerivedSheet) : null,
      npc,
      visibleToPlayers: row.visibleToPlayers,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Charge un personnage et le rôle de l'utilisateur dans sa campagne. */
  async loadFor(id: string, userId: string): Promise<{ row: CharacterRow; viewer: Viewer }> {
    if (!isUuid(id)) throw notFound('Personnage introuvable.');
    const row = await this.db.query.characters.findFirst({ where: eq(characters.id, id) });
    if (!row) throw notFound('Personnage introuvable.');
    const viewer: Viewer = { userId, role: await this.access.require(row.campaignId, userId) };
    if (!this.canSee(row, viewer)) throw notFound('Personnage introuvable.');
    return { row, viewer };
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  async list(campaignId: string, viewer: Viewer): Promise<CharacterSummaryDto[]> {
    const rows = await this.db
      .select({ c: characters, owner: users.displayName, campaign: campaigns.name })
      .from(characters)
      .innerJoin(campaigns, eq(campaigns.id, characters.campaignId))
      .leftJoin(users, eq(users.id, characters.ownerId))
      .where(
        and(
          eq(characters.campaignId, campaignId),
          viewer.role === 'gm' ? undefined : or(eq(characters.kind, 'pc'), eq(characters.visibleToPlayers, true)),
        ),
      )
      .orderBy(characters.kind, characters.name);
    return rows.map((r) => this.summary(r.c, viewer, r.campaign, r.owner));
  }

  /** « Mes personnages » : PJ possédés par l'utilisateur, toutes campagnes confondues. */
  async listMine(userId: string): Promise<CharacterSummaryDto[]> {
    const rows = await this.db
      .select({ c: characters, campaign: campaigns.name, role: memberships.role })
      .from(characters)
      .innerJoin(campaigns, eq(campaigns.id, characters.campaignId))
      .innerJoin(memberships, and(eq(memberships.campaignId, characters.campaignId), eq(memberships.userId, userId)))
      .where(and(eq(characters.ownerId, userId), eq(characters.kind, 'pc')))
      .orderBy(desc(characters.updatedAt));
    return rows.map((r) => this.summary(r.c, { userId, role: r.role }, r.campaign, null));
  }

  async get(id: string, userId: string): Promise<CharacterDto> {
    const { row, viewer } = await this.loadFor(id, userId);
    return this.dto(row, viewer);
  }

  // ───────────────────────────── Écriture ─────────────────────────────

  async create(campaignId: string, viewer: Viewer, input: z.infer<typeof createCharacterSchema>): Promise<CharacterDto> {
    const campaign = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw notFound();
    const ruleset = getRuleset(campaign.rulesetId);

    if (input.kind === 'npc') {
      if (viewer.role !== 'gm') throw forbidden('Seul le MJ crée des PNJ.');
      const [row] = await this.db
        .insert(characters)
        .values({ campaignId, kind: 'npc', name: input.name, rulesetId: campaign.rulesetId, npc: input.npc, visibleToPlayers: input.visibleToPlayers, portraitUrl: input.portraitUrl ?? null })
        .returning();
      if (input.addToConstellation) {
        await this.constellation.ensureNodeFor(campaignId, { type: 'character', id: row!.id, label: row!.name, kind: 'npc', playerVisible: input.visibleToPlayers });
      }
      await this.chronicle.appendAndPublish({
        campaignId,
        type: 'character.created',
        title: `${input.name} entre en scène`,
        text: [input.npc.species, input.npc.job].filter(Boolean).join(', '),
        visibility: input.visibleToPlayers ? 'players' : 'gm_only',
        actors: [{ kind: 'character', id: row!.id, name: row!.name }],
        source: 'gm',
        authorId: viewer.userId,
      });
      this.realtime.changed(campaignId, 'characters');
      return this.dto(row!, viewer);
    }

    let ownerId = viewer.userId;
    if (input.ownerId && input.ownerId !== viewer.userId) {
      if (viewer.role !== 'gm') throw forbidden('Seul le MJ crée un personnage pour un autre joueur.');
      if (!(await this.access.roleOf(campaignId, input.ownerId))) throw badRequest("Ce joueur n'est pas membre de la campagne.");
      ownerId = input.ownerId;
    }
    const customClass = input.classRef ? await this.homebrewClass(campaignId, viewer.userId, input.classRef) : undefined;
    const sheet = ruleset.createSheet({
      species: input.species,
      className: customClass?.name ?? input.className,
      ...(customClass ? { customClass, classRef: input.classRef } : {}),
      level: input.level ?? campaign.settings.startLevel,
      background: input.background,
      alignment: input.alignment,
      abilities: input.abilities,
      skills: input.skills,
    }) as Dnd5eSheet;
    if (input.portraitUrl) sheet.portraitUrl = input.portraitUrl;
    const [row] = await this.db
      .insert(characters)
      .values({ campaignId, ownerId, kind: 'pc', name: input.name, rulesetId: campaign.rulesetId, sheet: sheet as unknown as Record<string, unknown>, portraitUrl: input.portraitUrl ?? null })
      .returning();
    await this.constellation.ensureNodeFor(campaignId, { type: 'character', id: row!.id, label: row!.name, kind: 'pc', playerVisible: true });
    await this.chronicle.appendAndPublish({
      campaignId,
      type: 'character.created',
      title: `${input.name} rejoint le groupe`,
      text: `${sheet.species} · ${sheet.className} niveau ${sheet.level}`,
      actors: [{ kind: 'character', id: row!.id, name: row!.name }],
      source: viewer.role === 'gm' ? 'gm' : 'player',
      authorId: viewer.userId,
    });
    this.realtime.changed(campaignId, 'characters', row!.id);
    return this.dto(row!, viewer);
  }

  /** Classe de la Forge utilisable dans cette campagne : la sienne, ou une création rattachée à la campagne. */
  private async homebrewClass(campaignId: string, userId: string, creationId: string): Promise<ClassDef> {
    const row = isUuid(creationId)
      ? await this.db.query.creations.findFirst({ where: and(eq(creations.id, creationId), eq(creations.kind, 'Classe'), or(eq(creations.ownerId, userId), eq(creations.campaignId, campaignId))) })
      : undefined;
    const def = row && creationToClass({ ...row.data, id: row.id });
    if (!def) throw badRequest('Classe personnalisée introuvable ou incomplète.');
    return def;
  }

  /** Une classe de la Forge a changé : chaque fiche qui la suit reçoit la nouvelle définition. */
  async syncCustomClass(creationId: string, def: ClassDef): Promise<void> {
    const rows = await this.db.select().from(characters).where(sql`${characters.sheet}->>'classRef' = ${creationId}`);
    for (const row of rows) {
      const sheet = this.sheetOf(row);
      if (!sheet) continue;
      await this.db
        .update(characters)
        .set({ sheet: applyCustomClass(sheet, def) as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(characters.id, row.id));
      this.realtime.changed(row.campaignId, 'characters', row.id);
    }
  }

  async update(id: string, userId: string, patch: z.infer<typeof updateCharacterSchema>): Promise<CharacterDto> {
    const { row, viewer } = await this.loadFor(id, userId);
    if (!this.canEdit(row, viewer)) throw forbidden('Vous ne pouvez modifier que votre propre fiche.');
    const values: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
    if (patch.name) values.name = patch.name;
    if (patch.portraitUrl !== undefined) values.portraitUrl = patch.portraitUrl;
    if (patch.modelUrl !== undefined) values.modelUrl = patch.modelUrl;
    if (patch.visibleToPlayers !== undefined && viewer.role === 'gm') values.visibleToPlayers = patch.visibleToPlayers;
    if (patch.npc) {
      if (row.kind !== 'npc') throw badRequest('Seul un PNJ possède ces champs.');
      values.npc = { ...(row.npc as NpcData), ...patch.npc };
    }
    if (patch.sheet) {
      if (row.kind !== 'pc') throw badRequest('Un PNJ n’a pas de fiche complète.');
      const parsed = getRuleset(row.rulesetId).sheetSchema.safeParse(patch.sheet);
      if (!parsed.success) throw badRequest('Fiche invalide : ' + (parsed.error.issues[0]?.message ?? ''), parsed.error.issues);
      values.sheet = parsed.data as Record<string, unknown>;
    }
    const [updated] = await this.db.update(characters).set(values).where(eq(characters.id, id)).returning();
    this.realtime.changed(row.campaignId, 'characters', id);
    return this.dto(updated!, viewer);
  }

  async remove(id: string, userId: string): Promise<void> {
    const { row, viewer } = await this.loadFor(id, userId);
    if (!this.canEdit(row, viewer)) throw forbidden();
    await this.db.delete(characters).where(eq(characters.id, id));
    this.realtime.changed(row.campaignId, 'characters', id);
  }

  /** Applique une action de jeu sur la fiche et l'inscrit dans la Chronique. */
  async act(id: string, userId: string, action: Action): Promise<CharacterDto> {
    const { row, viewer } = await this.loadFor(id, userId);
    if (!this.canEdit(row, viewer)) throw forbidden('Vous ne pouvez agir que sur votre propre personnage.');
    const sheet = this.sheetOf(row);
    if (!sheet) throw badRequest('Ce personnage n’a pas de fiche.');
    const { next, event } = this.applyAction(row.name, sheet, action);
    const [updated] = await this.db
      .update(characters)
      .set({ sheet: next as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();
    if (event) {
      await this.chronicle.appendAndPublish({
        campaignId: row.campaignId,
        ...event,
        actors: [{ kind: 'character', id: row.id, name: row.name }],
        source: viewer.role === 'gm' ? 'gm' : 'player',
        authorId: userId,
      });
    }
    this.realtime.changed(row.campaignId, 'characters', id);
    return this.dto(updated!, viewer);
  }

  /** Logique pure de chaque action (règles déléguées à @ds/rules). */
  private applyAction(name: string, sheet: Dnd5eSheet, action: Action): { next: Dnd5eSheet; event: ActionEvent | null } {
    switch (action.type) {
      case 'damage': {
        const next = applyDamage(sheet, action.amount);
        const down = next.hp.current === 0 && sheet.hp.current > 0;
        return {
          next,
          event: {
            type: 'character.hp_changed',
            title: down ? `${name} tombe à terre` : `${name} subit ${action.amount} dégâts`,
            importance: down ? 3 : 1,
            payload: { mode: 'damage', amount: action.amount, hpBefore: sheet.hp.current, hpAfter: next.hp.current },
          },
        };
      }
      case 'heal': {
        const next = applyHealing(sheet, action.amount);
        return { next, event: { type: 'character.hp_changed', title: `${name} récupère ${next.hp.current - sheet.hp.current} PV`, payload: { mode: 'heal', amount: action.amount, hpBefore: sheet.hp.current, hpAfter: next.hp.current } } };
      }
      case 'temp_hp':
        return { next: setTempHp(sheet, action.amount), event: null };
      case 'short_rest': {
        const available = sheet.hitDice.total - sheet.hitDice.used;
        const spent = Math.min(action.hitDice, available);
        const conMod = abilityModifier(sheet.abilities.con);
        let healed = 0;
        for (let i = 0; i < spent; i++) healed += Math.max(0, rollDice(`1d${sheet.hitDice.die}`, systemRng).total + conMod);
        const next = shortRest(sheet, spent, healed);
        return { next, event: { type: 'character.rested', title: `${name} prend un repos court`, text: spent ? `${spent} dé(s) de vie, ${healed} PV récupérés.` : '', payload: { kind: 'short', hitDice: spent, healed } } };
      }
      case 'long_rest':
        return { next: longRest(sheet), event: { type: 'character.rested', title: `${name} prend un repos long`, payload: { kind: 'long' } } };
      case 'gain_xp': {
        const next = { ...sheet, xp: sheet.xp + action.amount };
        return { next, event: { type: 'character.xp_gained', title: `${name} gagne ${action.amount} XP`, text: action.reason, payload: { amount: action.amount, total: next.xp } } };
      }
      case 'level_up': {
        const next = levelUp(sheet);
        if (!next) throw badRequest('Le niveau 20 est déjà atteint.');
        return { next, event: { type: 'character.level_up', title: `${name} atteint le niveau ${next.level}`, payload: { level: next.level, hpMax: next.hp.max } } };
      }
      case 'add_item': {
        const item = { ...action.item, id: randomUUID() };
        return {
          next: { ...sheet, inventory: [...sheet.inventory, item] },
          event: { type: 'item.acquired', title: `${name} obtient ${item.qty > 1 ? `${item.qty} × ` : ''}${item.name}`, importance: item.rarity === 'Commun' ? 1 : 2, payload: { item } },
        };
      }
      case 'remove_item': {
        const item = sheet.inventory.find((i) => i.id === action.itemId);
        if (!item) throw notFound('Objet introuvable dans l’inventaire.');
        return { next: { ...sheet, inventory: sheet.inventory.filter((i) => i.id !== action.itemId) }, event: { type: 'item.removed', title: `${name} se sépare de ${item.name}`, payload: { item } } };
      }
      case 'add_spell': {
        if (!sheet.spellcasting) throw badRequest('Ce personnage ne lance pas de sorts.');
        const spell = { ...action.spell, id: randomUUID() };
        return { next: { ...sheet, spellcasting: { ...sheet.spellcasting, spells: [...sheet.spellcasting.spells, spell] } }, event: null };
      }
      case 'cast_spell': {
        const sc = sheet.spellcasting;
        const spell = sc?.spells.find((s) => s.id === action.spellId);
        if (!sc || !spell) throw notFound('Sort introuvable.');
        if (spell.level === 0) {
          return { next: sheet, event: { type: 'character.spell_cast', title: `${name} lance ${spell.name}`, payload: { spell: spell.name, level: 0 } } };
        }
        const level = Math.max(spell.level, action.slotLevel);
        const slot = sc.slots[String(level)];
        if (!slot || slot.used >= slot.max) throw badRequest("Plus d'emplacement disponible pour ce sort.");
        const next = { ...sheet, spellcasting: { ...sc, slots: { ...sc.slots, [String(level)]: { ...slot, used: slot.used + 1 } } } };
        return { next, event: { type: 'character.spell_cast', title: `${name} lance ${spell.name}${level > spell.level ? ` (niveau ${level})` : ''}`, payload: { spell: spell.name, level } } };
      }
      case 'use_resource': {
        const d = getRuleset('dnd5e-srd51').derive(sheet) as DerivedSheet;
        const res = d.resources.find((r) => r.id === action.resourceId);
        if (!res) throw notFound('Ressource inconnue.');
        if (action.amount > 0 && res.used + action.amount > res.max) throw badRequest(`Plus assez de « ${res.name} » (${res.max - res.used} restant).`);
        return { next: spendResource(sheet, action.resourceId, action.amount), event: null };
      }
      case 'death_save': {
        const ds = { ...sheet.deathSaves };
        if (action.success) ds.successes = Math.min(3, ds.successes + 1);
        else ds.failures = Math.min(3, ds.failures + 1);
        const next = { ...sheet, deathSaves: ds };
        if (ds.failures >= 3) return { next, event: { type: 'character.died', title: `Mort de ${name}`, importance: 5, payload: {} } };
        if (ds.successes >= 3) return { next, event: { type: 'character.hp_changed', title: `${name} est stabilisé`, importance: 2, payload: { stabilized: true } } };
        return { next, event: null };
      }
    }
  }

  // ───────────────────────────── Notes (FND-17) ─────────────────────────────

  private noteDto(n: typeof notes.$inferSelect, authorName: string): NoteDto {
    return {
      id: n.id, characterId: n.characterId, authorId: n.authorId, authorName, title: n.title, body: n.body,
      pinned: n.pinned, shared: n.shared, sessionNo: n.sessionNo, updatedAt: n.updatedAt.toISOString(),
    };
  }

  /** Notes visibles : les siennes (privées ou partagées) + les notes partagées des autres. */
  async listNotes(characterId: string, userId: string): Promise<NoteDto[]> {
    await this.loadFor(characterId, userId);
    const rows = await this.db
      .select({ n: notes, author: users.displayName })
      .from(notes)
      .innerJoin(users, eq(users.id, notes.authorId))
      .where(and(eq(notes.characterId, characterId), or(eq(notes.authorId, userId), eq(notes.shared, true))))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));
    return rows.map((r) => this.noteDto(r.n, r.author));
  }

  async createNote(characterId: string, userId: string, input: z.infer<typeof noteSchema>): Promise<NoteDto> {
    const { row } = await this.loadFor(characterId, userId);
    const sessionNo = await this.clock.current(row.campaignId);
    const [n] = await this.db.insert(notes).values({ characterId, authorId: userId, ...input, sessionNo }).returning();
    const author = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { displayName: true } });
    return this.noteDto(n!, author?.displayName ?? '');
  }

  async updateNote(noteId: string, userId: string, input: Partial<z.infer<typeof noteSchema>>): Promise<NoteDto> {
    if (!isUuid(noteId)) throw notFound();
    const [n] = await this.db.update(notes).set({ ...input, updatedAt: new Date() }).where(and(eq(notes.id, noteId), eq(notes.authorId, userId))).returning();
    if (!n) throw notFound('Note introuvable.');
    const author = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { displayName: true } });
    return this.noteDto(n, author?.displayName ?? '');
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    if (!isUuid(noteId)) throw notFound();
    await this.db.delete(notes).where(and(eq(notes.id, noteId), eq(notes.authorId, userId)));
  }

  /** Utilisé par le combat : profils des PJ d'une campagne. */
  async partyOf(campaignId: string): Promise<CharacterRow[]> {
    return this.db.select().from(characters).where(and(eq(characters.campaignId, campaignId), eq(characters.kind, 'pc')));
  }

  /** Report des PV depuis un combat (l'événement est déjà journalisé par le module Combat). */
  async syncHp(characterId: string, current: number, temp: number): Promise<void> {
    const row = await this.db.query.characters.findFirst({ where: eq(characters.id, characterId) });
    const sheet = row && this.sheetOf(row);
    if (!row || !sheet) return;
    const next = { ...sheet, hp: { ...sheet.hp, current: Math.min(current, sheet.hp.max), temp } };
    await this.db.update(characters).set({ sheet: next as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(characters.id, characterId));
    this.realtime.changed(row.campaignId, 'characters', characterId);
  }

  async rowsByIds(ids: string[]): Promise<CharacterRow[]> {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) return [];
    return this.db.select().from(characters).where(inArray(characters.id, valid));
  }
}
