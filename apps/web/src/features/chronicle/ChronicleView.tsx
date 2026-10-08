import { eventTypeDef, NARRATIVE_TYPES, type EventDto } from '@ds/shared';
import { useMemo, useState } from 'react';
import { Graph3D, type AxisMark, type GraphEdge, type GraphNode } from '../../shared/graph/Graph3D';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, Input, Loading, Panel, Rule } from '../../shared/ui/components';
import { useCampaign } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useCampaignCharacters } from '../character/api';
import { useChronicleMutations, useEventLinks, useNarrativeEvents } from './api';
import { EventDetail } from './EventDetail';
import { EventForm } from './EventForm';
import s from './chronicle.module.css';

const normalize = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Disposition 3D : un axe des sessions, chaque événement en couronne autour de sa session. */
function layout(events: EventDto[]) {
  const sessions = [...new Set(events.map((e) => e.sessionNo ?? 0))].sort((a, b) => a - b);
  const index = new Map(sessions.map((n, i) => [n, i]));
  const axis: AxisMark[] = sessions.map((n, i) => ({
    id: `axis-${n}`,
    label: n === 0 ? 'PROLOGUE' : `SESSION ${n}`,
    position: { x: (i - (sessions.length - 1) / 2) * 250, y: 0, z: 0 },
  }));
  const bySession = new Map<number, EventDto[]>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const n = e.sessionNo ?? 0;
    bySession.set(n, [...(bySession.get(n) ?? []), e]);
  }
  const positions = new Map<string, { x: number; y: number; z: number }>();
  for (const [n, list] of bySession) {
    const i = index.get(n)!;
    list.forEach((e, k) => {
      const a = (k / list.length) * Math.PI * 2 + n * 0.9;
      const r = 155 + (list.length > 8 ? (k % 2) * 40 : 0);
      positions.set(e.id, { x: (i - (sessions.length - 1) / 2) * 250, y: Math.sin(a) * r, z: Math.cos(a) * r });
    });
  }
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
  const mutations = useChronicleMutations(campaignId ?? '');

  /** En mode liaison, cliquer un événement crée (ou retire) le lien avec l'événement ouvert. */
  const toggleLink = (from: string, to: string) => {
    const existing = links.find((l) => (l.fromId === from && l.toId === to) || (l.fromId === to && l.toId === from));
    if (existing) mutations.unlink.mutate(existing.id);
    else mutations.link.mutate({ fromId: from, toId: to });
  };

  const visible = useMemo(() => events.filter((e) => !e.retracted), [events]);
  const pcs = characters.filter((c) => c.kind === 'pc');

  const matches = useMemo(() => {
    const u = normalize(query.trim());
    return new Set(
      visible
        .filter((e) => (!types.length || types.includes(e.type)) && (!chars.length || [...e.actors, ...e.targets].some((a) => a.id && chars.includes(a.id))) && (!u || normalize(`${e.title} ${e.text}`).includes(u)))
        .map((e) => e.id),
    );
  }, [visible, types, chars, query]);

  const { axis, nodes, edges } = useMemo(() => {
    const { axis, positions } = layout(visible);
    const nodes: GraphNode[] = visible.map((e) => ({
      id: e.id,
      label: e.title,
      color: eventTypeDef(e.type).color,
      position: positions.get(e.id)!,
      muted: !matches.has(e.id),
      hint: `${eventTypeDef(e.type).label}, session ${e.sessionNo ?? 0}`,
    }));
    const ids = new Set(visible.map((e) => e.id));
    const edges: GraphEdge[] = [
      ...visible.map((e) => ({ from: `axis-${e.sessionNo ?? 0}`, to: e.id, color: '#c9a96a', kind: 'spoke' as const, opacity: matches.has(e.id) ? 0.16 : 0.04 })),
      ...links.filter((l) => ids.has(l.fromId) && ids.has(l.toId)).map((l) => ({ from: l.fromId, to: l.toId, color: '#d8b3e0', opacity: matches.has(l.fromId) && matches.has(l.toId) ? 0.34 : 0.06 })),
    ];
    return { axis, nodes, edges };
  }, [visible, links, matches]);

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
                        Session {e.sessionNo ?? 0} · noté par {e.author?.name ?? 'le système'}
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

