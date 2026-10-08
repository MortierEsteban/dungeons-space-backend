import { describe, expect, it } from 'vitest';
import { spellMechanics } from '../dnd5e/spellcasting';
import { ScriptedRng } from '../rng';
import type { CombatantSpec, ResolvedSpell } from './commands';
import { createCombatEvent, decideCombat, type CombatActor } from './decide';
import { applyCombatEvent, replayCombat } from './reducer';
import { directionTowards, spellTargets, spellZone } from './spells';
import type { CombatState } from './types';

const PLAYER: CombatActor = { userId: 'p1', role: 'player' };
const GM: CombatActor = { userId: 'gm', role: 'gm' };

const spec = (over: Partial<CombatantSpec>): CombatantSpec => ({
  name: 'Créature', kind: 'monster', side: 'enemy', hp: 30, maxHp: 30, ac: 12, initiativeMod: 0, speed: 9, size: 1,
  position: null, characterId: null, monsterId: null, ownerUserId: null, attack: null, portraitUrl: null, modelUrl: null,
  ...over,
});

function board(rolls: number[]) {
  let n = 0;
  const ctx = { rng: new ScriptedRng(rolls), newId: () => `id${++n}` };
  let state = replayCombat([createCombatEvent('c', 'Test', 20, 12)])!;
  const run = (cmd: Parameters<typeof decideCombat>[1], actor: CombatActor = GM) => {
    const out = decideCombat(state, cmd, actor, ctx);
    for (const e of out) state = applyCombatEvent(state, e);
    return out;
  };
  return { run, get state(): CombatState { return state; } };
}

const fireball = spellMechanics({ id: 's', ref: 'fireball', name: 'Boule de feu', level: 3, concentration: false, ritual: false, prepared: true, favorite: false });

describe('gabarits de sorts', () => {
  it('oriente les cônes vers le point visé', () => {
    expect(directionTowards({ x: 5, y: 5 }, { x: 9, y: 5 })).toBe(0);
    expect(directionTowards({ x: 5, y: 5 }, { x: 5, y: 9 })).toBe(2);
    expect(directionTowards({ x: 5, y: 5 }, { x: 1, y: 1 })).toBe(5);
  });

  it('centre la boule de feu sur le point visé (rayon 6 m = 4 cases) et part du lanceur pour un cône', () => {
    expect(spellZone(fireball, { x: 0, y: 0 }, { x: 10, y: 6 }, 1.5)).toMatchObject({ shape: 'circle', origin: { x: 10, y: 6 }, size: 4, label: 'Boule de feu', color: '#f08a50' });
    const hands = spellMechanics({ id: 'h', ref: 'burning-hands', name: 'Mains brûlantes', level: 1, concentration: false, ritual: false, prepared: true, favorite: false });
    expect(spellZone(hands, { x: 2, y: 2 }, { x: 2, y: 8 }, 1.5)).toMatchObject({ shape: 'cone', origin: { x: 2, y: 2 }, size: 3, direction: 2 });
  });
});

describe('résolution des sorts', () => {
  const setup = (rolls: number[]) => {
    const t = board(rolls);
    t.run({ type: 'add_combatant', spec: spec({ name: 'Mage', kind: 'pc', side: 'ally', ownerUserId: 'p1', position: { x: 1, y: 1 } }) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Gobelin', position: { x: 10, y: 6 }, saves: { dex: 2 } }) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Diablotin', position: { x: 11, y: 6 }, defenses: { resistances: [{ damage: 'feu' }], immunities: [], vulnerabilities: [] } }) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Loin', position: { x: 18, y: 1 } }) });
    return t;
  };

  it('boule de feu : un jet de dégâts, une sauvegarde par cible, moitié sur réussite, résistance appliquée', () => {
    // 8d6 = 24 ; Gobelin JS 15+2 = 17 ≥ 14 (réussi) ; Diablotin JS 3 (raté).
    const t = setup([3, 3, 3, 3, 3, 3, 3, 3, 15, 3]);
    const zone = spellZone(fireball, t.state.combatants.id1!.position, { x: 10, y: 6 }, 1.5)!;
    const targets = spellTargets(t.state, zone, 'id1', false);
    expect(targets).toEqual(['id2', 'id3']);
    const cmd: ResolvedSpell = {
      type: 'resolve_spell', casterId: 'id1', name: 'Boule de feu', level: 3, targetIds: targets, zone, keepZone: false,
      save: { ability: 'dex', dc: 14, half: true }, damage: { notation: '8d6', type: 'feu' }, concentration: false, cost: 'action',
    };
    const out = t.run(cmd, PLAYER);
    expect(out.map((e) => e.type)).toEqual(['combat.spell_cast', 'combat.save_rolled', 'combat.hp_changed', 'combat.save_rolled', 'combat.hp_changed']);
    expect(t.state.combatants.id2!.hp).toBe(30 - 12);
    expect(t.state.combatants.id3!.hp).toBe(30 - 12);
    const resisted = out[4]!;
    expect(resisted.type === 'combat.hp_changed' && resisted.payload).toMatchObject({ defense: 'résistance', rawAmount: 24, amount: 12 });
    expect(t.state.combatants.id4!.hp).toBe(30);
  });

  it('rayon ardent : une attaque par rayon, la même cible peut en recevoir plusieurs', () => {
    // Rayon 1 : 15 + 5 = 20 touché, 2d6 = 4+4 ; rayon 2 : 1 (raté).
    const t = setup([15, 4, 4, 1]);
    t.run({ type: 'resolve_spell', casterId: 'id1', name: 'Rayon ardent', level: 2, targetIds: ['id2', 'id2'], keepZone: false, attack: { bonus: 5 }, damage: { notation: '2d6', type: 'feu' }, concentration: false, cost: 'action' }, PLAYER);
    expect(t.state.combatants.id2!.hp).toBe(22);
  });

  it('soins, état accordé, concentration et refus pour un joueur qui ne contrôle pas le lanceur', () => {
    const t = setup([5]);
    t.run({ type: 'resolve_spell', casterId: 'id1', name: 'Soins', level: 1, targetIds: ['id2'], keepZone: false, heal: { notation: '1d8+3' }, concentration: false, cost: 'action' }, PLAYER);
    expect(t.state.combatants.id2!.hp).toBe(30);
    t.run({ type: 'resolve_spell', casterId: 'id1', name: 'Bénédiction', level: 1, targetIds: ['id1'], keepZone: false, condition: 'Béni', concentration: true, cost: 'action' }, PLAYER);
    expect(t.state.combatants.id1!.conditions.map((c) => c.name).sort()).toEqual(['Béni', 'Concentration']);
    expect(() => t.run({ type: 'resolve_spell', casterId: 'id2', name: 'Soins', level: 1, targetIds: [], keepZone: false, concentration: false, cost: 'none' }, PLAYER)).toThrow();
  });

  it('applique la rage seulement quand l’état est porté', () => {
    const t = board([6, 6]);
    t.run({ type: 'add_combatant', spec: spec({ name: 'Brakk', defenses: { resistances: [{ damage: 'tranchant', when: 'Rage' }], immunities: [], vulnerabilities: [] } }) });
    t.run({ type: 'change_hp', combatantId: 'id1', amount: 10, mode: 'damage', damageType: 'tranchant' });
    expect(t.state.combatants.id1!.hp).toBe(20);
    t.run({ type: 'toggle_condition', combatantId: 'id1', name: 'Rage', rounds: null });
    t.run({ type: 'change_hp', combatantId: 'id1', amount: 10, mode: 'damage', damageType: 'tranchant' });
    expect(t.state.combatants.id1!.hp).toBe(15);
  });
});
