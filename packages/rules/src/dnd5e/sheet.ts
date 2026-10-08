import { z } from 'zod';
import { ABILITY_KEYS, abilityModifier, type AbilityKey, type AbilityScores } from './abilities';
import { CLASSES, getClass } from './classes';
import { clampLevel, levelForXp, maxHpFor, proficiencyBonus, spellSlotsFor, xpForNextLevel } from './progression';
import { SKILLS, proficiencyContribution, type ProficiencyLevel, type SkillKey } from './skills';
import { getSpecies } from './species';

const abilityKey = z.enum(ABILITY_KEYS);
const scores = z.object(Object.fromEntries(ABILITY_KEYS.map((k) => [k, z.number().int().min(1).max(30)])) as Record<AbilityKey, z.ZodNumber>);

export const RARITIES = ['Commun', 'Peu commun', 'Rare', 'Très rare', 'Légendaire'] as const;
export type Rarity = (typeof RARITIES)[number];

export const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  qty: z.number().int().min(0).max(99999),
  weight: z.number().min(0).max(10000),
  container: z.string().max(60).default('Sac à dos'),
  equipped: z.boolean().default(false),
  rarity: z.enum(RARITIES).default('Commun'),
  requiresAttunement: z.boolean().default(false),
  attuned: z.boolean().default(false),
  /** Référence vers une entrée du compendium ou une création du Sanctuaire. */
  ref: z.string().optional(),
  description: z.string().max(4000).optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const knownSpellSchema = z.object({
  id: z.string(),
  ref: z.string().optional(),
  name: z.string().min(1).max(120),
  level: z.number().int().min(0).max(9),
  school: z.string().max(40).optional(),
  castingTime: z.string().max(60).optional(),
  range: z.string().max(60).optional(),
  duration: z.string().max(60).optional(),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  prepared: z.boolean().default(false),
  favorite: z.boolean().default(false),
  description: z.string().max(4000).optional(),
  /** Jet associé (dégâts ou soins), en notation de dés. */
  roll: z.string().max(40).optional(),
});
export type KnownSpell = z.infer<typeof knownSpellSchema>;

export const coinsSchema = z.object({
  pc: z.number().int().min(0), pa: z.number().int().min(0), pe: z.number().int().min(0),
  po: z.number().int().min(0), pp: z.number().int().min(0),
});
export type Coins = z.infer<typeof coinsSchema>;

/** Fiche D&D 5e. Les valeurs dérivées ne sont pas stockées : voir `deriveSheet`. */
export const dnd5eSheetSchema = z.object({
  species: z.string().max(60),
  className: z.string().max(60),
  subclass: z.string().max(60).optional(),
  background: z.string().max(60).default(''),
  alignment: z.string().max(40).default(''),
  level: z.number().int().min(1).max(20),
  xp: z.number().int().min(0),
  abilities: scores,
  saveProficiencies: z.array(abilityKey),
  skills: z.record(z.string(), z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])),
  hp: z.object({ current: z.number().int().min(0), max: z.number().int().min(1), temp: z.number().int().min(0) }),
  hitDice: z.object({ die: z.number().int(), total: z.number().int().min(0), used: z.number().int().min(0) }),
  deathSaves: z.object({ successes: z.number().int().min(0).max(3), failures: z.number().int().min(0).max(3) }),
  armorClass: z.number().int().min(0).max(40),
  /** Vitesse en mètres. */
  speed: z.number().min(0).max(100),
  inspiration: z.boolean().default(false),
  spellcasting: z
    .object({
      ability: abilityKey,
      slots: z.record(z.string(), z.object({ max: z.number().int().min(0), used: z.number().int().min(0) })),
      spells: z.array(knownSpellSchema),
    })
    .nullable(),
  inventory: z.array(inventoryItemSchema),
  coins: coinsSchema,
  traits: z.array(z.object({ name: z.string(), source: z.string().default(''), description: z.string().default('') })),
  defenses: z.object({ resistances: z.array(z.string()), immunities: z.array(z.string()), senses: z.string().default('') }),
  conditions: z.array(z.string()).default([]),
  /** Valeurs forcées par le MJ/joueur (« l'outil assiste, ne bloque pas »), affichées avec un marqueur. */
  overrides: z.record(z.string(), z.number()).default({}),
  portraitUrl: z.string().max(2000).optional(),
  biography: z.string().max(20000).default(''),
});
export type Dnd5eSheet = z.infer<typeof dnd5eSheetSchema>;

export interface CreateCharacterInput {
  species: string;
  className: string;
  level?: number;
  background?: string;
  alignment?: string;
  /** Scores AVANT bonus d'espèce. */
  abilities: AbilityScores;
  skills?: SkillKey[];
}

