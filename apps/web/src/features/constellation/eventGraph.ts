import { eventTypeDef, eventWeight, type EventDto, type EventLinkDto, type NodeDto } from '@ds/shared';
import { GRAPH_DENSITY, selectDensity, type Density } from '../chronicle/density';
import { valenceColor, type LayoutLink } from './layout';

/** Préfixe des nœuds dérivés des événements de la Chronique (jamais confondus avec les nœuds stockés). */
export const EVENT_PREFIX = 'ev:';

export interface EventEdge extends LayoutLink {
  color: string;
  label: string;
  role: 'actor' | 'target' | 'chain';
}

export interface EventGraph {
  /** Événements affichés comme étoiles, avec leur nombre de liens et leur poids d'affichage. */
  events: { id: string; event: EventDto; degree: number; weight: number }[];
  edges: EventEdge[];
  /** Événements écartés par le niveau de détail. */
  hidden: number;
}

/**
 * Les événements narratifs de la Chronique deviennent des étoiles de la Constellation :
 * chacun est relié à ses acteurs et à ses cibles présents dans le graphe (personnages ou nœuds),
 * et aux événements qu'on lui a liés dans la Chronique. Un événement déjà épinglé comme nœud
 * de la Constellation n'est pas dupliqué. Le niveau de détail garde les plus lourds (importance, liens,
 * personnages impliqués, confiance de l'analyse) pour que des centaines d'événements ne noient pas le graphe.
 */
export function eventGraph(nodes: readonly NodeDto[], events: readonly EventDto[], links: readonly EventLinkDto[], minImportance = 1, density: Density = 'all'): EventGraph {
  const byCharacter = new Map(nodes.filter((n) => n.refType === 'character' && n.refId).map((n) => [n.refId!, n.id]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const pinned = new Set(nodes.filter((n) => n.refType === 'event' && n.refId).map((n) => n.refId!));
  const shown = events.filter((e) => !e.retracted && !pinned.has(e.id) && e.importance >= minImportance);
  const shownIds = new Set(shown.map((e) => e.id));
  const resolve = (ref: EventDto['actors'][number]) => (ref.kind === 'character' && ref.id ? byCharacter.get(ref.id) : ref.kind === 'node' && ref.id && nodeIds.has(ref.id) ? ref.id : undefined);

  const edges: EventEdge[] = [];
  for (const e of shown) {
    const def = eventTypeDef(e.type);
    const color = def.valence !== undefined ? valenceColor(def.valence) : def.color;
    const id = EVENT_PREFIX + e.id;
    const seen = new Set<string>();
    for (const a of e.actors) {
      const n = resolve(a);
      if (n && !seen.has(n)) {
        seen.add(n);
        edges.push({ fromId: n, toId: id, color, label: def.label, role: 'actor' });
      }
    }
    for (const t of e.targets) {
      const n = resolve(t);
      if (n && !seen.has(n)) {
        seen.add(n);
        edges.push({ fromId: id, toId: n, color, label: def.label, role: 'target' });
      }
    }
  }
  for (const l of links) {
    if (shownIds.has(l.fromId) && shownIds.has(l.toId)) edges.push({ fromId: EVENT_PREFIX + l.fromId, toId: EVENT_PREFIX + l.toId, color: '#d8b3e0', label: 'lié à', role: 'chain' });
  }
  const degree = new Map<string, number>();
  for (const ed of edges) for (const k of [ed.fromId, ed.toId]) degree.set(k, (degree.get(k) ?? 0) + 1);
  const stars = shown.map((event) => {
    const id = EVENT_PREFIX + event.id;
    const d = degree.get(id) ?? 0;
    return { id, event, degree: d, weight: eventWeight(event, d) };
  });
  const keep = selectDensity(stars.map((s) => ({ id: s.id, group: s.event.sessionNo ?? 0, weight: s.weight })), density, GRAPH_DENSITY);
  const isKept = (id: string) => !id.startsWith(EVENT_PREFIX) || keep.has(id);
  return { events: stars.filter((s) => keep.has(s.id)), edges: edges.filter((e) => isKept(e.fromId) && isKept(e.toId)), hidden: stars.length - keep.size };
}
