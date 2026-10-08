import type { CombatState } from '@ds/rules';

/**
 * Ce que la page de combat doit savoir du plateau 3D sans le charger :
 * ce module n'importe pas three.js (le moteur reste dans le morceau chargé à la demande).
 */

/** Une attaque à mettre en scène : un projectile d'énergie, puis l'impact (ou l'esquive). */
export interface AttackFx {
  id: number;
  attackerId: string;
  targetId: string;
  hit: boolean;
  crit: boolean;
}

/** Vol du projectile puis impact, en secondes. */
export const FX_FLIGHT = 0.42;
export const FX_IMPACT = 0.7;
export const FX_DURATION = (FX_FLIGHT + FX_IMPACT) * 1000;

/** WebGL disponible ? (sinon : repli sur le plateau 2D). */
export function hasWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    // On rend aussitôt le contexte de test : le navigateur en limite le nombre.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Le modèle d'un PJ suit sa fiche en direct (même s'il est déjà engagé dans un combat) ;
 * les autres créatures gardent celui choisi dans le combat. Renvoie le même objet si rien ne change.
 */
export function withCharacterModels(state: CombatState, models: ReadonlyMap<string, string | null>): CombatState {
  let combatants: CombatState['combatants'] | null = null;
  for (const c of Object.values(state.combatants)) {
    if (!c.characterId || !models.has(c.characterId)) continue;
    const modelUrl = models.get(c.characterId) ?? c.modelUrl ?? null;
    if (modelUrl === (c.modelUrl ?? null)) continue;
    combatants ??= { ...state.combatants };
    combatants[c.id] = { ...c, modelUrl };
  }
  return combatants ? { ...state, combatants } : state;
}

/** État du brouillard case par case, pour le rendu : 0 jamais vue, 1 déjà explorée, 2 visible. */
export interface FogCells {
  cols: number;
  rows: number;
  cells: Uint8Array;
}

export const FOG_UNKNOWN = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;
