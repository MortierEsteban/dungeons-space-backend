import { z } from 'zod';
import { ABILITY_KEYS, abilityModifier, type AbilityKey, type AbilityScores } from './abilities';
import { CLASSES, classDefSchema, getClass, type ClassDef, type ClassFeature } from './classes';
import { ITEMS } from './content/items';
import { describeEffect, effectSchema, tryFormula, type Effect, type Recharge, type ResourceDef, type SourcedEffect } from './effects';
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
  /** Passifs de l'objet (actifs quand il est équipé, ou harmonisé s'il l'exige). */
  effects: z.array(effectSchema).max(12).optional(),
  /** Jet associé (potion : soins ; arme personnalisée : dégâts), en notation de dés. */
  roll: z.string().max(40).optional(),
  /** Arme personnalisée : bonus magique et type de dégâts. */
  attackBonus: z.number().int().min(-5).max(10).optional(),
  damageType: z.string().max(30).optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const AREA_SHAPES = ['cone', 'sphere', 'line', 'cube', 'cylinder'] as const;

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
  // Mécaniques de combat (copiées du compendium ou de la Forge ; sinon retrouvées via `ref`).
  area: z.object({ shape: z.enum(AREA_SHAPES), size: z.number().min(0).max(200) }).optional(),
  save: abilityKey.optional(),
  half: z.boolean().optional(),
  attack: z.boolean().optional(),
  heal: z.boolean().optional(),
  damageType: z.string().max(30).optional(),
  condition: z.string().max(40).optional(),
  targets: z.number().int().min(1).max(10).optional(),
  upcast: z.string().max(20).optional(),
});
export type KnownSpell = z.infer<typeof knownSpellSchema>;

export const coinsSchema = z.object({
  pc: z.number().int().min(0), pa: z.number().int().min(0), pe: z.number().int().min(0),
  po: z.number().int().min(0), pp: z.number().int().min(0),
});
export type Coins = z.infer<typeof coinsSchema>;

export const traitSchema = z.object({
  name: z.string(),
  source: z.string().default(''),
  description: z.string().default(''),
  /** Passifs explicites ; absent = ceux du catalogue (espèce, classe) pour ce trait. */
  effects: z.array(effectSchema).max(12).optional(),
});
export type Trait = z.infer<typeof traitSchema>;

