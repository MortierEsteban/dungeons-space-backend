import { eventTypeDef, LINK_TYPES, NODE_KIND_META, NODE_KINDS, type EventDto, type LinkDto, type NodeDto, type NodeKind } from '@ds/shared';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { Graph3D, type GraphEdge, type GraphHandle, type GraphNode } from '../../shared/graph/Graph3D';
import { useDebounced, useLocalPref } from '../../shared/hooks';
import { Button, Chip, Empty, Field, IconButton, Input, Loading, Panel, Rule, Select, Tag, TextArea, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useEventLinks, useNarrativeEvents } from '../chronicle/api';
import { useConstellation, useConstellationMutations, useSuggestions } from './api';
import { EVENT_PREFIX, eventGraph } from './eventGraph';
import { forceLayout, valenceColor } from './layout';
import s from './constellation.module.css';

const normalize = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Un événement de la Chronique vu depuis la Constellation : qui, quoi, contre qui. */
function EventCard({ event, isGm, onClose, onOpen, nodes, onPin }: { event: EventDto; isGm: boolean; onClose(): void; onOpen(id: string): void; nodes: NodeDto[]; onPin(): void }) {
  const def = eventTypeDef(event.type);
  const navigate = useNavigate();
  const nodeOf = (ref: EventDto['actors'][number]) => (ref.kind === 'character' ? nodes.find((n) => n.refType === 'character' && n.refId === ref.id) : ref.kind === 'node' ? nodes.find((n) => n.id === ref.id) : undefined);
  const Ref = ({ r }: { r: EventDto['actors'][number] }) => {
    const n = nodeOf(r);
    return n ? (
      <button type="button" className={s.refLink} onClick={() => onOpen(n.id)}>
        {r.name}
      </button>
    ) : (
      <span>{r.name}</span>
    );
  };
  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      <div className="ds-row" style={{ alignItems: 'flex-start' }}>
        <div className="ds-grow">
          <div className="ds-label" style={{ color: def.color }}>
            Événement · {def.label} · {event.sessionNo ? `session ${event.sessionNo}` : 'prologue'}
          </div>
          <h2 className="ds-h2" style={{ fontSize: 22, color: 'var(--gold-light)' }}>
            {event.title}
          </h2>
        </div>
        <IconButton label="Fermer" onClick={onClose}>
          ×
        </IconButton>
      </div>
      <div className="ds-row" style={{ gap: 6 }}>
        <Tag color={def.color}>Importance {event.importance}</Tag>
        {event.visibility === 'gm_only' && <Tag color="var(--magenta-light)">MJ seulement</Tag>}
        {event.inGameDate && <Tag>{event.inGameDate}</Tag>}
      </div>
      {event.text && <p className={s.desc}>{event.text}</p>}
      {event.actors.length > 0 && (
        <div className={s.refs}>
          <span className="ds-label">Acteurs</span>
          {event.actors.map((a, i) => (
            <Ref key={`a${i}`} r={a} />
          ))}
        </div>
      )}
      {event.targets.length > 0 && (
        <div className={s.refs}>
          <span className="ds-label">Cibles</span>
          {event.targets.map((t, i) => (
            <Ref key={`t${i}`} r={t} />
          ))}
        </div>
      )}
      {event.places.length > 0 && (
        <div className={s.refs}>
          <span className="ds-label">Lieux</span>
          {event.places.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      )}
      <Rule />
      <div className="ds-row">
        <Button variant="secondary" size="sm" onClick={() => navigate('/explorer?vue=chronique')}>
          Ouvrir la Chronique
        </Button>
        {isGm && (
          <Button variant="ghost" size="sm" onClick={onPin} title="En faire un nœud de la Constellation, que l'on peut relier à la main">
            Épingler comme nœud
          </Button>
        )}
      </div>
    </div>
  );
}

/** Préréglages de lien : choisir un préréglage puis cliquer la cible (≤ 3 interactions, CST-06). */
const PRESETS = [
  { type: 'connaît', valence: 0, intensity: 1, label: 'Connaît' },
  { type: 'aime', valence: 2, intensity: 2, label: 'Aime +2' },
  { type: 'a affecté', valence: -3, intensity: 3, label: 'A frappé −3' },
  { type: 'déteste', valence: -3, intensity: 3, label: 'Déteste −3' },
  { type: 'dirige', valence: 1, intensity: 3, label: 'Dirige' },
  { type: 'a causé', valence: -2, intensity: 3, label: 'A causé' },
];

