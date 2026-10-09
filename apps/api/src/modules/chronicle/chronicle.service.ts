import {
  eventTypeDef,
  type correctEventSchema,
  type createEventSchema,
  type EntityRef,
  type EventCategory,
  type EventDto,
  type EventLinkDto,
  type EventPageDto,
  type eventQuerySchema,
  type Visibility,
} from '@ds/shared';
import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db, Executor } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, forbidden, notFound } from '../../kernel/errors';
import { isUuid, type SessionClock, type Viewer } from '../campaigns/access';
import { campaigns } from '../campaigns/campaigns.tables';
import type { IdentityService } from '../identity/identity.service';
import { eventLinks, events, type PlayerView } from './chronicle.tables';

export type EventRow = typeof events.$inferSelect;

export type { Viewer };

export interface AppendEvent {
  campaignId: string;
  type: string;
  title: string;
  text?: string;
  category?: EventCategory;
  importance?: number;
  visibility?: Visibility;
  visibleTo?: string[];
  actors?: EntityRef[];
  targets?: EntityRef[];
  places?: string[];
  inGameDate?: string | null;
  payload?: Record<string, unknown>;
  playerView?: PlayerView | null;
  source: 'system' | 'gm' | 'player';
  authorId?: string | null;
  correlationId?: string | null;
  /** undefined = session courante. */
  sessionNo?: number | null;
  idempotencyKey?: string;
  rulesetId?: string | null;
}

/** Catégories masquées de la timeline par défaut (trop verbeuses ; visibles via filtre ou replay). */
const DEFAULT_HIDDEN_CATEGORIES: EventCategory[] = ['combat', 'dice'];
const CORRECTION = 'chronicle.correction';

/**
 * La Chronique : journal append-only, ordonné par une séquence monotone par campagne.
 * Tous les modules y écrivent (combat, fiches, sessions…) : c'est la mémoire de la campagne.
 */
export class ChronicleService {
  constructor(
    private readonly db: Db,
    private readonly realtime: Realtime,
    private readonly clock: SessionClock,
    private readonly identity: IdentityService,
  ) {}

  // ───────────────────────────── Écriture ─────────────────────────────

  async append(input: AppendEvent, exec: Executor = this.db): Promise<EventRow> {
    const [row] = await this.appendMany(input.campaignId, [input], exec);
    return row!;
  }

  /** Ajoute plusieurs événements de façon atomique, avec des numéros de séquence contigus. */
  async appendMany(campaignId: string, inputs: AppendEvent[], exec: Executor = this.db): Promise<EventRow[]> {
    if (inputs.length === 0) return [];
    return exec.transaction(async (tx) => {
      const existing: EventRow[] = [];
      const fresh: AppendEvent[] = [];
      for (const input of inputs) {
        if (input.idempotencyKey) {
          const found = await tx.query.events.findFirst({
            where: and(eq(events.campaignId, campaignId), eq(events.idempotencyKey, input.idempotencyKey)),
          });
          if (found) {
            existing.push(found);
            continue;
          }
        }
        fresh.push(input);
      }
      if (fresh.length === 0) return existing;
      // Le verrou de ligne sur la campagne sérialise les écritures concurrentes : ordre total garanti.
      const [counter] = await tx
        .update(campaigns)
        .set({ eventSeq: sql`${campaigns.eventSeq} + ${fresh.length}` })
        .where(eq(campaigns.id, campaignId))
        .returning({ seq: campaigns.eventSeq });
      if (!counter) throw notFound('Campagne introuvable.');
      const firstSeq = counter.seq - fresh.length + 1;
      const needsSession = fresh.some((i) => i.sessionNo === undefined);
      const sessionNo = needsSession ? await this.clock.current(campaignId, tx) : null;
      const rows = await tx
        .insert(events)
        .values(
          fresh.map((i, k) => {
            const def = eventTypeDef(i.type);
            return {
              campaignId,
              seq: firstSeq + k,
              sessionNo: i.sessionNo === undefined ? sessionNo : i.sessionNo,
              correlationId: i.correlationId ?? null,
              type: i.type,
              category: i.category ?? def.category,
              title: i.title,
              text: i.text ?? '',
              importance: i.importance ?? def.defaultImportance,
              visibility: i.visibility ?? 'players',
              visibleTo: i.visibleTo ?? [],
              actors: i.actors ?? [],
              targets: i.targets ?? [],
              places: i.places ?? [],
              inGameDate: i.inGameDate ?? null,
              payload: i.payload ?? {},
              playerView: i.playerView ?? null,
              source: i.source,
              authorId: i.authorId ?? null,
              idempotencyKey: i.idempotencyKey ?? null,
              rulesetId: i.rulesetId ?? null,
            };
          }),
        )
        .returning();
      return [...existing, ...rows].sort((a, b) => a.seq - b.seq);
    });
  }

