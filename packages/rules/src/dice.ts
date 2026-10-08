import type { Rng } from './rng';

/**
 * Notation de dés : `2d6+3`, `d20-1`, `4d6kh3`, `2d20kl1`, `1d8+1d6+2`.
 * kh = garder les plus hauts, kl = garder les plus bas.
 */
export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'high' | 'low'; count: number };
}

export interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}

export type Term = DiceTerm | ConstTerm;

export interface DiceRollTerm {
  notation: string;
  rolls: number[];
  kept: number[];
  subtotal: number;
}

export interface DiceRoll {
  notation: string;
  terms: DiceRollTerm[];
  total: number;
  /** Valeur naturelle du d20 si le jet est un d20 unique (après avantage/désavantage). */
  natural?: number;
}

export type Advantage = 'normal' | 'advantage' | 'disadvantage';

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;
const MAX_DICE = 200;
const MAX_SIDES = 1000;

export class DiceNotationError extends Error {}

export function parseDice(notation: string): Term[] {
  const src = notation.replace(/\s+/g, '').toLowerCase();
  if (!src) throw new DiceNotationError('Notation vide');
  const parts = src.match(/[+-]?[^+-]+/g);
  if (!parts) throw new DiceNotationError(`Notation invalide : ${notation}`);
  return parts.map((raw) => {
    const sign: 1 | -1 = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    if (/^\d+$/.test(body)) return { kind: 'const', sign, value: Number(body) } satisfies ConstTerm;
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceNotationError(`Terme invalide : ${raw}`);
    const count = m[1] ? Number(m[1]) : 1;
    const sides = Number(m[2]);
    if (count < 1 || count > MAX_DICE) throw new DiceNotationError(`Nombre de dés hors limites : ${count}`);
    if (sides < 2 || sides > MAX_SIDES) throw new DiceNotationError(`Dé à ${sides} faces non supporté`);
    const term: DiceTerm = { kind: 'dice', sign, count, sides };
    if (m[3] && m[4]) {
      const keepCount = Number(m[4]);
      if (keepCount < 1 || keepCount > count) throw new DiceNotationError(`Conservation invalide : ${raw}`);
      term.keep = { mode: m[3] === 'kh' ? 'high' : 'low', count: keepCount };
    }
    return term;
  });
}

export function isValidDice(notation: string): boolean {
  try {
    parseDice(notation);
    return true;
  } catch {
    return false;
  }
}

function termNotation(t: Term): string {
  const sign = t.sign < 0 ? '-' : '+';
  if (t.kind === 'const') return `${sign}${t.value}`;
  const keep = t.keep ? `${t.keep.mode === 'high' ? 'kh' : 'kl'}${t.keep.count}` : '';
  return `${sign}${t.count}d${t.sides}${keep}`;
}

export function rollDice(notation: string, rng: Rng): DiceRoll {
  const terms = parseDice(notation);
  const out: DiceRollTerm[] = terms.map((t) => {
    if (t.kind === 'const') {
      return { notation: termNotation(t), rolls: [], kept: [], subtotal: t.sign * t.value };
    }
    const rolls = Array.from({ length: t.count }, () => rng.die(t.sides));
    let kept = rolls;
    if (t.keep) {
      const sorted = [...rolls].sort((a, b) => (t.keep!.mode === 'high' ? b - a : a - b));
      kept = sorted.slice(0, t.keep.count);
    }
    const subtotal = t.sign * kept.reduce((a, b) => a + b, 0);
    return { notation: termNotation(t), rolls, kept, subtotal };
  });
  const total = out.reduce((a, t) => a + t.subtotal, 0);
  const diceTerms = terms.filter((t): t is DiceTerm => t.kind === 'dice');
  const roll: DiceRoll = { notation: normalizeNotation(terms), terms: out, total };
  const only = diceTerms[0];
  if (diceTerms.length === 1 && only && only.sides === 20 && (only.count === 1 || only.keep?.count === 1)) {
    const first = out.find((t) => t.kept.length > 0);
    roll.natural = first?.kept[0];
  }
  return roll;
}

function normalizeNotation(terms: Term[]): string {
  return terms.map(termNotation).join('').replace(/^\+/, '');
}

/** Jet de d20 + modificateur, avec avantage/désavantage (2d20 garder 1). */
export function rollD20(modifier: number, rng: Rng, advantage: Advantage = 'normal'): DiceRoll {
  const base = advantage === 'advantage' ? '2d20kh1' : advantage === 'disadvantage' ? '2d20kl1' : '1d20';
  const mod = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`;
  return rollDice(base + mod, rng);
}

/** Avantage et désavantage s'annulent (règle 5e), quel que soit leur nombre. */
export function combineAdvantage(sources: Advantage[]): Advantage {
  const adv = sources.includes('advantage');
  const dis = sources.includes('disadvantage');
  if (adv && !dis) return 'advantage';
  if (dis && !adv) return 'disadvantage';
  return 'normal';
}

/** Double les dés (pas les constantes) pour un coup critique : `1d8+3` → `2d8+3`. */
export function critDice(notation: string): string {
  return normalizeNotation(
    parseDice(notation).map((t) => (t.kind === 'dice' ? { ...t, count: t.count * 2, keep: undefined } : t)),
  );
}

/** Moyenne arrondie à l'inférieur (PV « fixes » des monstres). */
export function averageDice(notation: string): number {
  return Math.floor(
    parseDice(notation).reduce((acc, t) => {
      if (t.kind === 'const') return acc + t.sign * t.value;
      const n = t.keep?.count ?? t.count;
      return acc + t.sign * n * ((t.sides + 1) / 2);
    }, 0),
  );
}

export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
