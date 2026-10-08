import { cellKey, type Cell, type Combatant, type CombatSettings, type CombatState, type TerrainKind, type Zone } from './types';

const DIFFICULT: ReadonlySet<TerrainKind> = new Set(['difficult', 'water', 'vegetation', 'lava']);

/**
 * Distance en cases entre deux cases.
 * simple : chaque diagonale coûte 1 (règle de base 5e) ; alternate : 1, 2, 1, 2… (variante 5/10/5).
 */
export function gridDistance(a: Cell, b: Cell, rule: CombatSettings['diagonalRule'] = 'simple'): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  if (rule === 'simple') return diag + straight;
  return straight + diag + Math.floor(diag / 2);
}

export function distanceMeters(a: Cell, b: Cell, settings: CombatSettings, cellMeters = 1.5): number {
  return gridDistance(a, b, settings.diagonalRule) * cellMeters;
}

export function inBounds(state: CombatState, c: Cell, size = 1): boolean {
  return c.x >= 0 && c.y >= 0 && c.x + size <= state.map.cols && c.y + size <= state.map.rows;
}

export function footprint(pos: Cell, size: number): Cell[] {
  const cells: Cell[] = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) cells.push({ x: pos.x + dx, y: pos.y + dy });
  return cells;
}

function occupiedBy(state: CombatState, exceptId: string): Map<string, Combatant> {
  const occ = new Map<string, Combatant>();
  for (const c of Object.values(state.combatants)) {
    if (c.id === exceptId || !c.position) continue;
    for (const cell of footprint(c.position, c.size)) occ.set(cellKey(cell), c);
  }
  return occ;
}

export function isWall(state: CombatState, c: Cell): boolean {
  return state.map.terrain[cellKey(c)] === 'wall';
}

const STEPS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Cases atteignables par un combattant avec un budget de déplacement (en mètres) :
 * terrain difficile ×2, murs infranchissables, ennemis bloquants, alliés traversables
 * (mais on ne s'y arrête pas). Retourne case → coût en mètres.
 */
export function reachableCells(state: CombatState, combatantId: string, budgetMeters: number): Map<string, number> {
  const self = state.combatants[combatantId];
  const result = new Map<string, number>();
  if (!self?.position) return result;
  const cm = state.map.cellMeters;
  const budget = Math.floor(budgetMeters / cm + 1e-9);
  const occ = occupiedBy(state, combatantId);
  const alternate = state.settings.diagonalRule === 'alternate';

  // Dijkstra sur (case, parité des diagonales) ; coûts entiers en cases.
  type Node = { x: number; y: number; cost: number; parity: number };
  const best = new Map<string, number>();
  const queue: Node[] = [{ ...self.position, cost: 0, parity: 0 }];
  best.set(`${cellKey(self.position)}|0`, 0);

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    const here = cellKey(cur);
    const blockerHere = occ.get(here);
    if (!blockerHere && (!result.has(here) || result.get(here)! > cur.cost * cm)) result.set(here, cur.cost * cm);
    for (const [dx, dy] of STEPS) {
      const nx = { x: cur.x + dx, y: cur.y + dy };
      if (!inBounds(state, nx, self.size)) continue;
      const cells = footprint(nx, self.size);
      if (cells.some((c) => isWall(state, c))) continue;
      const enemy = cells.some((c) => {
        const o = occ.get(cellKey(c));
        return o && o.side !== self.side && o.hpBand !== 'À terre';
      });
      if (enemy) continue;
      const isDiag = dx !== 0 && dy !== 0;
      let step = 1;
      let parity = cur.parity;
      if (isDiag && alternate) {
        step = parity === 1 ? 2 : 1;
        parity = 1 - parity;
      }
      if (cells.some((c) => DIFFICULT.has(state.map.terrain[cellKey(c)]!))) step *= 2;
      const cost = cur.cost + step;
      if (cost > budget) continue;
      const key = `${cellKey(nx)}|${alternate ? parity : 0}`;
      if (best.has(key) && best.get(key)! <= cost) continue;
      best.set(key, cost);
      queue.push({ ...nx, cost, parity: alternate ? parity : 0 });
    }
  }
  return result;
}

/** Coût (en mètres) du meilleur chemin vers une case, ou null si inaccessible. */
export function movementCost(state: CombatState, combatantId: string, to: Cell): number | null {
  const self = state.combatants[combatantId];
  if (!self?.position) return 0;
  const reach = reachableCells(state, combatantId, (state.map.cols + state.map.rows) * 4 * state.map.cellMeters);
  return reach.get(cellKey(to)) ?? null;
}

const DIRS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Cases couvertes par un gabarit de zone (cercle, carré, cône, ligne). */
export function zoneCells(zone: Zone, cols: number, rows: number): Cell[] {
  const out: Cell[] = [];
  const { origin, size } = zone;
  const [dx, dy] = DIRS[((zone.direction % 8) + 8) % 8]!;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const rx = x - origin.x;
      const ry = y - origin.y;
      let inside = false;
      switch (zone.shape) {
        case 'circle':
          inside = Math.hypot(rx, ry) <= size + 0.25;
          break;
        case 'square':
          inside = rx >= 0 && ry >= 0 && rx < size && ry < size;
          break;
        case 'line': {
          const len = Math.hypot(dx, dy);
          const along = (rx * dx + ry * dy) / len;
          const across = Math.abs(rx * dy - ry * dx) / len;
          inside = along >= 0.5 && along <= size + 0.5 && across <= 0.5;
          break;
        }
        case 'cone': {
          const dist = Math.hypot(rx, ry);
          if (dist === 0 || dist > size + 0.25) break;
          const cos = (rx * dx + ry * dy) / (dist * Math.hypot(dx, dy));
          inside = cos >= Math.cos(Math.PI / 4) - 1e-9;
          break;
        }
      }
      if (inside) out.push({ x, y });
    }
  }
  return out;
}

/** Combattants dont l'emprise touche le gabarit (CMB-23). */
export function combatantsInZone(state: CombatState, zone: Zone): Combatant[] {
  const cells = new Set(zoneCells(zone, state.map.cols, state.map.rows).map(cellKey));
  return Object.values(state.combatants).filter((c) => c.position && footprint(c.position, c.size).some((f) => cells.has(cellKey(f))));
}
