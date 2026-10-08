import type { NpcData } from '@ds/shared';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';
import { users } from '../identity/identity.tables';

/**
 * Personnages (PJ et PNJ). La fiche est un document JSON dont le schéma est fourni
 * par le ruleset de la campagne : le noyau reste agnostique du système de jeu.
 */
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['pc', 'npc'] }).notNull(),
    name: text('name').notNull(),
    rulesetId: text('ruleset_id').notNull(),
    sheet: jsonb('sheet').$type<Record<string, unknown>>(),
    npc: jsonb('npc').$type<NpcData>(),
    visibleToPlayers: boolean('visible_to_players').notNull().default(true),
    portraitUrl: text('portrait_url'),
    /** Modèle 3D (.glb téléversé) affiché sur le plateau de combat à la place du jeton. */
    modelUrl: text('model_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('characters_campaign_idx').on(t.campaignId)],
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    pinned: boolean('pinned').notNull().default(false),
    shared: boolean('shared').notNull().default(false),
    sessionNo: integer('session_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notes_character_idx').on(t.characterId)],
);
