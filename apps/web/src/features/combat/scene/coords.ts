import type { Cell } from '@ds/rules';
import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Repère du plateau 3D : une case = une unité, carte centrée sur l'origine,
 * colonnes le long de +X, lignes le long de +Z (le haut de l'image est au nord, -Z).
 */
export const WALL_HEIGHT = 1.3;
export const LOW_WALL_HEIGHT = 0.24;

export interface Frame {
  cols: number;
  rows: number;
}

/** Centre de la case (x, y) → coordonnées monde (x, z). */
export const cellCenter = (f: Frame, c: Cell): [number, number] => [c.x + 0.5 - f.cols / 2, c.y + 0.5 - f.rows / 2];

/** Centre de l'emprise d'une créature de taille `size` posée en `pos`. */
export const footprintCenter = (f: Frame, pos: Cell, size: number): [number, number] => [pos.x + size / 2 - f.cols / 2, pos.y + size / 2 - f.rows / 2];

/** Point du sol → case. */
export const cellAt = (f: Frame, x: number, z: number): Cell => ({ x: Math.floor(x + f.cols / 2), y: Math.floor(z + f.rows / 2) });

export const inside = (f: Frame, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < f.cols && c.y < f.rows;

/** Pseudo-aléa stable par case : le décor (rochers, arbres) ne « saute » pas à chaque rendu. */
export function cellRandom(x: number, y: number, salt = 0): () => number {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dalles horizontales fusionnées (une géométrie pour N cases) ; uv = position dans la case. */
export function tilesGeometry(f: Frame, cells: readonly Cell[], y = 0.01, inset = 0): BufferGeometry {
  const pos = new Float32Array(cells.length * 18);
  const uv = new Float32Array(cells.length * 12);
  cells.forEach((c, i) => {
    const x0 = c.x - f.cols / 2 + inset;
    const z0 = c.y - f.rows / 2 + inset;
    const x1 = x0 + 1 - inset * 2;
    const z1 = z0 + 1 - inset * 2;
    pos.set([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], i * 18);
    uv.set([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0], i * 12);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * « Rideau » vertical sur le contour d'un ensemble de cases (zones de sorts, portée) :
 * une face par arête qui sépare une case incluse d'une case exclue. uv.y = hauteur relative.
 */
export function curtainGeometry(f: Frame, cells: readonly Cell[], height: number): BufferGeometry {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  const quads: number[][] = [];
  for (const c of cells) {
    const x0 = c.x - f.cols / 2;
    const z0 = c.y - f.rows / 2;
    if (!set.has(`${c.x},${c.y - 1}`)) quads.push([x0, z0, x0 + 1, z0]);
    if (!set.has(`${c.x},${c.y + 1}`)) quads.push([x0 + 1, z0 + 1, x0, z0 + 1]);
    if (!set.has(`${c.x - 1},${c.y}`)) quads.push([x0, z0 + 1, x0, z0]);
    if (!set.has(`${c.x + 1},${c.y}`)) quads.push([x0 + 1, z0, x0 + 1, z0 + 1]);
  }
  const pos = new Float32Array(quads.length * 18);
  const uv = new Float32Array(quads.length * 12);
  quads.forEach(([ax, az, bx, bz], i) => {
    pos.set([ax!, 0, az!, bx!, 0, bz!, bx!, height, bz!, ax!, 0, az!, bx!, height, bz!, ax!, height, az!], i * 18);
    uv.set([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], i * 12);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

/** Lignes de la grille, légèrement au-dessus du sol. */
export function gridGeometry(f: Frame, y = 0.006): BufferGeometry {
  const pts: number[] = [];
  const hx = f.cols / 2;
  const hz = f.rows / 2;
  for (let x = 0; x <= f.cols; x++) pts.push(x - hx, y, -hz, x - hx, y, hz);
  for (let z = 0; z <= f.rows; z++) pts.push(-hx, y, z - hz, hx, y, z - hz);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  return g;
}
