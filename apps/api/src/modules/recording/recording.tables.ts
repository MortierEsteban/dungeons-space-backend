import type { RecordingStatus } from '@ds/shared';
import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.tables';
import { users } from '../identity/identity.tables';

export interface AudioPart {
  mime: string;
  chunks: number;
  bytes: number;
}

/**
 * Un enregistrement continu d'une session de jeu. Une session peut en compter plusieurs (coupure,
 * changement d'appareil) ; un seul est « en direct » à la fois, tenu par un appareil.
 */
export const sessionRecordings = pgTable(
  'session_recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    sessionNo: integer('session_no').notNull(),
    status: text('status').$type<RecordingStatus>().notNull().default('live'),
    deviceId: text('device_id').notNull(),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Dernier signe de vie de l'appareil (envoi de segments) : un appareil muet peut être relayé. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Compteur de séquence des segments (verrou de ligne = ordre total). */
    segmentCount: integer('segment_count').notNull().default(0),
    wordCount: integer('word_count').notNull().default(0),
    /** Dernier segment couvert par une analyse réussie (ou abandonnée). */
    analyzedSeq: integer('analyzed_seq').notNull().default(0),
    /** Archive audio : une partie par flux capté (une reprise après rechargement ouvre une nouvelle partie). */
    audioParts: jsonb('audio_parts').$type<AudioPart[]>().notNull().default([]),
  },
  (t) => [index('session_recordings_campaign_session_idx').on(t.campaignId, t.sessionNo)],
);

/** La transcription, segment par segment : la trace brute de tout ce qui s'est dit. */
export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordingId: uuid('recording_id').notNull().references(() => sessionRecordings.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    sessionNo: integer('session_no').notNull(),
    seq: integer('seq').notNull(),
    clientSeq: integer('client_seq').notNull(),
    speaker: text('speaker'),
    text: text('text').notNull(),
    words: integer('words').notNull().default(0),
    offsetMs: integer('offset_ms').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    spokenAt: timestamp('spoken_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('transcript_segments_recording_seq').on(t.recordingId, t.seq),
    unique('transcript_segments_recording_client_seq').on(t.recordingId, t.clientSeq),
    index('transcript_segments_session_idx').on(t.campaignId, t.sessionNo, t.spokenAt),
  ],
);

/** Journal des analyses : quelle fenêtre de transcription a produit quels événements, avec quel modèle. */
export const recordingAnalyses = pgTable(
  'recording_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordingId: uuid('recording_id').notNull().references(() => sessionRecordings.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    fromSeq: integer('from_seq').notNull(),
    toSeq: integer('to_seq').notNull(),
    status: text('status', { enum: ['running', 'done', 'failed', 'skipped'] }).notNull(),
    model: text('model').notNull(),
    eventIds: jsonb('event_ids').$type<string[]>().notNull().default([]),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('recording_analyses_recording_idx').on(t.recordingId, t.createdAt)],
);
