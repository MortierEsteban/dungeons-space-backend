import type { CampaignSettings } from '@ds/shared';
import { bigint, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.tables';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  synopsis: text('synopsis').notNull().default(''),
  tone: text('tone').notNull().default('Héroïque'),
  rulesetId: text('ruleset_id').notNull(),
  coverUrl: text('cover_url'),
  joinCode: text('join_code').notNull().unique(),
  visibility: text('visibility', { enum: ['private', 'public'] }).notNull().default('private'),
  recruiting: boolean('recruiting').notNull().default(false),
  status: text('status', { enum: ['active', 'finished'] }).notNull().default('active'),
  settings: jsonb('settings').$type<CampaignSettings>().notNull(),
  nextSessionAt: timestamp('next_session_at', { withTimezone: true }),
  /** Compteur de séquence de la Chronique : garantit un ordre total par campagne. */
  eventSeq: bigint('event_seq', { mode: 'number' }).notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['gm', 'player'] }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: uuid('invited_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('invitations_campaign_email').on(t.campaignId, t.email)],
);

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull().default(''),
    summary: text('summary').notNull().default(''),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [unique('game_sessions_campaign_number').on(t.campaignId, t.number)],
);
