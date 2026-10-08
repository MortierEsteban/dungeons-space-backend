import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';

/**
 * Métadonnées d'une rencontre. L'état du combat n'est PAS stocké ici : il est la projection
 * des événements de la Chronique dont `correlation_id` = id de la rencontre.
 */
export const encounters = pgTable('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status', { enum: ['setup', 'active', 'ended'] }).notNull().default('setup'),
  round: integer('round').notNull().default(0),
  combatantCount: integer('combatant_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
