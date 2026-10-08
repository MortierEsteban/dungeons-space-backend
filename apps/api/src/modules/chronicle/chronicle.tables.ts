import type { EntityRef, EventCategory, Visibility } from '@ds/shared';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';
import { users } from '../identity/identity.tables';

/** Vue joueur d'un événement dont certains champs sont masqués (ex. PV d'une créature cachée). */
export interface PlayerView {
  type: string;
  title: string;
  payload: Record<string, unknown>;
}

/**
 * Journal append-only de la campagne : « tout ce qui se passe est un événement immuable ».
 * Les corrections sont de nouveaux événements (`chronicle.correction`), jamais des UPDATE.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    sessionNo: integer('session_no'),
    correlationId: uuid('correlation_id'),
    type: text('type').notNull(),
    category: text('category').$type<EventCategory>().notNull(),
    title: text('title').notNull(),
    text: text('text').notNull().default(''),
    importance: integer('importance').notNull().default(1),
    visibility: text('visibility').$type<Visibility>().notNull(),
    visibleTo: jsonb('visible_to').$type<string[]>().notNull().default([]),
    actors: jsonb('actors').$type<EntityRef[]>().notNull().default([]),
    targets: jsonb('targets').$type<EntityRef[]>().notNull().default([]),
    places: jsonb('places').$type<string[]>().notNull().default([]),
    inGameDate: text('in_game_date'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /** null = les joueurs voient l'événement tel quel (sous réserve de `visibility`). */
    playerView: jsonb('player_view').$type<PlayerView>(),
    source: text('source', { enum: ['system', 'gm', 'player'] }).notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    schemaVersion: integer('schema_version').notNull().default(1),
    rulesetId: text('ruleset_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('events_campaign_seq').on(t.campaignId, t.seq),
    unique('events_campaign_idempotency').on(t.campaignId, t.idempotencyKey),
    index('events_correlation_idx').on(t.correlationId, t.seq),
    index('events_campaign_category_idx').on(t.campaignId, t.category, t.seq),
  ],
);

export const eventLinks = pgTable(
  'event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    fromEventId: uuid('from_event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    toEventId: uuid('to_event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('event_links_pair').on(t.fromEventId, t.toEventId)],
);
