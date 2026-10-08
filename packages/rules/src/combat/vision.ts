import type { CombatEvent, CombatEventType } from './events';
import { footprint } from './grid';
import { applyCombatEvent, fogOf } from './reducer';
import { cellKey, type Cell, type Combatant, type CombatState, type ObjectKind } from './types';

/**
 * Brouillard de guerre (calculé côté client, par utilisateur) : ce que voient les yeux d'un
 * joueur, selon les murs, les portes, la lumière et les visions que le MJ lui accorde.
 */

/** Rayon de lumière des sources posées sur la carte, en cases. */
export const LIGHT_RADIUS: Partial<Record<ObjectKind, number>> = { campfire: 3, torch: 4 };

/** Une case arrête-t-elle le regard ? Murs, portes fermées et bords de la carte. */
export function blocksSight(state: CombatState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.map.cols || y >= state.map.rows) return true;
  if (state.map.terrain[`${x},${y}`] === 'wall') return true;
  return state.map.objects.some((o) => o.kind === 'door' && !o.open && o.position.x === x && o.position.y === y);
}

/**
 * Champ de vision depuis une case : « shadowcasting » symétrique (A. Ford) — si A voit B, B voit A,
 * pas d'angle mort entre deux piliers, et chaque case n'est visitée qu'une fois par quadrant.
 * Les obstacles eux-mêmes sont visibles (on voit le mur, pas derrière).
 */
export function fieldOfView(state: CombatState, origin: Cell, radius = Infinity): Set<string> {
  const seen = new Set<string>([cellKey(origin)]);
  const maxDepth = Math.min(radius, Math.max(state.map.cols, state.map.rows));
  const inRange = (row: number, col: number) => row * row + col * col <= (radius + 0.5) * (radius + 0.5);

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const toCell = (row: number, col: number): [number, number] => {
      switch (quadrant) {
        case 0: return [origin.x + col, origin.y - row]; // nord
        case 1: return [origin.x + row, origin.y + col]; // est
        case 2: return [origin.x + col, origin.y + row]; // sud
        default: return [origin.x - row, origin.y + col]; // ouest
      }
    };
    const isWall = (row: number, col: number) => blocksSight(state, ...toCell(row, col));
    const reveal = (row: number, col: number) => {
      const [x, y] = toCell(row, col);
      if (x >= 0 && y >= 0 && x < state.map.cols && y < state.map.rows && inRange(row, col)) seen.add(`${x},${y}`);
    };
    const scan = (depth: number, start: number, end: number): void => {
      if (depth > maxDepth) return;
      let prevWall: boolean | null = null;
      const minCol = Math.floor(depth * start + 0.5);
      const maxCol = Math.ceil(depth * end - 0.5);
      for (let col = minCol; col <= maxCol; col++) {
        const wall = isWall(depth, col);
        const symmetric = col >= depth * start && col <= depth * end;
        if (wall || symmetric) reveal(depth, col);
        if (prevWall === true && !wall) start = (2 * col - 1) / (2 * depth);
        if (prevWall === false && wall) scan(depth + 1, start, (2 * col - 1) / (2 * depth));
        prevWall = wall;
      }
      if (prevWall === false) scan(depth + 1, start, end);
    };
    scan(1, -1, 1);
  }
  return seen;
}

/** Créatures par les yeux desquelles un utilisateur voit (les siennes, celles du groupe, celles qu'on lui prête). */
export function visionSources(state: CombatState, userId: string): Combatant[] {
  const fog = fogOf(state);
  return Object.values(state.combatants).filter((c) => {
    if (!c.position) return false;
    if (c.ownerUserId === userId) return true;
    if (fog.shared && c.kind === 'pc') return true;
    const grant = fog.grants[c.id];
    return !!grant && (grant.includes('*') || grant.includes(userId));
  });
}

/** Cases éclairées par les feux et torches (la lumière aussi s'arrête aux murs). */
export function litCells(state: CombatState): Set<string> {
  const lit = new Set<string>();
  for (const o of state.map.objects) {
    const radius = LIGHT_RADIUS[o.kind];
    if (radius) for (const k of fieldOfView(state, o.position, radius)) lit.add(k);
  }
  return lit;
}

/** Cases que voit un utilisateur en ce moment. */
export function visibleCells(state: CombatState, userId: string): Set<string> {
  const fog = fogOf(state);
  const visible = new Set<string>(Object.keys(fog.revealed));
  const lit = fog.range > 0 ? litCells(state) : null;
  for (const source of visionSources(state, userId)) {
    for (const eye of footprint(source.position!, source.size)) {
      for (const k of fieldOfView(state, eye)) {
        if (!lit) visible.add(k);
        else {
          // Dans le noir : à portée de vue, ou dans la lumière d'un feu (qu'on voit de loin).
          const [x, y] = k.split(',').map(Number) as [number, number];
          if (Math.hypot(x - eye.x, y - eye.y) <= fog.range + 0.5 || lit.has(k)) visible.add(k);
        }
      }
    }
  }
  return visible;
}

/**
 * Vue d'un utilisateur sous le brouillard : les créatures qu'il ne voit pas disparaissent
 * (les PJ restent connus du groupe), le décor et le terrain des zones jamais vues aussi.
 * `known` = cases déjà explorées, cases visibles comprises.
 */
export function fogView(state: CombatState, userId: string, visible: ReadonlySet<string>, known: ReadonlySet<string>): CombatState {
  const sources = new Set(visionSources(state, userId).map((c) => c.id));
  const combatants: CombatState['combatants'] = {};
  for (const c of Object.values(state.combatants)) {
    const seen = c.kind === 'pc' || sources.has(c.id) || (!!c.position && footprint(c.position, c.size).some((f) => visible.has(cellKey(f))));
    if (seen) combatants[c.id] = c;
  }
  const terrain: CombatState['map']['terrain'] = {};
  for (const [k, t] of Object.entries(state.map.terrain)) if (known.has(k)) terrain[k] = t;
  return {
    ...state,
    combatants,
    map: { ...state.map, terrain, objects: state.map.objects.filter((o) => known.has(cellKey(o.position))) },
  };
}

/** Événements qui peuvent changer ce que voit quelqu'un. */
const VISION_EVENTS: ReadonlySet<CombatEventType> = new Set<CombatEventType>([
  'combat.combatant_added',
  'combat.combatant_removed',
  'combat.token_moved',
  'combat.terrain_painted',
  'combat.object_added',
  'combat.object_updated',
  'combat.object_removed',
  'combat.map_resized',
  'combat.fog_updated',
  'combat.vision_shared',
  'combat.cells_revealed',
]);

/**
 * Mémoire de la carte d'un utilisateur, déduite du flux d'événements (tout est événement) :
 * identique sur tous ses appareils, rejouable, effacée par le MJ via `fog_memory_reset`.
 * Incrémentale : `advance` ne rejoue que les événements nouveaux.
 */
export class FogMemory {
  readonly explored = new Set<string>();
  private state: CombatState | null = null;
  private count = 0;

  constructor(readonly userId: string) {}

  get processed(): number {
    return this.count;
  }

  advance(events: readonly CombatEvent[]): void {
    for (; this.count < events.length; this.count++) {
      const e = events[this.count]!;
      this.state = applyCombatEvent(this.state, e);
      if (e.type === 'combat.fog_memory_reset') this.explored.clear();
      else if (VISION_EVENTS.has(e.type) && fogOf(this.state).enabled) for (const k of visibleCells(this.state, this.userId)) this.explored.add(k);
    }
  }
}
