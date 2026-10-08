import { describe, expect, it } from 'vitest';
import { ScriptedRng, SeededRng } from '../rng';
import type { CombatantSpec } from './commands';
import { CombatRuleError, createCombatEvent, decideCombat, tokenLabel, type CombatActor } from './decide';
import type { CombatEvent } from './events';
import { gridDistance, reachableCells, zoneCells } from './grid';
import { redactCombatEventForPlayer } from './redact';
import { applyCombatEvent, initiativeOrder, replayCombat } from './reducer';
import type { CombatState } from './types';

const GM: CombatActor = { userId: 'gm', role: 'gm' };
const PLAYER: CombatActor = { userId: 'p1', role: 'player' };

function spec(over: Partial<CombatantSpec>): CombatantSpec {
  return {
    name: 'Elowen', kind: 'pc', side: 'ally', hp: 38, maxHp: 44, ac: 16, initiativeMod: 4, speed: 9, size: 1,
    position: null, characterId: null, monsterId: null, ownerUserId: null, attack: { name: 'Arc long', bonus: 7, damage: '1d8+4', damageType: 'perforant' },
    ...over,
  };
}

function setup() {
  let n = 0;
  const ctx = { rng: new SeededRng(42), newId: () => `id${++n}` };
  const events: CombatEvent[] = [createCombatEvent('cmb', 'Embuscade', 12, 8)];
  let state = replayCombat(events)!;
  const run = (cmd: Parameters<typeof decideCombat>[1], actor: CombatActor = GM) => {
    const out = decideCombat(state, cmd, actor, ctx);
    for (const e of out) {
      events.push(e);
      state = applyCombatEvent(state, e);
    }
    return out;
  };
  return { ctx, events, run, get state(): CombatState { return state; } };
}

describe('grille', () => {
  it('mesure les distances selon la règle choisie', () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 4, y: 4 }, 'simple')).toBe(4);
    expect(gridDistance({ x: 0, y: 0 }, { x: 4, y: 4 }, 'alternate')).toBe(6);
    expect(gridDistance({ x: 0, y: 0 }, { x: 5, y: 2 }, 'alternate')).toBe(6);
  });

  it('calcule les gabarits', () => {
    expect(zoneCells({ id: 'z', shape: 'square', origin: { x: 1, y: 1 }, size: 2, direction: 0, color: '', label: '' }, 10, 10)).toHaveLength(4);
    const line = zoneCells({ id: 'z', shape: 'line', origin: { x: 0, y: 0 }, size: 4, direction: 0, color: '', label: '' }, 10, 10);
    expect(line.map((c) => c.x)).toEqual([1, 2, 3, 4]);
  });

  it('bloque les murs et double le terrain difficile', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({ position: { x: 0, y: 0 } }) });
    t.run({ type: 'paint_terrain', cells: [{ x: 1, y: 0 }, { x: 1, y: 1 }], terrain: 'wall' });
    t.run({ type: 'paint_terrain', cells: [{ x: 0, y: 1 }], terrain: 'difficult' });
    const reach = reachableCells(t.state, 'id1', 3);
    expect(reach.has('1,0')).toBe(false);
    expect(reach.get('0,1')).toBe(3);
    expect(reach.has('0,2')).toBe(false);
  });
});

describe('déroulé d’un combat', () => {
  it('lance l’initiative au démarrage et fait tourner les rounds', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({}) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Gobelin 1', kind: 'monster', side: 'enemy', hp: 7, maxHp: 7, ac: 15, initiativeMod: 2 }) });
    t.run({ type: 'start' });
    expect(t.state.status).toBe('active');
    expect(t.state.round).toBe(1);
    const order = initiativeOrder(t.state);
    expect(t.state.activeId).toBe(order[0]!.id);
    t.run({ type: 'next_turn' });
    t.run({ type: 'next_turn' });
    expect(t.state.round).toBe(2);
    expect(t.state.combatants.id2!.short).toBe('G1');
  });

  it('résout une attaque : touche, dégâts, action consommée', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({ ownerUserId: 'p1' }) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Gobelin', kind: 'monster', side: 'enemy', hp: 7, maxHp: 7, ac: 15 }) });
    t.run({ type: 'set_initiative', combatantId: 'id1', value: 20 });
    t.run({ type: 'set_initiative', combatantId: 'id2', value: 5 });
    t.run({ type: 'start' });
    t.ctx.rng = new ScriptedRng([12, 6]) as unknown as SeededRng;
    const events = t.run({ type: 'attack', attackerId: 'id1', targetId: 'id2', advantage: 'normal' }, PLAYER);
    expect(events[0]).toMatchObject({ type: 'combat.attack_rolled', payload: { total: 19, hit: true } });
    expect(t.state.combatants.id2!.hp).toBe(0);
    expect(t.state.combatants.id2!.hpBand).toBe('À terre');
    expect(t.state.combatants.id1!.resources.action).toBe(true);
  });

  it('applique les permissions joueur', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({ ownerUserId: 'p1' }) });
    t.run({ type: 'add_combatant', spec: spec({ name: 'Brakk', ownerUserId: 'p2' }) });
    expect(() => t.run({ type: 'move', combatantId: 'id2', to: { x: 3, y: 3 } }, PLAYER)).toThrow(CombatRuleError);
    expect(() => t.run({ type: 'paint_terrain', cells: [{ x: 0, y: 0 }], terrain: 'wall' }, PLAYER)).toThrow(/Maître du Jeu/);
    t.run({ type: 'move', combatantId: 'id1', to: { x: 3, y: 3 } }, PLAYER);
    expect(t.state.combatants.id1!.position).toEqual({ x: 3, y: 3 });
  });

  it('rappelle le jet de concentration', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({}) });
    t.run({ type: 'toggle_condition', combatantId: 'id1', name: 'Concentration', rounds: null });
    const [e] = t.run({ type: 'change_hp', combatantId: 'id1', amount: 24, mode: 'damage' });
    expect(e).toMatchObject({ payload: { concentrationDc: 12 } });
  });

  it('décrémente la durée des états au début du tour', () => {
    const t = setup();
    t.run({ type: 'add_combatant', spec: spec({}) });
    t.run({ type: 'toggle_condition', combatantId: 'id1', name: 'Béni', rounds: 1 });
    t.run({ type: 'start' });
    expect(t.state.combatants.id1!.conditions).toEqual([]);
  });

  it('abrège les noms de jetons', () => {
    expect(tokenLabel('Sœur Ilda')).toBe('SI');
    expect(tokenLabel('Gobelin 12')).toBe('G12');
    expect(tokenLabel('Elowen')).toBe('EL');
  });
});