export function createDnd5eSheet(input: CreateCharacterInput): Dnd5eSheet {
  const cls = getClass(input.className) ?? CLASSES[5]!;
  const species = getSpecies(input.species);
  const level = clampLevel(input.level ?? 1);
  const abilities = { ...input.abilities };
  for (const [k, bonus] of Object.entries(species?.abilityBonuses ?? {})) {
    abilities[k as AbilityKey] = Math.min(20, abilities[k as AbilityKey] + (bonus ?? 0));
  }
  const conMod = abilityModifier(abilities.con);
  const maxHp = maxHpFor(cls.hitDie, level, conMod);
  const slots = spellSlotsFor(cls.caster, level);
  const skillLevels: Record<string, ProficiencyLevel> = {};
  for (const s of input.skills ?? []) skillLevels[s] = 1;
  const dexMod = abilityModifier(abilities.dex);
  let armorClass = 10 + dexMod;
  if (cls.id === 'barbarian') armorClass += conMod;
  if (cls.id === 'monk') armorClass += abilityModifier(abilities.wis);

  return {
    species: species?.name ?? input.species,
    className: cls.name,
    background: input.background ?? '',
    alignment: input.alignment ?? '',
    level,
    xp: level === 1 ? 0 : (xpForNextLevel(level - 1) ?? 0),
    abilities,
    saveProficiencies: [...cls.saves],
    skills: skillLevels,
    hp: { current: maxHp, max: maxHp, temp: 0 },
    hitDice: { die: cls.hitDie, total: level, used: 0 },
    deathSaves: { successes: 0, failures: 0 },
    armorClass,
    speed: species?.speed ?? 9,
    inspiration: false,
    spellcasting: cls.caster
      ? {
          ability: cls.spellAbility ?? 'int',
          slots: Object.fromEntries(Object.entries(slots).map(([lvl, max]) => [lvl, { max, used: 0 }])),
          spells: [],
        }
      : null,
    inventory: [],
    coins: { pc: 0, pa: 0, pe: 0, po: 10, pp: 0 },
    traits: [
      ...(species?.traits.map((t) => ({ name: t.name, source: species.name, description: t.summary })) ?? []),
      ...cls.features.filter((f) => f.level <= level).map((f) => ({ name: f.name, source: `${cls.name} ${f.level}`, description: f.summary })),
    ],
    defenses: {
      resistances: [],
      immunities: [],
      senses: species?.darkvision ? `Vision dans le noir ${species.darkvision} m` : '',
    },
    conditions: [],
    overrides: {},
    biography: '',
  };
}

export interface DerivedSheet {
  proficiencyBonus: number;
  modifiers: Record<AbilityKey, number>;
  saves: Record<AbilityKey, { value: number; proficient: boolean }>;
  skills: { key: SkillKey; name: string; ability: AbilityKey; value: number; level: ProficiencyLevel }[];
  initiative: number;
  passivePerception: number;
  armorClass: number;
  spellSaveDc: number | null;
  spellAttack: number | null;
  carried: number;
  /** Capacité de charge en kg (FOR × 7,5). */
  capacity: number;
  attunedCount: number;
  xpNext: number | null;
  levelFromXp: number;
  /** Clés dérivées remplacées par une valeur forcée. */
  overridden: string[];
}

export function deriveSheet(sheet: Dnd5eSheet): DerivedSheet {
  const pb = proficiencyBonus(sheet.level);
  const modifiers = Object.fromEntries(ABILITY_KEYS.map((k) => [k, abilityModifier(sheet.abilities[k])])) as Record<AbilityKey, number>;
  const saves = Object.fromEntries(
    ABILITY_KEYS.map((k) => {
      const proficient = sheet.saveProficiencies.includes(k);
      return [k, { value: modifiers[k] + (proficient ? pb : 0), proficient }];
    }),
  ) as DerivedSheet['saves'];
  const skills = SKILLS.map((s) => {
    const level = (sheet.skills[s.key] ?? 0) as ProficiencyLevel;
    return { key: s.key, name: s.name, ability: s.ability, value: modifiers[s.ability] + proficiencyContribution(level, pb), level };
  });
  const perception = skills.find((s) => s.key === 'perception')?.value ?? modifiers.wis;
  const spellAbility = sheet.spellcasting?.ability;
  const o = sheet.overrides;
  const pick = (key: string, value: number) => (o[key] !== undefined ? o[key]! : value);

  return {
    proficiencyBonus: pb,
    modifiers,
    saves,
    skills,
    initiative: pick('initiative', modifiers.dex),
    passivePerception: pick('passivePerception', 10 + perception),
    armorClass: pick('armorClass', sheet.armorClass),
    spellSaveDc: spellAbility ? pick('spellSaveDc', 8 + pb + modifiers[spellAbility]) : null,
    spellAttack: spellAbility ? pick('spellAttack', pb + modifiers[spellAbility]) : null,
    carried: Math.round(sheet.inventory.reduce((acc, i) => acc + i.qty * i.weight, 0) * 100) / 100,
    capacity: sheet.abilities.str * 7.5,
    attunedCount: sheet.inventory.filter((i) => i.attuned).length,
    xpNext: xpForNextLevel(sheet.level),
    levelFromXp: levelForXp(sheet.xp),
    overridden: Object.keys(o),
  };
}

