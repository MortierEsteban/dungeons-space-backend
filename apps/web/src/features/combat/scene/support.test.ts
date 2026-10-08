import { applyCombatEvent, createCombatEvent, type Combatant, type CombatState } from '@ds/rules';
import { describe, expect, it } from 'vitest';
import { withCharacterModels } from './support';

function combat(...combatants: Partial<Combatant>[]): CombatState {
  let s = applyCombatEvent(null, createCombatEvent('cmb', 'Test'));
  combatants.forEach((c, i) => {
    const full = { id: `c${i}`, name: `C${i}`, characterId: null, modelUrl: null, ...c } as Combatant;
    s = applyCombatEvent(s, { type: 'combat.combatant_added', payload: { combatant: full } });
  });
  return s;
}

describe('modèles 3D des personnages', () => {
  it('un PJ déjà engagé prend le modèle choisi ensuite sur sa fiche', () => {
    const s = combat({ characterId: 'brakk', modelUrl: null });
    const shown = withCharacterModels(s, new Map([['brakk', '/uploads/brakk.glb']]));
    expect(shown.combatants.c0!.modelUrl).toBe('/uploads/brakk.glb');
  });

  it('garde le modèle du combat pour les créatures et les PJ sans modèle sur leur fiche', () => {
    const s = combat({ monsterId: 'goblin', modelUrl: '/uploads/gob.glb' }, { characterId: 'ilda', modelUrl: '/uploads/ilda.glb' });
    const shown = withCharacterModels(s, new Map([['ilda', null]]));
    expect(shown.combatants.c0!.modelUrl).toBe('/uploads/gob.glb');
    expect(shown.combatants.c1!.modelUrl).toBe('/uploads/ilda.glb');
  });

  it('renvoie le même état quand rien ne change (pas de rendu inutile)', () => {
    const s = combat({ characterId: 'elowen', modelUrl: null });
    expect(withCharacterModels(s, new Map([['elowen', null]]))).toBe(s);
  });
});
