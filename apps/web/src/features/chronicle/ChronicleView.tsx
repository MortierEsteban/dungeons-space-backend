import { eventOrigin, eventTypeDef, eventWeight, isLandmarkEvent, NARRATIVE_TYPES, type EventDto } from '@ds/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Graph3D, type AxisMark, type GraphEdge, type GraphHandle, type GraphNode } from '../../shared/graph/Graph3D';
import { useDebounced, useLocalPref } from '../../shared/hooks';
import { Button, Chip, IconButton, Input, Loading, Panel, Rule, Segmented, Toggle } from '../../shared/ui/components';
import { useCampaign } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useChronicleMutations, useEventLinks, useNarrativeEvents } from './api';
import { CAMPAIGN_DENSITY, DENSITIES, selectDensity, type Density } from './density';
import { EventDetail } from './EventDetail';
import { EventForm } from './EventForm';
import s from './chronicle.module.css';

const normalize = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Disposition 3D : un axe des sessions, chaque session occupe une tranche proportionnée à son nombre
 * d'événements. Dans la tranche, les événements avancent dans l'ordre et s'enroulent en spirale (angle d'or) :
 * les plus lourds près de l'axe, les détails en périphérie — lisible même avec des centaines de points.
 */
export function layout(events: readonly EventDto[], weights: ReadonlyMap<string, number>, totals: ReadonlyMap<number, number> = new Map()) {
  const sessions = [...new Set(events.map((e) => e.sessionNo ?? 0))].sort((a, b) => a - b);
  const bySession = new Map<number, EventDto[]>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const n = e.sessionNo ?? 0;
    bySession.set(n, [...(bySession.get(n) ?? []), e]);
  }
  // Tranche peu profonde (l'axe reste lisible à plat), disque d'autant plus large que la session est riche.
  const widths = sessions.map((n) => Math.min(260, Math.max(120, 40 + Math.sqrt(bySession.get(n)!.length) * 18)));
  const radii = sessions.map((n) => 110 + Math.sqrt(bySession.get(n)!.length) * 12);
  const gap = 130;
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, sessions.length - 1);
  const centers: number[] = [];
  let cursor = -total / 2;
  for (const w of widths) {
    centers.push(cursor + w / 2);
    cursor += w + gap;
  }
  const axis: AxisMark[] = sessions.map((n, i) => {
    const shown = bySession.get(n)!.length;
    const all = totals.get(n) ?? shown;
    const name = n === 0 ? 'PROLOGUE' : `SESSION ${n}`;
    return { id: `axis-${n}`, label: all > shown ? `${name} · ${shown}/${all}` : name, position: { x: centers[i]!, y: 0, z: 0 } };
  });
  const positions = new Map<string, { x: number; y: number; z: number }>();
  sessions.forEach((n, i) => {
    const list = bySession.get(n)!;
    list.forEach((e, k) => {
      const t = list.length === 1 ? 0.5 : k / (list.length - 1);
      const a = k * GOLDEN + n * 0.9;
      const r = 50 + (1 - (weights.get(e.id) ?? 0.5)) * (radii[i]! - 50) + (k % 3) * 6;
      positions.set(e.id, { x: centers[i]! + (t - 0.5) * widths[i]! * 0.8, y: Math.sin(a) * r, z: Math.cos(a) * r });
    });
  });
  return { axis, positions };
}

/** Couleurs des fils suivis, une par personnage (stable). */
const THREAD_COLORS = ['#7cc6ff', '#f0c674', '#9be3b0', '#ff9e7a', '#d8b3e0', '#ffd1e6'];

/** Événements où apparaît un personnage (acteur ou cible), dans l'ordre de la Chronique. */
export function characterThread(events: readonly EventDto[], characterId: string): EventDto[] {
  return events.filter((e) => [...e.actors, ...e.targets].some((a) => a.kind === 'character' && a.id === characterId)).sort((a, b) => a.seq - b.seq);
}