  /** Diffuse en temps réel (CHR-12), en respectant la visibilité de chaque salon. */
  async publish(rows: EventRow[]): Promise<void> {
    const visible = rows.filter((r) => r.type !== CORRECTION && !(r.category === 'combat' && r.importance < 3));
    if (visible.length === 0) return;
    const names = await this.identity.namesOf(visible.map((r) => r.authorId ?? ''));
    for (const row of visible) {
      const gm = this.toDto(row, { userId: '', role: 'gm' }, names);
      if (row.visibility === 'players') {
        this.realtime.toCampaign(row.campaignId, 'chronicle:event', gm, this.toDto(row, { userId: '', role: 'player' }, names));
      } else {
        this.realtime.toCampaign(row.campaignId, 'chronicle:event', gm, null);
        if (row.visibility === 'party_member') {
          const audience = [...row.visibleTo, ...(row.authorId ? [row.authorId] : [])];
          this.realtime.toUsers(row.campaignId, audience, 'chronicle:event', this.toDto(row, { userId: '', role: 'player' }, names));
        }
      }
    }
  }

  async appendAndPublish(input: AppendEvent): Promise<EventRow> {
    const row = await this.append(input);
    await this.publish([row]);
    return row;
  }

  /** Saisie manuelle d'un événement narratif (MJ ou joueur). */
  async createNarrative(campaignId: string, viewer: Viewer, input: CreateEventInputParsed): Promise<EventDto> {
    const visibility: Visibility = viewer.role === 'gm' ? input.visibility : input.visibility === 'gm_only' ? 'players' : input.visibility;
    const row = await this.append({
      campaignId,
      type: input.type,
      title: input.title,
      text: input.text,
      importance: input.importance,
      visibility,
      visibleTo: input.visibleTo,
      actors: input.actors,
      targets: input.targets,
      places: input.places,
      inGameDate: input.inGameDate,
      source: viewer.role === 'gm' ? 'gm' : 'player',
      authorId: viewer.userId,
      ...(input.sessionNo !== undefined ? { sessionNo: input.sessionNo } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
    for (const target of input.linkTo) {
      if (isUuid(target)) await this.createLink(campaignId, viewer, row.id, target).catch(() => undefined);
    }
    await this.publish([row]);
    return this.toDto(row, viewer, await this.identity.namesOf([viewer.userId]));
  }

  /** Correction ou retrait : un événement compensatoire, l'original reste intact (CHR-11). */
  async correct(campaignId: string, eventId: string, viewer: Viewer, input: z.infer<typeof correctEventSchema>): Promise<EventDto> {
    const target = await this.getRow(campaignId, eventId, viewer);
    if (viewer.role !== 'gm' && target.authorId !== viewer.userId) throw forbidden('Seul l’auteur ou le MJ peut corriger cet événement.');
    if (target.type === CORRECTION) throw badRequest('Une correction ne se corrige pas : corrigez l’événement d’origine.');
    await this.append({
      campaignId,
      type: CORRECTION,
      title: input.retract ? `Retrait : ${target.title}` : `Correction : ${target.title}`,
      text: input.reason,
      category: 'system',
      visibility: target.visibility,
      visibleTo: target.visibleTo,
      payload: { targetId: target.id, ...(input.title ? { title: input.title } : {}), ...(input.text !== undefined ? { text: input.text } : {}), retract: input.retract },
      source: viewer.role === 'gm' ? 'gm' : 'player',
      authorId: viewer.userId,
      sessionNo: target.sessionNo,
    });
    const [dto] = await this.hydrate([target], viewer);
    return dto!;
  }

  /**
   * Révèle aux joueurs un événement secret (ex. relu par le MJ après l'analyse de l'enregistrement).
   * Le journal reste append-only : une copie visible est ajoutée (avec ses liens) et l'original est retiré.
   */
  async reveal(campaignId: string, eventId: string, viewer: Viewer): Promise<EventDto> {
    if (viewer.role !== 'gm') throw forbidden('Seul le MJ révèle un événement.');
    const target = await this.getRow(campaignId, eventId, viewer);
    if (target.visibility !== 'gm_only') throw badRequest('Cet événement est déjà visible des joueurs.');
    const [original] = await this.hydrate([target], viewer);
    if (original!.retracted) throw badRequest('Cet événement a été retiré.');
    const copy = await this.db.transaction(async (tx) => {
      const [row] = await this.appendMany(
        campaignId,
        [
          {
            campaignId,
            type: target.type,
            title: original!.title,
            text: original!.text,
            category: target.category,
            importance: target.importance,
            visibility: 'players',
            actors: target.actors,
            targets: target.targets,
            places: target.places,
            inGameDate: target.inGameDate,
            payload: { ...target.payload, revealedFrom: target.id },
            source: target.source,
            authorId: target.authorId,
            correlationId: target.correlationId,
            sessionNo: target.sessionNo,
            idempotencyKey: `reveal:${target.id}`,
          },
          {
            campaignId,
            type: CORRECTION,
            title: `Révélé : ${target.title}`,
            text: 'Révélé aux joueurs.',
            category: 'system',
            visibility: 'gm_only',
            payload: { targetId: target.id, retract: true, revealed: true },
            source: 'gm',
            authorId: viewer.userId,
            sessionNo: target.sessionNo,
            idempotencyKey: `reveal-retract:${target.id}`,
          },
        ],
        tx,
      );
      const links = await tx.select().from(eventLinks).where(or(eq(eventLinks.fromEventId, target.id), eq(eventLinks.toEventId, target.id)));
      if (links.length) {
        await tx
          .insert(eventLinks)
          .values(links.map((l) => ({ campaignId, fromEventId: l.fromEventId === target.id ? row!.id : l.fromEventId, toEventId: l.toEventId === target.id ? row!.id : l.toEventId, createdBy: viewer.userId })))
          .onConflictDoNothing();
      }
      return row!;
    });
    await this.publish([copy]);
    if (copy) this.realtime.changed(campaignId, 'constellation');
    const [dto] = await this.hydrate([copy], viewer);
    return dto!;
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  private visibilityFilter(viewer: Viewer): SQL | undefined {
    if (viewer.role === 'gm') return undefined;
    return or(
      eq(events.visibility, 'players'),
      and(
        eq(events.visibility, 'party_member'),
        or(sql`${events.visibleTo} @> jsonb_build_array(${viewer.userId}::text)`, eq(events.authorId, viewer.userId)),
      ),
    );
  }

  async query(campaignId: string, viewer: Viewer, q: EventQueryParsed): Promise<EventPageDto> {
    const conditions: (SQL | undefined)[] = [eq(events.campaignId, campaignId), ne(events.type, CORRECTION), this.visibilityFilter(viewer)];
    const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
    const types = list(q.types);
    const categories = list(q.categories);
    if (types.length) conditions.push(inArray(events.type, types));
    if (categories.length) conditions.push(inArray(events.category, categories as EventCategory[]));
    else if (!q.correlationId && !types.length) conditions.push(notInArray(events.category, DEFAULT_HIDDEN_CATEGORIES));
    if (q.q) {
      const like = `%${q.q.replace(/[%_]/g, '\\$&')}%`;
      const title = viewer.role === 'gm' ? sql`${events.title}` : sql`coalesce(${events.playerView}->>'title', ${events.title})`;
      conditions.push(or(sql`${title} ilike ${like}`, sql`${events.text} ilike ${like}`, sql`${events.places}::text ilike ${like}`));
    }
    if (q.characterId) {
      const ref = JSON.stringify([{ id: q.characterId }]);
      conditions.push(or(sql`${events.actors} @> ${ref}::jsonb`, sql`${events.targets} @> ${ref}::jsonb`));
    }
    if (q.target) conditions.push(sql`${events.targets}::text ilike ${`%${q.target}%`}`);
    if (q.sessionNo !== undefined) conditions.push(eq(events.sessionNo, q.sessionNo));
    if (q.minImportance) conditions.push(gte(events.importance, q.minImportance));
    if (q.correlationId) conditions.push(isUuid(q.correlationId) ? eq(events.correlationId, q.correlationId) : sql`false`);
    if (q.origin === 'recording') conditions.push(sql`${events.payload}->>'origin' = 'recording'`);
    if (q.origin === 'manual') conditions.push(sql`coalesce(${events.payload}->>'origin', '') <> 'recording'`);
    if (q.before) conditions.push(lt(events.seq, q.before));

    const rows = await this.db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.seq))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    return { events: await this.hydrate(page, viewer), nextBefore: rows.length > q.limit ? page[page.length - 1]!.seq : null };
  }

  /**
   * Trace d'une session : tous ses événements, toutes catégories, dans l'ordre (le détail des combats
   * se limite aux faits marquants, le reste est rejouable depuis la rencontre).
   */
  async sessionEvents(campaignId: string, viewer: Viewer, sessionNo: number, limit = 3000): Promise<EventDto[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.campaignId, campaignId),
          eq(events.sessionNo, sessionNo),
          ne(events.type, CORRECTION),
          or(ne(events.category, 'combat'), gte(events.importance, 2)),
          this.visibilityFilter(viewer),
        ),
      )
      .orderBy(asc(events.seq))
      .limit(limit);
    return this.hydrate(rows, viewer);
  }

  async getRow(campaignId: string, eventId: string, viewer: Viewer): Promise<EventRow> {
    if (!isUuid(eventId)) throw notFound('Événement introuvable.');
    const row = await this.db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.campaignId, campaignId), this.visibilityFilter(viewer)) });
    if (!row) throw notFound('Événement introuvable.');
    return row;
  }

  /** Applique corrections et noms d'auteurs, puis projette selon le rôle. */
  async hydrate(rows: EventRow[], viewer: Viewer): Promise<EventDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const corrections = await this.db
      .select()
      .from(events)
      .where(and(eq(events.type, CORRECTION), inArray(sql`${events.payload}->>'targetId'`, ids)))
      .orderBy(asc(events.seq));
    const byTarget = new Map<string, EventRow[]>();
    for (const c of corrections) {
      const key = String(c.payload.targetId);
      byTarget.set(key, [...(byTarget.get(key) ?? []), c]);
    }
    const names = await this.identity.namesOf(rows.map((r) => r.authorId ?? ''));
    return rows.map((r) => {
      const dto = this.toDto(r, viewer, names);
      for (const c of byTarget.get(r.id) ?? []) {
        const p = c.payload as { title?: string; text?: string; retract?: boolean };
        dto.corrected = true;
        if (p.title) dto.title = p.title;
        if (p.text !== undefined) dto.text = p.text;
        if (p.retract) dto.retracted = true;
      }
      return dto;
    });
  }

  toDto(row: EventRow, viewer: Viewer, names: Map<string, string>): EventDto {
    const view = viewer.role !== 'gm' && row.playerView ? row.playerView : null;
    return {
      id: row.id,
      seq: row.seq,
      campaignId: row.campaignId,
      sessionNo: row.sessionNo,
      correlationId: row.correlationId,
      type: view?.type ?? row.type,
      category: row.category,
      title: view?.title ?? row.title,
      text: row.text,
      importance: row.importance,
      visibility: row.visibility,
      actors: row.actors,
      targets: row.targets,
      places: row.places,
      inGameDate: row.inGameDate,
      payload: view?.payload ?? row.payload,
      source: row.source,
      author: row.authorId ? { id: row.authorId, name: names.get(row.authorId) ?? 'Aventurier' } : null,
      occurredAt: row.occurredAt.toISOString(),
      corrected: false,
      retracted: false,
    };
  }

  // ───────────────────────────── Liens entre événements ─────────────────────────────

  async listLinks(campaignId: string, viewer: Viewer): Promise<EventLinkDto[]> {
    const rows = await this.db.select().from(eventLinks).where(eq(eventLinks.campaignId, campaignId));
    if (viewer.role === 'gm') return rows.map((l) => ({ id: l.id, fromId: l.fromEventId, toId: l.toEventId }));
    const visible = await this.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.campaignId, campaignId), this.visibilityFilter(viewer)));
    const ok = new Set(visible.map((v) => v.id));
    return rows.filter((l) => ok.has(l.fromEventId) && ok.has(l.toEventId)).map((l) => ({ id: l.id, fromId: l.fromEventId, toId: l.toEventId }));
  }

  async createLink(campaignId: string, viewer: Viewer, fromId: string, toId: string): Promise<EventLinkDto> {
    if (fromId === toId) throw badRequest('Un événement ne peut pas être relié à lui-même.');
    await this.getRow(campaignId, fromId, viewer);
    await this.getRow(campaignId, toId, viewer);
    const existing = await this.db.query.eventLinks.findFirst({
      where: or(
        and(eq(eventLinks.fromEventId, fromId), eq(eventLinks.toEventId, toId)),
        and(eq(eventLinks.fromEventId, toId), eq(eventLinks.toEventId, fromId)),
      ),
    });
    if (existing) return { id: existing.id, fromId: existing.fromEventId, toId: existing.toEventId };
    const [row] = await this.db.insert(eventLinks).values({ campaignId, fromEventId: fromId, toEventId: toId, createdBy: viewer.userId }).returning();
    this.realtime.changed(campaignId, 'constellation');
    return { id: row!.id, fromId, toId };
  }

  async deleteLink(campaignId: string, viewer: Viewer, linkId: string): Promise<void> {
    if (!isUuid(linkId)) throw notFound();
    const link = await this.db.query.eventLinks.findFirst({ where: and(eq(eventLinks.id, linkId), eq(eventLinks.campaignId, campaignId)) });
    if (!link) throw notFound('Lien introuvable.');
    if (viewer.role !== 'gm' && link.createdBy !== viewer.userId) throw forbidden();
    await this.db.delete(eventLinks).where(eq(eventLinks.id, linkId));
    this.realtime.changed(campaignId, 'constellation');
  }

  async stats(campaignId: string): Promise<{ events: number; links: number }> {
    const [e] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.campaignId, campaignId), inArray(events.category, ['narrative', 'social'])));
    const [l] = await this.db.select({ n: sql<number>`count(*)::int` }).from(eventLinks).where(eq(eventLinks.campaignId, campaignId));
    return { events: e?.n ?? 0, links: l?.n ?? 0 };
  }
}

type CreateEventInputParsed = z.infer<typeof createEventSchema>;
type EventQueryParsed = z.infer<typeof eventQuerySchema>;
