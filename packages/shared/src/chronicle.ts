import { z } from 'zod';

export const VISIBILITIES = ['gm_only', 'players', 'party_member'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const CATEGORIES = ['narrative', 'social', 'session', 'character', 'item', 'dice', 'combat', 'system'] as const;
export type EventCategory = (typeof CATEGORIES)[number];

export interface EventTypeDef {
  type: string;
  label: string;
  color: string;
  category: EventCategory;
  /** Valence suggérée pour la Constellation (CST-09) quand l'événement relie un acteur à une cible. */
  valence?: number;
  defaultImportance: number;
}

/** Catalogue extensible des types d'événements (CHR-02). Namespace + verbe. */
export const EVENT_TYPES: EventTypeDef[] = [
  { type: 'narrative.place', label: 'Lieu', color: '#b9a4e0', category: 'narrative', defaultImportance: 2 },
  { type: 'narrative.encounter', label: 'Rencontre', color: '#7cc6ff', category: 'narrative', valence: 1, defaultImportance: 2 },
  { type: 'narrative.discovery', label: 'Découverte', color: '#e8d3a0', category: 'narrative', defaultImportance: 3 },
  { type: 'narrative.quest', label: 'Quête', color: '#c9a96a', category: 'narrative', defaultImportance: 3 },
  { type: 'narrative.combat', label: 'Combat', color: '#e07aa8', category: 'narrative', valence: -2, defaultImportance: 3 },
  { type: 'narrative.death', label: 'Mort', color: '#b0306a', category: 'narrative', valence: -5, defaultImportance: 5 },
  { type: 'narrative.note', label: 'Note', color: '#a79c8a', category: 'narrative', defaultImportance: 1 },
  { type: 'social.helped', label: 'A aidé', color: '#7cc6ff', category: 'social', valence: 2, defaultImportance: 2 },
  { type: 'social.promised', label: 'A promis', color: '#e8d3a0', category: 'social', valence: 1, defaultImportance: 3 },
  { type: 'social.insulted', label: 'A insulté', color: '#e07aa8', category: 'social', valence: -2, defaultImportance: 2 },
  { type: 'social.assaulted', label: 'A agressé', color: '#b0306a', category: 'social', valence: -3, defaultImportance: 3 },
  { type: 'social.betrayed', label: 'A trahi', color: '#b0306a', category: 'social', valence: -4, defaultImportance: 4 },
  { type: 'session.started', label: 'Début de session', color: '#c9a96a', category: 'session', defaultImportance: 3 },
  { type: 'session.ended', label: 'Fin de session', color: '#c9a96a', category: 'session', defaultImportance: 3 },
  { type: 'character.created', label: 'Nouveau personnage', color: '#7cc6ff', category: 'character', defaultImportance: 3 },
  { type: 'character.level_up', label: 'Niveau supérieur', color: '#7cc6ff', category: 'character', defaultImportance: 4 },
  { type: 'character.xp_gained', label: 'Expérience', color: '#7cc6ff', category: 'character', defaultImportance: 1 },
  { type: 'character.hp_changed', label: 'Points de vie', color: '#e07aa8', category: 'character', defaultImportance: 1 },
  { type: 'character.rested', label: 'Repos', color: '#7cc6ff', category: 'character', defaultImportance: 1 },
  { type: 'character.spell_cast', label: 'Sort lancé', color: '#7cc6ff', category: 'character', defaultImportance: 1 },
  { type: 'character.died', label: 'Mort d’un personnage', color: '#b0306a', category: 'character', defaultImportance: 5 },
  { type: 'item.acquired', label: 'Objet acquis', color: '#e8d3a0', category: 'item', defaultImportance: 2 },
  { type: 'item.removed', label: 'Objet perdu', color: '#a79c8a', category: 'item', defaultImportance: 1 },
  { type: 'dice.rolled', label: 'Jet de dés', color: '#a79c8a', category: 'dice', defaultImportance: 1 },
  { type: 'campaign.member_joined', label: 'Nouveau membre', color: '#c9a96a', category: 'system', defaultImportance: 2 },
  { type: 'chronicle.correction', label: 'Correction', color: '#a79c8a', category: 'system', defaultImportance: 1 },
];

export const NARRATIVE_TYPES = EVENT_TYPES.filter((t) => t.category === 'narrative' || t.category === 'social');

export function eventTypeDef(type: string): EventTypeDef {
  if (type.startsWith('combat.')) return { type, label: 'Combat', color: '#e07aa8', category: 'combat', defaultImportance: 1 };
  return EVENT_TYPES.find((t) => t.type === type) ?? { type, label: type, color: '#a79c8a', category: 'system', defaultImportance: 1 };
}

/** Référence vers une entité du monde : personnage, nœud de Constellation ou simple nom libre. */
export const entityRefSchema = z.object({
  kind: z.enum(['character', 'node', 'free']),
  id: z.string().max(64).nullable().default(null),
  name: z.string().min(1).max(120),
});
export type EntityRef = z.infer<typeof entityRefSchema>;

export const createEventSchema = z.object({
  type: z.string().regex(/^(narrative|social)\.[a-z_]+$/, 'Type d’événement non autorisé.'),
  title: z.string().trim().min(1, 'Un titre est requis.').max(160),
  text: z.string().max(10000).default(''),
  sessionNo: z.number().int().min(0).nullable().optional(),
  importance: z.number().int().min(1).max(5).optional(),
  visibility: z.enum(VISIBILITIES).default('players'),
  visibleTo: z.array(z.string()).max(20).default([]),
  actors: z.array(entityRefSchema).max(20).default([]),
  targets: z.array(entityRefSchema).max(20).default([]),
  places: z.array(z.string().max(120)).max(10).default([]),
  inGameDate: z.string().max(60).nullable().default(null),
  /** Clé d'idempotence : un renvoi identique ne crée pas de doublon (CHR-01). */
  idempotencyKey: z.string().max(80).optional(),
  /** Événements à relier immédiatement. */
  linkTo: z.array(z.string()).max(20).default([]),
});
export type CreateEventInput = z.input<typeof createEventSchema>;

export const correctEventSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  text: z.string().max(10000).optional(),
  retract: z.boolean().default(false),
  reason: z.string().max(500).default(''),
});
export type CorrectEventInput = z.input<typeof correctEventSchema>;

