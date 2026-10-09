import { describe, expect, it } from 'vitest';
import { hops, labelAlpha, markerSize, type GraphEdge } from './Graph3D';

describe('lisibilité progressive du graphe', () => {
  it('ne nomme à la vue d’ensemble que les plus lourds, puis dévoile les autres en zoomant', () => {
    expect(labelAlpha(0.6, 1)).toBe(0);
    expect(labelAlpha(0.6, 2)).toBe(1);
    expect(labelAlpha(0.2, 2)).toBe(0);
    expect(labelAlpha(0.2, 3)).toBe(1);
  });

  it('dimensionne les repères selon le poids', () => {
    expect(markerSize(0)).toBeLessThan(markerSize(0.5));
    expect(markerSize(1)).toBe(24);
    expect(markerSize(5)).toBe(24);
  });

  it('mesure le voisinage en sauts, sans passer par les rayons de l’axe', () => {
    const edges: GraphEdge[] = [
      { from: 'a', to: 'b', color: '' },
      { from: 'b', to: 'c', color: '' },
      { from: 'c', to: 'd', color: '' },
      { from: 'axis', to: 'a', color: '', kind: 'spoke' },
      { from: 'axis', to: 'z', color: '', kind: 'spoke' },
    ];
    const d = hops(edges, ['a'], 2);
    expect([...d.entries()].sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });
});
