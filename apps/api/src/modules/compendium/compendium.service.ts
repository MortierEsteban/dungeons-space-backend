import { listRulesets, searchCompendium, findCompendiumEntry, type CompendiumEntry, type InventoryItem } from '@ds/rules';
import type { CharacterDto, Creation, CreationDto, RulesetDto } from '@ds/shared';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '../../infra/db/client';
import { badRequest, notFound } from '../../kernel/errors';
import { isUuid } from '../campaigns/access';
import { memberships } from '../campaigns/campaigns.tables';
import type { CharactersService } from '../characters/characters.service';
import { creations } from './compendium.tables';

type CreationRow = typeof creations.$inferSelect;

const toDto = (r: CreationRow): CreationDto => ({
  ...r.data,
  id: r.id,
  ownerId: r.ownerId,
  campaignId: r.campaignId,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const ITEM_KINDS = new Set(['Arme', 'Armure', 'Objet merveilleux', 'Potion']);

/** Le Sanctuaire : compendium SRD (lecture seule, versionné dans le ruleset) + la Forge (homebrew). */
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

  async create(userId: string, data: Creation): Promise<CreationDto> {
    await this.assertCampaign(data.campaignId, userId);
    const [row] = await this.db.insert(creations).values({ ownerId: userId, campaignId: data.campaignId, kind: data.kind, name: data.name, data }).returning();
    return toDto(row!);
  }

  async update(id: string, userId: string, data: Creation): Promise<CreationDto> {
    await this.owned(id, userId);
    await this.assertCampaign(data.campaignId, userId);
    const [row] = await this.db
      .update(creations)
      .set({ data, kind: data.kind, name: data.name, campaignId: data.campaignId, updatedAt: new Date() })
      .where(eq(creations.id, id))
      .returning();
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
    const mech = visible.mech as Record<string, unknown>;
    if (visible.kind === 'Sort') {
      return this.characters.act(characterId, userId, {
        type: 'add_spell',
        spell: {
          ref: visible.id, name: visible.name, level: Number(mech.lvl ?? 1), school: String(mech.school ?? ''), castingTime: String(mech.cast ?? ''),
          range: String(mech.range ?? ''), duration: String(mech.dur ?? ''), concentration: Boolean(mech.conc), ritual: Boolean(mech.ritual),
          prepared: false, favorite: false, description: visible.lore,
        },
      });
    }
    if (!ITEM_KINDS.has(visible.kind)) throw badRequest('Une créature ne se range pas dans un sac.');
    const item: Omit<InventoryItem, 'id'> = {
      name: visible.name, qty, weight: visible.weight, container: 'Sac à dos', equipped: false, rarity: visible.rarity,
      requiresAttunement: visible.attune, attuned: false, ref: visible.id, description: visible.lore,
    };
    return this.characters.act(characterId, userId, { type: 'add_item', item });
  }
}
