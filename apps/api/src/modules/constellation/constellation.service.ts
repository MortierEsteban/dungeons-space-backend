import {
  eventTypeDef,
  NODE_KIND_META,
  type ConstellationDto,
  type createLinkSchema,
  type createNodeSchema,
  type LinkDto,
  type LinkSuggestionDto,
  type NodeDto,
  type NodeKind,
  type updateLinkSchema,
  type updateNodeSchema,
} from '@ds/shared';
import { and, eq, gte, inArray, isNotNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db, Executor } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, forbidden, notFound } from '../../kernel/errors';
import { isUuid, type Viewer } from '../campaigns/access';
import { events } from '../chronicle/chronicle.tables';
import { links, nodes } from './constellation.tables';

type NodeRow = typeof nodes.$inferSelect;
type LinkRow = typeof links.$inferSelect;

const nodeDto = (n: NodeRow): NodeDto => ({
  id: n.id,
  kind: n.kind,
  label: n.label,
  description: n.description,
  refType: n.refType,
  refId: n.refId,
  color: n.color,
  playerVisible: n.playerVisible,
  pinned: n.pinned,
  position: n.position,
});

const linkDto = (l: LinkRow): LinkDto => ({
  id: l.id,
  fromId: l.fromNodeId,
  toId: l.toNodeId,
  type: l.type,
  valence: l.valence,
  intensity: l.intensity,
  note: l.note,
  playerVisible: l.playerVisible,
  sourceEventId: l.sourceEventId,
});

/**
 * La Constellation : graphe social/narratif du MJ. `dm_only` par défaut ;
 * un joueur ne reçoit jamais un nœud ou un lien non `playerVisible`, même via l'API.
 */
export class ConstellationService {
  constructor(
    private readonly db: Db,
    private readonly realtime: Realtime,
  ) {}

  async get(campaignId: string, viewer: Viewer, playerViewEnabled: boolean): Promise<ConstellationDto> {
    if (viewer.role !== 'gm' && !playerViewEnabled) return { nodes: [], links: [] };
    const nodeRows = await this.db.select().from(nodes).where(eq(nodes.campaignId, campaignId));
    const linkRows = await this.db.select().from(links).where(eq(links.campaignId, campaignId));
    if (viewer.role === 'gm') return { nodes: nodeRows.map(nodeDto), links: linkRows.map(linkDto) };
    const visible = new Set(nodeRows.filter((n) => n.playerVisible).map((n) => n.id));
    return {
      nodes: nodeRows.filter((n) => visible.has(n.id)).map(nodeDto),
      links: linkRows.filter((l) => l.playerVisible && visible.has(l.fromNodeId) && visible.has(l.toNodeId)).map(linkDto),
    };
  }

  private assertGm(viewer: Viewer) {
    if (viewer.role !== 'gm') throw forbidden('La Constellation est éditée par le MJ.');
  }

  private async node(campaignId: string, id: string): Promise<NodeRow> {
    if (!isUuid(id)) throw notFound('Nœud introuvable.');
    const row = await this.db.query.nodes.findFirst({ where: and(eq(nodes.id, id), eq(nodes.campaignId, campaignId)) });
    if (!row) throw notFound('Nœud introuvable.');
    return row;
  }

  async createNode(campaignId: string, viewer: Viewer, input: z.infer<typeof createNodeSchema>, exec: Executor = this.db): Promise<NodeDto> {
    this.assertGm(viewer);
    const [row] = await exec
      .insert(nodes)
      .values({ campaignId, ...input, color: input.color ?? NODE_KIND_META[input.kind].color })
      .returning();
    this.realtime.changed(campaignId, 'constellation');
    return nodeDto(row!);
  }

  /** Nœud lié à un personnage (créé à la volée) — CST-10. */
  async ensureNodeFor(campaignId: string, ref: { type: 'character' | 'event'; id: string; label: string; kind: NodeKind; playerVisible: boolean }, exec: Executor = this.db): Promise<NodeDto> {
    const existing = await exec.query.nodes.findFirst({
      where: and(eq(nodes.campaignId, campaignId), eq(nodes.refType, ref.type), eq(nodes.refId, ref.id)),
    });
    if (existing) return nodeDto(existing);
    const [row] = await exec
      .insert(nodes)
      .values({ campaignId, kind: ref.kind, label: ref.label, refType: ref.type, refId: ref.id, playerVisible: ref.playerVisible, color: NODE_KIND_META[ref.kind].color })
      .returning();
    this.realtime.changed(campaignId, 'constellation');
    return nodeDto(row!);
  }

