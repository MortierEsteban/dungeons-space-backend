import { eventConfidence, eventOrigin, eventTypeDef, type EventDto, type RecordingDto, type SessionDto } from '@ds/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { num, shortDate } from '../../shared/format';
import { useDebounced, useLocalPref } from '../../shared/hooks';
import { Button, Chip, cx, Empty, Input, Loading, Panel, Segmented, Tag, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { errorMessage } from '../../shared/api/client';
import { useSessions } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useChronicleMutations, useEventLinks } from '../chronicle/api';
import { DENSITIES, selectDensity, SESSION_DENSITY, type Density } from '../chronicle/density';
import { audioUrl, useRecordings, useSessionTrace, useTranscript } from '../recording/api';
import { buildJournal, laneOf, LANES, segmentTimeIndex, toPassages, type JournalEntry, type Passage } from './journal';
import { SessionStrip, type StripEvent } from './SessionStrip';
import s from './sessions.module.css';

const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const PAGE = 300;

function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * Vue par session de l'Explorer : la trace complète d'une soirée de jeu — frise des événements de toutes
 * natures, densité de parole, et journal où la transcription s'entrelace avec les événements.
 */
export function SessionsView() {
  const { campaignId } = useCurrentCampaign();
  const [params, setParams] = useSearchParams();
  const { data: sessions = [], isLoading } = useSessions(campaignId);
  const { data: recordings = [] } = useRecordings(campaignId);
  const requested = params.get('session');
  const selected = requested !== null && Number.isInteger(Number(requested)) ? Number(requested) : (sessions[0]?.number ?? null);

  const choose = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('session', String(n));
    setParams(next, { replace: true });
  };

  if (isLoading) return <Loading />;
  if (sessions.length === 0) {
    return (
      <Panel>
        <Empty title="Aucune session jouée pour l’instant.">Démarrez une session depuis la page Campagne : sa trace complète apparaîtra ici.</Empty>
      </Panel>
    );
  }

  return (
    <div className={s.layout}>
      <Panel className={s.list} aria-label="Sessions">
        {sessions.map((se) => (
          <SessionItem key={se.id} session={se} recordings={recordings.filter((r) => r.sessionNo === se.number)} active={se.number === selected} onClick={() => choose(se.number)} />
        ))}
        <button type="button" className={cx(s.item, selected === 0 && s.itemActive)} onClick={() => choose(0)}>
          <span className={s.itemNo}>—</span>
          <span className="ds-grow">
            <span className={s.itemTitle}>Prologue</span>
            <span className={s.itemMeta}>Avant la première session</span>
          </span>
        </button>
      </Panel>
      {selected !== null && <SessionDetail key={selected} sessionNo={selected} />}
    </div>
  );
}

function SessionItem({ session, recordings, active, onClick }: { session: SessionDto; recordings: RecordingDto[]; active: boolean; onClick(): void }) {
  const live = recordings.some((r) => r.status !== 'ended');
  const words = recordings.reduce((n, r) => n + r.wordCount, 0);
  const end = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  return (
    <button type="button" className={cx(s.item, active && s.itemActive)} onClick={onClick} aria-pressed={active}>
      <span className={s.itemNo}>{session.number}</span>
      <span className="ds-grow">
        <span className={s.itemTitle}>{session.title || `Session ${session.number}`}</span>
        <span className={s.itemMeta}>
          {shortDate(session.startedAt)} · {session.endedAt ? duration(end - Date.parse(session.startedAt)) : 'en cours'}
          {words > 0 && ` · ${num(words)} mots`}
        </span>
      </span>
      {recordings.length > 0 && <span className={cx(s.recDot, live && s.recDotLive)} title={live ? 'Enregistrement en cours' : 'Session enregistrée'} />}
    </button>
  );
}

