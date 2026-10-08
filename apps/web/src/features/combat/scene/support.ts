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
