import { getCondition } from '../dnd5e/conditions';
import type { CombatEvent } from './events';
import type { CombatState } from './types';

const OBJECT_LABELS: Record<string, string> = {
  chest: 'Coffre', barrel: 'Tonneau', door: 'Porte', campfire: 'Feu de camp', torch: 'Torche', trap: 'Piège', altar: 'Autel', statue: 'Statue',
};

/** « feu » → « de feu », « acide » → « d’acide », « perforant » → « perforants ». */
function damageLabel(type: string): string {
  const t = type.toLowerCase();
  if (['feu', 'froid', 'foudre', 'force', 'poison', 'tonnerre'].includes(t)) return `de ${t}`;
  if (t === 'acide') return 'd’acide';
  return t.endsWith('s') ? t : `${t}s`;
}

/**
 * Titre lisible d'un événement de combat pour la Chronique. Appelé avec l'événement déjà filtré
 * pour la vue joueur, il ne révèle donc jamais une valeur masquée.
 */
export function describeCombatEvent(e: CombatEvent, state: CombatState | null): string {
  const name = (id: string) => state?.combatants[id]?.name ?? 'Une créature';
  switch (e.type) {
    case 'combat.created':
      return `Combat préparé : ${e.payload.name}`;
    case 'combat.combatant_added':
      return `${e.payload.combatant.name} rejoint le combat`;
    case 'combat.combatant_updated':
      if (Object.keys(e.payload.patch).join() === 'portraitUrl') return `${name(e.payload.id)} a un nouveau portrait`;
      if (Object.keys(e.payload.patch).join() === 'modelUrl') return `${name(e.payload.id)} change d’apparence`;
      return `${name(e.payload.id)} est modifié`;
    case 'combat.combatant_removed':
      return `${name(e.payload.id)} quitte le combat`;
    case 'combat.initiative_set':
      return `Initiative de ${name(e.payload.id)} : ${e.payload.value}`;
    case 'combat.started':
      return `Le combat commence${state ? ` : ${state.name}` : ''}`;
    case 'combat.turn_started':
      return `Round ${e.payload.round} — au tour de ${name(e.payload.combatantId)}`;
    case 'combat.token_moved':
      return `${name(e.payload.id)} se déplace${e.payload.cost ? ` (${String(e.payload.cost).replace('.', ',')} m)` : ''}`;
    case 'combat.hp_changed': {
      const p = e.payload;
      const who = name(p.id);
      if (p.mode === 'heal') return p.amount === null ? `${who} reprend des forces` : `${who} récupère ${p.amount} PV`;
      if (p.mode === 'temp') return `${who} gagne des PV temporaires`;
      if (p.bandAfter === 'À terre') return `${who} tombe à terre`;
      const dmg = p.amount === null ? `est blessé (${p.bandAfter.toLowerCase()})` : `subit ${p.amount} dégâts${p.damageType ? ` ${damageLabel(p.damageType)}` : ''}${p.defense ? ` (${p.defense})` : ''}`;
      return `${who} ${dmg}${p.concentrationDc ? ` — jet de concentration DD ${p.concentrationDc}` : ''}`;
    }
    case 'combat.condition_applied':
      return `${name(e.payload.id)} : ${getCondition(e.payload.name)?.name ?? e.payload.name}${e.payload.rounds ? ` (${e.payload.rounds} rounds)` : ''}`;
    case 'combat.condition_removed':
      return `${name(e.payload.id)} n’est plus « ${e.payload.name} »`;
    case 'combat.attack_rolled': {
      const p = e.payload;
      const vs = p.targetAc === null ? '' : ` contre CA ${p.targetAc}`;
      const result = p.crit ? 'Critique !' : p.natural === 1 ? 'échec critique' : p.hit ? 'touché' : 'raté';
      return `${name(p.attackerId)} attaque ${name(p.targetId)} (${p.label}) : ${p.total}${vs} — ${result}`;
    }
    case 'combat.spell_cast': {
      const p = e.payload;
      const n = p.targetIds.length;
      return `${name(p.casterId)} lance ${p.name}${n ? ` (${n} cible${n > 1 ? 's' : ''})` : ''}${p.damage !== undefined ? ` — ${p.damage} dégâts` : ''}${p.heal !== undefined ? ` — ${p.heal} PV` : ''}`;
    }
    case 'combat.save_rolled': {
      const p = e.payload;
      const ab = { str: 'FOR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'SAG', cha: 'CHA' }[p.ability] ?? p.ability;
      return `${name(p.id)} : JS de ${ab} ${p.total} contre DD ${p.dc} — ${p.success ? 'réussi' : 'raté'} (${p.label})`;
    }
    case 'combat.dice_rolled':
      return `${e.payload.label} : ${e.payload.total} (${e.payload.notation})`;
    case 'combat.resource_used':
      return `${name(e.payload.id)} utilise ${e.payload.resource === 'action' ? 'son action' : e.payload.resource === 'bonus' ? 'son action bonus' : 'sa réaction'}`;
    case 'combat.map_resized':
      return `Carte redimensionnée (${e.payload.cols} × ${e.payload.rows})`;
    case 'combat.background_set':
      return e.payload.url ? 'Nouvelle carte de bataille' : 'Carte de bataille retirée';
    case 'combat.terrain_painted':
      return 'Terrain modifié';
    case 'combat.zone_added':
      return `Zone posée${e.payload.zone.label ? ` : ${e.payload.zone.label}` : ''}`;
    case 'combat.zone_removed':
      return 'Zone retirée';
    case 'combat.object_added':
      return `Décor placé : ${e.payload.object.label || (OBJECT_LABELS[e.payload.object.kind] ?? 'objet').toLowerCase()}`;
    case 'combat.object_updated':
      return e.payload.patch.revealed ? 'Un secret est révélé !' : e.payload.patch.open !== undefined ? (e.payload.patch.open ? 'Ouverture' : 'Fermeture') : 'Objet déplacé';
    case 'combat.object_removed':
      return 'Objet retiré';
    case 'combat.fog_updated': {
      const p = e.payload.patch;
      if (p.enabled !== undefined) return p.enabled ? 'Le brouillard de guerre tombe' : 'Le brouillard de guerre se lève';
      if (p.shared !== undefined) return p.shared ? 'Vision de groupe partagée' : 'Chacun ne voit plus que par ses yeux';
      return 'Portée de vue modifiée';
    }
    case 'combat.vision_shared':
      return e.payload.userIds.length ? `La vision de ${name(e.payload.combatantId)} est partagée` : `La vision de ${name(e.payload.combatantId)} n’est plus partagée`;
    case 'combat.cells_revealed':
      return e.payload.revealed ? 'Le MJ révèle une partie de la carte' : 'Le MJ masque une partie de la carte';
    case 'combat.fog_memory_reset':
      return 'Les souvenirs de la carte s’effacent';
    case 'combat.ended':
      return `Fin du combat${state ? ` : ${state.name}` : ''}`;
  }
}
