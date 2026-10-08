import { randomUUID } from 'node:crypto';
import {
  abilityModifier,
  ABILITY_KEYS,
  applyCombatEvent,
  combatCommandSchema,
  combatEventImportance,
  createCombatEvent,
  describeCombatEvent,
  decideCombat,
  formatModifier,
  getRuleset,
  MONSTERS,
  redactCombatEventForPlayer,
  scaledRoll,
  SIZE_CELLS,
  spellMechanics,
  spellTargets,
  spellZone,
  systemRng,
  type CombatantSpec,
  type CombatCommand,
  type CombatEvent,
  type CombatState,
  type Dnd5eSheet,
  type ResolvedSpell,
} from '@ds/rules';
import type { CombatEventEnvelope, createEncounterSchema, EncounterDto, EncounterSummaryDto, EntityRef } from '@ds/shared';
import { and, asc, desc, eq, like } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, forbidden, notFound } from '../../kernel/errors';
import { isUuid, type CampaignAccess, type Viewer } from '../campaigns/access';
import { campaigns } from '../campaigns/campaigns.tables';
import type { AppendEvent, ChronicleService, EventRow } from '../chronicle/chronicle.service';
import { events } from '../chronicle/chronicle.tables';
import type { CharactersService } from '../characters/characters.service';
import { encounters } from './combat.tables';


type EncounterRow = typeof encounters.$inferSelect;

interface Projection {
  full: CombatState;
  player: CombatState | null;
  lastSeq: number;
}

/**
 * Combat event-sourcé et serveur autoritaire : l'état = reduce(événements de la rencontre).
 * Le même réducteur (@ds/rules) tourne côté serveur, côté client et pour le replay.
 */
