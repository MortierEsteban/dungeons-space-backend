import { describe, expect, it } from 'vitest';
import { bundleMinor } from './density';

describe('repli des détails mineurs', () => {
  const items = ['A', 'b', 'c', 'd', 'E', 'f', 'g', 'H'].map((id) => ({ id }));
  const minor = (x: { id: string }) => x.id === x.id.toLowerCase();

  it('replie les suites assez longues et laisse les autres en place', () => {
    const out = bundleMinor(items, minor, 3);
    expect(out.map((o) => (o.kind === 'bundle' ? o.items.map((i) => i.id).join('') : o.item.id))).toEqual(['A', 'bcd', 'E', 'f', 'g', 'H']);
  });

  it('replie aussi une suite en fin de liste', () => {
    const out = bundleMinor([{ id: 'A' }, { id: 'b' }, { id: 'c' }], minor, 2);
    expect(out.at(-1)).toMatchObject({ kind: 'bundle', id: 'bundle-b' });
  });
});
