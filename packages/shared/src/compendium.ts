import { ABILITY_KEYS, AREA_SHAPES, classDefSchema, RARITIES, type AbilityKey, type ClassDef, type CompendiumEntry, type Effect, type InventoryItem, type KnownSpell } from '@ds/rules';
import { z } from 'zod';

export const CREATION_KINDS = ['Arme', 'Armure', 'Objet merveilleux', 'Potion', 'Sort', 'Créature', 'Classe'] as const;
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
  /** Publiée dans la bibliothèque partagée : visible et importable par tous. */
  shared: z.boolean().default(false),
});
export type CreationInput = z.input<typeof creationSchema>;
export type Creation = z.infer<typeof creationSchema>;

export interface CreationDto extends Creation {
  id: string;
  ownerId: string;
  /** Création importée depuis la bibliothèque partagée : l'original. */
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Entrée de la bibliothèque partagée : une création publiée par un membre de l'instance. */
export interface SharedCreationDto extends CreationDto {
  ownerName: string;
  campaignName: string | null;
  /** Nombre d'imports par d'autres tables. */
  imports: number;
  /** Déjà importée (ou créée) par l'utilisateur. */
  owned: boolean;
}

export const sharedQuerySchema = z.object({
  q: z.string().max(120).optional(),
  kind: z.enum(CREATION_KINDS).optional(),
});

/** Import en masse depuis la bibliothèque partagée vers ses créations (et une campagne). */
export const importCreationsSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  campaignId: z.string().nullable().default(null),
});

export const giveCreationSchema = z.object({ characterId: z.string(), qty: z.number().int().min(1).max(999).default(1) });

export interface RulesetDto {
  id: string;
  name: string;
  version: string;
  license: string;
  attribution: string;
}

export type { CompendiumEntry };

// ───────────────────────────── De la Forge à la fiche ─────────────────────────────

type Mech = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const firstWord = (v: string) => v.trim().split(/[\s,;]+/)[0]?.toLowerCase() ?? '';

/** Effets passifs d'une création (Forge) traduits en passifs mécaniques de la fiche. */
export function creationEffects(c: Pick<Creation, 'effects'>): Effect[] {
  const out: Effect[] = [];
  for (const e of c.effects) {
    if (e.mode !== 'Passif') continue;
    const value = e.value.trim();
    const n = Number(value.replace(',', '.').replace(/[^\d.+-]/g, ''));
    switch (e.kind) {
      case 'Résistance':
        if (value) out.push({ type: 'resistance', damage: firstWord(value) });
        break;
      case 'Immunité':
        if (value) out.push({ type: 'immunity', damage: firstWord(value) });
        break;
      case 'Bonus de CA':
        if (Number.isFinite(n) && n) out.push({ type: 'ac_bonus', value: Math.trunc(n) });
        break;
      case 'Vitesse':
        if (Number.isFinite(n) && n) out.push({ type: 'speed', bonus: n });
        break;
      case 'Avantage':
        out.push({ type: 'advantage', roll: 'check', ...(value ? { against: value } : {}) });
        break;
    }
  }
  return out;
}

/** Objet de la Forge → ligne d'inventaire (avec ses passifs, son jet et son bonus d'arme). */
export function creationToItem(c: Creation & { id: string }, qty = 1): Omit<InventoryItem, 'id'> {
  const m = c.mech as Mech;
  const effects = creationEffects(c);
  const dice = c.kind === 'Arme' || c.kind === 'Potion' ? `${Number(m.n) || 1}d${Number(m.f) || 6}${c.kind === 'Potion' && Number(m.mod) ? `+${Number(m.mod)}` : ''}` : undefined;
  return {
    name: c.name, qty, weight: c.weight, container: 'Sac à dos', equipped: false, rarity: c.rarity,
    requiresAttunement: c.attune, attuned: false, ref: c.id, description: c.lore,
    ...(effects.length ? { effects } : {}),
    ...(dice ? { roll: dice } : {}),
    ...(c.kind === 'Arme' ? { damageType: str(m.dtype).toLowerCase() || 'tranchant', attackBonus: Number(m.bonus) || 0 } : {}),
  };
}

/** Sort de la Forge → sort du grimoire, mécaniques de combat comprises. */
export function creationToSpell(c: Creation & { id: string }): Omit<KnownSpell, 'id'> {
  const m = c.mech as Mech;
  const save = str(m.save);
  const shape = str(m.area);
  return {
    ref: c.id, name: c.name, level: Number(m.lvl ?? 1), school: str(m.school), castingTime: str(m.cast), range: str(m.range), duration: str(m.dur),
    concentration: Boolean(m.conc), ritual: Boolean(m.ritual), prepared: false, favorite: false, description: c.lore,
    ...(str(m.dice) ? { roll: str(m.dice) } : {}),
    ...(str(m.dtype) ? { damageType: str(m.dtype).toLowerCase() } : {}),
    ...(save && (ABILITY_KEYS as readonly string[]).includes(save) ? { save: save as AbilityKey, half: Boolean(m.half) } : {}),
    ...(m.attack ? { attack: true } : {}),
    ...(m.heal ? { heal: true } : {}),
    ...(shape && (AREA_SHAPES as readonly string[]).includes(shape) ? { area: { shape: shape as (typeof AREA_SHAPES)[number], size: Number(m.areaSize) || 6 } } : {}),
    ...(str(m.condition) ? { condition: str(m.condition) } : {}),
    ...(Number(m.targets) > 1 ? { targets: Number(m.targets) } : {}),
    ...(str(m.upcast) ? { upcast: str(m.upcast) } : {}),
  };
}

/** Classe de la Forge → définition de classe validée (null si incomplète). */
export function creationToClass(c: Creation & { id: string }): ClassDef | null {
  const parsed = classDefSchema.safeParse({ ...(c.mech as Mech), id: c.id, name: c.name, homebrew: true });
  return parsed.success ? (parsed.data as ClassDef) : null;
}
