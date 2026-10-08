import type { Creation } from '@ds/shared';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';
import { users } from '../identity/identity.tables';

/**
 * Contenu utilisateur (homebrew), strictement séparé du contenu officiel SRD (exigence CNT-04) :
 * le SRD vit dans le ruleset (données versionnées), les créations vivent ici.
 */
export const creations = pgTable(
  'creations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    data: jsonb('data').$type<Creation>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('creations_owner_idx').on(t.ownerId)],
);
