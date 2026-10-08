import { RARITIES, type CompendiumEntry } from '@ds/rules';
import { z } from 'zod';

export const CREATION_KINDS = ['Arme', 'Armure', 'Objet merveilleux', 'Potion', 'Sort', 'Créature'] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

export const effectSchema = z.object({
  id: z.string(),
  mode: z.enum(['Passif', 'Actif']),
  trigger: z.string().max(80),
  kind: z.string().max(60),
  value: z.string().max(120).default(''),
  charges: z.number().int().min(0).max(100).default(0),
  recharge: z.string().max(40).default('Aube'),
  desc: z.string().max(1000).default(''),
});
export type CreationEffect = z.infer<typeof effectSchema>;

/** Création du Sanctuaire (la Forge) : objet, sort ou créature personnalisés (FND-41, FND-32). */
export const creationSchema = z.object({
  kind: z.enum(CREATION_KINDS),
  name: z.string().trim().min(1, 'Donnez un nom à votre création.').max(120),
  rarity: z.enum(RARITIES).default('Peu commun'),
  attune: z.boolean().default(false),
  weight: z.number().min(0).max(10000).default(0),
  price: z.number().min(0).max(10_000_000).default(0),
  /** Mécaniques propres au type (dégâts, CA, niveau de sort, statistiques…). */
  mech: z.record(z.string(), z.unknown()).default({}),
  frame: z.enum(['Simple', 'Runique', 'Orné']).default('Runique'),
  halo: z.boolean().default(false),
  tint: z.string().max(20).nullable().default(null),
  imageUrl: z.string().max(2000).nullable().default(null),
  effects: z.array(effectSchema).max(12).default([]),
  lore: z.string().max(4000).default(''),
  campaignId: z.string().nullable().default(null),
});
export type CreationInput = z.input<typeof creationSchema>;
export type Creation = z.infer<typeof creationSchema>;

export interface CreationDto extends Creation {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const giveCreationSchema = z.object({ characterId: z.string(), qty: z.number().int().min(1).max(999).default(1) });

export interface RulesetDto {
  id: string;
  name: string;
  version: string;
  license: string;
  attribution: string;
}

export type { CompendiumEntry };
