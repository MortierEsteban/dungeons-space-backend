import type { CasterType } from './classes';

/** XP minimale pour atteindre chaque niveau (index 0 = niveau 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
] as const;

export const MAX_LEVEL = 20;

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));
}

export function levelForXp(xp: number): number {
  let level = 1;
  XP_THRESHOLDS.forEach((threshold, i) => {
    if (xp >= threshold) level = i + 1;
  });
  return level;
}

/** XP nécessaire pour le niveau suivant, ou null au niveau 20. */
export function xpForNextLevel(level: number): number | null {
  return XP_THRESHOLDS[clampLevel(level)] ?? null;
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((clampLevel(level) - 1) / 4);
}

/** Emplacements d'un lanceur complet, par niveau de personnage (index 0 = niveau 1). */
const FULL_CASTER: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Magie de pacte : [nombre d'emplacements, niveau des emplacements]. */
function pactSlots(level: number): [number, number] {
  if (level >= 17) return [4, 5];
  if (level >= 11) return [3, 5];
  if (level === 1) return [1, 1];
  return [2, Math.min(5, Math.ceil(level / 2))];
}

/** Emplacements max par niveau de sort (clé 1..9). */
export function spellSlotsFor(caster: CasterType, level: number): Record<number, number> {
  const lvl = clampLevel(level);
  const toRecord = (arr: number[]) => Object.fromEntries(arr.map((n, i) => [i + 1, n]));
  switch (caster) {
    case 'full':
      return toRecord(FULL_CASTER[lvl - 1] ?? []);
    case 'half':
      return lvl < 2 ? {} : toRecord(FULL_CASTER[Math.ceil(lvl / 2) - 1] ?? []);
    case 'pact': {
      const [count, slotLevel] = pactSlots(lvl);
      return { [slotLevel]: count };
    }
    default:
      return {};
  }
}

/** PV au niveau 1 : dé de vie max + CON ; ensuite moyenne arrondie au supérieur + CON par niveau. */
export function maxHpFor(hitDie: number, level: number, conMod: number): number {
  const lvl = clampLevel(level);
  const perLevel = hitDie / 2 + 1;
  return Math.max(1, hitDie + conMod + (lvl - 1) * (perLevel + conMod));
}
