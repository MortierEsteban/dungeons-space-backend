import type { CombatEventEnvelope } from '@ds/shared';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMediaQuery } from '../../shared/hooks';
import { useDice } from '../../shared/dice/DiceProvider';
import { Button, Empty, Loading, Panel, Segmented } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useMe } from '../auth/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useCombat, type CommandInput } from './api';
import { Board, type FloatText, type Tool, type ToolOptions } from './Board';
import { Replay } from './Replay';
import { ActionBar, CombatLog, GmSetup, InitiativeBar, Inspector, Toolbar, ToolOptionsPanel, TrackerList } from './panels';
import s from './combat.module.css';

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
          setFloats((xs) => [...xs, f]);
          setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== f.id)), 1400);
        }
        if (e.type === 'combat.attack_rolled') dice.show(e.payload.label, `1d20${e.payload.bonus >= 0 ? '+' : ''}${e.payload.bonus}`, e.payload.total, e.payload.natural);
      }
    },
    [dice],
  );
  const { state, log, error, send: rawSend } = useCombat(encounterId, onEvents);
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
      </div>
      {view === 'replay' ? (
        <Replay encounterId={encounterId} isGm={isGm} userId={userId} />
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
            <Board
              state={state}
              isGm={isGm}
              userId={userId}
              tool={tool}
              options={options}
              selectedId={selected}
              selectedObjectId={selectedObject}
              onSelect={setSelected}
              onSelectObject={setSelectedObject}
              targeting={!!attacker}
              onTarget={onTarget}
              floats={floats}
              send={send}
            />
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
