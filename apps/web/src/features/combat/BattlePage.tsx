import { aimDistance, spellTargets, spellZone, type Cell, type QuickAttack, type Zone } from '@ds/rules';
import type { CombatEventEnvelope } from '@ds/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { num } from '../../shared/format';
import { useLocalPref, useMediaQuery } from '../../shared/hooks';
import { useDice } from '../../shared/dice/DiceProvider';
import { Button, Chip, cx, Empty, Loading, Panel, Segmented, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useCombat, type CommandInput } from './api';
import { Board, type BoardProps, type FloatText, type SpellAim, type SpellFlash, type Tool, type ToolOptions } from './Board';
import { CombatSheet, type CastRequest } from './CombatSheet';
import { Replay } from './Replay';
import { FX_DURATION, hasWebGL, withCharacterModels, type AttackFx } from './scene/support';
import { ActionBar, CombatLog, FogPanel, GmSetup, InitiativeBar, Inspector, Toolbar, ToolOptionsPanel, TrackerList, type Player } from './panels';
import { useFog } from './useFog';
import s from './combat.module.css';

const Board3D = lazy(() => import('./scene/Board3D'));
const WEBGL = typeof document !== 'undefined' && hasWebGL();

type RailTab = 'fiche' | 'creature' | 'journal' | 'mj';

/** Sort en cours de lancement : visée d'un gabarit ou choix des cibles, puis confirmation. */
interface Casting extends CastRequest {
  aim: Cell | null;
  targets: string[];
  keepZone: boolean;
}

/** Attaque en attente de cible : l'attaque rapide du pion, ou une arme choisie dans la fiche. */
interface PendingAttack {
  attackerId: string;
  attack?: QuickAttack;
}

