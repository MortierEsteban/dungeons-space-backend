import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  preference: text('preference', { enum: ['play', 'lead'] }).notNull().default('play'),
  locale: text('locale', { enum: ['fr', 'en'] }).notNull().default('fr'),
  homeStyle: text('home_style', { enum: ['immersive', 'classic'] }).notNull().default('immersive'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
