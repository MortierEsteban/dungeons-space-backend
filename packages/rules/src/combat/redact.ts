import type { CombatEvent } from './events';
import type { Combatant, CombatState } from './types';

/**
 * Vue joueur : filtre côté serveur (jamais côté client seul) les informations cachées par le MJ —
 * PV/CA des créatures masquées, objets secrets non révélés, jets secrets du MJ.
 * `before` est l'état COMPLET juste avant l'événement. Retourne null si l'événement ne doit pas être transmis.
 */
export function redactCombatEventForPlayer(event: CombatEvent, before: CombatState | null): CombatEvent | null {
  const hidden = (id: string) => before?.combatants[id]?.hidden ?? false;
  switch (event.type) {
    case 'combat.combatant_added': {
      const c = event.payload.combatant;
      return c.hidden ? { ...event, payload: { combatant: maskCombatant(c) } } : event;
    }
    case 'combat.combatant_updated': {
      const target = before?.combatants[event.payload.id];
      if (!target) return event;
      const willBeHidden = event.payload.patch.hidden ?? target.hidden;
      if (willBeHidden) {
        const { hp: _hp, maxHp: _max, ac: _ac, ...rest } = event.payload.patch;
        const patch = event.payload.patch.hidden === true ? { ...rest, hp: null, maxHp: null, ac: null } : rest;
        return { ...event, payload: { id: event.payload.id, patch } };
      }
      // Créature dévoilée : on transmet ses statistiques réelles.
      if (target.hidden && event.payload.patch.hidden === false) {
        return { ...event, payload: { id: target.id, patch: { ...event.payload.patch, hp: target.hp, maxHp: target.maxHp, ac: target.ac } } };
      }
      return event;
    }
    case 'combat.hp_changed':
      return hidden(event.payload.id)
        ? { ...event, payload: { ...event.payload, amount: null, hpBefore: null, hpAfter: null, tempAfter: null, rawAmount: undefined } }
        : event;
    case 'combat.attack_rolled':
      return hidden(event.payload.targetId) ? { ...event, payload: { ...event.payload, targetAc: null } } : event;
    case 'combat.dice_rolled':
      return event.payload.secret ? null : event;
    case 'combat.object_added':
      return event.payload.object.secret && !event.payload.object.revealed ? null : event;
    case 'combat.object_updated': {
      const obj = before?.map.objects.find((o) => o.id === event.payload.id);
      if (!obj || !obj.secret || obj.revealed) return event;
      if (event.payload.patch.revealed) {
        // Révélation : le joueur découvre l'objet complet.
        return { type: 'combat.object_added', payload: { object: { ...obj, ...event.payload.patch } } };
      }
      return null;
    }
    case 'combat.object_removed': {
      const obj = before?.map.objects.find((o) => o.id === event.payload.id);
      return obj && obj.secret && !obj.revealed ? null : event;
    }
    default:
      return event;
  }
}

function maskCombatant(c: Combatant): Combatant {
  return { ...c, hp: null, maxHp: null, ac: null, tempHp: 0 };
}