  async updateNode(campaignId: string, viewer: Viewer, id: string, patch: z.infer<typeof updateNodeSchema>): Promise<NodeDto> {
    this.assertGm(viewer);
    await this.node(campaignId, id);
    const [row] = await this.db.update(nodes).set(patch).where(eq(nodes.id, id)).returning();
    this.realtime.changed(campaignId, 'constellation');
    return nodeDto(row!);
  }

  async deleteNode(campaignId: string, viewer: Viewer, id: string): Promise<void> {
    this.assertGm(viewer);
    await this.node(campaignId, id);
    await this.db.delete(nodes).where(eq(nodes.id, id));
    this.realtime.changed(campaignId, 'constellation');
  }

  async createLink(campaignId: string, viewer: Viewer, input: z.infer<typeof createLinkSchema>): Promise<LinkDto[]> {
    this.assertGm(viewer);
    if (input.fromId === input.toId) throw badRequest('Un nœud ne peut pas être relié à lui-même.');
    await this.node(campaignId, input.fromId);
    await this.node(campaignId, input.toId);
    const base = {
      campaignId,
      type: input.type,
      valence: input.valence,
      intensity: input.intensity,
      note: input.note,
      playerVisible: input.playerVisible,
      sourceEventId: input.sourceEventId && isUuid(input.sourceEventId) ? input.sourceEventId : null,
    };
    const values = [{ ...base, fromNodeId: input.fromId, toNodeId: input.toId }];
    if (input.reciprocal) values.push({ ...base, fromNodeId: input.toId, toNodeId: input.fromId });
    const rows = await this.db.insert(links).values(values).returning();
    this.realtime.changed(campaignId, 'constellation');
    return rows.map(linkDto);
  }

  async updateLink(campaignId: string, viewer: Viewer, id: string, patch: z.infer<typeof updateLinkSchema>): Promise<LinkDto> {
    this.assertGm(viewer);
    if (!isUuid(id)) throw notFound();
    const [row] = await this.db.update(links).set(patch).where(and(eq(links.id, id), eq(links.campaignId, campaignId))).returning();
    if (!row) throw notFound('Lien introuvable.');
    this.realtime.changed(campaignId, 'constellation');
    return linkDto(row);
  }

  async deleteLink(campaignId: string, viewer: Viewer, id: string): Promise<void> {
    this.assertGm(viewer);
    if (!isUuid(id)) throw notFound();
    await this.db.delete(links).where(and(eq(links.id, id), eq(links.campaignId, campaignId)));
    this.realtime.changed(campaignId, 'constellation');
  }

  /**
   * Suggestions de liens depuis la Chronique (CST-09) : un événement qui relie un acteur à une cible,
   * tous deux présents dans la Constellation, propose un lien qualifié acceptable en un clic.
   */
  async suggestions(campaignId: string, viewer: Viewer): Promise<LinkSuggestionDto[]> {
    this.assertGm(viewer);
    const nodeRows = await this.db.select().from(nodes).where(and(eq(nodes.campaignId, campaignId), isNotNull(nodes.refId)));
    const byRef = new Map(nodeRows.map((n) => [n.refId!, n]));
    const linkRows = await this.db.select().from(links).where(eq(links.campaignId, campaignId));
    const linked = new Set(linkRows.map((l) => `${l.fromNodeId}>${l.toNodeId}`));
    const fromEvents = new Set(linkRows.map((l) => l.sourceEventId).filter(Boolean));
    const candidates = await this.db
      .select()
      .from(events)
      .where(and(eq(events.campaignId, campaignId), gte(events.importance, 2), or(eq(events.category, 'social'), eq(events.category, 'narrative'), inArray(events.type, ['character.died']))))
      .limit(500);
    const out: LinkSuggestionDto[] = [];
    for (const e of candidates) {
      if (fromEvents.has(e.id)) continue;
      const def = eventTypeDef(e.type);
      if (def.valence === undefined) continue;
      for (const a of e.actors) {
        for (const t of e.targets) {
          const from = a.id ? byRef.get(a.id) : undefined;
          const to = t.id ? byRef.get(t.id) : undefined;
          if (!from || !to || from.id === to.id || linked.has(`${from.id}>${to.id}`)) continue;
          out.push({
            key: `${e.id}:${from.id}:${to.id}`,
            fromId: from.id,
            toId: to.id,
            type: def.valence < 0 ? 'a affecté' : 'connaît',
            valence: def.valence,
            eventId: e.id,
            eventTitle: e.title,
          });
        }
      }
    }
    return out.slice(0, 30);
  }

}
