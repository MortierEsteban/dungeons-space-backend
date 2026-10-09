import type { EventDto, TranscriptSegmentDto } from '@ds/shared';
import { describe, expect, it } from 'vitest';
import { buildJournal, eventTime, packLane, segmentTimeIndex, speechHistogram, toPassages } from './journal';

const T0 = Date.parse('2026-10-09T20:00:00Z');
const seg = (seq: number, minute: number, text = 'une phrase', recordingId = 'r1'): TranscriptSegmentDto => ({
  id: `s${recordingId}${seq}`,
  recordingId,
  seq,
  speaker: null,
  text,
  offsetMs: minute * 60_000,
  durationMs: 2000,
  spokenAt: new Date(T0 + minute * 60_000).toISOString(),
  analyzed: true,
});
const ev = (id: string, minute: number, payload: Record<string, unknown> = {}): EventDto => ({
  id,
  seq: 1,
  campaignId: 'c',
  sessionNo: 1,
  correlationId: null,
  type: 'narrative.discovery',
  category: 'narrative',
  title: id,
  text: '',
  importance: 3,
  visibility: 'players',
  actors: [],
  targets: [],
  places: [],
  inGameDate: null,
  payload,
  source: 'system',
  author: null,
  occurredAt: new Date(T0 + minute * 60_000).toISOString(),
  corrected: false,
  retracted: false,
});

describe('journal de session', () => {
  it('regroupe la parole en passages séparés par les silences', () => {
    const passages = toPassages([seg(1, 0), seg(2, 0.2), seg(3, 0.4), seg(4, 5), seg(5, 5.1)]);
    expect(passages.map((p) => [p.from, p.to])).toEqual([
      [1, 3],
      [4, 5],
    ]);
  });

  it('coupe un passage trop long et ne mélange pas deux enregistrements', () => {
    expect(toPassages(Array.from({ length: 30 }, (_, i) => seg(i + 1, i * 0.1)), 45_000, 12)).toHaveLength(3);
    expect(toPassages([seg(1, 0, 'a', 'r1'), seg(1, 0.1, 'b', 'r2')])).toHaveLength(2);
  });

  it('place un événement automatique au moment où l’on en a parlé', () => {
    const segments = [seg(1, 2), seg(2, 3)];
    const auto = ev('auto', 10, { origin: 'recording', recordingId: 'r1', segments: [2, 2] });
    expect(eventTime(auto, segmentTimeIndex(segments))).toBe(T0 + 3 * 60_000);
    expect(eventTime(ev('manuel', 10), segmentTimeIndex(segments))).toBe(T0 + 10 * 60_000);
  });

  it('entrelace événements et parole, la parole d’abord à instant égal', () => {
    const journal = buildJournal([ev('a', 1), ev('b', 0)], toPassages([seg(1, 0)]));
    expect(journal.map((j) => (j.kind === 'event' ? j.event.id : 'parole'))).toEqual(['parole', 'b', 'a']);
  });
});

describe('frise de session', () => {
  it('empile les points proches au lieu de les superposer', () => {
    const rows = packLane(
      [
        { id: 'a', x: 10, r: 4 },
        { id: 'b', x: 12, r: 4 },
        { id: 'c', x: 14, r: 4 },
        { id: 'd', x: 100, r: 4 },
      ],
      6,
      5,
    );
    expect(new Set([rows.get('a'), rows.get('b'), rows.get('c')]).size).toBe(3);
    expect(rows.get('d')).toBe(0);
  });

  it('mesure la densité de parole', () => {
    const h = speechHistogram([seg(1, 0, 'un deux trois'), seg(2, 9, 'quatre')], T0, T0 + 10 * 60_000, 2);
    expect(h).toEqual([3, 1]);
  });
});
