import { rollDice } from '../dice';
import type { Rng } from '../rng';

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type AbilityScores = Record<AbilityKey, number>;

export const ABILITY_LABELS: Record<AbilityKey, { short: string; name: string }> = {
  str: { short: 'FOR', name: 'Force' },
  dex: { short: 'DEX', name: 'Dextérité' },
  con: { short: 'CON', name: 'Constitution' },
  int: { short: 'INT', name: 'Intelligence' },
  wis: { short: 'SAG', name: 'Sagesse' },
  cha: { short: 'CHA', name: 'Charisme' },
};

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Coût du point buy (27 points, scores de 8 à 15). */
const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export function pointBuyCost(scores: AbilityScores): number | null {
  let total = 0;
  for (const key of ABILITY_KEYS) {
    const cost = POINT_BUY_COST[scores[key]];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

/** 4d6, on garde les 3 meilleurs — six fois. */
export function rollAbilityScores(rng: Rng): number[] {
  return Array.from({ length: 6 }, () => rollDice('4d6kh3', rng).total);
}

export type StatMethod = 'roll' | 'point_buy' | 'standard_array';

export function scoresFromArray(values: readonly number[]): AbilityScores {
  return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, values[i] ?? 10])) as AbilityScores;
}
