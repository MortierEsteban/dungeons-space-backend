import { critDice, rollD20, rollDice } from '../dice';
import type { Rng } from '../rng';
import { sameDamage } from '../dnd5e/effects';
import type { CombatCommand, CombatantSpec, ResolvedSpell } from './commands';
import type { CombatEvent } from './events';
import { footprint, inBounds, isWall, movementCost } from './grid';
import { applyCombatEvent, hpBand, initiativeOrder } from './reducer';
import { cellKey, type Cell, type Combatant, type CombatSettings, type CombatState } from './types';

export interface CombatActor {
  userId: string;
  role: 'gm' | 'player';
}

export interface DecideContext {
  rng: Rng;
  newId: () => string;
}

export class CombatRuleError extends Error {
  constructor(
    message: string,
    readonly code: 'forbidden' | 'invalid' | 'not_found' = 'invalid',
  ) {
    super(message);
  }
}

export const DEFAULT_COMBAT_SETTINGS: CombatSettings = { diagonalRule: 'simple', hideMonsterStats: true };

export function createCombatEvent(id: string, name: string, cols = 24, rows = 15, settings: Partial<CombatSettings> = {}): CombatEvent {
  return { type: 'combat.created', payload: { id, name, cols, rows, settings: { ...DEFAULT_COMBAT_SETTINGS, ...settings } } };
}

/** Abréviation de jeton : « Gobelin 2 » → « G2 », « Sœur Ilda » → « SI », « Elowen » → « EL ». */
export function tokenLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  if (words.length > 1 && /^\d+$/.test(last)) return `${words[0]![0]!.toUpperCase()}${last}`.slice(0, 3);
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return name.slice(0, 2).toUpperCase();
}

function getCombatant(state: CombatState, id: string): Combatant {
  const c = state.combatants[id];
  if (!c) throw new CombatRuleError('Créature introuvable dans ce combat.', 'not_found');
  return c;
}

function canControl(actor: CombatActor, c: Combatant): boolean {
  return actor.role === 'gm' || (c.ownerUserId !== null && c.ownerUserId === actor.userId);
}

function assertGm(actor: CombatActor): void {
  if (actor.role !== 'gm') throw new CombatRuleError('Seul le Maître du Jeu peut faire cela.', 'forbidden');
}

function assertControl(actor: CombatActor, c: Combatant): void {
  if (!canControl(actor, c)) throw new CombatRuleError(`Vous ne contrôlez pas ${c.name}.`, 'forbidden');
}

/** Première case libre : alliés à gauche de la carte, ennemis à droite. */
export function findFreeCell(state: CombatState, side: Combatant['side'], size = 1): Cell | null {
  const occupied = new Set<string>();
  for (const c of Object.values(state.combatants)) if (c.position) footprint(c.position, c.size).forEach((f) => occupied.add(cellKey(f)));
  const { cols, rows } = state.map;
  const xs = Array.from({ length: cols }, (_, i) => (side === 'enemy' ? cols - 1 - i : i));
  for (const x of xs) {
    for (let k = 0; k < rows; k++) {
      const y = Math.floor(rows / 2) + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
      const pos = { x, y };
      if (!inBounds(state, pos, size)) continue;
      const cells = footprint(pos, size);
      if (cells.some((c) => occupied.has(cellKey(c)) || isWall(state, c))) continue;
      return pos;
    }
  }
  return null;
}

