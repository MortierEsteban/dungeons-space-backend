import { replayCombat, type CombatEvent, type CombatState } from '@ds/rules';
import type { CombatEventEnvelope } from '@ds/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { http } from '../../shared/api/client';
import { Button, Loading, Panel, Select } from '../../shared/ui/components';
import { Board, type ToolOptions } from './Board';
import { CombatLog, InitiativeBar } from './panels';
import s from './combat.module.css';

interface Mark {
  i: number;
  kind: 'turn' | 'highlight';
  round: number;
}

const NO_OPTIONS: ToolOptions = { brush: 'wall', zone: { shape: 'circle', size: 1, direction: 0, color: '#7cc6ff', label: '' }, objectKind: 'chest' };

/**
 * Lecteur de replay « façon Chess.com » (CMB-61/62/63) : l'état à l'instant N est
 * reconstruit en rejouant les N premiers événements avec le réducteur partagé.
 */
export function Replay({ encounterId, isGm, userId }: { encounterId: string; isGm: boolean; userId: string }) {
  const { data: stream, isLoading } = useQuery({
    queryKey: ['encounter', encounterId, 'stream'],
    queryFn: async () => (await http.get<{ events: CombatEventEnvelope[] }>(`/encounters/${encounterId}/events`)).events,
  });
  const events = useMemo<CombatEvent[]>(() => (stream ?? []).map((e) => e.event), [stream]);
  const [index, setIndex] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Jalons : chaque début de tour, plus les moments forts (critique, créature à terre).
  const marks = useMemo(
    () =>
      events.flatMap((e, i): Mark[] => {
        if (e.type === 'combat.turn_started') return [{ i: i + 1, kind: 'turn', round: e.payload.round }];
        if ((e.type === 'combat.attack_rolled' && e.payload.crit) || (e.type === 'combat.hp_changed' && e.payload.bandAfter === 'À terre')) return [{ i: i + 1, kind: 'highlight', round: 0 }];
        return [];
      }),
    [events],
  );

  useEffect(() => {
    if (stream) setIndex(stream.length);
  }, [stream]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIndex((i) => Math.min(events.length, i + 1)), 600 / speed);
    return () => clearInterval(t);
  }, [playing, speed, events.length]);

  useEffect(() => {
    if (playing && index >= events.length) setPlaying(false);
  }, [playing, index, events.length]);

  const state: CombatState | null = useMemo(() => replayCombat(events, index), [events, index]);
  if (isLoading || !stream) return <Loading />;
  if (!state) return <Panel>Aucun événement à rejouer.</Panel>;

  const turns = marks.filter((m) => m.kind === 'turn');
  const jump = (dir: 1 | -1) => {
    const target = dir > 0 ? turns.find((m) => m.i > index) : [...turns].reverse().find((m) => m.i < index);
    setIndex(target?.i ?? (dir > 0 ? events.length : 1));
  };

  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      <InitiativeBar state={state} isGm={false} canEndTurn={false} onSelect={() => undefined} send={() => undefined} />
      <div className={s.replayBody}>
        <Panel pad={false} className={s.boardPanel}>
          <Board
            state={state}
            isGm={isGm}
            userId={userId}
            tool="select"
            options={NO_OPTIONS}
            selectedId={null}
            selectedObjectId={null}
            onSelect={() => undefined}
            onSelectObject={() => undefined}
            targeting={false}
            onTarget={() => undefined}
            floats={[]}
            readOnly
            send={() => undefined}
          />
        </Panel>
        <Panel className={s.logPanel}>
          <span className="ds-label">Jusqu’à cet instant</span>
          <CombatLog log={(stream ?? []).slice(0, index).reverse()} state={state} />
        </Panel>
      </div>
      <Panel className={s.replayBar}>
        <div className="ds-row">
          <Button size="sm" variant="ghost" onClick={() => jump(-1)} aria-label="Tour précédent">
            ⏮
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIndex((i) => Math.max(1, i - 1))} aria-label="Événement précédent">
            ◀
          </Button>
          <Button size="sm" variant="primary" onClick={() => (index >= events.length && setIndex(1), setPlaying(!playing))}>
            {playing ? 'Pause' : 'Lecture'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIndex((i) => Math.min(events.length, i + 1))} aria-label="Événement suivant">
            ▶
          </Button>
          <Button size="sm" variant="ghost" onClick={() => jump(1)} aria-label="Tour suivant">
            ⏭
          </Button>
          <Select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Vitesse" style={{ width: 'auto', minHeight: 32, padding: '4px 30px 4px 10px' }}>
            {[0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                × {v}
              </option>
            ))}
          </Select>
          <span className="ds-help ds-grow" style={{ textAlign: 'right' }}>
            Round {state.round || '—'} · événement {index} / {events.length}
          </span>
        </div>
        <div className={s.scrubber}>
          <input type="range" min={1} max={events.length} value={index} onChange={(e) => (setPlaying(false), setIndex(Number(e.target.value)))} aria-label="Position dans le combat" />
          <div className={s.marks} aria-hidden>
            {marks.map((m, k) => (
              <span key={k} className={m.kind === 'turn' ? s.markTurn : s.markHighlight} style={{ left: `${((m.i - 1) / Math.max(1, events.length - 1)) * 100}%` }} title={m.kind === 'turn' ? `Round ${m.round}` : 'Moment fort'} />
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
