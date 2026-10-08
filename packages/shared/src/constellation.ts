import { z } from 'zod';

export const NODE_KINDS = ['pc', 'npc', 'event', 'place', 'faction', 'item', 'free'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_KIND_META: Record<NodeKind, { label: string; color: string }> = {
  pc: { label: 'PJ', color: '#4fb3ff' },
  npc: { label: 'PNJ', color: '#e8d3a0' },
  event: { label: 'Événement', color: '#e07aa8' },
  place: { label: 'Lieu', color: '#b9a4e0' },
  faction: { label: 'Faction', color: '#c9a96a' },
  item: { label: 'Objet', color: '#8fbf6a' },
  free: { label: 'Idée', color: '#a79c8a' },
};

export const LINK_TYPES = ['a affecté', 'aime', 'déteste', 'connaît', 'dirige', 'a causé', 'se trouve à', 'possède', 'craint', 'doit'] as const;

export const createNodeSchema = z.object({
  kind: z.enum(NODE_KINDS),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(''),
  refType: z.enum(['character', 'event']).nullable().default(null),
  refId: z.string().max(64).nullable().default(null),
  color: z.string().max(20).nullable().default(null),
  playerVisible: z.boolean().default(false),
});
export type CreateNodeInput = z.input<typeof createNodeSchema>;

export const updateNodeSchema = z.object({
  kind: z.enum(NODE_KINDS).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  color: z.string().max(20).nullable().optional(),
  playerVisible: z.boolean().optional(),
  pinned: z.boolean().optional(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }).nullable().optional(),
});
export type UpdateNodeInput = z.input<typeof updateNodeSchema>;

export const createLinkSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: z.string().trim().min(1).max(40).default('connaît'),
  /** Polarité : -5 (hostile) … +5 (allié). */
  valence: z.number().int().min(-5).max(5).default(0),
  /** Intensité : 0 … 5. */
  intensity: z.number().int().min(0).max(5).default(1),
  note: z.string().max(2000).default(''),
  playerVisible: z.boolean().default(false),
  /** Crée aussi le lien inverse. */
  reciprocal: z.boolean().default(false),
  sourceEventId: z.string().nullable().default(null),
});
export type CreateLinkInput = z.input<typeof createLinkSchema>;

export const updateLinkSchema = z.object({
  type: z.string().trim().min(1).max(40).optional(),
  valence: z.number().int().min(-5).max(5).optional(),
  intensity: z.number().int().min(0).max(5).optional(),
  note: z.string().max(2000).optional(),
  playerVisible: z.boolean().optional(),
});
export type UpdateLinkInput = z.input<typeof updateLinkSchema>;

export interface NodeDto {
  id: string;
  kind: NodeKind;
  label: string;
  description: string;
  refType: 'character' | 'event' | null;
  refId: string | null;
  color: string | null;
  playerVisible: boolean;
  pinned: boolean;
  position: { x: number; y: number; z: number } | null;
}

export interface LinkDto {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  valence: number;
  intensity: number;
  note: string;
  playerVisible: boolean;
  sourceEventId: string | null;
}

export interface ConstellationDto {
  nodes: NodeDto[];
  links: LinkDto[];
}

export interface LinkSuggestionDto {
  key: string;
  fromId: string;
  toId: string;
  type: string;
  valence: number;
  eventId: string;
  eventTitle: string;
}