export default function BattlePage() {
  const { encounterId = '' } = useParams();
  const { data: me } = useMe();
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const dice = useDice();
  const toast = useToast();
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 767px)');
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [effects, setEffects] = useState<AttackFx[]>([]);
  const [flashes, setFlashes] = useState<SpellFlash[]>([]);
  const [dim, setDim] = useLocalPref<'2d' | '3d'>('battleDim', WEBGL ? '3d' : '2d');
  const three = WEBGL && dim === '3d';

  // Chiffres flottants sur les pions, jets d'attaque et éclats des sorts de zone.
  const onEvents = useCallback(
    (events: CombatEventEnvelope[]) => {
      for (const { event: e } of events) {
        if (e.type === 'combat.hp_changed') {
          const f: FloatText = {
            id: Date.now() + Math.random(),
            combatantId: e.payload.id,
            text: e.payload.amount === null ? e.payload.bandAfter : `${e.payload.mode === 'damage' ? '−' : '+'}${e.payload.amount}${e.payload.defense ? ` (${e.payload.defense})` : ''}`,
            color: e.payload.mode === 'damage' ? '#f2b3cf' : '#7cc6ff',
          };
          // En 3D, le chiffre attend que le projectile ait touché.
          const delay = three && events.some((x) => x.event.type === 'combat.attack_rolled' || x.event.type === 'combat.spell_cast') ? 420 : 0;
          setTimeout(() => setFloats((xs) => [...xs, f]), delay);
          setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== f.id)), 1400 + delay);
        }
        if (e.type === 'combat.save_rolled') {
          const f: FloatText = { id: Date.now() + Math.random(), combatantId: e.payload.id, text: e.payload.success ? `JS ${e.payload.total} ✓` : `JS ${e.payload.total} ✗`, color: e.payload.success ? '#e8d3a0' : '#f2b3cf' };
          setFloats((xs) => [...xs, f]);
          setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== f.id)), 1300);
        }
        if (e.type === 'combat.spell_cast' && e.payload.zone) {
          const flash: SpellFlash = { id: Date.now() + Math.random(), zone: e.payload.zone };
          setFlashes((xs) => [...xs, flash]);
          setTimeout(() => setFlashes((xs) => xs.filter((x) => x.id !== flash.id)), 1100);
        }
        if (e.type === 'combat.spell_cast' && e.payload.damage !== undefined) dice.show(e.payload.name, 'dégâts', e.payload.damage, null);
        if (e.type === 'combat.attack_rolled') {
          // Projectile et impact sur le plateau 3D ; « Raté » flotte au-dessus de la cible.
          const fx: AttackFx = { id: Date.now() + Math.random(), attackerId: e.payload.attackerId, targetId: e.payload.targetId, hit: e.payload.hit, crit: e.payload.crit };
          setEffects((xs) => [...xs, fx]);
          setTimeout(() => setEffects((xs) => xs.filter((x) => x.id !== fx.id)), FX_DURATION + 100);
          if (!e.payload.hit) {
            const miss: FloatText = { id: fx.id + 0.5, combatantId: e.payload.targetId, text: 'Raté', color: '#bfe4ff' };
            setTimeout(() => setFloats((xs) => [...xs, miss]), 380);
            setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== miss.id)), 1800);
          }
          dice.show(e.payload.label, `1d20${e.payload.bonus >= 0 ? '+' : ''}${e.payload.bonus}`, e.payload.total, e.payload.natural);
        }
      }
    },
    [dice, three],
  );
  const { state: rawState, log, history, error, send: rawSend } = useCombat(encounterId, onEvents);
  // Les modèles 3D et portraits des PJ viennent de leur fiche, tenue à jour en temps réel.
  const characterModels = useMemo(() => new Map(characters.map((c) => [c.id, c.modelUrl])), [characters]);
  const characterPortraits = useMemo(() => new Map(characters.map((c) => [c.id, c.portraitUrl])), [characters]);
  const state = useMemo(() => rawState && withCharacterModels(rawState, characterModels, characterPortraits), [rawState, characterModels, characterPortraits]);
  const send = (cmd: CommandInput) => void rawSend(cmd);
  // Brouillard de guerre : un joueur voit par ses propres yeux ; le MJ voit tout, sauf en « Voir comme ».
  const [viewAs, setViewAs] = useState<string | null>(null);
  const fog = useFog(state, history, isGm ? viewAs : (me?.id ?? null));
  const players = useMemo<Player[]>(() => {
    const byId = new Map<string, string>();
    for (const c of characters) if (c.kind === 'pc' && c.ownerId) byId.set(c.ownerId, c.ownerName ?? c.name);
    return [...byId].map(([id, name]) => ({ id, name }));
  }, [characters]);

  const [view, setView] = useState<'board' | 'tracker' | 'replay'>(narrow ? 'tracker' : 'board');
  const [tool, setTool] = useState<Tool>('select');
  const [options, setOptions] = useState<ToolOptions>({ brush: 'wall', zone: { shape: 'circle', size: 2, direction: 0, color: '#e07aa8', label: '' }, objectKind: 'chest', fogBrush: 'reveal' });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<PendingAttack | null>(null);
  const [casting, setCasting] = useState<Casting | null>(null);
  const [rail, setRail] = useLocalPref<RailTab>('battleRail', 'fiche');

  // Échap annule la visée ou l'attaque en cours.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setCasting(null);
      setAttacker(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (error && !state) {
    return (
      <div className="ds-page">
        <Panel>
          <Empty title="Ce champ de bataille est introuvable." action={<Button onClick={() => navigate('/combat')}>Retour</Button>}>
            {error}
          </Empty>
        </Panel>
      </div>
    );
  }
  if (!state || !me) return <Loading />;

  const userId = me.id;
  const active = state.activeId ? state.combatants[state.activeId] : undefined;
  const mine = Object.values(state.combatants).find((c) => c.ownerUserId === userId);
  const actor = isGm ? active : mine;
  const party = characters.filter((c) => c.kind === 'pc');
  // Fiche affichée : le PJ sélectionné (s'il est à moi, ou si je suis MJ), sinon mon PJ, sinon le PJ actif pour le MJ.
  const selectedC = selected ? state.combatants[selected] : undefined;
  const sheetOf =
    (selectedC?.characterId && (isGm || selectedC.ownerUserId === userId) ? selectedC : undefined) ??
    mine ??
    (isGm && active?.characterId ? active : undefined) ??
    (isGm ? Object.values(state.combatants).find((c) => c.characterId) : undefined);

  const onTarget = (targetId: string) => {
    if (casting) {
      const max = casting.mech.targets;
      // Un rayon par clic (la même cible peut en recevoir plusieurs) ; sinon le clic bascule la cible.
      const targets = casting.mech.attack
        ? [...casting.targets, targetId].slice(-max)
        : casting.targets.includes(targetId)
          ? casting.targets.filter((t) => t !== targetId)
          : [...casting.targets, targetId].slice(-max);
      if (max === 1) return cast({ ...casting, targets });
      setCasting({ ...casting, targets });
      return;
    }
    if (!attacker) return;
    send({ type: 'attack', attackerId: attacker.attackerId, targetId, advantage: 'normal', ...(attacker.attack ? { attack: attacker.attack } : {}) });
    setAttacker(null);
  };

  const cast = (c: Casting) => {
    send({ type: 'cast_spell', casterId: c.casterId, spellId: c.spell.id, slotLevel: c.slotLevel, targetIds: c.targets, ...(c.aim ? { aim: c.aim } : {}), keepZone: c.keepZone });
    setCasting(null);
  };

  const startCast = (req: CastRequest) => {
    setAttacker(null);
    setTool('select');
    if (view !== 'board') setView('board');
    const caster = state.combatants[req.casterId];
    const m = req.mech;
    const lasting = !!req.spell.duration && !/instantan/i.test(req.spell.duration);
    const c: Casting = { ...req, aim: null, targets: [], keepZone: lasting };
    // Sort personnel sans visée (sphère centrée sur le lanceur) : le gabarit est posé d'office.
    if (m.area && m.selfOrigin && m.area.shape !== 'cone' && m.area.shape !== 'line' && m.area.shape !== 'cube' && caster?.position) return setCasting({ ...c, aim: caster.position });
    // Sort sans cible ni gabarit (bouclier, armure de mage…) : lancé aussitôt, sur soi.
    if (!m.area && !m.attack && !m.save && !m.roll && !m.condition) return cast({ ...c, targets: [req.casterId] });
    setCasting(c);
  };

  const caster = casting ? state.combatants[casting.casterId] : undefined;
  const castZone: Omit<Zone, 'id'> | null = casting?.aim ? spellZone(casting.mech, caster?.position ?? null, casting.aim, state.map.cellMeters) : null;
  const zoneTargets = castZone && casting ? spellTargets(state, castZone, casting.casterId, casting.mech.selfOrigin) : [];
  const aim: SpellAim | null =
    casting?.mech.area
      ? {
          zoneAt: (cell) => spellZone(casting.mech, caster?.position ?? null, cell, state.map.cellMeters),
          pinned: castZone,
          onAim: (cell) => setCasting((cur) => (cur ? { ...cur, aim: cell, targets: [] } : cur)),
        }
      : null;
  const outOfRange = !!(casting?.aim && caster?.position && casting.mech.rangeMeters && !casting.mech.selfOrigin && aimDistance(state, caster.position, casting.aim) > casting.mech.rangeMeters);
  const effectiveTargets = castZone ? (casting!.targets.length ? zoneTargets.filter((t) => casting!.targets.includes(t)) : zoneTargets) : (casting?.targets ?? []);

  // Ce que l'utilisateur a le droit de voir : plateau, initiative, suivi, inspecteur et journal.
  const shown = fog?.view ?? state;
  const boardProps: BoardProps = {
    state: shown,
    isGm,
    userId,
    tool,
    options,
    selectedId: selected,
    selectedObjectId: selectedObject,
    onSelect: (id) => {
      setSelected(id);
      if (id) setRail(state.combatants[id]?.characterId && (isGm || state.combatants[id]?.ownerUserId === userId) ? 'fiche' : 'creature');
    },
    onSelectObject: (id) => {
      setSelectedObject(id);
      if (id) setRail('creature');
    },
    targeting: !!attacker || (!!casting && !casting.mech.area),
    onTarget,
    floats,
    fog: fog?.cells ?? null,
    send,
    aim,
    markedIds: casting ? effectiveTargets : [],
    flashes,
  };

  const sheetPanel = sheetOf ? (
    <CombatSheet
      key={sheetOf.id}
      combatant={sheetOf}
      onCast={startCast}
      onWeapon={(attackerId, w) => {
        setCasting(null);
        setAttacker({ attackerId, attack: { name: w.name, bonus: w.bonus, damage: w.damage, damageType: w.damageType } });
        if (view !== 'board') setView('board');
      }}
      onHeal={(combatantId, amount) => send({ type: 'change_hp', combatantId, amount, mode: 'heal' })}
    />
  ) : (
    <span className="ds-help">Aucun personnage à afficher : sélectionnez un PJ sur le plateau.</span>
  );

  return (
    <div className={cx(s.battle, view === 'board' && s.battleFit)}>
      <div className={s.battleHead}>
        <Button variant="link" size="sm" onClick={() => navigate('/combat')}>
          ← Rencontres
        </Button>
        <h1 className="ds-h3 ds-grow">{state.name}</h1>
        <Segmented
          label="Affichage"
          value={view}
          options={[
            { value: 'board', label: 'Carte' },
            { value: 'tracker', label: 'Tracker' },
            { value: 'replay', label: 'Replay' },
          ]}
          onChange={setView}
        />
        {view !== 'tracker' && WEBGL && (
          <Segmented
            label="Rendu du plateau"
            value={dim}
            options={[
              { value: '2d', label: '2D' },
              { value: '3d', label: '3D' },
            ]}
            onChange={setDim}
          />
        )}
      </div>
      {view === 'replay' ? (
        <Replay encounterId={encounterId} isGm={isGm} userId={userId} three={three} characterModels={characterModels} fogViewer={isGm ? viewAs : userId} />
      ) : (
        <>
          <InitiativeBar state={shown} isGm={isGm} canEndTurn={!!active && active.ownerUserId === userId} onSelect={boardProps.onSelect} send={send} webgl={WEBGL} />
          {error && <div className={s.errorBanner}>{error}</div>}
          {attacker && (
            <div className={s.targetBanner}>
              Choisissez une cible pour {state.combatants[attacker.attackerId]?.name}
              {attacker.attack ? ` (${attacker.attack.name})` : ''}.{' '}
              <Button variant="link" size="sm" onClick={() => setAttacker(null)}>
                Annuler
              </Button>
            </div>
          )}
          {casting && (
            <div className={cx(s.targetBanner, s.castBanner)}>
              <span>
                <strong>{casting.spell.name}</strong>
                {casting.slotLevel > casting.spell.level ? ` (niveau ${casting.slotLevel})` : ''} —{' '}
                {casting.mech.area
                  ? casting.aim
                    ? `${effectiveTargets.length} créature${effectiveTargets.length > 1 ? 's' : ''} dans la zone${outOfRange ? ' · hors de portée' : ''}`
                    : casting.mech.selfOrigin
                      ? 'orientez le gabarit, puis cliquez.'
                      : `visez le centre de la zone${casting.mech.rangeMeters ? ` (portée ${num(casting.mech.rangeMeters)} m)` : ''}.`
                  : casting.mech.targets > 1
                    ? `choisissez jusqu’à ${casting.mech.targets} cible${casting.mech.attack ? 's (un rayon par clic)' : 's'} : ${casting.targets.length} / ${casting.mech.targets}`
                    : 'choisissez la cible.'}
              </span>
              {castZone && zoneTargets.length > 0 && (
                <span className={s.castTargets}>
                  {zoneTargets.map((id) => {
                    const on = !casting.targets.length || casting.targets.includes(id);
                    return (
                      <Chip
                        key={id}
                        square
                        active={on}
                        onClick={() => {
                          const base = casting.targets.length ? casting.targets : zoneTargets;
                          setCasting({ ...casting, targets: on ? base.filter((t) => t !== id) : [...base, id] });
                        }}
                        title={on ? 'Épargner cette créature' : 'Inclure cette créature'}
                      >
                        {state.combatants[id]?.name}
                      </Chip>
                    );
                  })}
                </span>
              )}
              {casting.mech.area && (
                <Toggle checked={casting.keepZone} onChange={(v) => setCasting({ ...casting, keepZone: v })}>
                  Laisser la zone
                </Toggle>
              )}
              <span className="ds-grow" />
              {((casting.mech.area && casting.aim) || (!casting.mech.area && casting.targets.length > 0)) && (
                <Button size="sm" variant="primary" onClick={() => cast({ ...casting, targets: castZone ? effectiveTargets : casting.targets })} disabled={!!castZone && effectiveTargets.length === 0 && !casting.keepZone}>
                  Lancer
                </Button>
              )}
              <Button variant="link" size="sm" onClick={() => setCasting(null)}>
                Annuler (Échap)
              </Button>
            </div>
          )}
          {view === 'tracker' ? (
            <Panel>
              <TrackerList state={shown} isGm={isGm} userId={userId} send={send} onAttack={(id) => (setAttacker({ attackerId: id }), setView('board'))} />
              {sheetOf && <div style={{ marginTop: 16 }}>{sheetPanel}</div>}
            </Panel>
          ) : (
            <div className={s.battleBody}>
              <div className={s.leftRail}>
                <Toolbar tool={tool} setTool={setTool} isGm={isGm} />
                <ToolOptionsPanel tool={tool} options={options} setOptions={setOptions} state={state} send={send} />
                {isGm && tool === 'fog' && <FogPanel state={state} options={options} setOptions={setOptions} players={players} viewAs={viewAs} setViewAs={setViewAs} send={send} />}
              </div>
              <Panel pad={false} className={s.boardPanel}>
                {three ? (
                  <Suspense fallback={<Loading label="Le plateau prend du relief…" />}>
                    <Board3D {...boardProps} effects={effects} />
                  </Suspense>
                ) : (
                  <Board {...boardProps} />
                )}
              </Panel>
              <div className={s.rightRail}>
                <div className={s.railTabs} role="tablist" aria-label="Panneaux">
                  {(
                    [
                      ['fiche', 'Fiche'],
                      ['creature', 'Créature'],
                      ['journal', 'Journal'],
                      ...(isGm ? [['mj', 'MJ'] as const] : []),
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" role="tab" aria-selected={rail === value} className={cx(rail === value && s.railTabOn)} onClick={() => setRail(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className={s.railBody}>
                  {rail === 'fiche' && <div className={s.flyout}>{sheetPanel}</div>}
                  {rail === 'creature' &&
                    (selected || selectedObject ? (
                      <Inspector state={shown} combatantId={selected} objectId={selectedObject} isGm={isGm} userId={userId} players={players} send={send} onClose={() => (setSelected(null), setSelectedObject(null))} onAttack={(id) => setAttacker({ attackerId: id })} />
                    ) : (
                      <div className={s.flyout}>
                        <span className="ds-help">Sélectionnez une créature ou un objet sur le plateau.</span>
                      </div>
                    ))}
                  {rail === 'journal' && (
                    <div className={s.flyout}>
                      <CombatLog log={log} state={shown} />
                    </div>
                  )}
                  {rail === 'mj' && isGm && <GmSetup state={state} party={party} send={send} />}
                </div>
              </div>
            </div>
          )}
          {actor && state.status === 'active' && (
            <ActionBar
              state={state}
              combatant={actor}
              isGm={isGm}
              send={send}
              onAttack={() => (setCasting(null), setAttacker({ attackerId: actor.id }))}
              onRoll={() => campaignId && void dice.roll(campaignId, 'Jet libre', '1d20').then((r) => r === null && toast('Jet impossible.', 'error'))}
              onSheet={actor.characterId ? () => (setSelected(actor.id), setRail('fiche')) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