/** Fiche D&D 5e. Les valeurs dérivées ne sont pas stockées : voir `deriveSheet`. */
export const dnd5eSheetSchema = z.object({
  species: z.string().max(60),
  className: z.string().max(60),
  subclass: z.string().max(60).optional(),
  /** Classe homebrew (Forge) : définition embarquée, tenue à jour quand la création change. */
  customClass: classDefSchema.optional(),
  /** Identifiant de la création (Forge) dont provient la classe homebrew. */
  classRef: z.string().max(64).optional(),
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
  traits: z.array(traitSchema),
  defenses: z.object({ resistances: z.array(z.string()), immunities: z.array(z.string()), senses: z.string().default('') }),
  conditions: z.array(z.string()).default([]),
  /** Usages dépensés des ressources de classe et d'espèce (rage, ki…), par identifiant. */
  resources: z.record(z.string(), z.object({ used: z.number().int().min(0) })).default({}),
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
  /** Classe homebrew : remplace la classe du SRD. */
  customClass?: ClassDef;
  classRef?: string;
}

/** Classe de la fiche : la classe homebrew embarquée, sinon celle du SRD. */
export function classOf(sheet: Pick<Dnd5eSheet, 'className' | 'customClass'>): ClassDef | undefined {
  return sheet.customClass ? { ...sheet.customClass, homebrew: true } : getClass(sheet.className);
}

const featureTrait = (cls: ClassDef, f: ClassFeature): Trait => ({ name: f.name, source: `${cls.name} ${f.level}`, description: f.summary, ...(f.effects ? { effects: f.effects } : {}) });

/** Passifs des aptitudes de classe acquises à ce niveau. */
function classEffects(cls: ClassDef | undefined, level: number): Effect[] {
  return (cls?.features ?? []).filter((f) => f.level <= level).flatMap((f) => f.effects ?? []);
}

export function createDnd5eSheet(input: CreateCharacterInput): Dnd5eSheet {
  const cls = input.customClass ?? getClass(input.className) ?? CLASSES[5]!;
  const species = getSpecies(input.species);
  const level = clampLevel(input.level ?? 1);
  const abilities = { ...input.abilities };
  for (const [k, bonus] of Object.entries(species?.abilityBonuses ?? {})) {
    abilities[k as AbilityKey] = Math.min(20, abilities[k as AbilityKey] + (bonus ?? 0));
  }
  const conMod = abilityModifier(abilities.con);
  const startEffects = [...classEffects(cls, level), ...(species?.traits.flatMap((t) => t.effects ?? []) ?? [])];
  const hpPerLevel = startEffects.reduce((a, e) => a + (e.type === 'hp_per_level' ? e.value : 0), 0);
  const maxHp = maxHpFor(cls.hitDie, level, conMod) + hpPerLevel * level;
  const slots = spellSlotsFor(cls.caster, level);
  const skillLevels: Record<string, ProficiencyLevel> = {};
  for (const s of input.skills ?? []) skillLevels[s] = 1;
  const dexMod = abilityModifier(abilities.dex);
  // CA de départ : la meilleure défense sans armure de la classe, sinon 10 + DEX.
  let armorClass = 10 + dexMod;
  for (const e of startEffects) if (e.type === 'unarmored_ac') armorClass = Math.max(armorClass, e.base + e.abilities.reduce((a, k) => a + abilityModifier(abilities[k]), 0));

  return {
    species: species?.name ?? input.species,
    className: cls.name,
    ...(input.customClass ? { customClass: { ...input.customClass, homebrew: true } } : {}),
    ...(input.classRef ? { classRef: input.classRef } : {}),
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
      ...(species?.traits.map((t) => ({ name: t.name, source: species.name, description: t.summary, ...(t.effects ? { effects: t.effects } : {}) })) ?? []),
      ...cls.features.filter((f) => f.level <= level).map((f) => featureTrait(cls, f)),
    ],
    defenses: {
      resistances: [],
      immunities: [],
      senses: species?.darkvision ? `Vision dans le noir ${species.darkvision} m` : '',
    },
    conditions: [],
    resources: {},
    overrides: {},
    biography: '',
  };
}

// ───────────────────────────── Traits & passifs ─────────────────────────────

export interface DerivedTrait extends Trait {
  /** Passifs effectivement appliqués (explicites ou issus du catalogue). */
  effects: Effect[];
  /** Trait du catalogue (espèce, classe) absent de la fiche : ajouté automatiquement. */
  fromCatalog: boolean;
}

/**
 * Traits de la fiche fusionnés avec le catalogue (espèce + aptitudes de classe acquises) :
 * une fiche ancienne ou incomplète reçoit quand même ses passifs ; un trait modifié sur la fiche
 * (ex. ascendance draconique) l'emporte sur le catalogue.
 */
export function sheetTraits(sheet: Dnd5eSheet): DerivedTrait[] {
  const species = getSpecies(sheet.species);
  const cls = classOf(sheet);
  const catalog: Trait[] = [
    ...(species?.traits.map((t) => ({ name: t.name, source: species.name, description: t.summary, effects: t.effects ?? [] })) ?? []),
    ...(cls?.features.filter((f) => f.level <= sheet.level).map((f) => ({ ...featureTrait(cls, f), effects: f.effects ?? [] })) ?? []),
  ];
  const sameOrigin = (a: Trait, b: Trait) => a.name.toLowerCase() === b.name.toLowerCase() && (a.source.split(' ')[0] ?? '') === (b.source.split(' ')[0] ?? '');
  const out: DerivedTrait[] = sheet.traits.map((t) => {
    const ref = catalog.find((c) => sameOrigin(c, t));
    return { ...t, effects: t.effects ?? ref?.effects ?? [], fromCatalog: false };
  });
  for (const c of catalog) if (!sheet.traits.some((t) => sameOrigin(c, t))) out.push({ ...c, effects: c.effects ?? [], fromCatalog: true });
  return out;
}

/** Objet actif : équipé, et harmonisé s'il l'exige. */
export const itemActive = (i: InventoryItem) => i.equipped && (!i.requiresAttunement || i.attuned);