describe('replay et vue joueur', () => {
  /** Joue une séquence aléatoire de commandes valides et renvoie le flux d'événements. */
  function randomCombat(seed: number) {
    const rng = new SeededRng(seed);
    const t = setup();
    t.ctx.rng = new SeededRng(seed * 7 + 1);
    const n = 2 + rng.die(5);
    for (let i = 0; i < n; i++) {
      const enemy = rng.next() < 0.5;
      t.run({ type: 'add_combatant', spec: spec({ name: `Créature ${i}`, kind: enemy ? 'monster' : 'pc', side: enemy ? 'enemy' : 'ally', hp: 5 + rng.die(30), maxHp: 40, ac: 10 + rng.die(8) }) });
    }
    t.run({ type: 'add_object', kind: 'trap', position: { x: 5, y: 5 } });
    t.run({ type: 'start' });
    for (let step = 0; step < 60; step++) {
      const ids = Object.keys(t.state.combatants);
      const a = ids[rng.die(ids.length) - 1]!;
      const b = ids[rng.die(ids.length) - 1]!;
      const roll = rng.die(7);
      try {
        if (roll === 1) t.run({ type: 'next_turn' });
        else if (roll === 2) t.run({ type: 'attack', attackerId: a, targetId: b, advantage: 'normal' });
        else if (roll === 3) t.run({ type: 'change_hp', combatantId: a, amount: rng.die(10), mode: rng.next() < 0.7 ? 'damage' : 'heal' });
        else if (roll === 4) t.run({ type: 'toggle_condition', combatantId: a, name: 'Empoisonné', rounds: rng.die(3) });
        else if (roll === 5) t.run({ type: 'move', combatantId: a, to: { x: rng.die(12) - 1, y: rng.die(8) - 1 } });
        else if (roll === 6) t.run({ type: 'update_object', objectId: t.state.map.objects[0]!.id, patch: { revealed: true } });
        else t.run({ type: 'roll', notation: '1d20', label: 'secret', secret: true });
      } catch (e) {
        if (!(e instanceof CombatRuleError)) throw e;
      }
    }
    return t;
  }

  it('rejouer le flux reconstruit exactement l’état final (200 combats)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = randomCombat(seed);
      expect(replayCombat(t.events)).toEqual(t.state);
    }
  });

  it('la vue joueur ne fuit jamais les PV/CA des créatures cachées ni les secrets', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const t = randomCombat(seed);
      let full: CombatState | null = null;
      let player: CombatState | null = null;
      for (const e of t.events) {
        const red = redactCombatEventForPlayer(e, full);
        full = applyCombatEvent(full, e);
        if (red) {
          expect(red.type === 'combat.dice_rolled' && red.payload.secret).toBe(false);
          player = applyCombatEvent(player, red);
        }
      }
      for (const c of Object.values(player!.combatants)) {
        const real = full!.combatants[c.id]!;
        if (real.hidden) expect([c.hp, c.maxHp, c.ac]).toEqual([null, null, null]);
        else expect(c.hp).toBe(real.hp);
        expect(c.hpBand).toBe(real.hpBand);
        expect(c.position).toEqual(real.position);
      }
      const trap = full!.map.objects[0]!;
      expect(player!.map.objects.some((o) => o.id === trap.id)).toBe(trap.revealed);
    }
  });
});
