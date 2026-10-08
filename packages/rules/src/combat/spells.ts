import type { AreaShape } from '../dnd5e/content/types';
import type { SpellMechanics } from '../dnd5e/spellcasting';
import { combatantsInZone } from './grid';
import type { Cell, CombatState, Zone, ZoneShape } from './types';

const SHAPE: Record<AreaShape, ZoneShape> = { sphere: 'circle', cylinder: 'circle', cube: 'square', cone: 'cone', line: 'line' };

/** Teinte du gabarit selon le type de dégâts (ou soins). */
export function spellColor(m: Pick<SpellMechanics, 'damageType' | 'heal' | 'condition'>): string {
  if (m.heal) return '#7cc6ff';
  const t = (m.damageType ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (t.startsWith('feu')) return '#f08a50';
  if (t.startsWith('froid')) return '#9fd8ff';
  if (t.startsWith('foudre')) return '#bfe4ff';
  if (t.startsWith('radiant')) return '#e8d3a0';
  if (t.startsWith('necro') || t.startsWith('poison') || t.startsWith('acide')) return '#8fbf6a';
  if (t.startsWith('force') || t.startsWith('psych')) return '#b9a4e0';
  if (t.startsWith('tonnerre')) return '#c9a96a';
  return m.condition ? '#b9a4e0' : '#e07aa8';
}

/** Direction 0..7 (E, SE, S, SO, O, NO, N, NE) la plus proche du vecteur a → b. */
export function directionTowards(a: Cell, b: Cell): number {
  if (a.x === b.x && a.y === b.y) return 0;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return (((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8);
}

/** Taille du gabarit en cases (rayon, côté ou longueur). */
export function areaCells(size: number, cellMeters: number): number {
  return Math.max(1, Math.round(size / cellMeters));
}

/**
 * Gabarit d'un sort visé sur une case : boule de feu centrée sur le point visé, cône et ligne
 * partant du lanceur vers le point visé, cube personnel posé devant le lanceur.
 */
export function spellZone(m: Pick<SpellMechanics, 'area' | 'selfOrigin' | 'name' | 'damageType' | 'heal' | 'condition'>, caster: Cell | null, aim: Cell, cellMeters: number): Omit<Zone, 'id'> | null {
  if (!m.area) return null;
  const shape = SHAPE[m.area.shape];
  const n = areaCells(m.area.size, cellMeters);
  const from = caster ?? aim;
  const direction = directionTowards(from, aim);
  let origin = aim;
  if (m.selfOrigin && caster) {
    if (shape === 'square') {
      const [dx, dy] = ([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const)[direction]!;
      origin = { x: Math.round(caster.x + 0.5 + dx * (n / 2 + 0.5) - n / 2), y: Math.round(caster.y + 0.5 + dy * (n / 2 + 0.5) - n / 2) };
    } else origin = caster;
  } else if (shape === 'square') {
    origin = { x: aim.x - Math.floor(n / 2), y: aim.y - Math.floor(n / 2) };
  }
  return { shape, origin, size: n, direction, color: spellColor(m), label: m.name };
}

/** Créatures touchées par un gabarit (le lanceur est exclu d'un gabarit qui part de lui). */
export function spellTargets(state: CombatState, zone: Omit<Zone, 'id'>, casterId: string, selfOrigin: boolean): string[] {
  return combatantsInZone(state, { ...zone, id: 'spell' })
    .filter((c) => !(selfOrigin && c.id === casterId))
    .map((c) => c.id);
}

/** Distance en mètres (diagonales simples) entre le lanceur et le point visé. */
export function aimDistance(state: CombatState, from: Cell, to: Cell): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) * state.map.cellMeters;
}
