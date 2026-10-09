import { describe, expect, it } from 'vitest';
import { SegmentQueue } from './queue';

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe('file d’envoi de la transcription', () => {
  it('numérote les phrases et calcule leur ancienneté à l’envoi', () => {
    const q = new SegmentQueue('k', new MemoryStorage());
    q.push({ text: 'Bonjour', startedAt: 1000, endedAt: 1800 });
    q.push({ text: 'Entrez', startedAt: 2000, endedAt: 2500 });
    expect(q.batch(10, 5000)).toEqual([
      { clientSeq: 0, text: 'Bonjour', speaker: null, ageMs: 4000, durationMs: 800 },
      { clientSeq: 1, text: 'Entrez', speaker: null, ageMs: 3000, durationMs: 500 },
    ]);
    expect(q.batch(1, 5000)).toHaveLength(1);
  });

  it('ne retire que ce qui a été accusé et survit à un rechargement', () => {
    const storage = new MemoryStorage();
    const q = new SegmentQueue('k', storage);
    q.push({ text: 'a', startedAt: 0, endedAt: 0 });
    q.push({ text: 'b', startedAt: 0, endedAt: 0 });
    q.ack([0]);
    const reloaded = new SegmentQueue('k', storage);
    expect(reloaded.size).toBe(1);
    expect(reloaded.nextSeq).toBe(2);
    expect(reloaded.batch(10, 0)[0]!.text).toBe('b');
  });

  it('reprend la numérotation du serveur sans jamais reculer', () => {
    const q = new SegmentQueue('k', new MemoryStorage());
    q.ensureSeq(42);
    expect(q.push({ text: 'x', startedAt: 0, endedAt: 0 })).toBe(42);
    q.ensureSeq(10);
    expect(q.nextSeq).toBe(43);
  });
});
