import { Box3, Vector3, type Object3D, type SkinnedMesh } from 'three';

/** Hauteur visée d'une créature de taille M, en cases (≈ 1,8 m pour une case de 1,5 m). */
export const HUMAN_HEIGHT = 1.2;

/** Largeur maximale, en cases par case de taille : au-delà, on réduit le modèle. */
const MAX_SPAN = 1.6;

/** Hauteur visée selon la taille de la créature (1 = M, 2 = G…). */
export const modelHeight = (size: number) => HUMAN_HEIGHT * (size === 1 ? 1 : 0.75 + size * 0.45);

/**
 * Échelle et décalage qui posent un modèle au sol, centré sur son emprise, à la bonne hauteur.
 * La hauteur prime : une arme ou des bras écartés peuvent déborder de la case (jusqu'à 1,6 case
 * de large pour une créature M) sans rapetisser le personnage.
 * Les maillages skinnés sont mesurés dans leur pose de repos, os à jour : un modèle dont les
 * matrices monde des os n'ont jamais été calculées serait sinon mesuré déformé.
 */
export function fitModel(object: Object3D, size: number): { scale: number; offset: Vector3 } {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const skinned = o as SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      skinned.computeBoundingSphere();
    }
  });
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) return { scale: 1, offset: new Vector3() };
  const dims = box.getSize(new Vector3());
  const height = Math.max(dims.y, 1e-3);
  const width = Math.max(dims.x, dims.z, 1e-3);
  const scale = Math.min(modelHeight(size) / height, (MAX_SPAN * size) / width);
  const center = box.getCenter(new Vector3());
  return { scale, offset: new Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale) };
}
