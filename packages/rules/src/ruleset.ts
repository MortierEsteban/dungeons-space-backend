import type { z } from 'zod';
import type { ConditionDef } from './dnd5e/conditions';

/** Ce qu'un ruleset doit fournir au noyau agnostique (campagnes, chronique, combat, constellation). */
export interface Ruleset<TSheet = unknown, TCreate = unknown, TDerived = unknown> {
  id: string;
  name: string;
  version: string;
  license: string;
  attribution: string;
  abilities: { key: string; short: string; name: string }[];
  conditions: ConditionDef[];
  /** Taille d'une case de grille, en mètres. */
  gridMeters: number;
  sheetSchema: z.ZodType<TSheet>;
  createSheet(input: TCreate): TSheet;
  derive(sheet: TSheet): TDerived;
  /** Projection d'une fiche vers les statistiques utiles au combat. */
  combatProfile(sheet: TSheet): {
    hp: number;
    maxHp: number;
    ac: number;
    initiativeMod: number;
    speed: number;
    attack: { name: string; bonus: number; damage: string; damageType: string } | null;
  };
}

const registry = new Map<string, Ruleset<any, any, any>>();

export function registerRuleset(ruleset: Ruleset<any, any, any>): void {
  registry.set(ruleset.id, ruleset);
}

export function getRuleset(id: string): Ruleset<any, any, any> {
  const r = registry.get(id);
  if (!r) throw new Error(`Ruleset inconnu : ${id}`);
  return r;
}

export function listRulesets(): Ruleset<any, any, any>[] {
  return [...registry.values()];
}