export function ChronicleView() {
  const { campaignId, current, isGm } = useCurrentCampaign();
  const { data: events = [], isLoading } = useNarrativeEvents(campaignId);
  const { data: links = [] } = useEventLinks(campaignId);
  const { data: campaign } = useCampaign(campaignId);
  const { data: characters = [] } = useCampaignCharacters(campaignId);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'overview' | 'detail' | 'add'>('overview');
  const [linking, setLinking] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [follow, setFollow] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useDebounced(q, 150);
  const [flat, setFlat] = useLocalPref('chronicleFlat', false);
  const mutations = useChronicleMutations(campaignId ?? '');
  const graph = useRef<GraphHandle>(null);

  /** En mode liaison, cliquer un événement crée (ou retire) le lien avec l'événement ouvert. */
  const toggleLink = (from: string, to: string) => {
    const existing = links.find((l) => (l.fromId === from && l.toId === to) || (l.fromId === to && l.toId === from));
    if (existing) mutations.unlink.mutate(existing.id);
    else mutations.link.mutate({ fromId: from, toId: to });
  };

  const [density, setDensity] = useLocalPref<Density>('chronicleDensity', 'balanced');
  const [showAuto, setShowAuto] = useLocalPref('chronicleAuto', true);
  const visible = useMemo(() => events.filter((e) => !e.retracted && (showAuto || eventOrigin(e) !== 'recording')), [events, showAuto]);
  const weights = useMemo(() => {
    const degree = new Map<string, number>();
    for (const l of links) for (const id of [l.fromId, l.toId]) degree.set(id, (degree.get(id) ?? 0) + 1);
    return new Map(visible.map((e) => [e.id, eventWeight(e, degree.get(e.id) ?? 0)]));
  }, [visible, links]);
  const pcs = characters.filter((c) => c.kind === 'pc');
  const followed = characters.find((c) => c.id === follow) ?? null;
  const threadEvents = useMemo(() => (follow ? characterThread(visible, follow) : []), [visible, follow]);
  const threadColor = THREAD_COLORS[Math.max(0, pcs.findIndex((c) => c.id === follow)) % THREAD_COLORS.length]!;

  const matches = useMemo(() => {
    const u = normalize(query.trim());
    return new Set(visible.filter((e) => (!types.length || types.includes(e.type)) && (!u || normalize(`${e.title} ${e.text}`).includes(u))).map((e) => e.id));
  }, [visible, types, query]);

  const filtering = types.length > 0 || query.trim() !== '';

  /** Niveau de détail : les plus lourds par session, plus tout ce que cherchent les filtres, le fil suivi et le voisinage de la sélection. */
  const shown = useMemo(() => {
    const keep = selectDensity(visible.map((e) => ({ id: e.id, group: e.sessionNo ?? 0, weight: weights.get(e.id) ?? 0 })), density, CAMPAIGN_DENSITY);
    if (filtering) for (const id of matches) keep.add(id);
    for (const e of threadEvents) keep.add(e.id);
    if (selected) {
      keep.add(selected);
      for (const l of links) if (l.fromId === selected || l.toId === selected) (keep.add(l.fromId), keep.add(l.toId));
    }
    return visible.filter((e) => keep.has(e.id));
  }, [visible, weights, density, filtering, matches, threadEvents, selected, links]);

  // Disposition calculée sur tous les événements visibles : sélectionner, filtrer ou changer le niveau de
  // détail n'en déplace aucun (la scène ne « saute » plus).
  const placement = useMemo(() => layout(visible, weights), [visible, weights]);

  const { axis, nodes, edges } = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of shown) counts.set(e.sessionNo ?? 0, (counts.get(e.sessionNo ?? 0) ?? 0) + 1);
    const totals = new Map<number, number>();
    for (const e of visible) totals.set(e.sessionNo ?? 0, (totals.get(e.sessionNo ?? 0) ?? 0) + 1);
    const axis: AxisMark[] = placement.axis.map((a) => {
      const n = Number(a.id.slice('axis-'.length));
      const name = n === 0 ? 'PROLOGUE' : `SESSION ${n}`;
      const c = counts.get(n) ?? 0;
      const all = totals.get(n) ?? 0;
      return { ...a, label: all > c ? `${name} · ${c}/${all}` : name };
    });
    const nodes: GraphNode[] = shown.map((e) => {
      const w = weights.get(e.id) ?? 0.5;
      return {
        id: e.id,
        label: e.title,
        color: eventTypeDef(e.type).color,
        position: placement.positions.get(e.id)!,
        muted: !matches.has(e.id),
        hint: `${eventTypeDef(e.type).label}, session ${e.sessionNo ?? 0}${eventOrigin(e) === 'recording' ? ', déduit de l’enregistrement' : ''}`,
        weight: w,
        landmark: isLandmarkEvent(e),
      };
    });
    const ids = new Set(shown.map((e) => e.id));
    const edges: GraphEdge[] = [
      ...shown.map((e) => ({ from: `axis-${e.sessionNo ?? 0}`, to: e.id, color: '#c9a96a', kind: 'spoke' as const, opacity: matches.has(e.id) ? 0.05 + (weights.get(e.id) ?? 0) * 0.12 : 0.03 })),
      ...links.filter((l) => ids.has(l.fromId) && ids.has(l.toId)).map((l) => ({ from: l.fromId, to: l.toId, color: '#d8b3e0', opacity: matches.has(l.fromId) && matches.has(l.toId) ? 0.34 : 0.06, label: 'lié à' })),
    ];
    return { axis, nodes, edges };
  }, [visible, shown, weights, links, matches, placement]);

  const selectedEvent = visible.find((e) => e.id === selected) ?? null;
  const sessions = Math.max(0, ...visible.map((e) => e.sessionNo ?? 0));
  const step = selected ? threadEvents.findIndex((e) => e.id === selected) : -1;
  const thread = useMemo(() => (follow && threadEvents.length ? { ids: threadEvents.map((e) => e.id), color: threadColor, current: selected } : null), [follow, threadEvents, threadColor, selected]);

  const select = (id: string | null) => {
    setSelected(id);
    setMode(id ? 'detail' : 'overview');
  };
  /** Ouvre un événement : la scène cadre automatiquement l'événement et ses voisins. */
  const goTo = (id: string) => select(id);
  const stepTo = (i: number) => {
    const e = threadEvents[Math.max(0, Math.min(threadEvents.length - 1, i))];
    if (e) goTo(e.id);
  };
  const startFollow = (id: string | null) => {
    setFollow(id);
    select(null);
    if (!id) graph.current?.reset();
  };

  // Parcours du fil au clavier : ← et → (hors champs de saisie).
  useEffect(() => {
    if (!follow || !threadEvents.length) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') stepTo(step < 0 ? 0 : step + 1);
      else if (e.key === 'ArrowLeft') stepTo(step < 0 ? threadEvents.length - 1 : step - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading) return <Loading />;

  const activeFilters = types.length + (showAuto ? 0 : 1);

  return (
    <div className={s.layout}>
      <Panel pad={false} className={s.stagePanel}>
        <Graph3D
          ariaLabel="Chronique en trois dimensions"
          handle={graph}
          nodes={nodes}
          edges={edges}
          axis={axis}
          thread={thread}
          selectedId={selected}
          linking={!!linking}
          flat={flat}
          onToggleFlat={() => setFlat(!flat)}
          onSelect={(id) => {
            if (linking && id && id !== linking) {
              toggleLink(linking, id);
              return;
            }
            select(id);
          }}
          overlay={
            <div className={s.filters} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <div className={s.searchRow}>
                <Input placeholder="Rechercher dans la chronique…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans la chronique" />
                <Button size="sm" variant={filtersOpen ? 'secondary' : 'ghost'} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
                  Filtres{activeFilters ? ` · ${activeFilters}` : ''}
                </Button>
              </div>
              <div className={s.chips}>
                <Segmented label="Niveau de détail" value={density} options={DENSITIES} onChange={setDensity} />
                <span className="ds-help">
                  {shown.length}/{visible.length}
                </span>
              </div>
              {pcs.length > 0 && (
                <div className={s.chips}>
                  <span className="ds-label">Suivre</span>
                  {pcs.map((c, i) => (
                    <Chip key={c.id} square color={THREAD_COLORS[i % THREAD_COLORS.length]} active={follow === c.id} onClick={() => startFollow(follow === c.id ? null : c.id)} title={`Suivre le fil de ${c.name}`}>
                      {c.name.split(' ')[0]}
                    </Chip>
                  ))}
                </div>
              )}
              {filtersOpen && (
                <>
                  {events.some((e) => eventOrigin(e) === 'recording') && (
                    <Toggle checked={showAuto} onChange={setShowAuto}>
                      Événements déduits des enregistrements
                    </Toggle>
                  )}
                  <div className={s.chips}>
                    {NARRATIVE_TYPES.filter((t) => t.category === 'narrative' && t.type !== 'narrative.note').map((t) => (
                      <Chip key={t.type} color={t.color} active={types.includes(t.type)} onClick={() => setTypes((xs) => (xs.includes(t.type) ? xs.filter((x) => x !== t.type) : [...xs, t.type]))}>
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                </>
              )}
              {linking && (
                <div className={s.linkingBanner}>
                  Mode liaison : cliquez sur un événement à relier.{' '}
                  <Button variant="link" size="sm" onClick={() => setLinking(null)}>
                    Terminer
                  </Button>
                </div>
              )}
            </div>
          }
        />
      </Panel>

      <Panel className={s.side}>
        {followed && mode !== 'add' && (
          <div className={s.threadBar} style={{ borderColor: threadColor }}>
            <div className="ds-grow" style={{ minWidth: 0 }}>
              <div className="ds-label" style={{ color: threadColor }}>
                Fil de {followed.name}
              </div>
              <span className="ds-help">{threadEvents.length ? (step >= 0 ? `Étape ${step + 1} / ${threadEvents.length}` : `${threadEvents.length} événement${threadEvents.length > 1 ? 's' : ''} · ← → pour parcourir`) : 'Aucun événement pour l’instant'}</span>
            </div>
            <IconButton label="Étape précédente" disabled={!threadEvents.length || step === 0} onClick={() => stepTo(step < 0 ? threadEvents.length - 1 : step - 1)}>
              ‹
            </IconButton>
            <IconButton label="Étape suivante" disabled={!threadEvents.length || step === threadEvents.length - 1} onClick={() => stepTo(step + 1)}>
              ›
            </IconButton>
            <IconButton label="Ne plus suivre" onClick={() => startFollow(null)}>
              ×
            </IconButton>
          </div>
        )}
        {mode === 'add' ? (
          <EventForm
            sessions={sessions}
            defaultSession={selectedEvent?.sessionNo ?? sessions}
            linkTo={selectedEvent ? [selectedEvent.id] : []}
            events={visible}
            onCancel={() => setMode(selectedEvent ? 'detail' : 'overview')}
            onCreated={(e) => {
              setSelected(e.id);
              setMode('detail');
            }}
          />
        ) : mode === 'detail' && selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            events={visible}
            links={links}
            linking={linking === selectedEvent.id}
            onLinking={(on) => setLinking(on ? selectedEvent.id : null)}
            onOpen={goTo}
            onClose={() => select(null)}
            onAddLinked={() => setMode('add')}
          />
        ) : followed ? (
          <ol className={s.threadList}>
            {threadEvents.map((e, i) => {
              const prev = threadEvents[i - 1];
              const newSession = !prev || (prev.sessionNo ?? 0) !== (e.sessionNo ?? 0);
              return (
                <li key={e.id}>
                  {newSession && <div className={s.threadSession}>{(e.sessionNo ?? 0) === 0 ? 'Prologue' : `Session ${e.sessionNo}`}</div>}
                  <button type="button" className={s.recentItem} onClick={() => goTo(e.id)}>
                    <span className={s.recentGem} style={{ background: eventTypeDef(e.type).color }} />
                    <span className="ds-grow">
                      <span className={s.recentTitle}>{e.title}</span>
                      <span className={s.recentMeta}>
                        {eventTypeDef(e.type).label} · {e.actors.some((a) => a.id === follow) ? 'acteur' : 'cible'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="ds-stack" style={{ gap: 16 }}>
            <div>
              <div className="ds-label">Chronique</div>
              <h2 className="ds-h2" style={{ fontSize: 26, color: 'var(--gold-light)' }}>
                {current?.name}
              </h2>
            </div>
            <div className={s.stats}>
              <div>
                <strong>{campaign?.stats.events ?? visible.length}</strong>
                <span>Événements</span>
              </div>
              <div>
                <strong>{campaign?.stats.sessions ?? sessions}</strong>
                <span>Sessions</span>
              </div>
              <div>
                <strong>{campaign?.stats.links ?? links.length}</strong>
                <span>Liens</span>
              </div>
            </div>
            <Button variant="primary" block onClick={() => setMode('add')}>
              + Noter un événement
            </Button>
            <p className="ds-help" style={{ margin: 0 }}>
              Vue d’ensemble : seuls les moments marquants sont nommés. Zoomez pour dévoiler les autres, cliquez un événement pour isoler ce qui lui est lié, ou suivez un personnage.
            </p>
            <Rule />
            <div className="ds-label" style={{ textAlign: 'center' }}>
              Dernières entrées
            </div>
            <div className={s.recent}>
              {[...visible]
                .sort((a, b) => b.seq - a.seq)
                .slice(0, 8)
                .map((e) => (
                  <button key={e.id} type="button" className={s.recentItem} onClick={() => goTo(e.id)}>
                    <span className={s.recentGem} style={{ background: eventTypeDef(e.type).color }} />
                    <span className="ds-grow">
                      <span className={s.recentTitle}>{e.title}</span>
                      <span className={s.recentMeta}>
                        Session {e.sessionNo ?? 0} · {eventOrigin(e) === 'recording' ? 'déduit de l’enregistrement' : `noté par ${e.author?.name ?? 'le système'}`}
                        {e.visibility === 'gm_only' && isGm ? ' · secret' : ''}
                      </span>
                    </span>
                  </button>
                ))}
              {visible.length === 0 && <p className="ds-help">Le grimoire est encore vierge : notez le premier événement de votre campagne.</p>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
