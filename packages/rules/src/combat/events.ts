import type { Cell, Combatant, CombatSettings, HpBand, MapObject, TerrainKind, Zone } from './types';

/**
 * Événements de combat : suffisants pour reconstruire l'état (exigence CMB-60/62).
 * Le même réducteur sert au temps réel, au chargement et au replay → aucune divergence possible.
 */
export type CombatEvent =
  | { type: 'combat.created'; payload: { id: string; name: string; cols: number; rows: number; settings: CombatSettings } }
  | { type: 'combat.combatant_added'; payload: { combatant: Combatant } }
  | { type: 'combat.combatant_updated'; payload: { id: string; patch: Partial<Pick<Combatant, 'name' | 'short' | 'ac' | 'maxHp' | 'hp' | 'hidden' | 'side' | 'initiativeMod' | 'speed' | 'attack' | 'hpBand' | 'modelUrl'>> } }
  | { type: 'combat.combatant_removed'; payload: { id: string } }
  | { type: 'combat.initiative_set'; payload: { id: string; value: number; natural: number | null } }
  | { type: 'combat.started'; payload: Record<string, never> }
  | { type: 'combat.turn_started'; payload: { round: number; combatantId: string } }
  | { type: 'combat.token_moved'; payload: { id: string; from: Cell | null; to: Cell; cost: number } }
  | {
      type: 'combat.hp_changed';
      payload: {
        id: string;
        mode: 'damage' | 'heal' | 'temp';
        /** null dans la vue joueur d'une créature cachée. */
        amount: number | null;
        hpBefore: number | null;
        hpAfter: number | null;
        tempAfter: number | null;
        bandAfter: HpBand;
        damageType?: string;
        /** DD du jet de concentration à rappeler (CMB-34). */
        concentrationDc?: number;
        source?: string;
      };
    }
  | { type: 'combat.condition_applied'; payload: { id: string; name: string; rounds: number | null } }
  | { type: 'combat.condition_removed'; payload: { id: string; name: string } }
  | {
      type: 'combat.attack_rolled';
      payload: {
        attackerId: string;
        targetId: string;
        label: string;
        natural: number;
        bonus: number;
        total: number;
        targetAc: number | null;
        hit: boolean;
        crit: boolean;
      };
    }
  | { type: 'combat.dice_rolled'; payload: { label: string; notation: string; rolls: number[]; total: number; byUserId: string; secret: boolean } }
  | { type: 'combat.resource_used'; payload: { id: string; resource: 'action' | 'bonus' | 'reaction' } }
  | { type: 'combat.map_resized'; payload: { cols: number; rows: number } }
  | { type: 'combat.background_set'; payload: { url: string | null } }
  | { type: 'combat.terrain_painted'; payload: { cells: Cell[]; terrain: TerrainKind | null } }
  | { type: 'combat.zone_added'; payload: { zone: Zone } }
  | { type: 'combat.zone_removed'; payload: { id: string } }
  | { type: 'combat.object_added'; payload: { object: MapObject } }
  | { type: 'combat.object_updated'; payload: { id: string; patch: Partial<Omit<MapObject, 'id' | 'kind'>> } }
  | { type: 'combat.object_removed'; payload: { id: string } }
  | { type: 'combat.ended'; payload: { summary: string } };

export type CombatEventType = CombatEvent['type'];

export type CombatEventOf<T extends CombatEventType> = Extract<CombatEvent, { type: T }>;

/** Importance (1-5) dans la Chronique : seuls les moments marquants remontent par défaut. */
export function combatEventImportance(e: CombatEvent): number {
  switch (e.type) {
    case 'combat.started':
    case 'combat.ended':
      return 4;
    case 'combat.hp_changed':
      return e.payload.bandAfter === 'À terre' ? 3 : 1;
    case 'combat.attack_rolled':
      return e.payload.crit ? 2 : 1;
    default:
      return 1;
  }
}