function SessionDetail({ sessionNo }: { sessionNo: number }) {
  const { campaignId, isGm } = useCurrentCampaign();
  const toast = useToast();
  const { data: trace, isLoading } = useSessionTrace(campaignId, sessionNo);
  const { data: links = [] } = useEventLinks(campaignId);
  const live = !!trace?.recordings.some((r) => r.status === 'live');
  const [showTranscript, setShowTranscript] = useLocalPref('sessionTranscript', true);
  const transcriptOn = !!trace?.transcriptVisible && !!trace.recordings.length && showTranscript;
  const { segments } = useTranscript(campaignId, sessionNo, transcriptOn, live);
  const [density, setDensity] = useLocalPref<Density>('sessionDensity', 'balanced');
  const [lanes, setLanes] = useState<string[]>([]);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim().toLowerCase(), 200);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusPassage, setFocusPassage] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const mutations = useChronicleMutations(campaignId ?? '');
  const listRef = useRef<HTMLDivElement>(null);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of links) for (const id of [l.fromId, l.toId]) d.set(id, (d.get(id) ?? 0) + 1);
    return d;
  }, [links]);
  const segmentTimes = useMemo(() => segmentTimeIndex(segments), [segments]);
  // En vue équilibrée, la parole entre deux événements forme un seul passage replié ; « Tout » la détaille.
  const passages = useMemo(() => (density === 'all' ? toPassages(segments) : toPassages(segments, 6 * 60_000, 40)), [segments, density]);
  const events = useMemo(() => (trace?.events ?? []).filter((e) => !e.retracted || density === 'all'), [trace, density]);

  const all = useMemo(() => buildJournal(events, [], { degree, segmentTimes }).filter((j): j is Extract<JournalEntry, { kind: 'event' }> => j.kind === 'event'), [events, degree, segmentTimes]);
  const shownIds = useMemo(
    () => selectDensity(all.map((j) => ({ id: j.event.id, group: laneOf(j.event.category), weight: j.weight })), density, SESSION_DENSITY),
    [all, density],
  );

  const start = useMemo(() => {
    const times = [...all.map((j) => j.at), ...passages.map((p) => p.startAt)];
    const first = trace?.session ? Date.parse(trace.session.startedAt) : Infinity;
    return Math.min(first, ...times);
  }, [all, passages, trace]);
  const end = useMemo(() => {
    const times = [...all.map((j) => j.at), ...passages.map((p) => p.endAt)];
    const last = trace?.session?.endedAt ? Date.parse(trace.session.endedAt) : live ? Date.now() : -Infinity;
    return Math.max(start + 60_000, last, ...times);
  }, [all, passages, trace, live, start]);

  const laneFilter = (e: EventDto) => !lanes.length || lanes.includes(LANES[laneOf(e.category)]?.id ?? '');
  const inRange = (t: number) => !range || (t >= range[0] && t <= range[1]);
  const matches = (text: string) => !query || text.toLowerCase().includes(query);

  const strip: StripEvent[] = all.filter((j) => laneFilter(j.event)).map((j) => ({ event: j.event, at: j.at, weight: j.weight, shown: shownIds.has(j.event.id) }));

  const journal = useMemo(() => {
    const evs = events.filter((e) => shownIds.has(e.id) && laneFilter(e));
    const ps = transcriptOn && density !== 'essential' ? passages : [];
    return buildJournal(evs, ps, { degree, segmentTimes }).filter((j) =>
      j.kind === 'event' ? inRange(j.at) && matches(`${j.event.title} ${j.event.text} ${j.event.places.join(' ')}`) : inRange(j.at) && matches(j.passage.segments.map((x) => x.text).join(' ')),
    );
    // Les filtres (couloirs, période, recherche) sont lus via les fermetures ci-dessus.
  }, [events, shownIds, lanes, transcriptOn, density, passages, degree, segmentTimes, range, query]);

  // Événement choisi sur la frise : on le fait défiler dans le journal.
  useEffect(() => {
    if (!selected) return;
    listRef.current?.querySelector(`[data-entry="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const showSource = (e: EventDto) => {
    const segs = e.payload.segments as [number, number] | undefined;
    const passage = segs && passages.find((p) => p.recordingId === e.payload.recordingId && p.from <= segs[1] && p.to >= segs[0]);
    if (!passage) {
      toast('Passage introuvable : affichez la transcription ou élargissez le niveau de détail.', 'info');
      return;
    }
    setFocusPassage(passage.id);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-entry="${passage.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  if (isLoading || !trace) return <Loading />;

  const counts = { manual: 0, recording: 0, system: 0 };
  for (const e of trace.events) if (!e.retracted) counts[eventOrigin(e)]++;
  const words = trace.recordings.reduce((n, r) => n + r.wordCount, 0);
  const session = trace.session;

  return (
    <div className={s.detail}>
      <Panel className={s.head}>
        <div className="ds-grow">
          <div className="ds-label">{sessionNo === 0 ? 'Prologue' : `Session ${sessionNo}`}</div>
          <h2 className="ds-h2" style={{ fontSize: 26, color: 'var(--gold-light)' }}>
            {session?.title || (sessionNo === 0 ? 'Avant la première session' : `Session ${sessionNo}`)}
          </h2>
          {session && (
            <p className="ds-help" style={{ margin: 0 }}>
              {shortDate(session.startedAt)}
              {session.endedAt ? ` → ${clock.format(Date.parse(session.endedAt))} (${duration(Date.parse(session.endedAt) - Date.parse(session.startedAt))})` : ' · en cours'}
            </p>
          )}
        </div>
        <div className={s.stats}>
          <div>
            <strong>{counts.manual + counts.recording + counts.system}</strong>
            <span>Événements</span>
          </div>
          <div>
            <strong>{counts.recording}</strong>
            <span>Déduits</span>
          </div>
          <div>
            <strong>{num(words)}</strong>
            <span>Mots</span>
          </div>
        </div>
        {live && <Tag color="#ff8fa3">Enregistrement en direct</Tag>}
        {session?.summary && <p className={s.summary}>{session.summary}</p>}
        {isGm && trace.recordings.some((r) => r.audio) && (
          <div className={s.audio}>
            {trace.recordings.flatMap((r) =>
              (r.audio?.parts ?? []).map((_, part) => (
                <audio key={`${r.id}-${part}`} controls preload="none" src={audioUrl(campaignId!, r.id, part)} aria-label={`Audio de la session, partie ${part + 1}`} />
              )),
            )}
          </div>
        )}
      </Panel>

      <Panel pad={false} className={s.stripPanel}>
        <SessionStrip
          events={strip}
          segments={transcriptOn ? segments : []}
          start={start}
          end={end}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            if (!shownIds.has(id)) setDensity('all');
          }}
          range={range}
          onRange={setRange}
        />
      </Panel>

      <Panel className={s.journalPanel}>
        <div className={s.toolbar}>
          <Input placeholder="Rechercher dans la session…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans la session" />
          <Segmented label="Niveau de détail" value={density} options={DENSITIES} onChange={setDensity} />
        </div>
        <div className={s.toolbar}>
          <div className={s.chips}>
            {LANES.map((l) => (
              <Chip key={l.id} active={lanes.includes(l.id)} onClick={() => setLanes((xs) => (xs.includes(l.id) ? xs.filter((x) => x !== l.id) : [...xs, l.id]))}>
                {l.label}
              </Chip>
            ))}
          </div>
          {trace.transcriptVisible && trace.recordings.length > 0 && (
            <Toggle checked={showTranscript} onChange={setShowTranscript}>
              Transcription
            </Toggle>
          )}
        </div>
        {range && (
          <div className={s.rangeBar}>
            De {clock.format(range[0])} à {clock.format(range[1])}
            <Button size="sm" variant="link" onClick={() => setRange(null)}>
              Toute la session
            </Button>
          </div>
        )}
        <div className={s.journal} ref={listRef}>
          {journal.length === 0 && <Empty title="Rien à montrer.">Aucun événement ne correspond à ces filtres.</Empty>}
          {journal.slice(0, limit).map((j) =>
            j.kind === 'event' ? (
              <EventEntry
                key={j.event.id}
                entry={j}
                isGm={isGm}
                selected={selected === j.event.id}
                onSelect={() => setSelected(selected === j.event.id ? null : j.event.id)}
                onSource={transcriptOn ? () => showSource(j.event) : undefined}
                onReveal={() => mutations.reveal.mutate(j.event.id, { onSuccess: () => toast('Événement révélé aux joueurs.', 'success'), onError: (e) => toast(errorMessage(e), 'error') })}
                onRetract={() => mutations.correct.mutate({ id: j.event.id, retract: true, reason: 'Retiré après relecture de la session.' }, { onError: (e) => toast(errorMessage(e), 'error') })}
              />
            ) : (
              <PassageEntry key={j.passage.id} passage={j.passage} at={j.at} expanded={density === 'all' || focusPassage === j.passage.id} focused={focusPassage === j.passage.id} />
            ),
          )}
          {journal.length > limit && (
            <Button variant="ghost" block onClick={() => setLimit((n) => n + PAGE)}>
              Afficher la suite ({journal.length - limit})
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EventEntry({
  entry,
  isGm,
  selected,
  onSelect,
  onSource,
  onReveal,
  onRetract,
}: {
  entry: Extract<JournalEntry, { kind: 'event' }>;
  isGm: boolean;
  selected: boolean;
  onSelect(): void;
  onSource?: () => void;
  onReveal(): void;
  onRetract(): void;
}) {
  const e = entry.event;
  const def = eventTypeDef(e.type);
  const origin = eventOrigin(e);
  const minor = entry.weight < 0.35;
  return (
    <article data-entry={e.id} className={cx(s.event, selected && s.eventSelected, minor && s.eventMinor)} style={{ borderLeftColor: def.color, opacity: e.retracted ? 0.5 : undefined }}>
      <button type="button" className={s.eventHead} onClick={onSelect} aria-expanded={selected}>
        <span className={s.time}>{clock.format(entry.at)}</span>
        <span className={s.gem} style={{ background: def.color, transform: `rotate(45deg) scale(${0.7 + entry.weight * 0.6})` }} />
        <span className={s.eventTitle} style={{ textDecoration: e.retracted ? 'line-through' : undefined }}>
          {e.title}
        </span>
        <span className={s.eventTags}>
          <span className="ds-label" style={{ color: def.color }}>
            {def.label}
          </span>
          {origin === 'recording' && <Tag color="var(--arcane-light)">Auto · {Math.round(eventConfidence(e) * 100)} %</Tag>}
          {e.importance >= 4 && <Tag color="var(--gold-light)">Moment clé</Tag>}
          {e.visibility === 'gm_only' && isGm && <Tag color="var(--magenta-light)">Secret</Tag>}
          {e.retracted && <Tag>Retiré</Tag>}
        </span>
      </button>
      {(selected || (!minor && e.text)) && e.text && <p className={s.eventText}>{e.text}</p>}
      {selected && (
        <div className={s.eventMore}>
          {(e.actors.length > 0 || e.targets.length > 0) && (
            <div className="ds-row" style={{ gap: 6 }}>
              {e.actors.map((a, i) => (
                <Tag key={`a${i}`} color="var(--arcane-light)">
                  {a.name}
                </Tag>
              ))}
              {e.targets.map((t, i) => (
                <Tag key={`t${i}`} color="var(--magenta-light)">
                  → {t.name}
                </Tag>
              ))}
              {e.places.map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </div>
          )}
          <div className="ds-row" style={{ gap: 8 }}>
            {origin === 'recording' && onSource && (
              <Button size="sm" variant="link" onClick={onSource}>
                Passage source
              </Button>
            )}
            {isGm && origin === 'recording' && e.visibility === 'gm_only' && !e.retracted && (
              <Button size="sm" variant="secondary" onClick={onReveal}>
                Révéler aux joueurs
              </Button>
            )}
            {isGm && origin === 'recording' && !e.retracted && (
              <Button size="sm" variant="ghost" onClick={onRetract}>
                Retirer
              </Button>
            )}
            <span className="ds-help">
              {origin === 'manual' ? `Noté par ${e.author?.name ?? 'un membre'}` : origin === 'recording' ? 'Déduit de l’enregistrement' : 'Inscrit par l’application'}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

function PassageEntry({ passage, at, expanded, focused }: { passage: Passage; at: number; expanded: boolean; focused: boolean }) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => setOpen(expanded), [expanded]);
  const text = passage.segments.map((x) => x.text).join(' ');
  const short = text.length > 220 ? `${text.slice(0, 220)}…` : text;
  return (
    <div data-entry={passage.id} className={cx(s.passage, focused && s.passageFocused)}>
      <span className={s.time}>{clock.format(at)}</span>
      <div className="ds-grow">
        {open ? (
          passage.segments.map((x) => (
            <p key={x.id} className={s.line}>
              {x.speaker && <strong>{x.speaker} : </strong>}
              {x.text}
            </p>
          ))
        ) : (
          <p className={s.line}>{short}</p>
        )}
        {(passage.segments.length > 1 || text.length > 220) && (
          <button type="button" className={s.more} onClick={() => setOpen(!open)}>
            {open ? 'Replier' : `Lire le passage (${passage.segments.length} phrase${passage.segments.length > 1 ? 's' : ''})`}
          </button>
        )}
      </div>
    </div>
  );
}
