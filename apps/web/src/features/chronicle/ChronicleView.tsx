import { eventOrigin, eventTypeDef, eventWeight, NARRATIVE_TYPES, type EventDto } from '@ds/shared';
import { useMemo, useState } from 'react';
import { Graph3D, type AxisMark, type GraphEdge, type GraphNode } from '../../shared/graph/Graph3D';
import { useDebounced, useLocalPref } from '../../shared/hooks';
import { Button, Chip, Input, Loading, Panel, Rule, Segmented, Toggle } from '../../shared/ui/components';
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
  const [chars, setChars] = useState<string[]>([]);
  const query = useDebounced(q, 150);
  const [flat, setFlat] = useLocalPref('chronicleFlat', false);
  const mutations = useChronicleMutations(campaignId ?? '');

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

  const matches = useMemo(() => {
    const u = normalize(query.trim());
    return new Set(
      visible
        .filter((e) => (!types.length || types.includes(e.type)) && (!chars.length || [...e.actors, ...e.targets].some((a) => a.id && chars.includes(a.id))) && (!u || normalize(`${e.title} ${e.text}`).includes(u)))
        .map((e) => e.id),
    );
  }, [visible, types, chars, query]);

  const filtering = types.length > 0 || chars.length > 0 || query.trim() !== '';

  /** Niveau de détail : les plus lourds par session, plus tout ce que cherchent les filtres et le voisinage de la sélection. */
  const shown = useMemo(() => {
    const keep = selectDensity(visible.map((e) => ({ id: e.id, group: e.sessionNo ?? 0, weight: weights.get(e.id) ?? 0 })), density, CAMPAIGN_DENSITY);
    if (filtering) for (const id of matches) keep.add(id);
    if (selected) {
      keep.add(selected);
      for (const l of links) if (l.fromId === selected || l.toId === selected) (keep.add(l.fromId), keep.add(l.toId));
    }
    return visible.filter((e) => keep.has(e.id));
  }, [visible, weights, density, filtering, matches, selected, links]);

  const { axis, nodes, edges } = useMemo(() => {
    const totals = new Map<number, number>();
    for (const e of visible) totals.set(e.sessionNo ?? 0, (totals.get(e.sessionNo ?? 0) ?? 0) + 1);
    const { axis, positions } = layout(shown, weights, totals);
    const nodes: GraphNode[] = shown.map((e) => {
      const w = weights.get(e.id) ?? 0.5;
      return {
        id: e.id,
        label: e.title,
        color: eventTypeDef(e.type).color,
        position: positions.get(e.id)!,
        muted: !matches.has(e.id),
        hint: `${eventTypeDef(e.type).label}, session ${e.sessionNo ?? 0}${eventOrigin(e) === 'recording' ? ', déduit de l’enregistrement' : ''}`,
        size: 0.65 + w * 0.7,
        pinLabel: w >= 0.9,
        quiet: w < 0.5,
      };
    });
    const ids = new Set(shown.map((e) => e.id));
    const edges: GraphEdge[] = [
      ...shown.map((e) => ({ from: `axis-${e.sessionNo ?? 0}`, to: e.id, color: '#c9a96a', kind: 'spoke' as const, opacity: matches.has(e.id) ? 0.06 + (weights.get(e.id) ?? 0) * 0.14 : 0.03 })),
      ...links.filter((l) => ids.has(l.fromId) && ids.has(l.toId)).map((l) => ({ from: l.fromId, to: l.toId, color: '#d8b3e0', opacity: matches.has(l.fromId) && matches.has(l.toId) ? 0.34 : 0.06 })),
    ];
    return { axis, nodes, edges };
  }, [visible, shown, weights, links, matches]);

  const selectedEvent = visible.find((e) => e.id === selected) ?? null;
  const sessions = Math.max(0, ...visible.map((e) => e.sessionNo ?? 0));

  const select = (id: string | null) => {
    setSelected(id);
    setMode(id ? 'detail' : 'overview');
  };

  if (isLoading) return <Loading />;

  return (
    <div className={s.layout}>
      <Panel pad={false} className={s.stagePanel}>
        <Graph3D
          ariaLabel="Chronique en trois dimensions"
          nodes={nodes}
          edges={edges}
          axis={axis}
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
              <Input placeholder="Rechercher dans la chronique…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans la chronique" />
              <div className={s.chips}>
                <Segmented label="Niveau de détail" value={density} options={DENSITIES} onChange={setDensity} />
                <span className="ds-help">
                  {shown.length}/{visible.length}
                </span>
              </div>
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
              {pcs.length > 0 && (
                <div className={s.chips}>
                  <span className="ds-label">Personnages</span>
                  {pcs.map((c) => (
                    <Chip key={c.id} square active={chars.includes(c.id)} onClick={() => setChars((xs) => (xs.includes(c.id) ? xs.filter((x) => x !== c.id) : [...xs, c.id]))}>
                      {c.name.split(' ')[0]}
                    </Chip>
                  ))}
                </div>
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
            onOpen={(id) => setSelected(id)}
            onClose={() => select(null)}
            onAddLinked={() => setMode('add')}
          />
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
            <Rule />
            <div className="ds-label" style={{ textAlign: 'center' }}>
              Dernières entrées
            </div>
            <div className={s.recent}>
              {[...visible]
                .sort((a, b) => b.seq - a.seq)
                .slice(0, 8)
                .map((e) => (
                  <button key={e.id} type="button" className={s.recentItem} onClick={() => select(e.id)}>
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

