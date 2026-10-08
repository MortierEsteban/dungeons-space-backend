import { gridDistance, type Cell, type CombatState, type Zone } from '@ds/rules';
import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { num } from '../../../shared/format';
import s from '../combat.module.css';
import { cellCenter, curtainGeometry, tilesGeometry, type Frame } from './coords';
import { curtainMaterial, tileMaterial, useAnimatedMaterial, useDisposable } from './shaders';

/** Ensemble de cases lumineuses : dalles au sol + rideau de lumière sur le contour. */
export function CellField({ frame, cells, color, fill = 0.22, curtain = 0.8, strength = 1 }: { frame: Frame; cells: Cell[]; color: string; fill?: number; curtain?: number; strength?: number }) {
  const tiles = useMemo(() => tilesGeometry(frame, cells, 0.018), [frame, cells]);
  const wall = useMemo(() => (curtain > 0 ? curtainGeometry(frame, cells, curtain) : null), [frame, cells, curtain]);
  useDisposable(tiles);
  useDisposable(wall);
  const tileMat = useAnimatedMaterial(() => tileMaterial(color, fill), [color, fill]);
  const wallMat = useAnimatedMaterial(() => curtainMaterial(color, strength), [color, strength]);
  if (cells.length === 0) return null;
  return (
    <group>
      <mesh geometry={tiles} material={tileMat} renderOrder={2} />
      {wall && <mesh geometry={wall} material={wallMat} renderOrder={3} />}
    </group>
  );
}

/** Gabarit de sort posé : champ coloré et étiquette flottante. */
export function ZoneField({ frame, zone, cells }: { frame: Frame; zone: Zone; cells: Cell[] }) {
  const [x, z] = cellCenter(frame, zone.origin);
  return (
    <group>
      <CellField frame={frame} cells={cells} color={zone.color} fill={0.2} curtain={zone.shape === 'circle' ? 1.1 : 0.75} />
      {zone.label && (
        <Html position={[x, 1.3, z]} center zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <div className={s.zoneLabel3d} style={{ borderColor: zone.color }}>
            {zone.label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Contour de case survolée. */
export function HoverCell({ frame, cell, color = '#e8d3a0' }: { frame: Frame; cell: Cell; color?: string }) {
  const [x, z] = cellCenter(frame, cell);
  const h = 0.48;
  return (
    <Line
      points={[
        [x - h, 0.02, z - h],
        [x + h, 0.02, z - h],
        [x + h, 0.02, z + h],
        [x - h, 0.02, z + h],
        [x - h, 0.02, z - h],
      ]}
      color={color}
      lineWidth={2}
      transparent
      opacity={0.9}
    />
  );
}

/** Règle : arc pointillé d'une case à l'autre, distance en mètres et en cases. */
export function Measure({ frame, a, b, state }: { frame: Frame; a: Cell; b: Cell; state: CombatState }) {
  const [ax, az] = cellCenter(frame, a);
  const [bx, bz] = cellCenter(frame, b);
  const d = gridDistance(a, b, state.settings.diagonalRule);
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    const len = Math.hypot(bx - ax, bz - az);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push([ax + (bx - ax) * t, 0.08 + Math.sin(t * Math.PI) * Math.min(1.2, len * 0.15), az + (bz - az) * t]);
    }
    return pts;
  }, [ax, az, bx, bz]);
  return (
    <group>
      <Line points={points} color="#e8d3a0" lineWidth={2.5} dashed dashSize={0.25} gapSize={0.15} />
      <HoverCell frame={frame} cell={a} />
      <HoverCell frame={frame} cell={b} />
      <Html position={[bx, 0.5, bz]} center zIndexRange={[35, 0]} style={{ pointerEvents: 'none' }}>
        <div className={s.measure3d}>
          {num(d * state.map.cellMeters)} m · {d} cases
        </div>
      </Html>
    </group>
  );
}

/** Chemin pointillé du pion qu'on déplace, et son coût. */
export function MovePath({ frame, from, to, size, label, ok }: { frame: Frame; from: Cell; to: Cell; size: number; label: string; ok: boolean }) {
  const off = size / 2 - 0.5;
  const [ax, az] = cellCenter(frame, from);
  const [bx, bz] = cellCenter(frame, to);
  return (
    <group>
      <Line
        points={[
          [ax + off, 0.05, az + off],
          [bx + off, 0.05, bz + off],
        ]}
        color={ok ? '#7cc6ff' : '#e07aa8'}
        lineWidth={3}
        dashed
        dashSize={0.2}
        gapSize={0.12}
      />
      <Html position={[bx + off, 0.95, bz + off]} center zIndexRange={[35, 0]} style={{ pointerEvents: 'none' }}>
        <div className={s.ghostCost} style={{ position: 'static', transform: 'none' }}>
          {label}
        </div>
      </Html>
    </group>
  );
}