export function buildCombatant(state: CombatState, spec: CombatantSpec, id: string): Combatant {
  const position = spec.position ?? findFreeCell(state, spec.side, spec.size);
  return {
    id,
    name: spec.name,
    short: spec.short || tokenLabel(spec.name),
    kind: spec.kind,
    side: spec.side,
    characterId: spec.characterId,
    monsterId: spec.monsterId,
    ownerUserId: spec.ownerUserId,
    hp: Math.min(spec.hp, spec.maxHp),
    maxHp: spec.maxHp,
    tempHp: 0,
    ac: spec.ac,
    hpBand: hpBand(spec.hp, spec.maxHp),
    initiative: null,
    initiativeMod: spec.initiativeMod,
    speed: spec.speed,
    size: spec.size,
    position,
    conditions: [],
    hidden: spec.hidden ?? (spec.kind !== 'pc' && state.settings.hideMonsterStats),
    attack: spec.attack,
    resources: { action: false, bonus: false, reaction: false, movementUsed: 0 },
    portraitUrl: spec.portraitUrl,
    modelUrl: spec.modelUrl,
    ...(spec.saves ? { saves: spec.saves } : {}),
    ...(spec.defenses ? { defenses: spec.defenses } : {}),
  };
}

function nextActive(state: CombatState): { round: number; combatantId: string } | null {
  const order = initiativeOrder(state).filter((c) => !(c.kind !== 'pc' && c.hp !== null && c.hp <= 0));
  if (order.length === 0) return null;
  const idx = state.activeId ? order.findIndex((c) => c.id === state.activeId) : -1;
  if (idx === -1) {
    // Le combattant actif a été retiré ou vaincu : on reprend au suivant dans l'ordre global.
    const all = initiativeOrder(state);
    const prevIdx = all.findIndex((c) => c.id === state.activeId);
    const following = prevIdx >= 0 ? all.slice(prevIdx + 1).find((c) => order.includes(c)) : undefined;
    return { round: following ? state.round : Math.max(1, state.round) + (state.activeId ? 1 : 0), combatantId: (following ?? order[0]!).id };
  }
  const wrap = idx + 1 >= order.length;
  return { round: wrap ? state.round + 1 : state.round, combatantId: order[wrap ? 0 : idx + 1]!.id };
}

/** Défense de la créature contre ce type de dégâts (les défenses « sous Rage » exigent l'état du même nom). */
export function damageDefense(c: Combatant, damageType: string | undefined): 'résistance' | 'immunité' | 'vulnérabilité' | null {
  if (!damageType || !c.defenses) return null;
  const active = (d: { damage: string; when?: string }) => sameDamage(d.damage, damageType) && (!d.when || c.conditions.some((x) => x.name.toLowerCase() === d.when!.toLowerCase()));
  if (c.defenses.immunities.some(active)) return 'immunité';
  const resist = c.defenses.resistances.some(active);
  const vuln = c.defenses.vulnerabilities.some(active);
  if (resist && !vuln) return 'résistance';
  if (vuln && !resist) return 'vulnérabilité';
  return null;
}

function hpChange(c: Combatant, mode: 'damage' | 'heal' | 'temp', rawAmount: number, extra: { damageType?: string; source?: string } = {}): CombatEvent {
  const defense = mode === 'damage' ? damageDefense(c, extra.damageType) : null;
  const amount = defense === 'immunité' ? 0 : defense === 'résistance' ? Math.floor(rawAmount / 2) : defense === 'vulnérabilité' ? rawAmount * 2 : rawAmount;
  const hp = c.hp ?? 0;
  const max = c.maxHp ?? 1;
  let hpAfter = hp;
  let tempAfter = c.tempHp;
  if (mode === 'damage') {
    const absorbed = Math.min(c.tempHp, amount);
    tempAfter = c.tempHp - absorbed;
    hpAfter = Math.max(0, hp - (amount - absorbed));
  } else if (mode === 'heal') {
    hpAfter = Math.min(max, hp + amount);
  } else {
    tempAfter = Math.max(c.tempHp, amount);
  }
  const concentrating = mode === 'damage' && amount > 0 && c.conditions.some((x) => x.name === 'Concentration');
  return {
    type: 'combat.hp_changed',
    payload: {
      id: c.id,
      mode,
      amount,
      hpBefore: hp,
      hpAfter,
      tempAfter,
      bandAfter: hpBand(hpAfter, max),
      ...(extra.damageType ? { damageType: extra.damageType } : {}),
      ...(extra.source ? { source: extra.source } : {}),
      ...(concentrating ? { concentrationDc: Math.max(10, Math.floor(amount / 2)) } : {}),
      ...(defense ? { defense, rawAmount } : {}),
    },
  };
}