/** Tous les passifs de la fiche, avec leur provenance. */
export function sheetEffects(sheet: Dnd5eSheet): SourcedEffect[] {
  return [
    ...sheetTraits(sheet).flatMap((t) => t.effects.map((e) => ({ ...e, source: t.source || t.name }))),
    ...sheet.inventory.filter((i) => itemActive(i) && i.effects?.length).flatMap((i) => i.effects!.map((e) => ({ ...e, source: i.name }))),
  ];
}

const BODY_ARMOR = new Set(ITEMS.filter((i) => i.category === 'Armure' && !i.armorClass?.startsWith('+')).map((i) => i.id));
const SHIELDS = new Set(ITEMS.filter((i) => i.category === 'Armure' && i.armorClass?.startsWith('+')).map((i) => i.id));

/** Armure portée (et bouclier) : la défense sans armure ne s'applique qu'en leur absence. */
function wornArmor(sheet: Dnd5eSheet): { armor: boolean; shield: boolean } {
  const worn = sheet.inventory.filter((i) => i.equipped);
  const is = (set: Set<string>, i: InventoryItem) => (i.ref ? set.has(i.ref) : ITEMS.some((e) => set.has(e.id) && e.name.toLowerCase() === i.name.toLowerCase()));
  return { armor: worn.some((i) => is(BODY_ARMOR, i)), shield: worn.some((i) => is(SHIELDS, i)) };
}

// ───────────────────────────── Ressources ─────────────────────────────

export interface DerivedResource {
  id: string;
  name: string;
  max: number;
  used: number;
  recharge: Recharge;
  pool: boolean;
  source: string;
}

/** Ressources de la classe (selon le niveau) et de l'espèce. */
export function resourceDefs(sheet: Dnd5eSheet): (ResourceDef & { source: string })[] {
  const cls = classOf(sheet);
  const species = getSpecies(sheet.species);
  return [
    ...(cls?.resources ?? []).filter((r) => r.fromLevel <= sheet.level).map((r) => ({ ...r, source: cls!.name })),
    ...(species?.resources ?? []).map((r) => ({ ...r, source: species!.name })),
  ];
}

function deriveResources(sheet: Dnd5eSheet, mods: Record<AbilityKey, number>, pb: number): DerivedResource[] {
  return resourceDefs(sheet).map((r) => {
    const max = tryFormula(r.max, { level: sheet.level, pb, mods }) ?? 0;
    return { id: r.id, name: r.name, max, used: Math.min(max, sheet.resources?.[r.id]?.used ?? 0), recharge: r.recharge, pool: r.pool, source: r.source };
  });
}

/** Récupère les ressources selon le repos : le repos long recharge tout, le court seulement les « repos court ». */
function rechargeResources(sheet: Dnd5eSheet, rest: 'short' | 'long'): Dnd5eSheet['resources'] {
  const defs = resourceDefs(sheet);
  const next: Dnd5eSheet['resources'] = {};
  for (const [id, r] of Object.entries(sheet.resources ?? {})) {
    const def = defs.find((d) => d.id === id);
    const reset = def && (def.recharge === 'short' || (rest === 'long' && def.recharge === 'long'));
    if (!reset && r.used > 0) next[id] = r;
  }
  return next;
}

/** Dépense (ou rend) des usages d'une ressource, bornés par son maximum. */
export function spendResource(sheet: Dnd5eSheet, id: string, amount: number): Dnd5eSheet {
  const d = deriveSheet(sheet).resources.find((r) => r.id === id);
  if (!d) throw new Error('Ressource inconnue.');
  const used = Math.max(0, Math.min(d.max, d.used + amount));
  return { ...sheet, resources: { ...sheet.resources, [id]: { used } } };
}

// ───────────────────────────── Valeurs dérivées ─────────────────────────────

export interface DerivedSheet {
  proficiencyBonus: number;
  modifiers: Record<AbilityKey, number>;
  saves: Record<AbilityKey, { value: number; proficient: boolean; advantages: string[] }>;
  skills: { key: SkillKey; name: string; ability: AbilityKey; value: number; level: ProficiencyLevel; advantages: string[] }[];
  initiative: number;
  passivePerception: number;
  armorClass: number;
  /** Vitesse en mètres, bonus des passifs compris. */
  speed: number;
  senses: string;
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
  /** Défenses consolidées (saisies à la main + passifs). `when` : seulement sous cette condition. */
  resistances: { damage: string; source: string; when?: string }[];
  immunities: { damage: string; source: string; when?: string }[];
  vulnerabilities: { damage: string; source: string; when?: string }[];
  conditionImmunities: { condition: string; source: string; when?: string }[];
  /** Avantages situationnels, en clair. */
  advantages: { label: string; source: string; when?: string }[];
  traits: DerivedTrait[];
  resources: DerivedResource[];
}

