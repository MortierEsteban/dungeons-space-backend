import type { Cell, TerrainKind } from '@ds/rules';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { cellCenter, cellRandom, tilesGeometry, WALL_HEIGHT, LOW_WALL_HEIGHT, type Frame } from './coords';
import { lavaMaterial, useAnimatedMaterial, useDisposable, waterMaterial } from './shaders';
import { wallTexture } from './textures';

/** Capacité des InstancedMesh par paliers (puissances de 2) : on ne recrée le maillage qu'en franchissant un palier. */
const cap = (n: number) => Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

type Placement = { pos: [number, number, number]; scale: [number, number, number]; rotY: number; tint: number };

/** Remplit un InstancedMesh à partir d'une liste de placements (matrices + teintes). */
function useInstances(ref: React.RefObject<InstancedMesh | null>, items: Placement[], base: string) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const color = new Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rotY);
      m.compose(new Vector3(...it.pos), q, new Vector3(...it.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(base).multiplyScalar(it.tint));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, items, base]);
}

function Walls({ frame, cells, low }: { frame: Frame; cells: Cell[]; low: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const h = low ? LOW_WALL_HEIGHT : WALL_HEIGHT;
  const items = useMemo(
    () =>
      cells.map((c): Placement => {
        const [x, z] = cellCenter(frame, c);
        const rnd = cellRandom(c.x, c.y, 1);
        const hh = h * (low ? 1 : 0.94 + rnd() * 0.12);
        return { pos: [x, hh / 2, z], scale: [1, hh, 1], rotY: 0, tint: 0.85 + rnd() * 0.3 };
      }),
    [cells, frame, h, low],
  );
  useInstances(ref, items, '#9a8fb0');
  const map = useMemo(() => wallTexture(), []);
  return (
    <instancedMesh key={cap(items.length)} ref={ref} args={[undefined, undefined, cap(items.length)]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial map={map} roughness={0.92} metalness={0.05} />
    </instancedMesh>
  );
}

function Rocks({ frame, cells }: { frame: Frame; cells: Cell[] }) {
  const ref = useRef<InstancedMesh>(null);
  const items = useMemo(
    () =>
      cells.flatMap((c) => {
        const [x, z] = cellCenter(frame, c);
        const rnd = cellRandom(c.x, c.y, 2);
        return Array.from({ length: 4 }, (): Placement => {
          const sc = 0.09 + rnd() * 0.12;
          return { pos: [x + (rnd() - 0.5) * 0.7, sc * 0.4, z + (rnd() - 0.5) * 0.7], scale: [sc * (1 + rnd() * 0.6), sc * 0.8, sc], rotY: rnd() * 6.28, tint: 0.7 + rnd() * 0.5 };
        });
      }),
    [cells, frame],
  );
  useInstances(ref, items, '#8a7b68');
  return (
    <instancedMesh key={cap(items.length)} ref={ref} args={[undefined, undefined, cap(items.length)]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}

/** Végétation : petits conifères (cône) et buissons (icosaèdre), disposés de façon stable. */
function Vegetation({ frame, cells }: { frame: Frame; cells: Cell[] }) {
  const trees = useRef<InstancedMesh>(null);
  const bushes = useRef<InstancedMesh>(null);
  const { t, b } = useMemo(() => {
    const t: Placement[] = [];
    const b: Placement[] = [];
    for (const c of cells) {
      const [x, z] = cellCenter(frame, c);
      const rnd = cellRandom(c.x, c.y, 3);
      if (rnd() < 0.55) {
        const hh = 0.55 + rnd() * 0.5;
        t.push({ pos: [x + (rnd() - 0.5) * 0.4, hh / 2, z + (rnd() - 0.5) * 0.4], scale: [0.28 + rnd() * 0.1, hh, 0.28 + rnd() * 0.1], rotY: rnd() * 6.28, tint: 0.75 + rnd() * 0.45 });
      }
      for (let k = 0; k < 2; k++) {
        const sc = 0.12 + rnd() * 0.1;
        b.push({ pos: [x + (rnd() - 0.5) * 0.75, sc * 0.6, z + (rnd() - 0.5) * 0.75], scale: [sc, sc * 0.8, sc], rotY: rnd() * 6.28, tint: 0.7 + rnd() * 0.5 });
      }
    }
    return { t, b };
  }, [cells, frame]);
  useInstances(trees, t, '#3f6b3a');
  useInstances(bushes, b, '#5d8a4a');
  return (
    <>
      <instancedMesh key={`t${cap(t.length)}`} ref={trees} args={[undefined, undefined, cap(t.length)]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh key={`b${cap(b.length)}`} ref={bushes} args={[undefined, undefined, cap(b.length)]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </>
  );
}

function Liquid({ frame, cells, kind }: { frame: Frame; cells: Cell[]; kind: 'water' | 'lava' }) {
  const geometry = useMemo(() => tilesGeometry(frame, cells, kind === 'water' ? 0.03 : 0.02), [frame, cells, kind]);
  useDisposable(geometry);
  const material = useAnimatedMaterial(() => (kind === 'water' ? waterMaterial() : lavaMaterial()), [kind]);
  return <mesh geometry={geometry} material={material} receiveShadow={kind === 'water'} />;
}

/** Terrain peint par le MJ, en relief : murs extrudés, eau et lave animées, rochers, végétation. */
export function Terrain3D({ frame, terrain, lowWalls }: { frame: Frame; terrain: Record<string, TerrainKind>; lowWalls: boolean }) {
  const byKind = useMemo(() => {
    const out: Record<TerrainKind, Cell[]> = { wall: [], difficult: [], water: [], lava: [], vegetation: [] };
    for (const [k, t] of Object.entries(terrain)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (x < frame.cols && y < frame.rows) out[t].push({ x, y });
    }
    return out;
  }, [terrain, frame]);
  return (
    <group>
      {byKind.wall.length > 0 && <Walls frame={frame} cells={byKind.wall} low={lowWalls} />}
      {byKind.difficult.length > 0 && <Rocks frame={frame} cells={byKind.difficult} />}
      {byKind.vegetation.length > 0 && <Vegetation frame={frame} cells={byKind.vegetation} />}
      {byKind.water.length > 0 && <Liquid frame={frame} cells={byKind.water} kind="water" />}
      {byKind.lava.length > 0 && <Liquid frame={frame} cells={byKind.lava} kind="lava" />}
    </group>
  );
}
