import { describe, expect, it } from 'vitest';
import type { EventDto } from './chronicle';
import { eventWeight, selectByWeight } from './weight';

const ev = (patch: Partial<EventDto> = {}): EventDto => ({
  id: 'e',
  seq: 1,
  campaignId: 'c',
  sessionNo: 1,
  correlationId: null,
  type: 'narrative.note',
  category: 'narrative',
  title: 't',
  text: '',
  importance: 2,
  visibility: 'players',
  actors: [],
  targets: [],
  places: [],
  inGameDate: null,
  payload: {},
  source: 'gm',
  author: null,
  occurredAt: '2026-01-01T00:00:00Z',
  corrected: false,
  retracted: false,
  ...patch,
});

describe('poids des événements', () => {
  it('croît avec l’importance et reste borné', () => {
    const ws = [1, 2, 3, 4, 5].map((importance) => eventWeight(ev({ importance })));
    expect(ws).toEqual([...ws].sort((a, b) => a - b));
    expect(Math.max(...ws)).toBeLessThanOrEqual(1);
    expect(eventWeight(ev({ importance: 5 }))).toBeGreaterThanOrEqual(0.95);
  });

  it('pondère les événements automatiques par la confiance de l’analyse', () => {
    const manual = eventWeight(ev({ importance: 3 }));
    const sure = eventWeight(ev({ importance: 3, source: 'system', payload: { origin: 'recording', confidence: 0.95 } }));
    const unsure = eventWeight(ev({ importance: 3, source: 'system', payload: { origin: 'recording', confidence: 0.2 } }));
    expect(manual).toBeGreaterThan(sure);
    expect(sure).toBeGreaterThan(unsure);
  });

  it('récompense les liens et les personnages impliqués', () => {
    const lone = eventWeight(ev());
    const linked = eventWeight(ev(), 2);
    const cast = eventWeight(ev({ actors: [{ kind: 'free', id: null, name: 'A' }], targets: [{ kind: 'free', id: null, name: 'B' }] }));
    expect(linked).toBeGreaterThan(lone);
    expect(cast).toBeGreaterThan(lone);
  });
});

describe('niveau de détail', () => {
  const items = [
    ...Array.from({ length: 50 }, (_, i) => ({ id: `a${i}`, group: 1, weight: 0.3 + (i % 5) * 0.1 })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, group: 2, weight: 0.1 })),
  ];

  it('garde tout sous le budget', () => {
    expect(selectByWeight(items, { budget: 100, perGroupMin: 2 }).size).toBe(items.length);
  });

  it('garantit un minimum par session et respecte le budget', () => {
    const kept = selectByWeight(items, { budget: 12, perGroupMin: 3 });
    expect(kept.size).toBe(12);
    expect(['b0', 'b1', 'b2'].every((id) => kept.has(id))).toBe(true);
  });

  it('garde toujours les événements au-dessus du seuil', () => {
    const kept = selectByWeight([...items, { id: 'key', group: 1, weight: 0.97 }], { budget: 5, perGroupMin: 1, alwaysAbove: 0.95 });
    expect(kept.has('key')).toBe(true);
  });
});
