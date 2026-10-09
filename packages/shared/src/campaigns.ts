import { z } from 'zod';
import { recordingSettingsSchema } from './recording';

export const ROLES = ['gm', 'player'] as const;
export type Role = (typeof ROLES)[number];

export const TONES = ['Héroïque', 'Sombre', 'Mystère', 'Humoristique', 'Bac à sable'] as const;
export const STAT_METHODS = ['roll', 'point_buy', 'standard_array'] as const;

export const VARIANT_KEYS = ['instantDeath', 'maxCrits', 'encumbrance', 'safeLongRests'] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];
export const VARIANT_LABELS: Record<VariantKey, string> = {
  instantDeath: 'Mort instantanée',
  maxCrits: 'Critiques maximisés',
  encumbrance: 'Encombrement',
  safeLongRests: 'Repos longs en lieu sûr',
};

export const campaignSettingsSchema = z.object({
  startLevel: z.number().int().min(1).max(20).default(1),
  statMethod: z.enum(STAT_METHODS).default('roll'),
  variants: z.record(z.enum(VARIANT_KEYS), z.boolean()).default({}),
  /** Règle de diagonale par défaut des combats. */
  diagonalRule: z.enum(['simple', 'alternate']).default('simple'),
  /** Les joueurs voient-ils une vue filtrée de la Constellation ? (CST-15) */
  playerConstellation: z.boolean().default(false),
  /** Enregistrement permanent des sessions, analysé par un modèle de langage. */
  recording: recordingSettingsSchema.default({}),
});
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court.').max(80),
  synopsis: z.string().max(4000).default(''),
  tone: z.enum(TONES).default('Héroïque'),
  rulesetId: z.string().default('dnd5e-srd51'),
  coverUrl: z.string().max(2000).nullable().default(null),
  visibility: z.enum(['private', 'public']).default('private'),
  recruiting: z.boolean().default(false),
  settings: campaignSettingsSchema.default({}),
  invites: z.array(z.string().trim().toLowerCase().email()).max(20).default([]),
});
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema
  .omit({ invites: true, rulesetId: true })
  .partial()
  .extend({ status: z.enum(['active', 'finished']).optional(), nextSessionAt: z.string().datetime().nullable().optional() });
export type UpdateCampaignInput = z.input<typeof updateCampaignSchema>;

export const joinCampaignSchema = z.object({ code: z.string().trim().toUpperCase().min(4).max(12) });
export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export interface MemberDto {
  userId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export interface CampaignSummaryDto {
  id: string;
  name: string;
  synopsis: string;
  tone: string;
  coverUrl: string | null;
  role: Role;
  status: 'active' | 'finished';
  gmName: string;
  playerCount: number;
  sessionCount: number;
  level: number;
  nextSessionAt: string | null;
}

export interface SessionDto {
  id: string;
  number: number;
  title: string;
  startedAt: string;
  endedAt: string | null;
  summary: string;
}

export interface CampaignDto extends CampaignSummaryDto {
  rulesetId: string;
  visibility: 'private' | 'public';
  recruiting: boolean;
  settings: CampaignSettings;
  /** Code d'invitation — visible du MJ uniquement. */
  joinCode: string | null;
  members: MemberDto[];
  invitations: { id: string; email: string; createdAt: string }[];
  currentSession: SessionDto | null;
  stats: { events: number; sessions: number; links: number; characters: number };
}

export interface DiscoverCampaignDto {
  id: string;
  name: string;
  synopsis: string;
  tone: string;
  coverUrl: string | null;
  gmName: string;
  playerCount: number;
  level: number;
  status: 'active' | 'finished';
  recruiting: boolean;
  /** Rôle de l'utilisateur courant s'il est déjà membre. */
  myRole: Role | null;
}

export interface InvitationDto {
  id: string;
  campaignId: string;
  campaignName: string;
  invitedBy: string;
  createdAt: string;
}

export const startSessionSchema = z.object({ title: z.string().trim().max(120).default('') });
export const endSessionSchema = z.object({ summary: z.string().max(10000).default('') });
