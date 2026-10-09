import type { EventDto, NodeDto } from '@ds/shared';
import { describe, expect, it } from 'vitest';
import { EVENT_PREFIX, eventGraph } from './eventGraph';

const node = (id: string, extra: Partial<NodeDto> = {}): NodeDto => ({
  id, kind: 'npc', label: id, description: '', refType: null, refId: null, color: null, playerVisible: true, pinned: false, position: null, ...extra,
});
const event = (id: string, extra: Partial<EventDto> = {}): EventDto => ({
  id, seq: 1, campaignId: 'c', sessionNo: 1, correlationId: null, type: 'social.betrayed', category: 'social', title: id, text: '', importance: 3, visibility: 'players',
  actors: [], targets: [], places: [], inGameDate: null, payload: {}, source: 'gm', author: null, occurredAt: '', corrected: false, retracted: false, ...extra,
});

describe('événements de la Chronique dans la Constellation', () => {
  const nodes = [node('n-elowen', { kind: 'pc', refType: 'character', refId: 'elowen' }), node('n-culte', { kind: 'faction' }), node('n-pinned', { kind: 'event', refType: 'event', refId: 'e-pinned' })];

  it('relie chaque événement à ses acteurs et à ses cibles présents dans le graphe', () => {
    const g = eventGraph(nodes, [event('e1', { actors: [{ kind: 'character', id: 'elowen', name: 'Elowen' }], targets: [{ kind: 'node', id: 'n-culte', name: 'Culte' }, { kind: 'free', id: null, name: 'Inconnu' }] })], []);
    expect(g.events.map((e) => e.id)).toEqual([`${EVENT_PREFIX}e1`]);
    expect(g.edges.map((e) => [e.fromId, e.toId, e.role])).toEqual([
      ['n-elowen', `${EVENT_PREFIX}e1`, 'actor'],
      [`${EVENT_PREFIX}e1`, 'n-culte', 'target'],
    ]);
    // Trahison : lien hostile.
    expect(g.edges[0]!.color).toBe('#b0306a');
  });

  it('écarte les événements retirés, déjà épinglés ou trop mineurs, et suit les liens entre événements', () => {
    const events = [event('e1'), event('e2', { importance: 1 }), event('e3', { retracted: true }), event('e-pinned'), event('e4')];
    const g = eventGraph(nodes, events, [{ id: 'l', fromId: 'e1', toId: 'e4' }], 2);
    expect(g.events.map((e) => e.event.id)).toEqual(['e1', 'e4']);
    expect(g.edges).toEqual([expect.objectContaining({ fromId: `${EVENT_PREFIX}e1`, toId: `${EVENT_PREFIX}e4`, role: 'chain' })]);
  });

  it('garde les étoiles les plus lourdes quand le niveau de détail l’exige', () => {
    const many = Array.from({ length: 80 }, (_, i) => event(`m${i}`, { importance: i === 7 ? 5 : 2, actors: [{ kind: 'character', id: 'elowen', name: 'Elowen' }] }));
    const g = eventGraph(nodes, many, [], 1, 'essential');
    expect(g.events.length).toBeLessThan(many.length);
    expect(g.hidden).toBe(many.length - g.events.length);
    expect(g.events.map((e) => e.event.id)).toContain('m7');
    const kept = new Set(g.events.map((e) => e.id));
    expect(g.edges.every((e) => kept.has(e.toId))).toBe(true);
  });
});
