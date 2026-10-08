import type { CombatEventEnvelope } from '@ds/shared';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLocalPref, useMediaQuery } from '../../shared/hooks';
import { useDice } from '../../shared/dice/DiceProvider';
import { Button, Empty, Loading, Panel, Segmented } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useCombat, type CommandInput } from './api';
import { Board, type BoardProps, type FloatText, type Tool, type ToolOptions } from './Board';
import { Replay } from './Replay';
import { FX_DURATION, hasWebGL, withCharacterModels, type AttackFx } from './scene/support';
import { ActionBar, CombatLog, GmSetup, InitiativeBar, Inspector, Toolbar, ToolOptionsPanel, TrackerList } from './panels';
import s from './combat.module.css';

const Board3D = lazy(() => import('./scene/Board3D'));
const WEBGL = typeof document !== 'undefined' && hasWebGL();

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
  const [dim, setDim] = useLocalPref<'2d' | '3d'>('battleDim', WEBGL ? '3d' : '2d');
  const three = WEBGL && dim === '3d';

  // Chiffres flottants sur les pions et affichage des jets d'attaque.
  const onEvents = useCallback(
    (events: CombatEventEnvelope[]) => {
      for (const { event: e } of events) {
        if (e.type === 'combat.hp_changed') {
          const f: FloatText = {
            id: Date.now() + Math.random(),
            combatantId: e.payload.id,
            text: e.payload.amount === null ? e.payload.bandAfter : `${e.payload.mode === 'damage' ? '−' : '+'}${e.payload.amount}`,
            color: e.payload.mode === 'damage' ? '#f2b3cf' : '#7cc6ff',
          };
          // En 3D, le chiffre attend que le projectile ait touché.
          const delay = three && events.some((x) => x.event.type === 'combat.attack_rolled') ? 420 : 0;
          setTimeout(() => setFloats((xs) => [...xs, f]), delay);
          setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== f.id)), 1400 + delay);
        }
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
        }
        if (e.type === 'combat.attack_rolled') dice.show(e.payload.label, `1d20${e.payload.bonus >= 0 ? '+' : ''}${e.payload.bonus}`, e.payload.total, e.payload.natural);
      }
    },
    [dice, three],
  );
  const { state: rawState, log, error, send: rawSend } = useCombat(encounterId, onEvents);
  // Les modèles 3D des PJ viennent de leur fiche, tenue à jour en temps réel.
  const characterModels = useMemo(() => new Map(characters.map((c) => [c.id, c.modelUrl])), [characters]);
  const state = useMemo(() => rawState && withCharacterModels(rawState, characterModels), [rawState, characterModels]);
  const send = (cmd: CommandInput) => void rawSend(cmd);

  const [view, setView] = useState<'board' | 'tracker' | 'replay'>(narrow ? 'tracker' : 'board');
  const [tool, setTool] = useState<Tool>('select');
  const [options, setOptions] = useState<ToolOptions>({ brush: 'wall', zone: { shape: 'circle', size: 2, direction: 0, color: '#e07aa8', label: '' }, objectKind: 'chest' });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);

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

  const onTarget = (targetId: string) => {
    if (!attacker) return;
    send({ type: 'attack', attackerId: attacker, targetId, advantage: 'normal' });
    setAttacker(null);
  };

  const boardProps: BoardProps = {
    state,
    isGm,
    userId,
    tool,
    options,
    selectedId: selected,
    selectedObjectId: selectedObject,
    onSelect: setSelected,
    onSelectObject: setSelectedObject,
    targeting: !!attacker,
    onTarget,
    floats,
    send,
  };

  return (
    <div className={s.battle}>
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
        <Replay encounterId={encounterId} isGm={isGm} userId={userId} three={three} characterModels={characterModels} />
      ) : (
        <>
      <InitiativeBar state={state} isGm={isGm} canEndTurn={!!active && active.ownerUserId === userId} onSelect={setSelected} send={send} />
      {error && <div className={s.errorBanner}>{error}</div>}
      {attacker && (
        <div className={s.targetBanner}>
          Choisissez une cible pour {state.combatants[attacker]?.name}.{' '}
          <Button variant="link" size="sm" onClick={() => setAttacker(null)}>
            Annuler
          </Button>
        </div>
      )}
      {view === 'tracker' ? (
        <Panel>
          <TrackerList state={state} isGm={isGm} userId={userId} send={send} onAttack={(id) => (setAttacker(id), setView('board'))} />
        </Panel>
      ) : (
        <div className={s.battleBody}>
          <div className={s.leftRail}>
            <Toolbar tool={tool} setTool={setTool} isGm={isGm} />
            <ToolOptionsPanel tool={tool} options={options} setOptions={setOptions} state={state} send={send} />
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
            <Inspector state={state} combatantId={selected} objectId={selectedObject} isGm={isGm} userId={userId} send={send} onClose={() => (setSelected(null), setSelectedObject(null))} onAttack={setAttacker} />
            {isGm && <GmSetup state={state} party={party} send={send} />}
            <Panel className={s.logPanel}>
              <span className="ds-label">Journal de combat</span>
              <CombatLog log={log} state={state} />
            </Panel>
          </div>
        </div>
      )}
      {actor && state.status === 'active' && (
        <ActionBar
          state={state}
          combatant={actor}
          isGm={isGm}
          send={send}
          onAttack={() => setAttacker(actor.id)}
          onRoll={() => campaignId && void dice.roll(campaignId, 'Jet libre', '1d20').then((r) => r === null && toast('Jet impossible.', 'error'))}
        />
      )}
        </>
      )}
    </div>
  );
}
