import { searchForm, type RecordingDto, type TranscriptHitDto, type TranscriptSegmentDto } from '@ds/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { num, shortDate } from '../../shared/format';
import { useDebounced } from '../../shared/hooks';
import { Button, cx, Empty, IconButton, Input, Loading, Panel, Segmented } from '../../shared/ui/components';
import { useCampaign, useSessions } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useRecordings, useTranscript, useTranscriptSearch } from './api';
import s from './transcripts.module.css';

const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Plages à surligner : chaque mot de la recherche, sans tenir compte de la casse ni des accents
 * (la forme repliée est calculée caractère par caractère pour retrouver les positions d'origine).
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const words = searchForm(query).split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = searchForm(text[i]!);
    for (let k = 0; k < f.length; k++) origin.push(i);
    folded += f;
  }
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + w.length)) ranges.push([origin[at]!, origin[at + w.length - 1]! + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** Le segment contient-il tous les mots de la recherche ? */
const matchesAll = (text: string, query: string) => {
  const t = searchForm(text);
  return searchForm(query).split(/\s+/u).filter(Boolean).every((w) => t.includes(w));
};

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([a, b], i) => {
    if (a > cursor) out.push(text.slice(cursor, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    cursor = b;
  });
  out.push(text.slice(cursor));
  return <>{out}</>;
}

/** Comment lancer un enregistrement : rappelé là où l'on cherche la transcription. */
export function RecordingHowTo({ isGm }: { isGm: boolean }) {
  if (!isGm) return <p className="ds-help">Seul le MJ peut enregistrer une session. Quand il le fait, l’indicateur « REC » s’allume en haut de l’écran pour toute la table.</p>;
  return (
    <ol className={s.howto}>
      <li>
        Page <Link to="/campagne">Campagne</Link> → <strong>Réglages</strong> : activez « Enregistrer les sessions ».
      </li>
      <li>
        Démarrez la session (page <Link to="/campagne">Campagne</Link>, bloc Sessions).
      </li>
      <li>
        Cliquez <strong>Enregistrer</strong> dans ce même bloc, ou sur le bouton <strong>REC</strong> en haut de l’écran. Utilisez Chrome ou Edge et autorisez le micro.
      </li>
      <li>La transcription arrive ici au fil de l’eau ; les événements marquants sont inscrits dans la Chronique.</li>
    </ol>
  );
}

/**
 * Transcriptions des sessions : lecture intégrale d'une session et recherche dans toutes les sessions,
 * casse et accents ignorés. Un résultat ouvre la session au bon endroit.
 */
export function TranscriptsView() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: campaign } = useCampaign(campaignId);
  const { data: sessions = [] } = useSessions(campaignId);
  const { data: recordings = [], isLoading } = useRecordings(campaignId);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim(), 250);
  const [scope, setScope] = useState<'all' | 'session'>('all');
  const [jump, setJump] = useState<string | null>(null);
  const canRead = isGm || !!campaign?.settings.recording.playersSeeTranscript;

  const bySession = useMemo(() => {
    const m = new Map<number, RecordingDto[]>();
    for (const r of recordings) m.set(r.sessionNo, [...(m.get(r.sessionNo) ?? []), r]);
    return m;
  }, [recordings]);
  const recorded = [...bySession.keys()].sort((a, b) => b - a);
  const requested = Number(params.get('session'));
  const selected = recorded.includes(requested) ? requested : (recorded[0] ?? null);

  const choose = (n: number, segmentId: string | null = null) => {
    const next = new URLSearchParams(params);
    next.set('session', String(n));
    setParams(next, { replace: true });
    setJump(segmentId);
    if (segmentId) setScope('session');
  };

  const searching = query.length >= 2;
  const global = useTranscriptSearch(campaignId, query, null, canRead && searching && scope === 'all');

  if (isLoading) return <Loading />;
  if (!canRead) {
    return (
      <Panel>
        <Empty title="La transcription est réservée au MJ.">Votre MJ peut l’ouvrir aux joueurs dans les réglages de la campagne.</Empty>
      </Panel>
    );
  }
  if (recorded.length === 0) {
    return (
      <Panel className="ds-stack" style={{ gap: 12, maxWidth: 720 }}>
        <Empty title="Aucune session enregistrée pour l’instant.">Les transcriptions apparaîtront ici, consultables et cherchables.</Empty>
        <RecordingHowTo isGm={isGm} />
      </Panel>
    );
  }

  const title = (n: number) => (n === 0 ? 'Prologue' : (sessions.find((se) => se.number === n)?.title ?? `Session ${n}`));

  return (
    <div className={s.layout}>
      <Panel className={s.searchBar}>
        <Input placeholder="Rechercher un mot, un nom, une promesse… (accents et majuscules ignorés)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans les transcriptions" />
        <Segmented
          label="Portée de la recherche"
          value={scope}
          options={[
            { value: 'all', label: 'Toutes les sessions' },
            { value: 'session', label: 'Session ouverte' },
          ]}
          onChange={setScope}
        />
      </Panel>

      <Panel className={s.list} aria-label="Sessions enregistrées">
        {recorded.map((n) => {
          const recs = bySession.get(n)!;
          const live = recs.some((r) => r.status !== 'ended');
          const session = sessions.find((se) => se.number === n);
          return (
            <button key={n} type="button" className={cx(s.item, n === selected && s.itemActive)} aria-pressed={n === selected} onClick={() => choose(n)}>
              <span className={s.itemNo}>{n || '—'}</span>
              <span className={s.itemBody}>
                <span className={s.itemTitle}>{title(n)}</span>
                <span className={s.itemMeta}>
                  {session ? `${shortDate(session.startedAt)} · ` : ''}
                  {num(recs.reduce((t, r) => t + r.wordCount, 0))} mots
                </span>
              </span>
              {live && <span className={s.liveDot} title="Enregistrement en cours" />}
            </button>
          );
        })}
      </Panel>

      {searching && scope === 'all' ? (
        <Panel className={s.main}>
          <SearchResults hits={global.data?.hits ?? []} more={!!global.data?.more} loading={global.isFetching && !global.data} query={query} title={title} onOpen={(h) => choose(h.sessionNo, h.segment.id)} />
        </Panel>
      ) : selected !== null ? (
        <Reader
          key={selected}
          sessionNo={selected}
          title={title(selected)}
          live={bySession.get(selected)!.some((r) => r.status === 'live')}
          query={searching ? query : ''}
          jump={jump}
          onJumped={() => setJump(null)}
        />
      ) : null}
    </div>
  );
}

