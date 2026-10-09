import { z } from 'zod';
import type { SessionDto } from './campaigns';
import type { EventDto } from './chronicle';

/** Réglages de l'enregistrement des sessions (MJ). */
export const recordingSettingsSchema = z.object({
  /** Propose d'enregistrer les sessions (transcription continue, indicateur visible de toute la table). */
  enabled: z.boolean().default(false),
  /** Un modèle de langage lit la transcription au fil de l'eau et inscrit les événements dans la Chronique. */
  autoAnalyze: z.boolean().default(true),
  /** Visibilité des événements créés automatiquement : `gm_only` = le MJ relit avant de révéler. */
  autoVisibility: z.enum(['players', 'gm_only']).default('players'),
  /** Les joueurs peuvent-ils relire la transcription ? */
  playersSeeTranscript: z.boolean().default(false),
  /** Conserve aussi l'audio (archive privée, servie au MJ uniquement). */
  keepAudio: z.boolean().default(false),
});
export type RecordingSettings = z.infer<typeof recordingSettingsSchema>;

export const RECORDING_STATUSES = ['live', 'paused', 'ended'] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const startRecordingSchema = z.object({
  /** Identifiant stable de l'appareil qui capte le son : un seul appareil enregistre à la fois. */
  deviceId: z.string().trim().min(4).max(64),
  /** Reprend la main sur un enregistrement tenu par un autre appareil. */
  takeover: z.boolean().default(false),
});
export type StartRecordingInput = z.input<typeof startRecordingSchema>;

export const transcriptSegmentInputSchema = z.object({
  /** Numéro attribué par l'appareil : un renvoi (réseau instable) ne crée pas de doublon. */
  clientSeq: z.number().int().min(0),
  text: z.string().trim().min(1).max(4000),
  speaker: z.string().trim().max(60).nullable().default(null),
  /** Il y a combien de temps le segment a commencé, au moment de l'envoi (insensible au décalage des horloges). */
  ageMs: z.number().int().min(0).max(24 * 3600_000),
  durationMs: z.number().int().min(0).default(0),
});
export type TranscriptSegmentInput = z.input<typeof transcriptSegmentInputSchema>;

export const appendSegmentsSchema = z.object({
  deviceId: z.string().trim().min(4).max(64),
  segments: z.array(transcriptSegmentInputSchema).min(1).max(200),
});
export type AppendSegmentsInput = z.input<typeof appendSegmentsSchema>;

export const transcriptQuerySchema = z.object({
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export interface RecordingAnalysisStateDto {
  /** Un analyseur est configuré côté serveur (clé d'API présente). */
  available: boolean;
  running: boolean;
  /** Dernier segment pris en compte par une analyse. */
  analyzedSeq: number;
  /** Mots transcrits pas encore analysés. */
  pendingWords: number;
  eventsCreated: number;
  lastAnalyzedAt: string | null;
  lastError: string | null;
}

export interface RecordingDto {
  id: string;
  campaignId: string;
  sessionNo: number;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  startedBy: { id: string; name: string } | null;
  /** Appareil qui capte le son (MJ uniquement). */
  deviceId: string | null;
  lastSeenAt: string;
  segmentCount: number;
  wordCount: number;
  /** Prochain numéro attendu de l'appareil (reprise après rechargement). */
  nextClientSeq: number;
  analysis: RecordingAnalysisStateDto;
  /** Archive audio disponible (MJ). */
  audio: { chunks: number; bytes: number } | null;
}

export interface TranscriptSegmentDto {
  id: string;
  recordingId: string;
  seq: number;
  speaker: string | null;
  text: string;
  offsetMs: number;
  durationMs: number;
  spokenAt: string;
  analyzed: boolean;
}

export interface TranscriptPageDto {
  segments: TranscriptSegmentDto[];
  /** Curseur de la page suivante (`after`), null s'il n'y a plus rien. */
  nextAfter: number | null;
}

/** Trace complète d'une session : ses enregistrements et tous ses événements (toutes catégories). */
export interface SessionTraceDto {
  session: SessionDto | null;
  sessionNo: number;
  recordings: RecordingDto[];
  events: EventDto[];
  /** Le spectateur peut-il lire la transcription ? */
  transcriptVisible: boolean;
}

/** Origine d'un événement : saisi à la main, déduit de l'enregistrement, ou écrit par un module. */
export type EventOrigin = 'manual' | 'recording' | 'system';

export function eventOrigin(e: Pick<EventDto, 'source' | 'payload'>): EventOrigin {
  if (e.payload?.origin === 'recording') return 'recording';
  return e.source === 'system' ? 'system' : 'manual';
}