export class CombatService {
  private readonly projections = new Map<string, Projection>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: Db,
    private readonly access: CampaignAccess,
    private readonly chronicle: ChronicleService,
    private readonly characters: CharactersService,
    private readonly realtime: Realtime,
  ) {}

  /** Les commandes d'une même rencontre sont traitées l'une après l'autre (pas de course). */
  private serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    const release = () => {
      if (this.locks.get(key) === next) this.locks.delete(key);
    };
    next.then(release, release);
    return next;
  }

  private summary(row: EncounterRow): EncounterSummaryDto {
    return {
      id: row.id,
      campaignId: row.campaignId,
      name: row.name,
      status: row.status,
      round: row.round,
      combatantCount: row.combatantCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async encounter(encounterId: string): Promise<EncounterRow> {
    if (!isUuid(encounterId)) throw notFound('Rencontre introuvable.');
    const row = await this.db.query.encounters.findFirst({ where: eq(encounters.id, encounterId) });
    if (!row) throw notFound('Rencontre introuvable.');
    return row;
  }

  private async streamRows(encounterId: string): Promise<EventRow[]> {
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.correlationId, encounterId), like(events.type, 'combat.%')))
      .orderBy(asc(events.seq));
  }

  private static asCombatEvent(row: Pick<EventRow, 'type' | 'payload'>): CombatEvent {
    return { type: row.type, payload: row.payload } as CombatEvent;
  }

  /** Vue joueur stockée à l'écriture : null = événement invisible pour les joueurs. */
  private static playerEvent(row: EventRow): CombatEvent | null {
    if (row.visibility === 'gm_only') return null;
    return row.playerView ? ({ type: row.playerView.type, payload: row.playerView.payload } as CombatEvent) : CombatService.asCombatEvent(row);
  }

  private async projection(encounterId: string): Promise<Projection> {
    const cached = this.projections.get(encounterId);
    if (cached) return cached;
    const rows = await this.streamRows(encounterId);
    let full: CombatState | null = null;
    let player: CombatState | null = null;
    for (const row of rows) {
      full = applyCombatEvent(full, CombatService.asCombatEvent(row));
      const pe = CombatService.playerEvent(row);
      if (pe) player = applyCombatEvent(player, pe);
    }
    if (!full) throw notFound('Rencontre vide.');
    const projection = { full, player, lastSeq: rows[rows.length - 1]?.seq ?? 0 };
    this.projections.set(encounterId, projection);
    return projection;
  }

  private envelope(row: EventRow, event: CombatEvent): CombatEventEnvelope {
    return { seq: row.seq, eventId: row.id, occurredAt: row.occurredAt.toISOString(), actorUserId: row.authorId, event };
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  async list(campaignId: string, viewer: Viewer): Promise<EncounterSummaryDto[]> {
    await this.access.require(campaignId, viewer.userId);
    const rows = await this.db.select().from(encounters).where(eq(encounters.campaignId, campaignId)).orderBy(desc(encounters.updatedAt));
    return rows.map((r) => this.summary(r));
  }

  async get(encounterId: string, userId: string): Promise<EncounterDto> {
    const row = await this.encounter(encounterId);
    const role = await this.access.require(row.campaignId, userId);
    const p = await this.projection(encounterId);
    const state = role === 'gm' ? p.full : p.player;
    if (!state) throw notFound('Rencontre introuvable.');
    return { ...this.summary(row), state, lastSeq: p.lastSeq };
  }

  /** Flux complet (filtré selon le rôle) pour le lecteur de replay (CMB-61). */
  async stream(encounterId: string, userId: string): Promise<CombatEventEnvelope[]> {
    const row = await this.encounter(encounterId);
    const role = await this.access.require(row.campaignId, userId);
    const rows = await this.streamRows(encounterId);
    return rows.flatMap((r) => {
      const e = role === 'gm' ? CombatService.asCombatEvent(r) : CombatService.playerEvent(r);
      return e ? [this.envelope(r, e)] : [];
    });
  }

  // ───────────────────────────── Écriture ─────────────────────────────

  async create(campaignId: string, viewer: Viewer, input: z.infer<typeof createEncounterSchema>): Promise<EncounterDto> {
    if (viewer.role !== 'gm') throw badRequest('Seul le MJ prépare un combat.');
    const campaign = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw notFound();
    const id = randomUUID();
    await this.db.insert(encounters).values({ id, campaignId, name: input.name });
    const created = createCombatEvent(id, input.name, input.cols, input.rows, {
      diagonalRule: input.diagonalRule ?? campaign.settings.diagonalRule,
      hideMonsterStats: input.hideMonsterStats,
    });
    await this.persist(campaignId, id, viewer, null, [created]);
    if (input.includeParty) {
      const party = await this.characters.partyOf(campaignId);
      if (party.length) await this.execute(id, viewer.userId, party.map((c) => ({ type: 'add_character', characterId: c.id }) as CombatCommand));
    }
    this.realtime.changed(campaignId, 'encounters', id);
    return this.get(id, viewer.userId);
  }

  async remove(encounterId: string, userId: string): Promise<void> {
    const row = await this.encounter(encounterId);
    await this.access.requireGm(row.campaignId, userId);
    await this.db.delete(encounters).where(eq(encounters.id, encounterId));
    this.projections.delete(encounterId);
    this.realtime.changed(row.campaignId, 'encounters', encounterId);
  }

  /** Point d'entrée des commandes (REST) : validation, décision, persistance, diffusion. */
  async command(encounterId: string, userId: string, raw: unknown): Promise<CombatEventEnvelope[]> {
    const command = combatCommandSchema.parse(raw);
    return this.execute(encounterId, userId, [command]);
  }

  private async execute(encounterId: string, userId: string, commands: CombatCommand[]): Promise<CombatEventEnvelope[]> {
    return this.serialize(encounterId, async () => {
      const row = await this.encounter(encounterId);
      const viewer: Viewer = { userId, role: await this.access.require(row.campaignId, userId) };
      const projection = await this.projection(encounterId);
      let working = projection.full;
      const produced: CombatEvent[] = [];
      const ctx = { rng: systemRng, newId: () => randomUUID() };
      for (const command of commands) {
        for (const resolved of await this.resolve(row.campaignId, working, command, viewer)) {
          for (const e of decideCombat(working, resolved, viewer, ctx)) {
            produced.push(e);
            working = applyCombatEvent(working, e);
          }
        }
      }
      const envelopes = await this.persist(row.campaignId, encounterId, viewer, projection, produced);
      return viewer.role === 'gm' ? envelopes.gm : envelopes.players;
    });
  }

  /**
   * Sort du grimoire d'un PJ : l'emplacement est dépensé sur la fiche (événement de Chronique),
   * puis le sort est entièrement spécifié (DD, attaque, dégâts à l'échelle, gabarit, cibles).
   */
  private async resolveSpell(state: CombatState, command: Extract<CombatCommand, { type: 'cast_spell' }>, viewer: Viewer): Promise<ResolvedSpell> {
    if (state.status === 'ended') throw badRequest('Ce combat est terminé.');
    const caster = state.combatants[command.casterId];
    if (!caster) throw notFound('Créature introuvable dans ce combat.');
    if (!caster.characterId) throw badRequest('Seuls les personnages lancent des sorts de leur grimoire.');
    if (viewer.role !== 'gm' && caster.ownerUserId !== viewer.userId) throw forbidden(`Vous ne contrôlez pas ${caster.name}.`);
    const character = await this.characters.act(caster.characterId, viewer.userId, { type: 'cast_spell', spellId: command.spellId, slotLevel: command.slotLevel });
    const sheet = character.sheet!;
    const derived = character.derived!;
    const spell = sheet.spellcasting?.spells.find((s) => s.id === command.spellId);
    if (!spell || !sheet.spellcasting) throw notFound('Sort introuvable.');
    const m = spellMechanics(spell);
    const level = Math.max(spell.level, command.slotLevel);
    const roll = scaledRoll(m, level, sheet.level);
    const mod = derived.modifiers[sheet.spellcasting.ability];
    const aim = command.aim ?? (m.selfOrigin ? caster.position : null);
    const zone = m.area && aim ? spellZone(m, caster.position, aim, state.map.cellMeters) : null;
    let targetIds = command.targetIds.filter((id) => state.combatants[id]);
    if (zone) {
      // Gabarit : toutes les créatures touchées, ou celles retenues par le lanceur parmi elles.
      const inZone = spellTargets(state, zone, caster.id, m.selfOrigin);
      targetIds = targetIds.length ? inZone.filter((id) => targetIds.includes(id)) : inZone;
    } else {
      targetIds = (m.attack ? targetIds : [...new Set(targetIds)]).slice(0, m.targets);
    }
    return {
      type: 'resolve_spell',
      casterId: caster.id,
      name: spell.name,
      level,
      targetIds,
      ...(zone ? { zone } : {}),
      keepZone: !!zone && command.keepZone,
      ...(m.attack && derived.spellAttack !== null ? { attack: { bonus: derived.spellAttack } } : {}),
      ...(m.save && derived.spellSaveDc !== null ? { save: { ability: m.save, dc: derived.spellSaveDc, half: m.half } } : {}),
      ...(roll && !m.heal ? { damage: { notation: roll, ...(m.damageType ? { type: m.damageType } : {}) } } : {}),
      ...(roll && m.heal ? { heal: { notation: `${roll}${formatModifier(mod)}` } } : {}),
      ...(m.condition ? { condition: m.condition } : {}),
      concentration: m.concentration,
      cost: m.cost,
    };
  }

  /** Remplace les références (fiche, bestiaire, grimoire) par des commandes entièrement spécifiées. */
  private async resolve(campaignId: string, state: CombatState, command: CombatCommand, viewer: Viewer): Promise<(Exclude<CombatCommand, { type: 'add_character' | 'add_monster' | 'cast_spell' }> | ResolvedSpell)[]> {
    if (command.type === 'cast_spell') return [await this.resolveSpell(state, command, viewer)];
    if (command.type === 'add_character') {
      const [c] = await this.characters.rowsByIds([command.characterId]);
      if (!c || c.campaignId !== campaignId || c.kind !== 'pc' || !c.sheet) throw notFound('Personnage introuvable dans cette campagne.');
      if (Object.values(state.combatants).some((x) => x.characterId === c.id)) throw badRequest(`${c.name} est déjà dans ce combat.`);
      const profile = getRuleset(c.rulesetId).combatProfile(c.sheet as unknown as Dnd5eSheet);
      const spec: CombatantSpec = {
        name: c.name, kind: 'pc', side: 'ally', ...profile, size: 1, position: command.position ?? null,
        characterId: c.id, monsterId: null, ownerUserId: c.ownerId, hidden: false,
        portraitUrl: c.portraitUrl, modelUrl: c.modelUrl,
      };
      return [{ type: 'add_combatant', spec }];
    }
    if (command.type === 'add_monster') {
      const m = MONSTERS.find((x) => x.id === command.monsterId);
      if (!m) throw notFound('Créature inconnue du bestiaire.');
      const already = Object.values(state.combatants).filter((x) => x.monsterId === m.id).length;
      const dexMod = Math.floor((m.abilities.dex - 10) / 2);
      const attack = m.attacks[0] ? { name: m.attacks[0].name, bonus: m.attacks[0].bonus, damage: m.attacks[0].damage, damageType: m.attacks[0].damageType } : null;
      return Array.from({ length: command.count }, (_, i) => ({
        type: 'add_combatant' as const,
        spec: {
          name: command.count > 1 || already > 0 ? `${m.name} ${already + i + 1}` : m.name,
          kind: 'monster' as const, side: 'enemy' as const, hp: m.hp, maxHp: m.hp, ac: m.ac, initiativeMod: dexMod,
          speed: m.speed, size: SIZE_CELLS[m.size], position: i === 0 ? (command.position ?? null) : null,
          characterId: null, monsterId: m.id, ownerUserId: null, attack, portraitUrl: null, modelUrl: null,
          saves: Object.fromEntries(ABILITY_KEYS.map((k) => [k, abilityModifier(m.abilities[k])])),
          defenses: {
            resistances: (m.defenses?.resistances ?? []).map((damage) => ({ damage })),
            immunities: (m.defenses?.immunities ?? []).map((damage) => ({ damage })),
            vulnerabilities: (m.defenses?.vulnerabilities ?? []).map((damage) => ({ damage })),
          },
        },
      }));
    }
    return [command];
  }

  private ref(state: CombatState | null, id: string): EntityRef {
    const c = state?.combatants[id];
    return c?.characterId ? { kind: 'character', id: c.characterId, name: c.name } : { kind: 'free', id: null, name: c?.name ?? 'Créature' };
  }

  /** Persiste les événements (vue complète + vue joueur), met à jour projections et diffuse. */
  private async persist(
    campaignId: string,
    encounterId: string,
    viewer: Viewer,
    projection: Projection | null,
    produced: CombatEvent[],
  ): Promise<{ gm: CombatEventEnvelope[]; players: CombatEventEnvelope[] }> {
    if (produced.length === 0) return { gm: [], players: [] };
    let full: CombatState | null = projection?.full ?? null;
    let player: CombatState | null = projection?.player ?? null;
    const inputs: AppendEvent[] = [];
    const playerEvents: (CombatEvent | null)[] = [];
    for (const e of produced) {
      const pe = redactCombatEventForPlayer(e, full);
      const title = describeCombatEvent(e, full);
      const actors: EntityRef[] = [];
      const targets: EntityRef[] = [];
      if (e.type === 'combat.attack_rolled') {
        actors.push(this.ref(full, e.payload.attackerId));
        targets.push(this.ref(full, e.payload.targetId));
      } else if (e.type === 'combat.hp_changed') {
        targets.push(this.ref(full, e.payload.id));
      }
      inputs.push({
        campaignId,
        type: e.type,
        title,
        category: 'combat',
        importance: combatEventImportance(e),
        visibility: pe ? 'players' : 'gm_only',
        playerView: pe && pe !== e ? { type: pe.type, title: describeCombatEvent(pe, player), payload: pe.payload as Record<string, unknown> } : null,
        payload: e.payload as Record<string, unknown>,
        actors,
        targets,
        correlationId: encounterId,
        source: viewer.role === 'gm' ? 'gm' : 'player',
        authorId: viewer.userId,
      });
      playerEvents.push(pe);
      full = applyCombatEvent(full, e);
      if (pe) player = applyCombatEvent(player, pe);
    }

    const rows = await this.db.transaction(async (tx) => {
      const appended = await this.chronicle.appendMany(campaignId, inputs, tx);
      await tx
        .update(encounters)
        .set({ status: full!.status, round: full!.round, combatantCount: Object.keys(full!.combatants).length, updatedAt: new Date() })
        .where(eq(encounters.id, encounterId));
      return appended;
    });
    this.projections.set(encounterId, { full: full!, player, lastSeq: rows[rows.length - 1]!.seq });

    const gm = rows.map((r, i) => this.envelope(r, produced[i]!));
    const players = rows.flatMap((r, i) => (playerEvents[i] ? [this.envelope(r, playerEvents[i]!)] : []));
    this.realtime.toCampaign(campaignId, 'combat:events', { encounterId, events: gm }, { encounterId, events: players });
    await this.chronicle.publish(rows);
    await this.syncCharacterHp(full!, produced);
    return { gm, players };
  }

  /** Les PV des PJ blessés en combat sont reportés sur leur fiche. */
  private async syncCharacterHp(state: CombatState, produced: CombatEvent[]): Promise<void> {
    const touched = new Set(produced.flatMap((e) => (e.type === 'combat.hp_changed' ? [e.payload.id] : [])));
    for (const id of touched) {
      const c = state.combatants[id];
      if (c?.characterId && c.hp !== null) await this.characters.syncHp(c.characterId, c.hp, c.tempHp);
    }
  }
}