function NodeForm({ onDone }: { onDone(): void }) {
  const { campaignId } = useCurrentCampaign();
  const { createNode } = useConstellationMutations(campaignId!);
  const toast = useToast();
  const [kind, setKind] = useState<NodeKind>('npc');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [visible, setVisible] = useState(false);
  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      <h2 className="ds-h2">Nouveau nœud</h2>
      <div className="ds-row" style={{ gap: 6 }}>
        {NODE_KINDS.map((k) => (
          <Chip key={k} color={NODE_KIND_META[k].color} active={kind === k} onClick={() => setKind(k)}>
            {NODE_KIND_META[k].label}
          </Chip>
        ))}
      </div>
      <Field label="Nom" htmlFor="node-label">
        <Input id="node-label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="Le Tavernier" />
      </Field>
      <Field label="Description" htmlFor="node-desc">
        <TextArea id="node-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Toggle checked={visible} onChange={setVisible}>
        Visible des joueurs
      </Toggle>
      <div className="ds-row">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button
          variant="primary"
          disabled={!label.trim() || createNode.isPending}
          onClick={() =>
            createNode.mutate(
              { kind, label: label.trim(), description, playerVisible: visible },
              { onSuccess: () => (toast('Nœud ajouté.', 'success'), onDone()), onError: (e) => toast(errorMessage(e), 'error') },
            )
          }
        >
          Ajouter
        </Button>
      </div>
    </div>
  );
}

