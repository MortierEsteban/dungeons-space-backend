import { LINK_TYPES, NODE_KIND_META, NODE_KINDS, type LinkDto, type NodeDto, type NodeKind } from '@ds/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../shared/api/client';
import { Graph3D, type GraphEdge, type GraphNode } from '../../shared/graph/Graph3D';
import { useDebounced } from '../../shared/hooks';
import { Button, Chip, Empty, Field, IconButton, Input, Loading, Panel, Rule, Select, Tag, TextArea, Toggle } from '../../shared/ui/components';
import { useToast } from '../../shared/ui/toast';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useConstellation, useConstellationMutations, useSuggestions } from './api';
import { forceLayout, valenceColor } from './layout';
import s from './constellation.module.css';

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

  const nodes = data?.nodes ?? [];
  const links = data?.links ?? [];
  const positions = useMemo(() => forceLayout(nodes, links), [nodes, links]);

  const visibleLinks = links.filter((l) => l.intensity >= minIntensity && (polarity === 'all' || (polarity === 'pos' ? l.valence > 0 : l.valence < 0)));
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    color: n.color ?? NODE_KIND_META[n.kind].color,
    position: positions.get(n.id) ?? { x: 0, y: 0, z: 0 },
    shape: n.kind === 'pc' || n.kind === 'npc' ? 'circle' : 'diamond',
    muted: (kinds.length > 0 && !kinds.includes(n.kind)) || (!!query && !n.label.toLowerCase().includes(query.toLowerCase())),
    hint: NODE_KIND_META[n.kind].label,
  }));
  const edges: GraphEdge[] = visibleLinks.map((l) => ({ from: l.fromId, to: l.toId, color: valenceColor(l.valence), width: 1 + l.intensity * 0.5, opacity: 0.55, arrow: true, dashed: !l.playerVisible && isGm }));
  const node = nodes.find((n) => n.id === selected) ?? null;

  const onSelect = (id: string | null) => {
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
          nodes={graphNodes}
          edges={edges}
          selectedId={selected}
          onSelect={onSelect}
          linking={linking}
          overlay={
            <div className={s.filters} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <Input
                placeholder="Rechercher un nœud…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  const hit = nodes.find((n) => n.label.toLowerCase().includes(q.toLowerCase()));
                  if (e.key === 'Enter' && hit) onSelect(hit.id);
                }}
                aria-label="Rechercher un nœud (Entrée pour s'y rendre)"
              />
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
            </div>
          }
        />
      </Panel>
      <Panel className={s.side}>
        {mode === 'add' ? (
          <NodeForm onDone={() => setMode(node ? 'detail' : 'overview')} />
        ) : node ? (
          <NodeDetail
            node={node}
            nodes={nodes}
            links={links}
            isGm={isGm}
            onOpen={(id) => setSelected(id)}
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
              <p className="ds-help">Cliquez sur une entité pour voir ce qu’elle affecte et ce qui l’affecte. Liens bleus : alliance ; magenta : hostilité ; pointillés : cachés aux joueurs.</p>
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
                <strong>{links.filter((l) => l.valence < 0).length}</strong>
                <span>Hostilités</span>
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