/**
 * Résolution d'un sort : un seul jet de dégâts pour une zone (règle 5e), une attaque par rayon,
 * un jet de sauvegarde par cible (moitié des dégâts ou rien sur une réussite), état infligé ou accordé.
 */
function resolveSpell(state: CombatState, cmd: ResolvedSpell, actor: CombatActor, ctx: DecideContext): CombatEvent[] {
  const caster = getCombatant(state, cmd.casterId);
  assertControl(actor, caster);
  const events: CombatEvent[] = [];
  let working = state;
  const emit = (e: CombatEvent) => {
    events.push(e);
    working = applyCombatEvent(working, e);
  };
  const targets = cmd.targetIds.filter((id) => state.combatants[id]);
  const shared = cmd.damage && !cmd.attack ? Math.max(0, rollDice(cmd.damage.notation, ctx.rng).total) : undefined;
  const healed = cmd.heal ? Math.max(0, rollDice(cmd.heal.notation, ctx.rng).total) : undefined;
  emit({
    type: 'combat.spell_cast',
    payload: {
      casterId: caster.id, name: cmd.name, level: cmd.level, targetIds: targets,
      ...(cmd.zone ? { zone: cmd.zone } : {}), ...(shared !== undefined ? { damage: shared } : {}), ...(healed !== undefined ? { heal: healed } : {}),
    },
  });
  if (cmd.zone && cmd.keepZone) emit({ type: 'combat.zone_added', payload: { zone: { ...cmd.zone, id: ctx.newId() } } });
  for (const id of targets) {
    const target = working.combatants[id]!;
    if (cmd.attack) {
      const roll = rollD20(cmd.attack.bonus, ctx.rng);
      const natural = roll.natural ?? roll.total - cmd.attack.bonus;
      const crit = natural === 20;
      const hit = natural !== 1 && (crit || target.ac === null || roll.total >= target.ac);
      emit({ type: 'combat.attack_rolled', payload: { attackerId: caster.id, targetId: id, label: cmd.name, natural, bonus: cmd.attack.bonus, total: roll.total, targetAc: target.ac, hit, crit } });
      if (hit && cmd.damage) {
        const dmg = rollDice(crit ? critDice(cmd.damage.notation) : cmd.damage.notation, ctx.rng).total;
        emit(hpChange(working.combatants[id]!, 'damage', Math.max(0, dmg), { damageType: cmd.damage.type, source: caster.name }));
      }
      if (hit && cmd.condition && !cmd.damage) emit({ type: 'combat.condition_applied', payload: { id, name: cmd.condition, rounds: null } });
      continue;
    }
    if (cmd.save) {
      const mod = target.saves?.[cmd.save.ability] ?? 0;
      const roll = rollD20(mod, ctx.rng);
      const natural = roll.natural ?? roll.total - mod;
      const success = roll.total >= cmd.save.dc;
      emit({ type: 'combat.save_rolled', payload: { id, label: cmd.name, ability: cmd.save.ability, natural, total: roll.total, dc: cmd.save.dc, success } });
      if (shared !== undefined) {
        const amount = success ? (cmd.save.half ? Math.floor(shared / 2) : 0) : shared;
        if (amount > 0) emit(hpChange(working.combatants[id]!, 'damage', amount, { damageType: cmd.damage?.type, source: caster.name }));
      }
      if (!success && cmd.condition) emit({ type: 'combat.condition_applied', payload: { id, name: cmd.condition, rounds: null } });
      continue;
    }
    if (healed !== undefined) emit(hpChange(target, 'heal', healed));
    else if (shared !== undefined) emit(hpChange(target, 'damage', shared, { damageType: cmd.damage?.type, source: caster.name }));
    else if (cmd.condition) emit({ type: 'combat.condition_applied', payload: { id, name: cmd.condition, rounds: null } });
  }
  if (cmd.concentration) emit({ type: 'combat.condition_applied', payload: { id: caster.id, name: 'Concentration', rounds: null } });
  const self = working.combatants[caster.id]!;
  if (cmd.cost !== 'none' && state.status === 'active' && state.activeId === caster.id && !self.resources[cmd.cost]) {
    emit({ type: 'combat.resource_used', payload: { id: caster.id, resource: cmd.cost } });
  }
  return events;
}

