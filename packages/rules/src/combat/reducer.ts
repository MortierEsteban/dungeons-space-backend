import type { CombatEvent } from './events';
import { cellKey, DEFAULT_FOG, type Combatant, type CombatState, type FogSettings, type HpBand } from './types';

/** Réglages du brouillard (désactivé pour les combats qui n'en ont jamais eu). */
export const fogOf = (state: CombatState): FogSettings => state.fog ?? DEFAULT_FOG;

export function hpBand(hp: number, max: number): HpBand {
  if (hp <= 0) return 'À terre';
  const p = hp / Math.max(1, max);
  if (p > 0.75) return 'Indemne';
  if (p > 0.5) return 'Blessé';
  if (p > 0.25) return 'Sanglant';
  return 'Agonisant';
}

const FRESH_RESOURCES = { action: false, bonus: false, reaction: false, movementUsed: 0 };

/** Ordre d'initiative : initiative décroissante, puis modificateur, puis nom (stable et déterministe). */
export function initiativeOrder(state: CombatState): Combatant[] {
  return Object.values(state.combatants).sort(
    (a, b) =>
      (b.initiative ?? -99) - (a.initiative ?? -99) ||
      b.initiativeMod - a.initiativeMod ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

function updateCombatant(state: CombatState, id: string, fn: (c: Combatant) => Combatant): CombatState {
  const c = state.combatants[id];
  if (!c) return state;
  return { ...state, combatants: { ...state.combatants, [id]: fn(c) } };
}

/**
 * Réducteur pur : (état, événement) → état. Tolérant aux références manquantes
 * (la vue joueur peut ne pas connaître certains objets secrets).
 */
export function applyCombatEvent(state: CombatState | null, event: CombatEvent): CombatState {
  if (event.type === 'combat.created') {
    const p = event.payload;
    return {
      id: p.id,
      name: p.name,
      status: 'setup',
      round: 0,
      activeId: null,
      combatants: {},
      map: { cols: p.cols, rows: p.rows, cellMeters: 1.5, background: null, terrain: {}, zones: [], objects: [] },
      settings: p.settings,
      version: 1,
    };
  }
  if (!state) throw new Error(`Événement ${event.type} reçu avant combat.created`);
  const next = reduce(state, event);
  return { ...next, version: state.version + 1 };
}

function reduce(state: CombatState, event: CombatEvent): CombatState {
  switch (event.type) {
    case 'combat.created':
      return state;
    case 'combat.combatant_added':
      return { ...state, combatants: { ...state.combatants, [event.payload.combatant.id]: event.payload.combatant } };
    case 'combat.combatant_updated':
      return updateCombatant(state, event.payload.id, (c) => ({ ...c, ...event.payload.patch }));
    case 'combat.combatant_removed': {
      const { [event.payload.id]: _removed, ...rest } = state.combatants;
      return { ...state, combatants: rest, activeId: state.activeId === event.payload.id ? null : state.activeId };
    }
    case 'combat.initiative_set':
      return updateCombatant(state, event.payload.id, (c) => ({ ...c, initiative: event.payload.value }));
    case 'combat.started':
      return { ...state, status: 'active', round: Math.max(1, state.round) };
    case 'combat.turn_started': {
      const { combatantId, round } = event.payload;
      const withTurn = { ...state, round, activeId: combatantId };
      // Début de tour : ressources remises à zéro, durées des états décrémentées.
      return updateCombatant(withTurn, combatantId, (c) => ({
        ...c,
        resources: { ...FRESH_RESOURCES },
        conditions: c.conditions
          .map((cond) => (cond.rounds === null ? cond : { ...cond, rounds: cond.rounds - 1 }))
          .filter((cond) => cond.rounds === null || cond.rounds > 0),
      }));
    }
    case 'combat.token_moved':
      return updateCombatant(state, event.payload.id, (c) => ({
        ...c,
        position: event.payload.to,
        resources:
          state.status === 'active' && state.activeId === c.id
            ? { ...c.resources, movementUsed: c.resources.movementUsed + event.payload.cost }
            : c.resources,
      }));
    case 'combat.hp_changed': {
      const p = event.payload;
      return updateCombatant(state, p.id, (c) => ({
        ...c,
        hp: p.hpAfter === null ? c.hp : p.hpAfter,
        tempHp: p.tempAfter === null ? c.tempHp : p.tempAfter,
        hpBand: p.bandAfter,
      }));
    }
    case 'combat.condition_applied':
      return updateCombatant(state, event.payload.id, (c) => ({
        ...c,
        conditions: [...c.conditions.filter((x) => x.name !== event.payload.name), { name: event.payload.name, rounds: event.payload.rounds }],
      }));
    case 'combat.condition_removed':
      return updateCombatant(state, event.payload.id, (c) => ({ ...c, conditions: c.conditions.filter((x) => x.name !== event.payload.name) }));
    case 'combat.resource_used':
      return updateCombatant(state, event.payload.id, (c) => ({ ...c, resources: { ...c.resources, [event.payload.resource]: true } }));
    case 'combat.attack_rolled':
    case 'combat.dice_rolled':
      return state;
    case 'combat.map_resized':
      return { ...state, map: { ...state.map, cols: event.payload.cols, rows: event.payload.rows } };
    case 'combat.background_set':
      return { ...state, map: { ...state.map, background: event.payload.url } };
    case 'combat.terrain_painted': {
      const terrain = { ...state.map.terrain };
      for (const cell of event.payload.cells) {
        if (event.payload.terrain) terrain[cellKey(cell)] = event.payload.terrain;
        else delete terrain[cellKey(cell)];
      }
      return { ...state, map: { ...state.map, terrain } };
    }
    case 'combat.zone_added':
      return { ...state, map: { ...state.map, zones: [...state.map.zones, event.payload.zone] } };
    case 'combat.zone_removed':
      return { ...state, map: { ...state.map, zones: state.map.zones.filter((z) => z.id !== event.payload.id) } };
    case 'combat.object_added':
      return { ...state, map: { ...state.map, objects: [...state.map.objects.filter((o) => o.id !== event.payload.object.id), event.payload.object] } };
    case 'combat.object_updated':
      return {
        ...state,
        map: { ...state.map, objects: state.map.objects.map((o) => (o.id === event.payload.id ? { ...o, ...event.payload.patch } : o)) },
      };
    case 'combat.object_removed':
      return { ...state, map: { ...state.map, objects: state.map.objects.filter((o) => o.id !== event.payload.id) } };
    case 'combat.fog_updated':
      return { ...state, fog: { ...fogOf(state), ...event.payload.patch } };
    case 'combat.vision_shared': {
      const { [event.payload.combatantId]: _old, ...grants } = fogOf(state).grants;
      if (event.payload.userIds.length) grants[event.payload.combatantId] = event.payload.userIds;
      return { ...state, fog: { ...fogOf(state), grants } };
    }
    case 'combat.cells_revealed': {
      const revealed = { ...fogOf(state).revealed };
      for (const cell of event.payload.cells) {
        if (event.payload.revealed) revealed[cellKey(cell)] = true;
        else delete revealed[cellKey(cell)];
      }
      return { ...state, fog: { ...fogOf(state), revealed } };
    }
    case 'combat.fog_memory_reset':
      return state;
    case 'combat.ended':
      return { ...state, status: 'ended', activeId: null };
  }
}

/** Reconstruit l'état complet à partir du flux (replay, reprise après reconnexion). */
export function replayCombat(events: readonly CombatEvent[], upTo = events.length): CombatState | null {
  let state: CombatState | null = null;
  for (let i = 0; i < Math.min(upTo, events.length); i++) state = applyCombatEvent(state, events[i]!);
  return state;
}
