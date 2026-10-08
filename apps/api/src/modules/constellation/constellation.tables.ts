import type { NodeKind } from '@ds/shared';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';

/** Nœud de la Constellation : pointeur polymorphe (refType + refId) ou nœud libre. */
export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NodeKind>().notNull(),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    refType: text('ref_type', { enum: ['character', 'event'] }),
    refId: uuid('ref_id'),
    color: text('color'),
    playerVisible: boolean('player_visible').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    position: jsonb('position').$type<{ x: number; y: number; z: number }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('nodes_campaign_idx').on(t.campaignId), index('nodes_ref_idx').on(t.refType, t.refId)],
);

/** Lien orienté et qualifié : type, polarité (valence -5..+5) et intensité (0..5). */
export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    fromNodeId: uuid('from_node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
    toNodeId: uuid('to_node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    valence: integer('valence').notNull().default(0),
    intensity: integer('intensity').notNull().default(1),
    note: text('note').notNull().default(''),
    playerVisible: boolean('player_visible').notNull().default(false),
    sourceEventId: uuid('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('links_campaign_idx').on(t.campaignId)],
);
