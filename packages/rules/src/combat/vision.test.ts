import { describe, expect, it } from 'vitest';
import { SeededRng } from '../rng';
import type { CombatantSpec } from './commands';
import { CombatRuleError, createCombatEvent, decideCombat, type CombatActor } from './decide';
import { describeCombatEvent } from './describe';
import type { CombatEvent } from './events';
import { applyCombatEvent, initiativeOrder, replayCombat } from './reducer';
import type { CombatState } from './types';
import { blocksSight, combatantName, fieldOfView, FogMemory, fogView, visibleCells } from './vision';

const GM: CombatActor = { userId: 'gm', role: 'gm' };
const LYRA: CombatActor = { userId: 'lyra', role: 'player' };

const spec = (over: Partial<CombatantSpec>): CombatantSpec => ({
  name: 'Elowen', kind: 'pc', side: 'ally', hp: 30, maxHp: 30, ac: 15, initiativeMod: 2, speed: 9, size: 1,
  position: null, characterId: null, monsterId: null, ownerUserId: null, attack: null, portraitUrl: null, modelUrl: null,
  ...over,
});

/**
 * Carte 12 × 8 coupée en deux par un mur vertical en x = 6 (avec une porte en (6, 4)).
 * Elowen (Lyra) à gauche, Brakk (Tomas) et un gobelin à droite.
 */
function dungeon() {
  let n = 0;
  const ctx = { rng: new SeededRng(7), newId: () => `id${++n}` };
  const events: CombatEvent[] = [createCombatEvent('cmb', 'Crypte', 12, 8)];
  let state = replayCombat(events)!;
  const run = (cmd: Parameters<typeof decideCombat>[1], actor: CombatActor = GM) => {
    for (const e of decideCombat(state, cmd, actor, ctx)) {
      events.push(e);
      state = applyCombatEvent(state, e);
    }
  };
  run({ type: 'paint_terrain', cells: [0, 1, 2, 3, 5, 6, 7].map((y) => ({ x: 6, y })), terrain: 'wall' });
  run({ type: 'add_object', kind: 'door', position: { x: 6, y: 4 } });
  run({ type: 'add_combatant', spec: spec({ name: 'Elowen', ownerUserId: 'lyra', position: { x: 2, y: 4 } }) }); // id2
  run({ type: 'add_combatant', spec: spec({ name: 'Brakk', ownerUserId: 'tomas', position: { x: 9, y: 2 } }) }); // id3
  run({ type: 'add_combatant', spec: spec({ name: 'Gobelin', kind: 'monster', side: 'enemy', position: { x: 10, y: 4 } }) }); // id4
  run({ type: 'set_fog', enabled: true });
  return { events, run, get state(): CombatState { return state; } };
}

