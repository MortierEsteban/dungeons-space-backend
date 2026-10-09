import { describe, expect, it } from 'vitest';
import { highlightRanges } from './TranscriptsView';

describe('surlignage des transcriptions', () => {
  it('retrouve chaque mot sans tenir compte des accents ni de la casse', () => {
    const text = 'Le MAÎTRE a forgé le marteau du maître';
    const marked = highlightRanges(text, 'maitre forge').map(([a, b]) => text.slice(a, b));
    expect(marked).toEqual(['MAÎTRE', 'forgé', 'maître']);
  });

  it('fusionne les plages qui se chevauchent', () => {
    expect(highlightRanges('abcdef', 'abc bcd')).toEqual([[0, 4]]);
    expect(highlightRanges('abc', '  ')).toEqual([]);
  });
});