function NodeDetail({ node, nodes, links, isGm, onOpen, onClose, linking, setLinking, preset, setPreset }: {
  node: NodeDto;
  nodes: NodeDto[];
  links: LinkDto[];
  isGm: boolean;
  onOpen(id: string): void;
  onClose(): void;
  linking: boolean;
  setLinking(on: boolean): void;
  preset: number;
  setPreset(i: number): void;
}) {
  const { campaignId } = useCurrentCampaign();
  const m = useConstellationMutations(campaignId!);
  const navigate = useNavigate();
  const name = (id: string) => nodes.find((n) => n.id === id)?.label ?? '?';
  const outgoing = links.filter((l) => l.fromId === node.id);
  const incoming = links.filter((l) => l.toId === node.id);
  const LinkRow = ({ l, dir }: { l: LinkDto; dir: 'out' | 'in' }) => (
    <div className={s.linkRow}>
      <span className={s.valence} style={{ background: valenceColor(l.valence) }}>
        {l.valence > 0 ? `+${l.valence}` : l.valence}
      </span>
      <button type="button" className={s.linkText} onClick={() => onOpen(dir === 'out' ? l.toId : l.fromId)}>
        {dir === 'out' ? (
          <>
            <em>{l.type}</em> → {name(l.toId)}
          </>
        ) : (
          <>
            {name(l.fromId)} → <em>{l.type}</em>
          </>
        )}
        {l.note && <span className={s.note}>{l.note}</span>}
      </button>
      {isGm && (
        <IconButton label="Supprimer le lien" onClick={() => m.deleteLink.mutate(l.id)}>
          ×
        </IconButton>
      )}
    </div>
  );
  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      <div className="ds-row" style={{ alignItems: 'flex-start' }}>
        <div className="ds-grow">
          <div className="ds-label" style={{ color: NODE_KIND_META[node.kind].color }}>
            {NODE_KIND_META[node.kind].label}
          </div>
          <h2 className="ds-h2" style={{ fontSize: 24, color: 'var(--gold-light)' }}>
            {node.label}
          </h2>
        </div>
        <IconButton label="Fermer" onClick={onClose}>
          ×
        </IconButton>
      </div>
      <div className="ds-row" style={{ gap: 6 }}>
        {node.playerVisible ? <Tag color="var(--arcane-light)">Visible des joueurs</Tag> : <Tag color="var(--magenta-light)">MJ seulement</Tag>}
        {node.refType === 'character' && (
          <Button variant="link" size="sm" onClick={() => navigate(`/personnage/${node.refId}`)}>
            Ouvrir la fiche →
          </Button>
        )}
      </div>
      {node.description && <p className={s.desc}>{node.description}</p>}
      <Rule />
      <div className="ds-label">Ce qu’il affecte · {outgoing.length}</div>
      {outgoing.map((l) => (
        <LinkRow key={l.id} l={l} dir="out" />
      ))}
      <div className="ds-label">Ce qui l’affecte · {incoming.length}</div>
      {incoming.map((l) => (
        <LinkRow key={l.id} l={l} dir="in" />
      ))}
      {isGm && (
        <>
          <Rule />
          <div className="ds-row">
            <Button variant={linking ? 'heal' : 'secondary'} onClick={() => setLinking(!linking)}>
              {linking ? 'Terminer' : 'Relier à…'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => m.updateNode.mutate({ id: node.id, playerVisible: !node.playerVisible })}>
              {node.playerVisible ? 'Cacher aux joueurs' : 'Montrer aux joueurs'}
            </Button>
            <Button variant="danger" size="sm" onClick={() => window.confirm(`Retirer « ${node.label} » de la Constellation ?`) && (m.deleteNode.mutate(node.id), onClose())}>
              Supprimer
            </Button>
          </div>
          {linking && (
            <div className="ds-stack" style={{ gap: 6 }}>
              <span className="ds-help">Choisissez la relation, puis cliquez la cible sur la carte.</span>
              <div className="ds-row" style={{ gap: 6 }}>
                {PRESETS.map((p, i) => (
                  <Chip key={p.label} color={valenceColor(p.valence)} active={preset === i} onClick={() => setPreset(i)}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ConstellationView() {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data, isLoading } = useConstellation(campaignId);
  const { data: suggestions = [] } = useSuggestions(campaignId, isGm);
  const m = useConstellationMutations(campaignId ?? '');
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'overview' | 'detail' | 'add'>('overview');
  const [linking, setLinking] = useState(false);
  const [preset, setPreset] = useState(0);
  const [kinds, setKinds] = useState<NodeKind[]>([]);
  const [polarity, setPolarity] = useState<'all' | 'pos' | 'neg'>('all');
  const [minIntensity, setMinIntensity] = useState(0);
  const [q, setQ] = useState('');
  const query = useDebounced(q, 150);
  const [flat, setFlat] = useLocalPref('constellationFlat', true);
  const [showEvents, setShowEvents] = useLocalPref('constellationEvents', true);
  const [eventImportance, setEventImportance] = useLocalPref('constellationEventImportance', 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const graph = useRef<GraphHandle>(null);
  const { data: events = [] } = useNarrativeEvents(showEvents ? campaignId : null);
  const { data: eventLinks = [] } = useEventLinks(showEvents ? campaignId : null);

  const nodes = data?.nodes ?? [];
  const links = data?.links ?? [];
  const evGraph = useMemo(() => (showEvents ? eventGraph(nodes, events, eventLinks, eventImportance) : { events: [], edges: [] }), [showEvents, nodes, events, eventLinks, eventImportance]);
  const positions = useMemo(
    () => forceLayout([...nodes, ...evGraph.events.map((e) => ({ id: e.id }))], [...links, ...evGraph.edges], flat),
    [nodes, links, evGraph, flat],
  );
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of [...links, ...evGraph.edges]) for (const k of [l.fromId, l.toId]) d.set(k, (d.get(k) ?? 0) + 1);
    return d;
  }, [links, evGraph]);

  const matches = (label: string) => !query || normalize(label).includes(normalize(query));
  const visibleLinks = links.filter((l) => l.intensity >= minIntensity && (polarity === 'all' || (polarity === 'pos' ? l.valence > 0 : l.valence < 0)));
  const graphNodes: GraphNode[] = [
    ...nodes.map((n) => ({
      id: n.id,
      label: n.label,
      color: n.color ?? NODE_KIND_META[n.kind].color,
      position: positions.get(n.id) ?? { x: 0, y: 0, z: 0 },
      shape: n.kind === 'pc' || n.kind === 'npc' ? ('circle' as const) : ('diamond' as const),
      muted: (kinds.length > 0 && !kinds.includes(n.kind)) || !matches(n.label),
      hint: NODE_KIND_META[n.kind].label,
      size: 1 + Math.min(0.5, (degree.get(n.id) ?? 0) * 0.05),
      pinLabel: n.kind === 'pc' || n.kind === 'faction' || (degree.get(n.id) ?? 0) >= 5,
    })),
    ...evGraph.events.map(({ id, event }) => ({
      id,
      label: event.title,
      color: eventTypeDef(event.type).color,
      position: positions.get(id) ?? { x: 0, y: 0, z: 0 },
      shape: 'diamond' as const,
      muted: (kinds.length > 0 && !kinds.includes('event')) || !matches(event.title),
      hint: `${eventTypeDef(event.type).label}, session ${event.sessionNo ?? 0}`,
      size: 0.7 + event.importance * 0.08,
      pinLabel: event.importance >= 5,
    })),
  ];
  const edges: GraphEdge[] = [
    ...visibleLinks.map((l) => ({ from: l.fromId, to: l.toId, color: valenceColor(l.valence), width: 1 + l.intensity * 0.5, opacity: 0.55, arrow: true, dashed: !l.playerVisible && isGm, label: l.type })),
    ...evGraph.edges.map((e) => ({ from: e.fromId, to: e.toId, color: e.color, width: 1, opacity: 0.3, arrow: e.role !== 'chain', dashed: e.role === 'chain', label: e.role === 'chain' ? 'lié à' : e.role === 'actor' ? `acteur · ${e.label}` : `cible · ${e.label}` })),
  ];
  const node = nodes.find((n) => n.id === selected) ?? null;
  const selectedEvent = selected?.startsWith(EVENT_PREFIX) ? (evGraph.events.find((e) => e.id === selected)?.event ?? null) : null;

  const goTo = (id: string) => {
    onSelect(id);
    graph.current?.focus(id);
  };

  const onSelect = (id: string | null) => {
    if (linking && id?.startsWith(EVENT_PREFIX)) {
      toast('Épinglez d’abord cet événement comme nœud pour le relier.', 'info');
      return;
    }
    if (linking && selected && id && id !== selected) {
      const p = PRESETS[preset]!;
      m.createLink.mutate(
        { fromId: selected, toId: id, type: p.type, valence: p.valence, intensity: p.intensity, playerVisible: false },
        { onSuccess: () => toast(`Lien créé : ${node?.label} — ${p.type} → ${nodes.find((n) => n.id === id)?.label}`, 'success'), onError: (e) => toast(errorMessage(e), 'error') },
      );
      return;
    }
    setLinking(false);
    setSelected(id);
    setMode(id ? 'detail' : 'overview');
  };

  if (isLoading) return <Loading />;
  if (!isGm && nodes.length === 0) {
    return (
      <Panel>
        <Empty title="La Constellation est gardée par le MJ.">Votre MJ n’a pas encore partagé de relations avec les joueurs.</Empty>
      </Panel>
    );
  }

  return (
    <div className={s.layout}>
      <Panel pad={false} className={s.stagePanel}>
        <Graph3D
          ariaLabel="Constellation des relations"
          handle={graph}
          nodes={graphNodes}
          edges={edges}
          selectedId={selected}
          onSelect={onSelect}
          linking={linking}
          flat={flat}
          onToggleFlat={() => setFlat(!flat)}
          legend={
            <>
              {NODE_KINDS.filter((k) => k !== 'event' || evGraph.events.length || nodes.some((n) => n.kind === 'event')).map((k) => (
                <span key={k} className={s.legendItem}>
                  <i style={{ background: NODE_KIND_META[k].color }} className={k === 'pc' || k === 'npc' ? s.dot : s.gem} />
                  {NODE_KIND_META[k].label}
                </span>
              ))}
              <span className={s.legendItem}>
                <i className={s.line} style={{ background: '#4fb3ff' }} />
                Alliance
              </span>
              <span className={s.legendItem}>
                <i className={s.line} style={{ background: '#b0306a' }} />
                Hostilité
              </span>
            </>
          }
          overlay={
            <div className={s.filters} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <div className="ds-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <Input
                  placeholder="Rechercher un nœud ou un événement…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    const hit = graphNodes.find((n) => !n.muted && matches(n.label));
                    if (e.key === 'Enter' && hit) goTo(hit.id);
                  }}
                  aria-label="Rechercher (Entrée pour s'y rendre)"
                />
                <Button size="sm" variant={filtersOpen ? 'secondary' : 'ghost'} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
                  Filtres{kinds.length || polarity !== 'all' || minIntensity ? ' •' : ''}
                </Button>
              </div>
              <div className="ds-row" style={{ gap: 6 }}>
                <Toggle checked={showEvents} onChange={setShowEvents}>
                  Événements de la Chronique{showEvents ? ` · ${evGraph.events.length}` : ''}
                </Toggle>
              </div>
              {filtersOpen && (
              <>
              {showEvents && (
                <Select value={eventImportance} onChange={(e) => setEventImportance(Number(e.target.value))} aria-label="Importance minimale des événements" style={{ minHeight: 32, padding: '4px 30px 4px 10px', fontSize: 13 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <option key={i} value={i}>
                      {i === 1 ? 'Tous les événements' : `Événements d’importance ≥ ${i}`}
                    </option>
                  ))}
                </Select>
              )}
              <div className="ds-row" style={{ gap: 6 }}>
                {NODE_KINDS.map((k) => (
                  <Chip key={k} color={NODE_KIND_META[k].color} active={kinds.includes(k)} onClick={() => setKinds((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]))}>
                    {NODE_KIND_META[k].label}
                  </Chip>
                ))}
              </div>
              <div className="ds-row" style={{ gap: 6 }}>
                <Chip active={polarity === 'all'} onClick={() => setPolarity('all')}>
                  Tous liens
                </Chip>
                <Chip color="#4fb3ff" active={polarity === 'pos'} onClick={() => setPolarity('pos')}>
                  Alliés
                </Chip>
                <Chip color="#b0306a" active={polarity === 'neg'} onClick={() => setPolarity('neg')}>
                  Hostiles
                </Chip>
                <Select value={minIntensity} onChange={(e) => setMinIntensity(Number(e.target.value))} aria-label="Intensité minimale" style={{ width: 'auto', minHeight: 32, padding: '4px 30px 4px 10px', fontSize: 13 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <option key={i} value={i}>
                      Intensité ≥ {i}
                    </option>
                  ))}
                </Select>
              </div>
              </>
              )}
            </div>
          }
        />
      </Panel>
      <Panel className={s.side}>
        {mode === 'add' ? (
          <NodeForm onDone={() => setMode(node ? 'detail' : 'overview')} />
        ) : selectedEvent ? (
          <EventCard
            event={selectedEvent}
            isGm={isGm}
            nodes={nodes}
            onClose={() => onSelect(null)}
            onOpen={goTo}
            onPin={() =>
              m.createNode.mutate(
                { kind: 'event', label: selectedEvent.title, description: selectedEvent.text, refType: 'event', refId: selectedEvent.id, playerVisible: selectedEvent.visibility !== 'gm_only' },
                { onSuccess: (n) => (toast('Événement épinglé dans la Constellation.', 'success'), setSelected(n.id)), onError: (e) => toast(errorMessage(e), 'error') },
              )
            }
          />
        ) : node ? (
          <NodeDetail
            node={node}
            nodes={nodes}
            links={links}
            isGm={isGm}
            onOpen={goTo}
            onClose={() => onSelect(null)}
            linking={linking}
            setLinking={setLinking}
            preset={preset}
            setPreset={setPreset}
          />
        ) : (
          <div className="ds-stack" style={{ gap: 14 }}>
            <div>
              <div className="ds-label">Constellation</div>
              <h2 className="ds-h2" style={{ fontSize: 24, color: 'var(--gold-light)' }}>
                Qui affecte qui ?
              </h2>
              <p className="ds-help">
                Cliquez sur une entité pour voir ce qu’elle affecte et ce qui l’affecte ; double-cliquez pour la centrer. Les losanges roses sont les événements de la Chronique, reliés à
                leurs acteurs et à leurs cibles. Liens bleus : alliance ; magenta : hostilité ; pointillés : cachés aux joueurs.
              </p>
            </div>
            <div className={s.stats}>
              <div>
                <strong>{nodes.length}</strong>
                <span>Nœuds</span>
              </div>
              <div>
                <strong>{links.length}</strong>
                <span>Liens</span>
              </div>
              <div>
                <strong>{evGraph.events.length}</strong>
                <span>Événements</span>
              </div>
            </div>
            {isGm && (
              <Button variant="primary" block onClick={() => setMode('add')}>
                + Ajouter un nœud
              </Button>
            )}
            {isGm && suggestions.length > 0 && (
              <>
                <Rule />
                <div className="ds-label">Suggestions de la Chronique · {suggestions.length}</div>
                {suggestions.map((sg) => {
                  const from = nodes.find((n) => n.id === sg.fromId)?.label;
                  const to = nodes.find((n) => n.id === sg.toId)?.label;
                  return (
                    <div key={sg.key} className={s.suggestion}>
                      <span className={s.valence} style={{ background: valenceColor(sg.valence) }}>
                        {sg.valence > 0 ? `+${sg.valence}` : sg.valence}
                      </span>
                      <span className="ds-grow">
                        <strong>{from}</strong> — {sg.type} → <strong>{to}</strong>
                        <span className={s.note}>d’après « {sg.eventTitle} »</span>
                      </span>
                      <Button
                        size="sm"
                        variant="heal"
                        onClick={() => m.createLink.mutate({ fromId: sg.fromId, toId: sg.toId, type: sg.type, valence: sg.valence, intensity: Math.min(5, Math.abs(sg.valence)), sourceEventId: sg.eventId, note: sg.eventTitle })}
                      >
                        Accepter
                      </Button>
                    </div>
                  );
                })}
              </>
            )}
            {isGm && nodes.length === 0 && <Empty title="Aucune étoile pour l’instant.">Les personnages créés apparaissent ici automatiquement ; ajoutez lieux, factions et mystères.</Empty>}
            <p className="ds-help">Types de liens : {LINK_TYPES.join(', ')}.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
