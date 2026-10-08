import { listRulesets, searchCompendium, findCompendiumEntry, type CompendiumEntry } from '@ds/rules';
import { creationToClass, creationToItem, creationToSpell, type CharacterDto, type Creation, type CreationDto, type CreationKind, type RulesetDto, type SharedCreationDto } from '@ds/shared';
import { and, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../../infra/db/client';
import { badRequest, notFound } from '../../kernel/errors';
import { isUuid } from '../campaigns/access';
import { campaigns, memberships } from '../campaigns/campaigns.tables';
import type { CharactersService } from '../characters/characters.service';
import { users } from '../identity/identity.tables';
import { creations } from './compendium.tables';

type CreationRow = typeof creations.$inferSelect;

const toDto = (r: CreationRow): CreationDto => ({
  ...r.data,
  shared: r.shared,
  id: r.id,
  ownerId: r.ownerId,
  campaignId: r.campaignId,
  sourceId: r.sourceId,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const ITEM_KINDS = new Set<CreationKind>(['Arme', 'Armure', 'Objet merveilleux', 'Potion']);

/** Le Sanctuaire : compendium SRD (lecture seule, versionné dans le ruleset) + la Forge (homebrew) + la bibliothèque partagée. */
export class CompendiumService {
  constructor(
    private readonly db: Db,
    private readonly characters: CharactersService,
  ) {}

  rulesets(): RulesetDto[] {
    return listRulesets().map((r) => ({ id: r.id, name: r.name, version: r.version, license: r.license, attribution: r.attribution }));
  }

  search(q: string | undefined, kind: CompendiumEntry['kind'] | undefined): CompendiumEntry[] {
    return searchCompendium({ ...(q ? { q } : {}), ...(kind ? { kind } : {}) });
  }

  entry(id: string): CompendiumEntry {
    const e = findCompendiumEntry(id);
    if (!e) throw notFound('Entrée introuvable dans le Sanctuaire.');
    return e;
  }

  /** Créations visibles : les siennes et celles rattachées à ses campagnes. */
  async listCreations(userId: string): Promise<CreationDto[]> {
    const mine = await this.db.select({ id: memberships.campaignId }).from(memberships).where(eq(memberships.userId, userId));
    const campaignIds = mine.map((m) => m.id);
    const rows = await this.db
      .select()
      .from(creations)
      .where(campaignIds.length ? or(eq(creations.ownerId, userId), inArray(creations.campaignId, campaignIds)) : eq(creations.ownerId, userId))
      .orderBy(desc(creations.updatedAt));
    return rows.map(toDto);
  }

  private async owned(id: string, userId: string): Promise<CreationRow> {
    if (!isUuid(id)) throw notFound();
    const row = await this.db.query.creations.findFirst({ where: and(eq(creations.id, id), eq(creations.ownerId, userId)) });
    if (!row) throw notFound('Création introuvable.');
    return row;
  }

  private async assertCampaign(campaignId: string | null, userId: string) {
    if (!campaignId) return;
    const m = isUuid(campaignId) && (await this.db.query.memberships.findFirst({ where: and(eq(memberships.campaignId, campaignId), eq(memberships.userId, userId)) }));
    if (!m) throw notFound('Campagne introuvable.');
  }

  /** Une classe doit être complète (dé de vie, sauvegardes…) pour servir à créer un personnage. */
  private assertValid(data: Creation, id = 'draft') {
    if (data.kind === 'Classe' && !creationToClass({ ...data, id })) throw badRequest('Classe incomplète : dé de vie, deux sauvegardes et des aptitudes valides sont requis.');
  }

  async create(userId: string, data: Creation): Promise<CreationDto> {
    await this.assertCampaign(data.campaignId, userId);
    this.assertValid(data);
    const [row] = await this.db
      .insert(creations)
      .values({ ownerId: userId, campaignId: data.campaignId, kind: data.kind, name: data.name, data, shared: data.shared })
      .returning();
    return toDto(row!);
  }

  async update(id: string, userId: string, data: Creation): Promise<CreationDto> {
    await this.owned(id, userId);
    await this.assertCampaign(data.campaignId, userId);
    this.assertValid(data, id);
    const [row] = await this.db
      .update(creations)
      .set({ data, kind: data.kind, name: data.name, campaignId: data.campaignId, shared: data.shared, updatedAt: new Date() })
      .where(eq(creations.id, id))
      .returning();
    // Une classe modifiée : les fiches qui la suivent sont mises à jour (aptitudes, emplacements…).
    if (data.kind === 'Classe') {
      const def = creationToClass({ ...data, id });
      if (def) await this.characters.syncCustomClass(id, def);
    }
    return toDto(row!);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.owned(id, userId);
    await this.db.delete(creations).where(eq(creations.id, id));
  }

  /** « Donner à un joueur » : la création rejoint l'inventaire (ou le grimoire) d'un personnage. */
  async give(id: string, userId: string, characterId: string, qty: number): Promise<CharacterDto> {
    const visible = (await this.listCreations(userId)).find((c) => c.id === id);
    if (!visible) throw notFound('Création introuvable.');
    if (visible.kind === 'Sort') return this.characters.act(characterId, userId, { type: 'add_spell', spell: creationToSpell(visible) });
    if (visible.kind === 'Classe') throw badRequest('Une classe se choisit à la création du personnage (Génération).');
    if (!ITEM_KINDS.has(visible.kind)) throw badRequest('Une créature ne se range pas dans un sac.');
    return this.characters.act(characterId, userId, { type: 'add_item', item: creationToItem(visible, qty) });
  }

  // ───────────────────────────── Bibliothèque partagée ─────────────────────────────

  /** Créations publiées par tous les membres de l'instance, les plus importées d'abord. */
  async shared(userId: string, q: string | undefined, kind: CreationKind | undefined): Promise<SharedCreationDto[]> {
    const rows = await this.db
      .select({ c: creations, owner: users.displayName, campaign: campaigns.name })
      .from(creations)
      .innerJoin(users, eq(users.id, creations.ownerId))
      .leftJoin(campaigns, eq(campaigns.id, creations.campaignId))
      .where(and(eq(creations.shared, true), kind ? eq(creations.kind, kind) : undefined, q ? ilike(creations.name, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined))
      .orderBy(desc(creations.imports), desc(creations.updatedAt))
      .limit(300);
    // Ce que l'utilisateur possède déjà : ses propres publications et les originaux de ses imports.
    const mine = await this.db.select({ id: creations.id, sourceId: creations.sourceId }).from(creations).where(eq(creations.ownerId, userId));
    const owned = new Set(mine.flatMap((m) => [m.id, m.sourceId ?? '']));
    return rows.map((r) => ({ ...toDto(r.c), ownerName: r.owner, campaignName: r.campaign, imports: r.c.imports, owned: owned.has(r.c.id) }));
  }

  /**
   * Import en masse : chaque création publiée est copiée dans les créations de l'utilisateur
   * (rattachée à la campagne choisie). Une création déjà importée n'est pas dupliquée.
   */
  async importShared(userId: string, ids: string[], campaignId: string | null): Promise<CreationDto[]> {
    await this.assertCampaign(campaignId, userId);
    const valid = [...new Set(ids.filter(isUuid))];
    if (!valid.length) return [];
    const sources = await this.db.select().from(creations).where(and(inArray(creations.id, valid), eq(creations.shared, true)));
    const already = await this.db
      .select({ sourceId: creations.sourceId })
      .from(creations)
      .where(and(eq(creations.ownerId, userId), inArray(creations.sourceId, valid)));
    const skip = new Set(already.map((a) => a.sourceId));
    const fresh = sources.filter((s) => s.ownerId !== userId && !skip.has(s.id));
    if (!fresh.length) return [];
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(creations)
        .values(fresh.map((s) => ({ ownerId: userId, campaignId, kind: s.kind, name: s.name, data: { ...s.data, campaignId, shared: false }, shared: false, sourceId: s.id })))
        .returning();
      await tx.update(creations).set({ imports: sql`${creations.imports} + 1` }).where(and(inArray(creations.id, fresh.map((s) => s.id)), ne(creations.ownerId, userId)));
      return rows.map(toDto);
    });
  }
}
