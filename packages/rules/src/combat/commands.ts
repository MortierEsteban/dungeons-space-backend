import { z } from 'zod';
import { OBJECT_KINDS, TERRAIN_KINDS, ZONE_SHAPES } from './types';

/** Seuls les modèles téléversés sur l'instance sont acceptés (jamais d'URL externe arbitraire). */
export const modelUrlSchema = z.string().regex(/^\/uploads\/[A-Za-z0-9-]+\.glb$/, 'Modèle 3D invalide (fichier .glb téléversé attendu).');

const cell = z.object({ x: z.number().int().min(0).max(199), y: z.number().int().min(0).max(199) });
const id = z.string().min(1).max(64);
const quickAttack = z.object({
  name: z.string().min(1).max(60),
  bonus: z.number().int().min(-10).max(30),
  damage: z.string().min(1).max(40),
  damageType: z.string().max(30).default(''),
});

/** Créature entièrement spécifiée (le serveur résout fiches et bestiaire avant `decide`). */
export const combatantSpecSchema = z.object({
  name: z.string().min(1).max(60),
  short: z.string().max(3).optional(),
  kind: z.enum(['pc', 'npc', 'monster']),
  side: z.enum(['ally', 'enemy', 'neutral']),
  hp: z.number().int().min(0).max(9999),
  maxHp: z.number().int().min(1).max(9999),
  ac: z.number().int().min(0).max(40),
  initiativeMod: z.number().int().min(-10).max(20).default(0),
  speed: z.number().min(0).max(100).default(9),
  size: z.number().int().min(1).max(4).default(1),
  position: cell.nullable().default(null),
  characterId: z.string().nullable().default(null),
  monsterId: z.string().nullable().default(null),
  ownerUserId: z.string().nullable().default(null),
  hidden: z.boolean().optional(),
  attack: quickAttack.nullable().default(null),
  portraitUrl: z.string().max(2000).nullable().default(null),
  modelUrl: modelUrlSchema.nullable().default(null),
});
export type CombatantSpec = z.infer<typeof combatantSpecSchema>;

/**
 * Commandes envoyées par les clients. Les commandes `add_character` / `add_monster`
 * sont résolues côté serveur en `add_combatant`.
 */
export const combatCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_character'), characterId: id, position: cell.optional() }),
  z.object({ type: z.literal('add_monster'), monsterId: id, count: z.number().int().min(1).max(12).default(1), position: cell.optional() }),
  z.object({ type: z.literal('add_combatant'), spec: combatantSpecSchema }),
  z.object({
    type: z.literal('update_combatant'),
    combatantId: id,
    patch: z.object({
      name: z.string().min(1).max(60).optional(),
      ac: z.number().int().min(0).max(40).optional(),
      maxHp: z.number().int().min(1).max(9999).optional(),
      hidden: z.boolean().optional(),
      side: z.enum(['ally', 'enemy', 'neutral']).optional(),
      initiativeMod: z.number().int().min(-10).max(20).optional(),
    }),
  }),
  z.object({ type: z.literal('remove_combatant'), combatantId: id }),
  /** Apparence 3D : le propriétaire (ou le MJ) remplace le jeton par un modèle, ou revient au jeton (null). */
  z.object({ type: z.literal('set_model'), combatantId: id, modelUrl: modelUrlSchema.nullable() }),
  z.object({ type: z.literal('set_initiative'), combatantId: id, value: z.number().int().min(-10).max(50) }),
  z.object({ type: z.literal('roll_initiative'), combatantIds: z.array(id).optional() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('next_turn') }),
  z.object({ type: z.literal('end'), summary: z.string().max(2000).default('') }),
  z.object({ type: z.literal('move'), combatantId: id, to: cell }),
  z.object({
    type: z.literal('change_hp'),
    combatantId: id,
    amount: z.number().int().min(0).max(9999),
    mode: z.enum(['damage', 'heal', 'temp']),
    damageType: z.string().max(30).optional(),
  }),
  z.object({ type: z.literal('toggle_condition'), combatantId: id, name: z.string().min(1).max(40), rounds: z.number().int().min(1).max(100).nullable().default(null) }),
  z.object({
    type: z.literal('attack'),
    attackerId: id,
    targetId: id,
    advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
    attack: quickAttack.optional(),
  }),
  z.object({ type: z.literal('use_resource'), combatantId: id, resource: z.enum(['action', 'bonus', 'reaction']) }),
  z.object({ type: z.literal('roll'), notation: z.string().min(1).max(40), label: z.string().max(80).default('Jet libre'), secret: z.boolean().default(false) }),
  z.object({ type: z.literal('resize_map'), cols: z.number().int().min(4).max(80), rows: z.number().int().min(4).max(80) }),
  z.object({ type: z.literal('set_background'), url: z.string().max(2_000_000).nullable() }),
  z.object({ type: z.literal('paint_terrain'), cells: z.array(cell).min(1).max(2000), terrain: z.enum(TERRAIN_KINDS).nullable() }),
  z.object({
    type: z.literal('add_zone'),
    shape: z.enum(ZONE_SHAPES),
    origin: cell,
    size: z.number().int().min(1).max(40),
    direction: z.number().int().min(0).max(7).default(0),
    color: z.string().max(20).default('#7cc6ff'),
    label: z.string().max(60).default(''),
  }),
  z.object({ type: z.literal('remove_zone'), zoneId: id }),
  z.object({ type: z.literal('add_object'), kind: z.enum(OBJECT_KINDS), position: cell, label: z.string().max(60).optional(), secret: z.boolean().optional() }),
  z.object({
    type: z.literal('update_object'),
    objectId: id,
    patch: z.object({ position: cell.optional(), open: z.boolean().optional(), revealed: z.boolean().optional(), label: z.string().max(60).optional() }),
  }),
  z.object({ type: z.literal('remove_object'), objectId: id }),
]);
export type CombatCommand = z.infer<typeof combatCommandSchema>;
export type CombatCommandType = CombatCommand['type'];