export const MAX_ATTUNED = 3;

/** Dégâts : les PV temporaires absorbent d'abord. Retourne la nouvelle fiche (immuable). */
export function applyDamage(sheet: Dnd5eSheet, amount: number): Dnd5eSheet {
  const dmg = Math.max(0, Math.trunc(amount));
  const absorbed = Math.min(sheet.hp.temp, dmg);
  const current = Math.max(0, sheet.hp.current - (dmg - absorbed));
  return { ...sheet, hp: { ...sheet.hp, temp: sheet.hp.temp - absorbed, current } };
}

export function applyHealing(sheet: Dnd5eSheet, amount: number): Dnd5eSheet {
  const heal = Math.max(0, Math.trunc(amount));
  const current = Math.min(sheet.hp.max, sheet.hp.current + heal);
  return {
    ...sheet,
    hp: { ...sheet.hp, current },
    deathSaves: current > 0 ? { successes: 0, failures: 0 } : sheet.deathSaves,
  };
}

export function setTempHp(sheet: Dnd5eSheet, amount: number): Dnd5eSheet {
  // Les PV temporaires ne se cumulent pas : on garde la plus haute valeur.
  return { ...sheet, hp: { ...sheet.hp, temp: Math.max(sheet.hp.temp, Math.max(0, Math.trunc(amount))) } };
}

/** Repos long : PV max, emplacements, moitié des dés de vie (au moins 1). */
export function longRest(sheet: Dnd5eSheet): Dnd5eSheet {
  const recovered = Math.max(1, Math.floor(sheet.hitDice.total / 2));
  return {
    ...sheet,
    hp: { ...sheet.hp, current: sheet.hp.max, temp: 0 },
    hitDice: { ...sheet.hitDice, used: Math.max(0, sheet.hitDice.used - recovered) },
    deathSaves: { successes: 0, failures: 0 },
    spellcasting: sheet.spellcasting
      ? {
          ...sheet.spellcasting,
          slots: Object.fromEntries(Object.entries(sheet.spellcasting.slots).map(([k, s]) => [k, { ...s, used: 0 }])),
        }
      : null,
  };
}

/** Repos court : dépense de dés de vie (le résultat du jet est fourni par l'appelant). */
export function shortRest(sheet: Dnd5eSheet, hitDiceSpent: number, healed: number): Dnd5eSheet {
  const spend = Math.max(0, Math.min(hitDiceSpent, sheet.hitDice.total - sheet.hitDice.used));
  const next = applyHealing(sheet, healed);
  const isPact = getClass(sheet.className)?.caster === 'pact';
  return {
    ...next,
    hitDice: { ...sheet.hitDice, used: sheet.hitDice.used + spend },
    spellcasting:
      next.spellcasting && isPact
        ? { ...next.spellcasting, slots: Object.fromEntries(Object.entries(next.spellcasting.slots).map(([k, s]) => [k, { ...s, used: 0 }])) }
        : next.spellcasting,
  };
}

/**
 * Passage de niveau guidé : PV moyens + CON, dés de vie, emplacements, nouvelles aptitudes.
 * Retourne `null` si le niveau 20 est déjà atteint.
 */
export function levelUp(sheet: Dnd5eSheet, hpGain?: number): Dnd5eSheet | null {
  if (sheet.level >= 20) return null;
  const cls = getClass(sheet.className);
  const level = sheet.level + 1;
  const conMod = abilityModifier(sheet.abilities.con);
  const die = cls?.hitDie ?? sheet.hitDice.die;
  const gain = Math.max(1, hpGain ?? die / 2 + 1 + conMod);
  const slots = spellSlotsFor(cls?.caster ?? null, level);
  const newFeatures = (cls?.features ?? []).filter((f) => f.level === level);
  return {
    ...sheet,
    level,
    xp: Math.max(sheet.xp, xpForNextLevel(sheet.level) ?? sheet.xp),
    hp: { ...sheet.hp, max: sheet.hp.max + gain, current: sheet.hp.current + gain },
    hitDice: { ...sheet.hitDice, total: level },
    spellcasting: sheet.spellcasting
      ? {
          ...sheet.spellcasting,
          slots: Object.fromEntries(
            Object.entries(slots).map(([lvl, max]) => [lvl, { max, used: Math.min(max, sheet.spellcasting!.slots[lvl]?.used ?? 0) }]),
          ),
        }
      : null,
    traits: [...sheet.traits, ...newFeatures.map((f) => ({ name: f.name, source: `${cls!.name} ${f.level}`, description: f.summary }))],
  };
}
