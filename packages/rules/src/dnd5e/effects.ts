import { z } from 'zod';
import { ABILITY_KEYS, type AbilityKey } from './abilities';
import { SKILL_KEYS, SKILLS, type SkillKey } from './skills';

/**
 * Effets mécaniques des traits, aptitudes et objets (passifs).
 * Un effet `when` n'est actif que sous cette condition (ex. « Rage ») : affiché sur la fiche,
 * appliqué en combat quand le combattant porte l'état du même nom.
 */
const when = z.string().max(60).optional();
const ability = z.enum(ABILITY_KEYS);

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resistance'), damage: z.string().min(1).max(30), when }),
  z.object({ type: z.literal('immunity'), damage: z.string().min(1).max(30), when }),
  z.object({ type: z.literal('vulnerability'), damage: z.string().min(1).max(30), when }),
  z.object({ type: z.literal('condition_immunity'), condition: z.string().min(1).max(40), when }),
  /** Avantage sur un type de jet : `ability` restreint à une caractéristique, `against` décrit la situation. */
  z.object({ type: z.literal('advantage'), roll: z.enum(['save', 'check', 'attack', 'skill']), ability: ability.optional(), skill: z.enum(SKILL_KEYS as [SkillKey, ...SkillKey[]]).optional(), against: z.string().max(80).optional(), when }),
  z.object({ type: z.literal('skill'), skill: z.enum(SKILL_KEYS as [SkillKey, ...SkillKey[]]), level: z.union([z.literal(1), z.literal(2)]).default(1) }),
  z.object({ type: z.literal('save_proficiency'), ability }),
  z.object({ type: z.literal('speed'), bonus: z.number().min(-30).max(30), when }),
  z.object({ type: z.literal('darkvision'), range: z.number().min(0).max(120) }),
  /** CA sans armure : base + modificateurs (ex. 10 + DEX + CON) ; le bouclier reste permis si `shield`. */
  z.object({ type: z.literal('unarmored_ac'), base: z.number().int().min(0).max(30), abilities: z.array(ability).max(3), shield: z.boolean().default(true) }),
  z.object({ type: z.literal('ac_bonus'), value: z.number().int().min(-10).max(10), when }),
  z.object({ type: z.literal('initiative'), bonus: z.number().int().min(-10).max(20) }),
  z.object({ type: z.literal('hp_per_level'), value: z.number().int().min(-5).max(10) }),
  /** Touche-à-tout : moitié du bonus de maîtrise aux compétences non maîtrisées. */
  z.object({ type: z.literal('jack_of_all_trades') }),
]);
export type Effect = z.infer<typeof effectSchema>;
export type EffectType = Effect['type'];

export const EFFECT_LABELS: Record<EffectType, string> = {
  resistance: 'Résistance',
  immunity: 'Immunité',
  vulnerability: 'Vulnérabilité',
  condition_immunity: 'Immunité à un état',
  advantage: 'Avantage',
  skill: 'Maîtrise de compétence',
  save_proficiency: 'Maîtrise de sauvegarde',
  speed: 'Vitesse',
  darkvision: 'Vision dans le noir',
  unarmored_ac: 'Défense sans armure',
  ac_bonus: 'Bonus de CA',
  initiative: "Bonus d'initiative",
  hp_per_level: 'PV par niveau',
  jack_of_all_trades: 'Touche-à-tout',
};

/** Types de dégâts du SRD (libellés français, au singulier). */
export const DAMAGE_TYPES = ['acide', 'contondant', 'feu', 'force', 'foudre', 'froid', 'nécrotique', 'perforant', 'poison', 'psychique', 'radiant', 'tonnerre', 'tranchant'] as const;

/** « Feu », « feux », « Nécrotique » → « feu », « necrotique » : comparaisons tolérantes. */
export function normalizeDamage(type: string): string {
  return type
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/s$/, '');
}

export function sameDamage(a: string, b: string): boolean {
  return normalizeDamage(a) === normalizeDamage(b);
}

/** Effet tel qu'appliqué : avec sa provenance (« Nain », « Barbare 1 », « Cape de feu »…). */
export type SourcedEffect = Effect & { source: string };