describe('brouillard de guerre', () => {
  it('le regard s’arrête aux murs et aux portes fermées, mais voit le mur lui-même', () => {
    const t = dungeon();
    const fov = fieldOfView(t.state, { x: 2, y: 4 });
    expect(fov.has('6,2')).toBe(true);
    expect(fov.has('6,4')).toBe(true);
    expect(fov.has('9,4')).toBe(false);
    expect(fov.has('0,0')).toBe(true);
  });

  it('est symétrique : si A voit B, B voit A', () => {
    const t = dungeon();
    t.run({ type: 'paint_terrain', cells: [{ x: 3, y: 2 }, { x: 4, y: 5 }, { x: 1, y: 6 }], terrain: 'wall' });
    for (let ax = 0; ax < 6; ax++)
      for (let ay = 0; ay < 8; ay++)
        for (const k of fieldOfView(t.state, { x: ax, y: ay })) {
          const [bx, by] = k.split(',').map(Number) as [number, number];
          if (blocksSight(t.state, bx, by) || blocksSight(t.state, ax, ay)) continue;
          expect(fieldOfView(t.state, { x: bx, y: by }).has(`${ax},${ay}`)).toBe(true);
        }
  });

  it('chaque joueur ne voit que par les yeux de ses personnages ; ouvrir la porte change tout', () => {
    const t = dungeon();
    const lyra = visibleCells(t.state, 'lyra');
    expect(lyra.has('9,2')).toBe(false);
    const view = fogView(t.state, 'lyra', lyra, lyra);
    // Le gobelin est caché (hors du plateau, anonyme) ; Brakk, PJ, reste connu du groupe.
    expect(view.combatants.id4).toMatchObject({ concealed: true, position: null, short: '?', hp: null, ac: null });
    expect(combatantName(view.combatants.id4!)).toBe('Créature inconnue');
    expect(view.combatants.id3!.concealed).toBeUndefined();
    t.run({ type: 'update_object', objectId: 'id1', patch: { open: true } }, LYRA);
    expect(visibleCells(t.state, 'lyra').has('10,4')).toBe(true);
  });

  it('l’ordre d’initiative ne dépend jamais de ce que voit le joueur', () => {
    const t = dungeon();
    t.run({ type: 'set_initiative', combatantId: 'id2', value: 12 });
    t.run({ type: 'set_initiative', combatantId: 'id3', value: 8 });
    t.run({ type: 'set_initiative', combatantId: 'id4', value: 15 });
    t.run({ type: 'start' });
    // C'est au gobelin, invisible pour Lyra : il reste en tête et actif dans sa vue.
    expect(t.state.activeId).toBe('id4');
    const order = (s: CombatState) => initiativeOrder(s).map((c) => c.id);
    const seenBy = (userId: string) => {
      const v = visibleCells(t.state, userId);
      return fogView(t.state, userId, v, v);
    };
    expect(order(seenBy('lyra'))).toEqual(order(t.state));
    expect(seenBy('lyra').activeId).toBe('id4');
    // Porte ouverte (le gobelin devient visible) puis refermée : l'ordre ne bouge pas.
    t.run({ type: 'update_object', objectId: 'id1', patch: { open: true } });
    expect(seenBy('lyra').combatants.id4!.concealed).toBeUndefined();
    expect(order(seenBy('lyra'))).toEqual(order(t.state));
    t.run({ type: 'update_object', objectId: 'id1', patch: { open: false } });
    expect(order(seenBy('lyra'))).toEqual(order(t.state));
    // Le journal ne nomme pas une créature hors de vue.
    const attack: CombatEvent = { type: 'combat.attack_rolled', payload: { attackerId: 'id4', targetId: 'id2', label: 'Cimeterre', natural: 12, bonus: 4, total: 16, targetAc: 15, hit: true, crit: false } };
    expect(describeCombatEvent(attack, seenBy('lyra'))).not.toContain('Gobelin');
  });

  it('le MJ partage une vision à un joueur, à tous, ou au groupe entier', () => {
    const t = dungeon();
    t.run({ type: 'share_vision', combatantId: 'id3', userIds: ['lyra'] });
    expect(visibleCells(t.state, 'lyra').has('10,4')).toBe(true);
    t.run({ type: 'share_vision', combatantId: 'id3', userIds: [] });
    expect(visibleCells(t.state, 'lyra').has('10,4')).toBe(false);
    t.run({ type: 'set_fog', shared: true });
    expect(visibleCells(t.state, 'lyra').has('10,4')).toBe(true);
    expect(() => t.run({ type: 'share_vision', combatantId: 'id3', userIds: ['*'] }, LYRA)).toThrow(CombatRuleError);
  });

  it('dans le noir, on voit à portée de vue… et la lumière d’une torche au loin', () => {
    const t = dungeon();
    t.run({ type: 'set_fog', range: 2 });
    let v = visibleCells(t.state, 'lyra');
    expect(v.has('3,4')).toBe(true);
    expect(v.has('5,0')).toBe(false);
    t.run({ type: 'add_object', kind: 'torch', position: { x: 5, y: 0 } });
    v = visibleCells(t.state, 'lyra');
    expect(v.has('5,0')).toBe(true);
    expect(v.has('5,1')).toBe(true);
  });

  it('les cases révélées par le MJ sont visibles de tous', () => {
    const t = dungeon();
    t.run({ type: 'reveal_cells', cells: [{ x: 10, y: 4 }], revealed: true });
    const v = visibleCells(t.state, 'lyra');
    expect(fogView(t.state, 'lyra', v, v).combatants.id4!.concealed).toBeUndefined();
  });

  it('la mémoire de la carte se déduit du flux et le MJ peut l’effacer', () => {
    const t = dungeon();
    t.run({ type: 'update_object', objectId: 'id1', patch: { open: true } });
    t.run({ type: 'update_object', objectId: 'id1', patch: { open: false } });
    const memory = new FogMemory('lyra');
    memory.advance(t.events);
    expect(memory.explored.has('10,4')).toBe(true); // vu porte ouverte, retenu porte fermée
    expect(visibleCells(t.state, 'lyra').has('10,4')).toBe(false);
    t.run({ type: 'reset_fog_memory' });
    memory.advance(t.events);
    expect(memory.explored.size).toBe(0);
    expect(() => t.run({ type: 'reset_fog_memory' }, LYRA)).toThrow(/Maître du Jeu/);
  });
});
