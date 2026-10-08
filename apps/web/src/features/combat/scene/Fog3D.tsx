import { useEffect, useMemo } from 'react';
import { DataTexture, LinearFilter, RedFormat } from 'three';
import type { Frame } from './coords';
import { fogMaterial, useAnimatedMaterial, useDisposable } from './shaders';
import { FOG_EXPLORED, FOG_VISIBLE, type FogCells } from './support';

/** Nappe de brouillard posée sur la carte, au-dessus du sol et sous les créatures visibles. */
export function Fog3D({ frame, fog }: { frame: Frame; fog: FogCells }) {
  const texture = useMemo(() => {
    const data = new Uint8Array(fog.cols * fog.rows);
    // Ligne 0 de la texture = bas de l'image = dernière ligne de la grille.
    for (let y = 0; y < fog.rows; y++)
      for (let x = 0; x < fog.cols; x++) {
        const v = fog.cells[y * fog.cols + x];
        data[(fog.rows - 1 - y) * fog.cols + x] = v === FOG_VISIBLE ? 255 : v === FOG_EXPLORED ? 128 : 0;
      }
    const t = new DataTexture(data, fog.cols, fog.rows, RedFormat);
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.needsUpdate = true;
    return t;
  }, [fog]);
  useDisposable(texture);
  const material = useAnimatedMaterial(() => fogMaterial(), []);
  useEffect(() => {
    material.uniforms.uFog!.value = texture;
  }, [material, texture]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.04} material={material} renderOrder={6}>
      <planeGeometry args={[frame.cols, frame.rows]} />
    </mesh>
  );
}