function SearchResults({ hits, more, loading, query, title, onOpen }: { hits: TranscriptHitDto[]; more: boolean; loading: boolean; query: string; title(n: number): string; onOpen(h: TranscriptHitDto): void }) {
  if (loading) return <Loading />;
  if (!hits.length) return <Empty title="Aucun passage trouvé.">Essayez un autre mot, ou moins de mots : chacun doit apparaître dans la même phrase.</Empty>;
  let last: number | null = null;
  return (
    <div className={s.results}>
      <div className="ds-label">
        {hits.length}
        {more ? '+' : ''} passage{hits.length > 1 ? 's' : ''}
      </div>
      {hits.map((h) => {
        const head = h.sessionNo !== last;
        last = h.sessionNo;
        return (
          <div key={h.segment.id}>
            {head && <div className={s.groupHead}>{h.sessionNo === 0 ? 'Prologue' : `Session ${h.sessionNo} · ${title(h.sessionNo)}`}</div>}
            <button type="button" className={s.hit} onClick={() => onOpen(h)}>
              <span className={s.time}>{clock.format(Date.parse(h.segment.spokenAt))}</span>
              <span className={s.hitText}>
                {h.before && <span className={s.context}>{h.before} </span>}
                {h.segment.speaker && <strong>{h.segment.speaker} : </strong>}
                <Highlight text={h.segment.text} query={query} />
                {h.after && <span className={s.context}> {h.after}</span>}
              </span>
            </button>
          </div>
        );
      })}
      {more && <p className="ds-help">D’autres passages existent : précisez la recherche.</p>}
    </div>
  );
}

function Reader({ sessionNo, title, live, query, jump, onJumped }: { sessionNo: number; title: string; live: boolean; query: string; jump: string | null; onJumped(): void }) {
  const { campaignId } = useCurrentCampaign();
  const { segments, loading } = useTranscript(campaignId, sessionNo, true, live);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => (query ? segments.filter((x) => matchesAll(x.text, query)).map((x) => x.id) : []), [segments, query]);
  const hitSet = useMemo(() => new Set(hits), [hits]);

  const scrollTo = (id: string) => {
    setFlash(id);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-seg="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  // Résultat choisi dans la recherche globale : on l'amène au centre dès qu'il est chargé.
  useEffect(() => {
    if (!jump || !segments.some((x) => x.id === jump)) return;
    scrollTo(jump);
    onJumped();
  }, [jump, segments]);

  useEffect(() => setCursor(0), [query]);
  const step = (d: number) => {
    if (!hits.length) return;
    const next = (cursor + d + hits.length) % hits.length;
    setCursor(next);
    scrollTo(hits[next]!);
  };

  const text = () => segments.map((x) => `[${clock.format(Date.parse(x.spokenAt))}] ${x.speaker ? `${x.speaker} : ` : ''}${x.text}`).join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-session-${sessionNo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel className={s.main}>
      <div className={s.readerHead}>
        <div className={s.readerTitle}>
          <div className="ds-label">{sessionNo === 0 ? 'Prologue' : `Session ${sessionNo}`}</div>
          <h2 className="ds-h2" style={{ fontSize: 22, color: 'var(--gold-light)' }}>
            {title}
          </h2>
          <span className="ds-help">
            {segments.length} phrase{segments.length > 1 ? 's' : ''}
            {live ? ' · en direct' : ''}
          </span>
        </div>
        <div className={s.readerActions}>
          {query && (
            <div className={s.matchNav}>
              <span className="ds-help">{hits.length ? `${cursor + 1} / ${hits.length}` : '0 résultat'}</span>
              <IconButton label="Résultat précédent" disabled={!hits.length} onClick={() => step(-1)}>
                ‹
              </IconButton>
              <IconButton label="Résultat suivant" disabled={!hits.length} onClick={() => step(1)}>
                ›
              </IconButton>
            </div>
          )}
          <Button size="sm" variant="ghost" disabled={!segments.length} onClick={download}>
            Télécharger
          </Button>
          <Link className={s.traceLink} to={`/explorer?vue=sessions&session=${sessionNo}`}>
            Trace de la session →
          </Link>
        </div>
      </div>
      <div className={s.transcript} ref={listRef}>
        {loading && !segments.length && <Loading />}
        {!loading && !segments.length && <p className="ds-help">Rien de transcrit pour l’instant.</p>}
        {segments.map((x: TranscriptSegmentDto) => (
          <p key={x.id} data-seg={x.id} className={cx(s.seg, flash === x.id && s.segFlash, hitSet.has(x.id) && s.segHit)}>
            <span className={s.time}>{clock.format(Date.parse(x.spokenAt))}</span>
            <span className={s.segText}>
              {x.speaker && <strong>{x.speaker} : </strong>}
              {query ? <Highlight text={x.text} query={query} /> : x.text}
            </span>
          </p>
        ))}
      </div>
    </Panel>
  );
}