type ResolvedCommand = Exclude<CombatCommand, { type: 'add_character' } | { type: 'add_monster' } | { type: 'cast_spell' }> | ResolvedSpell;

/**
 * Décision : (état, commande, acteur) → événements. Le serveur est autoritaire :
 * il vérifie les permissions, lance les dés, et n'applique que les événements produits ici.
 * Philosophie « assister sans bloquer » : seules les contraintes physiques ou de rôle sont refusées.
 */
export function decideCombat(state: CombatState, cmd: ResolvedCommand, actor: CombatActor, ctx: DecideContext): CombatEvent[] {
  if (state.status === 'ended' && cmd.type !== 'roll') throw new CombatRuleError('Ce combat est terminé.');

  switch (cmd.type) {
    case 'add_combatant': {
      assertGm(actor);
      return [{ type: 'combat.combatant_added', payload: { combatant: buildCombatant(state, cmd.spec, ctx.newId()) } }];
    }
    case 'update_combatant': {
      assertGm(actor);
      const c = getCombatant(state, cmd.combatantId);
      const patch: Extract<CombatEvent, { type: 'combat.combatant_updated' }>['payload']['patch'] = { ...cmd.patch };
      if (cmd.patch.name) patch.short = tokenLabel(cmd.patch.name);
      if (cmd.patch.maxHp !== undefined) {
        patch.hp = Math.min(c.hp ?? cmd.patch.maxHp, cmd.patch.maxHp);
        patch.hpBand = hpBand(patch.hp, cmd.patch.maxHp);
      }
      return [{ type: 'combat.combatant_updated', payload: { id: c.id, patch } }];
    }
    case 'remove_combatant': {
      assertGm(actor);
      getCombatant(state, cmd.combatantId);
      return [{ type: 'combat.combatant_removed', payload: { id: cmd.combatantId } }];
    }
    case 'set_model': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      return [{ type: 'combat.combatant_updated', payload: { id: c.id, patch: { modelUrl: cmd.modelUrl } } }];
    }
    case 'set_portrait': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      return [{ type: 'combat.combatant_updated', payload: { id: c.id, patch: { portraitUrl: cmd.portraitUrl } } }];
    }
    case 'resolve_spell':
      return resolveSpell(state, cmd, actor, ctx);
    case 'set_initiative': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      return [{ type: 'combat.initiative_set', payload: { id: c.id, value: cmd.value, natural: null } }];
    }
    case 'roll_initiative': {
      const ids = cmd.combatantIds ?? Object.keys(state.combatants);
      const targets = ids.map((id) => getCombatant(state, id));
      targets.forEach((c) => assertControl(actor, c));
      return targets.map((c) => {
        const roll = rollD20(c.initiativeMod, ctx.rng);
        return { type: 'combat.initiative_set', payload: { id: c.id, value: roll.total, natural: roll.natural ?? null } };
      });
    }
    case 'start': {
      assertGm(actor);
      if (state.status === 'active') throw new CombatRuleError('Le combat a déjà commencé.');
      const events: CombatEvent[] = [];
      let working = state;
      // Initiative manquante : on la lance automatiquement (CMB-30).
      for (const c of Object.values(state.combatants)) {
        if (c.initiative === null) {
          const roll = rollD20(c.initiativeMod, ctx.rng);
          const e: CombatEvent = { type: 'combat.initiative_set', payload: { id: c.id, value: roll.total, natural: roll.natural ?? null } };
          events.push(e);
          working = { ...working, combatants: { ...working.combatants, [c.id]: { ...c, initiative: roll.total } } };
        }
      }
      const first = initiativeOrder(working)[0];
      if (!first) throw new CombatRuleError('Ajoutez au moins une créature avant de commencer.');
      events.push({ type: 'combat.started', payload: {} });
      events.push({ type: 'combat.turn_started', payload: { round: 1, combatantId: first.id } });
      return events;
    }
    case 'next_turn': {
      if (state.status !== 'active') throw new CombatRuleError("Le combat n'a pas commencé.");
      const active = state.activeId ? state.combatants[state.activeId] : undefined;
      if (actor.role !== 'gm' && !(active && canControl(actor, active))) {
        throw new CombatRuleError("Ce n'est pas votre tour.", 'forbidden');
      }
      const next = nextActive(state);
      if (!next) throw new CombatRuleError('Plus aucune créature en lice.');
      return [{ type: 'combat.turn_started', payload: next }];
    }
    case 'end': {
      assertGm(actor);
      return [{ type: 'combat.ended', payload: { summary: cmd.summary } }];
    }
    case 'move': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      if (!inBounds(state, cmd.to, c.size)) throw new CombatRuleError('Case hors de la carte.');
      if (footprint(cmd.to, c.size).some((cell) => isWall(state, cell))) throw new CombatRuleError('Un mur bloque cette case.');
      const occupied = Object.values(state.combatants).some(
        (o) => o.id !== c.id && o.position && footprint(o.position, o.size).some((f) => footprint(cmd.to, c.size).some((t) => t.x === f.x && t.y === f.y)),
      );
      if (occupied) throw new CombatRuleError('Cette case est déjà occupée.');
      const cost = movementCost(state, c.id, cmd.to);
      // Hors de portée « réglementaire » (ex. bloqué par des ennemis) : on accepte, coût à vol d'oiseau.
      const fallback = c.position ? Math.max(Math.abs(c.position.x - cmd.to.x), Math.abs(c.position.y - cmd.to.y)) * state.map.cellMeters : 0;
      return [{ type: 'combat.token_moved', payload: { id: c.id, from: c.position, to: cmd.to, cost: cost ?? fallback } }];
    }
    case 'change_hp': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      return [hpChange(c, cmd.mode, cmd.amount, { damageType: cmd.damageType })];
    }
    case 'toggle_condition': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      const has = c.conditions.some((x) => x.name === cmd.name);
      return [
        has
          ? { type: 'combat.condition_removed', payload: { id: c.id, name: cmd.name } }
          : { type: 'combat.condition_applied', payload: { id: c.id, name: cmd.name, rounds: cmd.rounds } },
      ];
    }
    case 'attack': {
      const attacker = getCombatant(state, cmd.attackerId);
      const target = getCombatant(state, cmd.targetId);
      assertControl(actor, attacker);
      const attack = cmd.attack ?? attacker.attack;
      if (!attack) throw new CombatRuleError(`${attacker.name} n'a pas d'attaque définie.`);
      const roll = rollD20(attack.bonus, ctx.rng, cmd.advantage);
      const natural = roll.natural ?? roll.total - attack.bonus;
      const crit = natural === 20;
      const hit = natural !== 1 && (crit || target.ac === null || roll.total >= target.ac);
      const events: CombatEvent[] = [
        {
          type: 'combat.attack_rolled',
          payload: { attackerId: attacker.id, targetId: target.id, label: attack.name, natural, bonus: attack.bonus, total: roll.total, targetAc: target.ac, hit, crit },
        },
      ];
      if (hit) {
        const dmg = rollDice(crit ? critDice(attack.damage) : attack.damage, ctx.rng);
        events.push(hpChange(target, 'damage', Math.max(0, dmg.total), { damageType: attack.damageType, source: attacker.name }));
      }
      if (state.status === 'active' && state.activeId === attacker.id && !attacker.resources.action) {
        events.push({ type: 'combat.resource_used', payload: { id: attacker.id, resource: 'action' } });
      }
      return events;
    }
    case 'use_resource': {
      const c = getCombatant(state, cmd.combatantId);
      assertControl(actor, c);
      return [{ type: 'combat.resource_used', payload: { id: c.id, resource: cmd.resource } }];
    }
    case 'roll': {
      const roll = rollDice(cmd.notation, ctx.rng);
      return [
        {
          type: 'combat.dice_rolled',
          payload: {
            label: cmd.label,
            notation: roll.notation,
            rolls: roll.terms.flatMap((t) => t.kept),
            total: roll.total,
            byUserId: actor.userId,
            secret: actor.role === 'gm' && cmd.secret,
          },
        },
      ];
    }
    case 'resize_map':
      assertGm(actor);
      return [{ type: 'combat.map_resized', payload: { cols: cmd.cols, rows: cmd.rows } }];
    case 'set_background':
      assertGm(actor);
      return [{ type: 'combat.background_set', payload: { url: cmd.url } }];
    case 'paint_terrain':
      assertGm(actor);
      return [{ type: 'combat.terrain_painted', payload: { cells: cmd.cells.filter((c) => inBounds(state, c)), terrain: cmd.terrain } }];
    case 'add_zone': {
      // Les gabarits de sorts peuvent être posés par tous (CMB-22).
      const { type: _t, ...zone } = cmd;
      return [{ type: 'combat.zone_added', payload: { zone: { ...zone, id: ctx.newId() } } }];
    }
    case 'remove_zone':
      return [{ type: 'combat.zone_removed', payload: { id: cmd.zoneId } }];
    case 'add_object':
      assertGm(actor);
      return [
        {
          type: 'combat.object_added',
          payload: {
            object: {
              id: ctx.newId(),
              kind: cmd.kind,
              position: cmd.position,
              label: cmd.label ?? '',
              open: false,
              secret: cmd.secret ?? cmd.kind === 'trap',
              revealed: false,
            },
          },
        },
      ];
    case 'update_object': {
      const obj = state.map.objects.find((o) => o.id === cmd.objectId);
      if (!obj) throw new CombatRuleError('Objet introuvable.', 'not_found');
      // Les joueurs peuvent ouvrir/fermer portes et coffres ; le reste est réservé au MJ.
      const onlyOpen = Object.keys(cmd.patch).every((k) => k === 'open');
      if (!(onlyOpen && (obj.kind === 'door' || obj.kind === 'chest'))) assertGm(actor);
      return [{ type: 'combat.object_updated', payload: { id: obj.id, patch: cmd.patch } }];
    }
    case 'remove_object':
      assertGm(actor);
      return [{ type: 'combat.object_removed', payload: { id: cmd.objectId } }];
    case 'set_fog': {
      assertGm(actor);
      const { type: _t, ...patch } = cmd;
      if (Object.keys(patch).length === 0) throw new CombatRuleError('Aucun réglage du brouillard à modifier.');
      return [{ type: 'combat.fog_updated', payload: { patch } }];
    }
    case 'share_vision':
      assertGm(actor);
      getCombatant(state, cmd.combatantId);
      return [{ type: 'combat.vision_shared', payload: { combatantId: cmd.combatantId, userIds: [...new Set(cmd.userIds)] } }];
    case 'reveal_cells':
      assertGm(actor);
      return [{ type: 'combat.cells_revealed', payload: { cells: cmd.cells.filter((c) => inBounds(state, c)), revealed: cmd.revealed } }];
    case 'reset_fog_memory':
      assertGm(actor);
      return [{ type: 'combat.fog_memory_reset', payload: {} }];
  }
}
