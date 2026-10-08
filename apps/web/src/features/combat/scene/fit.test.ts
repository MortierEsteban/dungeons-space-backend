import { Bone, Box3, BoxGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { fitModel, HUMAN_HEIGHT } from './fit';

/**
 * Personnage « Blender » tel que le livre GLTFLoader : maillage skinné de 2 m, os placé et pivoté
 * (l'axe d'un os Blender suit l'os), matrices inverses lues dans le fichier, matrices monde des os
 * jamais calculées puisque rien n'a encore été rendu.
 */
function skinnedCharacter(): Group {
  const geometry = new BoxGeometry(0.8, 2, 0.4).translate(0, 1, 0);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
  const bone = new Bone();
  bone.position.set(0, 1, 0);
  bone.rotation.x = -Math.PI / 2;
  bone.updateMatrix();
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const armature = new Group();
  // Ordre de l’export Blender : les maillages avant l’os racine (pivoté de −90°, Z-up → Y-up).
  armature.add(mesh, bone);
  mesh.bind(new Skeleton([bone], [bone.matrix.clone().invert()]), new Matrix4());
  return armature;
}

describe('mise à l’échelle des modèles importés', () => {
  it('mesure un modèle skinné cloné dans sa pose de repos (pas d’échelle absurde)', () => {
    const { scale, offset } = fitModel(cloneSkinned(skinnedCharacter()), 1);
    expect(scale).toBeCloseTo(HUMAN_HEIGHT / 2, 3);
    expect(offset.y).toBeCloseTo(0, 3);
    // Mesure naïve sur ces os jamais mis à jour : le modèle de 2 m est mesuré couché (0,4 m).
    const naive = new Box3().setFromObject(cloneSkinned(skinnedCharacter()));
    expect(naive.max.y - naive.min.y).toBeCloseTo(0.4, 3);
  });

  it('laisse une arme déborder de la case plutôt que de rapetisser le personnage', () => {
    // Figurine de 0,93 de haut tenant un bâton : 1,47 de large (le modèle de Brakk).
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(1.47, 0.93, 0.61).translate(0, 0.465, 0), new MeshStandardMaterial()));
    const { scale } = fitModel(g, 1);
    expect(0.93 * scale).toBeGreaterThan(1);
  });

  it('pose le modèle au sol et le centre sur son emprise', () => {
    const g = new Group();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1).translate(3, -2, 1), new MeshStandardMaterial());
    g.add(mesh);
    const { scale, offset } = fitModel(g, 1);
    expect(scale).toBeCloseTo(HUMAN_HEIGHT, 3);
    expect(offset.x).toBeCloseTo(-3 * scale, 3);
    expect(offset.y).toBeCloseTo(2.5 * scale, 3);
  });
});
