import type { EventDto } from '@ds/shared';
import { describe, expect, it } from 'vitest';
import { characterThread, layout } from './ChronicleView';

const ev = (id: string, sessionNo: number, seq: number): EventDto =>
  ({ id, seq, sessionNo, type: 'narrative.note', category: 'narrative', payload: {}, actors: [], targets: [], importance: 2, source: 'gm' }) as unknown as EventDto;

describe('disposition 3D de la Chronique', () => {
  const events = [...Array.from({ length: 60 }, (_, i) => ev(`a${i}`, 1, i)), ev('b0', 2, 100), ev('b1', 2, 101)];
  const weights = new Map(events.map((e, i) => [e.id, i === 0 ? 1 : 0.2]));

  it('donne plus de place aux sessions chargées et indique les événements masqués', () => {
    const { axis, positions } = layout(events, weights, new Map([[1, 200]]));
    expect(axis.map((a) => a.label)).toEqual(['SESSION 1 · 60/200', 'SESSION 2']);
    const xs = (prefix: string) => events.filter((e) => e.id.startsWith(prefix)).map((e) => positions.get(e.id)!.x);
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(xs('a'))).toBeGreaterThan(spread(xs('b')));
    expect(Math.max(...xs('a'))).toBeLessThan(Math.min(...xs('b')));
  });

  it('rapproche de l’axe les événements les plus lourds', () => {
    const { positions } = layout(events, weights);
    const radius = (id: string) => Math.hypot(positions.get(id)!.y, positions.get(id)!.z);
    expect(radius('a0')).toBeLessThan(radius('a3'));
  });
});

describe('fil d’un personnage', () => {
  it('garde les événements où il agit ou subit, dans l’ordre de la Chronique', () => {
    const who = (id: string) => ({ kind: 'character' as const, id, name: id });
    const events = [
      { ...ev('c', 1, 3), actors: [who('brakk')] },
      { ...ev('a', 1, 1), targets: [who('brakk')] },
      { ...ev('b', 1, 2), actors: [who('elowen')] },
      { ...ev('d', 1, 4), actors: [{ kind: 'free' as const, id: 'brakk', name: 'Brakk' }] },
    ] as EventDto[];
    expect(characterThread(events, 'brakk').map((e) => e.id)).toEqual(['a', 'c']);
  });
});
