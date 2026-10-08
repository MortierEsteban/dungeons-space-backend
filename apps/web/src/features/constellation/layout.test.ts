import type { LinkDto, NodeDto } from '@ds/shared';
import { describe, expect, it } from 'vitest';
import { forceLayout, valenceColor } from './layout';

const node = (id: string, extra: Partial<NodeDto> = {}): NodeDto => ({
  id, kind: 'npc', label: id, description: '', refType: null, refId: null, color: null, playerVisible: false, pinned: false, position: null, ...extra,
});
const link = (fromId: string, toId: string): LinkDto => ({ id: `${fromId}-${toId}`, fromId, toId, type: 'connaît', valence: 0, intensity: 1, note: '', playerVisible: false, sourceEventId: null });

describe('disposition de la Constellation', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id));
  const links = [link('a', 'b'), link('b', 'c')];

  it('est déterministe (même carte à chaque visite)', () => {
    expect(forceLayout(nodes, links)).toEqual(forceLayout(nodes, links));
  });

  it('respecte les nœuds épinglés et la vue à plat', () => {
    const pinned = [...nodes, node('e', { pinned: true, position: { x: 500, y: 10, z: -20 } })];
    expect(forceLayout(pinned, links).get('e')).toEqual({ x: 500, y: 10, z: -20 });
    for (const p of forceLayout(nodes, links, true).values()) expect(p.z).toBe(0);
  });

  it('rapproche les nœuds liés', () => {
    const pos = forceLayout(nodes, links);
    const d = (x: string, y: string) => Math.hypot(pos.get(x)!.x - pos.get(y)!.x, pos.get(x)!.y - pos.get(y)!.y, pos.get(x)!.z - pos.get(y)!.z);
    expect(d('a', 'b')).toBeLessThan(d('a', 'd') + 1);
  });

  it('colore les liens selon leur polarité', () => {
    expect(valenceColor(-4)).toBe('#b0306a');
    expect(valenceColor(0)).toBe('#c9a96a');
    expect(valenceColor(3)).toBe('#4fb3ff');
  });
});