const ABILITY_SHORT: Record<AbilityKey, string> = { str: 'FOR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'SAG', cha: 'CHA' };
const ROLL_LABEL = { save: 'jets de sauvegarde', check: 'tests', attack: "jets d'attaque", skill: 'tests' } as const;
const skillName = (k: string) => SKILLS.find((x) => x.key === k)?.name ?? k;

/** Description courte d'un effet, pour la fiche et la Forge. */
export function describeEffect(e: Effect): string {
  const cond = 'when' in e && e.when ? ` (${e.when})` : '';
  switch (e.type) {
    case 'resistance':
      return `Résistance : ${e.damage}${cond}`;
    case 'immunity':
      return `Immunité : ${e.damage}${cond}`;
    case 'vulnerability':
      return `Vulnérabilité : ${e.damage}${cond}`;
    case 'condition_immunity':
      return `Immunité à l’état ${e.condition}${cond}`;
    case 'advantage': {
      const what = e.skill ? `tests de ${skillName(e.skill)}` : `${ROLL_LABEL[e.roll]}${e.ability ? ` de ${ABILITY_SHORT[e.ability]}` : ''}`;
      return `Avantage aux ${what}${e.against ? ` ${e.against}` : ''}${cond}`;
    }
    case 'skill':
      return `${e.level === 2 ? 'Expertise' : 'Maîtrise'} : ${skillName(e.skill)}`;
    case 'save_proficiency':
      return `Maîtrise des JS de ${ABILITY_SHORT[e.ability]}`;
    case 'speed':
      return `Vitesse ${e.bonus >= 0 ? '+' : ''}${String(e.bonus).replace('.', ',')} m${cond}`;
    case 'darkvision':
      return `Vision dans le noir ${String(e.range).replace('.', ',')} m`;
    case 'unarmored_ac':
      return `CA sans armure = ${e.base}${e.abilities.map((a) => ` + ${ABILITY_SHORT[a]}`).join('')}`;
    case 'ac_bonus':
      return `CA ${e.value >= 0 ? '+' : ''}${e.value}${cond}`;
    case 'initiative':
      return `Initiative ${e.bonus >= 0 ? '+' : ''}${e.bonus}`;
    case 'hp_per_level':
      return `${e.value >= 0 ? '+' : ''}${e.value} PV par niveau`;
    case 'jack_of_all_trades':
      return 'Moitié du bonus de maîtrise aux tests non maîtrisés';
  }
}

// ───────────────────────────── Ressources (rage, ki, emplacements…) ─────────────────────────────

export const RECHARGES = ['short', 'long', 'none'] as const;
export type Recharge = (typeof RECHARGES)[number];
export const RECHARGE_LABELS: Record<Recharge, string> = { short: 'Repos court', long: 'Repos long', none: 'Manuelle' };

/**
 * Ressource à usages limités. `max` est soit une formule (`level`, `2 + floor(level / 4)`, `max(1, cha)`, `5 * level`),
 * soit une progression par paliers (`1:2, 3:3, 6:4` = 2 au niveau 1, 3 au niveau 3, 4 au niveau 6).
 */
export const resourceDefSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  max: z.string().min(1).max(120),
  recharge: z.enum(RECHARGES).default('long'),
  /** Niveau de classe à partir duquel la ressource existe. */
  fromLevel: z.number().int().min(1).max(20).default(1),
  /** Une réserve (PV de l'imposition des mains…) se dépense par points, pas par cases. */
  pool: z.boolean().default(false),
});
export type ResourceDef = z.infer<typeof resourceDefSchema>;

export interface FormulaContext {
  level: number;
  pb: number;
  mods: Record<AbilityKey, number>;
}

/** Évaluateur de formules sûr (pas d'eval) : nombres, + - * /, parenthèses, min/max/floor/ceil, variables. */
export function evalFormula(src: string, ctx: FormulaContext): number {
  const s = src.trim();
  if (/^\d+\s*:/.test(s)) {
    let value = 0;
    for (const part of s.split(/[,;]/)) {
      const m = /^\s*(\d+)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(part);
      if (m && ctx.level >= Number(m[1])) value = Number(m[2]!.replace(',', '.'));
    }
    return value;
  }
  const tokens = s.match(/\d+(?:[.,]\d+)?|[a-z_]+|[-+*/(),]/gi) ?? [];
  let i = 0;
  const vars: Record<string, number> = { level: ctx.level, niveau: ctx.level, pb: ctx.pb, ...ctx.mods, for: ctx.mods.str, sag: ctx.mods.wis };
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const primary = (): number => {
    const t = next();
    if (t === undefined) throw new Error('Formule incomplète');
    if (t === '(') {
      const v = expr();
      if (next() !== ')') throw new Error('Parenthèse manquante');
      return v;
    }
    if (t === '-') return -primary();
    if (/^\d/.test(t)) return Number(t.replace(',', '.'));
    const name = t.toLowerCase();
    if (peek() === '(') {
      next();
      const args = [expr()];
      while (peek() === ',') {
        next();
        args.push(expr());
      }
      if (next() !== ')') throw new Error('Parenthèse manquante');
      const fn = { min: Math.min, max: Math.max, floor: (x: number) => Math.floor(x), ceil: (x: number) => Math.ceil(x) }[name];
      if (!fn) throw new Error(`Fonction inconnue : ${t}`);
      return fn(...(args as [number]));
    }
    if (!(name in vars)) throw new Error(`Variable inconnue : ${t}`);
    return vars[name]!;
  };
  const term = (): number => {
    let v = primary();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * primary() : v / primary();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  };
  const value = expr();
  if (i < tokens.length) throw new Error(`Symbole inattendu : ${tokens[i]}`);
  return Math.floor(value);
}

/** Valeur d'une formule, ou null si elle est invalide (affichée telle quelle dans l'éditeur). */
export function tryFormula(src: string, ctx: FormulaContext): number | null {
  try {
    const v = evalFormula(src, ctx);
    return Number.isFinite(v) ? Math.max(0, v) : null;
  } catch {
    return null;
  }
}