export function deriveSheet(sheet: Dnd5eSheet): DerivedSheet {
  const pb = proficiencyBonus(sheet.level);
  const modifiers = Object.fromEntries(ABILITY_KEYS.map((k) => [k, abilityModifier(sheet.abilities[k])])) as Record<AbilityKey, number>;
  const traits = sheetTraits(sheet);
  const effects = sheetEffects(sheet);
  const permanent = effects.filter((e) => !('when' in e && e.when));
  const advantages = effects.flatMap((e) => (e.type === 'advantage' ? [{ label: describeEffect(e), source: e.source, ...(e.when ? { when: e.when } : {}) }] : []));
  const advFor = (pred: (e: Extract<Effect, { type: 'advantage' }>) => boolean) =>
    effects.flatMap((e) => (e.type === 'advantage' && pred(e) ? [`${e.against ?? 'toujours'}${e.when ? ` (${e.when})` : ''}`] : []));

  const saveProf = new Set([...sheet.saveProficiencies, ...permanent.flatMap((e) => (e.type === 'save_proficiency' ? [e.ability] : []))]);
  const saves = Object.fromEntries(
    ABILITY_KEYS.map((k) => {
      const proficient = saveProf.has(k);
      // Seuls les avantages propres à cette caractéristique ; les autres (« contre le charme ») restent dans `advantages`.
      return [k,{ value: modifiers[k] + (proficient ? pb : 0), proficient, advantages: advFor((e) => e.roll === 'save' && e.ability === k) }];
    }),
  ) as DerivedSheet['saves'];

  const jack = permanent.some((e) => e.type === 'jack_of_all_trades');
  const skills = SKILLS.map((s) => {
    const granted = permanent.reduce<number>((m, e) => (e.type === 'skill' && e.skill === s.key ? Math.max(m, e.level) : m), 0);
    let level = Math.max((sheet.skills[s.key] ?? 0) as number, granted) as ProficiencyLevel;
    if (level === 0 && jack) level = 0.5;
    return {
      key: s.key, name: s.name, ability: s.ability, value: modifiers[s.ability] + proficiencyContribution(level, pb), level,
      advantages: advFor((e) => (e.roll === 'skill' && e.skill === s.key) || (e.roll === 'check' && e.ability === s.ability && !e.against)),
    };
  });
  const perception = skills.find((s) => s.key === 'perception')?.value ?? modifiers.wis;
  const spellAbility = sheet.spellcasting?.ability;
  const o = sheet.overrides;
  const pick = (key: string, value: number) => (o[key] !== undefined ? o[key]! : value);

  // CA : valeur saisie, ou défense sans armure si elle est meilleure et qu'aucune armure n'est portée.
  const worn = wornArmor(sheet);
  let ac = sheet.armorClass;
  if (!worn.armor) {
    for (const e of permanent) {
      if (e.type !== 'unarmored_ac' || (!e.shield && worn.shield)) continue;
      ac = Math.max(ac, e.base + e.abilities.reduce((a, k) => a + modifiers[k], 0) + (worn.shield ? 2 : 0));
    }
  }
  ac += permanent.reduce((a, e) => a + (e.type === 'ac_bonus' ? e.value : 0), 0);

  const speed = sheet.speed + permanent.reduce((a, e) => a + (e.type === 'speed' ? e.bonus : 0), 0);
  const darkvision = Math.max(getSpecies(sheet.species)?.darkvision ?? 0, ...permanent.map((e) => (e.type === 'darkvision' ? e.range : 0)));
  const senses = [...new Set([sheet.defenses.senses, darkvision && !/noir/i.test(sheet.defenses.senses) ? `Vision dans le noir ${String(darkvision).replace('.', ',')} m` : ''].filter(Boolean))].join(' · ');

  const typed = <T extends 'resistance' | 'immunity' | 'vulnerability'>(type: T, manual: string[]) => [
    ...manual.map((damage) => ({ damage, source: 'Fiche' })),
    ...effects.flatMap((e) => (e.type === type ? [{ damage: (e as { damage: string }).damage, source: e.source, ...(e.when ? { when: e.when } : {}) }] : [])),
  ];

  return {
    proficiencyBonus: pb,
    modifiers,
    saves,
    skills,
    initiative: pick('initiative', modifiers.dex + permanent.reduce((a, e) => a + (e.type === 'initiative' ? e.bonus : 0), 0)),
    passivePerception: pick('passivePerception', 10 + perception),
    armorClass: pick('armorClass', ac),
    speed: pick('speed', speed),
    senses,
    spellSaveDc: spellAbility ? pick('spellSaveDc', 8 + pb + modifiers[spellAbility]) : null,
    spellAttack: spellAbility ? pick('spellAttack', pb + modifiers[spellAbility]) : null,
    carried: Math.round(sheet.inventory.reduce((acc, i) => acc + i.qty * i.weight, 0) * 100) / 100,
    capacity: sheet.abilities.str * 7.5,
    attunedCount: sheet.inventory.filter((i) => i.attuned).length,
    xpNext: xpForNextLevel(sheet.level),
    levelFromXp: levelForXp(sheet.xp),
    overridden: Object.keys(o),
    resistances: typed('resistance', sheet.defenses.resistances),
    immunities: typed('immunity', sheet.defenses.immunities),
    vulnerabilities: typed('vulnerability', []),
    conditionImmunities: effects.flatMap((e) => (e.type === 'condition_immunity' ? [{ condition: e.condition, source: e.source, ...(e.when ? { when: e.when } : {}) }] : [])),
    advantages,
    traits,
    resources: deriveResources(sheet, modifiers, pb),
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

/** Repos long : PV max, emplacements, ressources, moitié des dés de vie (au moins 1). */
export function longRest(sheet: Dnd5eSheet): Dnd5eSheet {
  const recovered = Math.max(1, Math.floor(sheet.hitDice.total / 2));
  return {
    ...sheet,
    hp: { ...sheet.hp, current: sheet.hp.max, temp: 0 },
    hitDice: { ...sheet.hitDice, used: Math.max(0, sheet.hitDice.used - recovered) },
    deathSaves: { successes: 0, failures: 0 },
    resources: rechargeResources(sheet, 'long'),
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
  const isPact = classOf(sheet)?.caster === 'pact';
  return {
    ...next,
    hitDice: { ...sheet.hitDice, used: sheet.hitDice.used + spend },
    resources: rechargeResources(sheet, 'short'),
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
  const cls = classOf(sheet);
  const level = sheet.level + 1;
  const conMod = abilityModifier(sheet.abilities.con);
  const die = cls?.hitDie ?? sheet.hitDice.die;
  const perLevel = sheetEffects(sheet).reduce((a, e) => a + (e.type === 'hp_per_level' ? e.value : 0), 0);
  const gain = Math.max(1, (hpGain ?? die / 2 + 1 + conMod) + perLevel);
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
    traits: [...sheet.traits, ...newFeatures.map((f) => featureTrait(cls!, f))],
  };
}

/**
 * Remplace la classe homebrew embarquée (la création a été modifiée dans la Forge) :
 * emplacements recalculés, aptitudes de la classe remplacées par les nouvelles.
 */
export function applyCustomClass(sheet: Dnd5eSheet, def: ClassDef): Dnd5eSheet {
  const old = classOf(sheet);
  const isOldFeature = (t: Trait) => !!old && t.source.startsWith(`${old.name} `) && old.features.some((f) => f.name === t.name);
  const slots = spellSlotsFor(def.caster, sheet.level);
  return {
    ...sheet,
    className: def.name,
    customClass: { ...def, homebrew: true },
    saveProficiencies: [...def.saves],
    hitDice: { ...sheet.hitDice, die: def.hitDie },
    traits: [...sheet.traits.filter((t) => !isOldFeature(t)), ...def.features.filter((f) => f.level <= sheet.level).map((f) => featureTrait(def, f))],
    spellcasting: def.caster
      ? {
          ability: def.spellAbility ?? sheet.spellcasting?.ability ?? 'int',
          slots: Object.fromEntries(Object.entries(slots).map(([lvl, max]) => [lvl, { max, used: Math.min(max, sheet.spellcasting?.slots[lvl]?.used ?? 0) }])),
          spells: sheet.spellcasting?.spells ?? [],
        }
      : null,
  };
}
