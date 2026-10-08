import { ABILITY_KEYS, inventoryItemSchema, knownSpellSchema, modelUrlSchema, SKILL_KEYS, type DerivedSheet, type Dnd5eSheet } from '@ds/rules';
import { z } from 'zod';

const abilityScores = z.object(Object.fromEntries(ABILITY_KEYS.map((k) => [k, z.number().int().min(3).max(20)])) as Record<(typeof ABILITY_KEYS)[number], z.ZodNumber>);

export const createPcSchema = z.object({
  kind: z.literal('pc'),
  name: z.string().trim().min(1).max(60),
  species: z.string().min(1).max(60),
  className: z.string().min(1).max(60),
  level: z.number().int().min(1).max(20).optional(),
  background: z.string().max(60).default(''),
  alignment: z.string().max(40).default(''),
  abilities: abilityScores,
  skills: z.array(z.enum(SKILL_KEYS as [string, ...string[]])).max(8).default([]),
  portraitUrl: z.string().max(2000).optional(),
  /** Le MJ peut créer un PJ pour un joueur. */
  ownerId: z.string().optional(),
});

export const npcDataSchema = z.object({
  species: z.string().max(60).default(''),
  job: z.string().max(80).default(''),
  trait: z.string().max(500).default(''),
  goal: z.string().max(500).default(''),
  /** Visible du MJ uniquement. */
  secret: z.string().max(2000).default(''),
  attitude: z.enum(['amical', 'neutre', 'hostile']).default('neutre'),
  notes: z.string().max(10000).default(''),
});
export type NpcData = z.infer<typeof npcDataSchema>;

export const createNpcSchema = z.object({
  kind: z.literal('npc'),
  name: z.string().trim().min(1).max(60),
  npc: npcDataSchema.default({}),
  visibleToPlayers: z.boolean().default(false),
  portraitUrl: z.string().max(2000).optional(),
  /** Crée aussi le nœud correspondant dans la Constellation (CST-10). */
  addToConstellation: z.boolean().default(true),
});

export const createCharacterSchema = z.discriminatedUnion('kind', [createPcSchema, createNpcSchema]);
export type CreateCharacterInput = z.input<typeof createCharacterSchema>;

export const updateCharacterSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  portraitUrl: z.string().max(2000).nullable().optional(),
  /** Modèle 3D importé par le joueur (ou le MJ pour un PNJ). */
  modelUrl: modelUrlSchema.nullable().optional(),
  visibleToPlayers: z.boolean().optional(),
  npc: npcDataSchema.partial().optional(),
  /** Fiche complète (validée par le schéma du ruleset). */
  sheet: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCharacterInput = z.input<typeof updateCharacterSchema>;

/**
 * Actions sur une fiche qui produisent un événement de Chronique (règle transverse FND :
 * « toute mutation significative émet un événement »).
 */
export const characterActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('damage'), amount: z.number().int().min(0).max(9999) }),
  z.object({ type: z.literal('heal'), amount: z.number().int().min(0).max(9999) }),
  z.object({ type: z.literal('temp_hp'), amount: z.number().int().min(0).max(9999) }),
  z.object({ type: z.literal('short_rest'), hitDice: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal('long_rest') }),
  z.object({ type: z.literal('gain_xp'), amount: z.number().int().min(1).max(1_000_000), reason: z.string().max(200).default('') }),
  z.object({ type: z.literal('level_up') }),
  z.object({ type: z.literal('add_item'), item: inventoryItemSchema.omit({ id: true }) }),
  z.object({ type: z.literal('remove_item'), itemId: z.string() }),
  z.object({ type: z.literal('add_spell'), spell: knownSpellSchema.omit({ id: true }) }),
  z.object({ type: z.literal('cast_spell'), spellId: z.string(), slotLevel: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal('death_save'), success: z.boolean() }),
]);
export type CharacterAction = z.input<typeof characterActionSchema>;

export interface CharacterSummaryDto {
  id: string;
  campaignId: string;
  campaignName: string;
  kind: 'pc' | 'npc';
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  portraitUrl: string | null;
  modelUrl: string | null;
  /** « Elfe · Rôdeur 5 » pour un PJ, « Naine · Forgeronne » pour un PNJ. */
  subtitle: string;
  level: number | null;
  hp: { current: number; max: number } | null;
  canEdit: boolean;
}

export interface CharacterDto extends CharacterSummaryDto {
  rulesetId: string;
  sheet: Dnd5eSheet | null;
  derived: DerivedSheet | null;
  npc: NpcData | null;
  visibleToPlayers: boolean;
  updatedAt: string;
}

export const noteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(20000).default(''),
  pinned: z.boolean().default(false),
  shared: z.boolean().default(false),
});
export type NoteInput = z.input<typeof noteSchema>;

export interface NoteDto {
  id: string;
  characterId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  pinned: boolean;
  shared: boolean;
  sessionNo: number | null;
  updatedAt: string;
}