export const eventQuerySchema = z.object({
  q: z.string().max(120).optional(),
  types: z.string().optional(),
  categories: z.string().optional(),
  characterId: z.string().optional(),
  target: z.string().max(120).optional(),
  sessionNo: z.coerce.number().int().optional(),
  minImportance: z.coerce.number().int().min(1).max(5).optional(),
  correlationId: z.string().optional(),
  /** `recording` : seulement les événements déduits de l'enregistrement ; `manual` : tous les autres. */
  origin: z.enum(['manual', 'recording']).optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(100),
});
export type EventQuery = z.input<typeof eventQuerySchema>;

export interface EventDto {
  id: string;
  seq: number;
  campaignId: string;
  sessionNo: number | null;
  correlationId: string | null;
  type: string;
  category: EventCategory;
  title: string;
  text: string;
  importance: number;
  visibility: Visibility;
  actors: EntityRef[];
  targets: EntityRef[];
  places: string[];
  inGameDate: string | null;
  payload: Record<string, unknown>;
  source: 'system' | 'gm' | 'player';
  author: { id: string; name: string } | null;
  occurredAt: string;
  corrected: boolean;
  retracted: boolean;
}

export interface EventPageDto {
  events: EventDto[];
  nextBefore: number | null;
}

export interface EventLinkDto {
  id: string;
  fromId: string;
  toId: string;
}

export const createEventLinkSchema = z.object({ fromId: z.string(), toId: z.string() });

export const rollSchema = z.object({
  notation: z.string().min(1).max(40),
  label: z.string().max(80).default('Jet libre'),
  secret: z.boolean().default(false),
  characterId: z.string().optional(),
});
export type RollInput = z.input<typeof rollSchema>;

export interface RollResultDto {
  label: string;
  notation: string;
  rolls: number[];
  total: number;
  natural: number | null;
  eventId: string;
}
