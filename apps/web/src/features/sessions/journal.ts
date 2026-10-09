import { eventWeight, type EventCategory, type EventDto, type TranscriptSegmentDto } from '@ds/shared';

/** Un passage : des phrases consécutives de la transcription, regroupées pour rester lisibles. */
export interface Passage {
  id: string;
  recordingId: string;
  from: number;
  to: number;
  startAt: number;
  endAt: number;
  segments: TranscriptSegmentDto[];
}

export type JournalEntry = { kind: 'event'; at: number; event: EventDto; weight: number } | { kind: 'passage'; at: number; passage: Passage };

/** Regroupe la transcription en passages : une pause de plus de `gapMs` ou un passage trop long ouvre le suivant. */
export function toPassages(segments: readonly TranscriptSegmentDto[], gapMs = 45_000, maxSegments = 12): Passage[] {
  const out: Passage[] = [];
  for (const s of [...segments].sort((a, b) => Date.parse(a.spokenAt) - Date.parse(b.spokenAt) || a.seq - b.seq)) {
    const at = Date.parse(s.spokenAt);
    const last = out[out.length - 1];
    if (last && last.recordingId === s.recordingId && at - last.endAt <= gapMs && last.segments.length < maxSegments) {
      last.segments.push(s);
      last.to = s.seq;
      last.endAt = at + s.durationMs;
    } else {
      out.push({ id: `p-${s.id}`, recordingId: s.recordingId, from: s.seq, to: s.seq, startAt: at, endAt: at + s.durationMs, segments: [s] });
    }
  }
  return out;
}

/** Les événements et la parole, dans l'ordre où ils se sont produits. */
export function buildJournal(
  events: readonly EventDto[],
  passages: readonly Passage[],
  { degree = new Map(), segmentTimes }: { degree?: ReadonlyMap<string, number>; segmentTimes?: ReadonlyMap<string, number> } = {},
): JournalEntry[] {
  const entries: JournalEntry[] = [
    ...events.map((event) => ({ kind: 'event' as const, at: eventTime(event, segmentTimes), event, weight: eventWeight(event, degree.get(event.id) ?? 0) })),
    ...passages.map((passage) => ({ kind: 'passage' as const, at: passage.startAt, passage })),
  ];
  // À instant égal, la parole précède l'événement qu'elle a fait naître.
  return entries.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'passage' ? -1 : 1));
}

/**
 * Instant d'un événement dans la session : un événement déduit de l'enregistrement est placé au moment
 * où l'on en a parlé (son premier segment), pas à l'heure de l'analyse qui l'a produit.
 */
export function eventTime(e: EventDto, segmentTimes?: ReadonlyMap<string, number>): number {
  const segs = e.payload.segments;
  if (segmentTimes && e.payload.origin === 'recording' && Array.isArray(segs) && typeof e.payload.recordingId === 'string') {
    const t = segmentTimes.get(`${e.payload.recordingId}:${segs[0]}`);
    if (t !== undefined) return t;
  }
  return Date.parse(e.occurredAt);
}

/** Index « enregistrement:séquence » → instant, pour replacer les événements automatiques. */
export function segmentTimeIndex(segments: readonly TranscriptSegmentDto[]): Map<string, number> {
  return new Map(segments.map((s) => [`${s.recordingId}:${s.seq}`, Date.parse(s.spokenAt)]));
}

/** Couloirs de la frise de session. */
export const LANES: { id: string; label: string; categories: EventCategory[] }[] = [
  { id: 'story', label: 'Récit', categories: ['narrative'] },
  { id: 'social', label: 'Relations', categories: ['social'] },
  { id: 'party', label: 'Personnages', categories: ['character', 'item'] },
  { id: 'combat', label: 'Combat', categories: ['combat'] },
  { id: 'dice', label: 'Dés', categories: ['dice'] },
  { id: 'table', label: 'Table', categories: ['session', 'system'] },
];

export const laneOf = (category: EventCategory) => LANES.findIndex((l) => l.categories.includes(category));

export interface StripPoint {
  id: string;
  x: number;
  lane: number;
  /** Décalage vertical dans le couloir (évite les superpositions). */
  dy: number;
  r: number;
}

/**
 * Place les points d'un couloir sans chevauchement : chaque point prend la première rangée libre
 * (0, +1, −1, +2, −2…) ; au-delà de la hauteur du couloir, il se superpose à la rangée la moins chargée.
 */
export function packLane(items: readonly { id: string; x: number; r: number }[], rowHeight: number, maxRows: number): Map<string, number> {
  const rows = [0];
  for (let k = 1; rows.length < maxRows; k++) {
    rows.push(k);
    if (rows.length < maxRows) rows.push(-k);
  }
  const lastX = new Map<number, number>();
  const out = new Map<string, number>();
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    let chosen = rows.find((row) => (lastX.get(row) ?? -Infinity) <= it.x - it.r * 2 - 1);
    if (chosen === undefined) chosen = rows.reduce((best, row) => ((lastX.get(row) ?? -Infinity) < (lastX.get(best) ?? -Infinity) ? row : best), rows[0]!);
    lastX.set(chosen, it.x);
    out.set(it.id, chosen * rowHeight);
  }
  return out;
}

/** Mots prononcés par tranche de temps (densité de parole de la table). */
export function speechHistogram(segments: readonly TranscriptSegmentDto[], start: number, end: number, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  const span = Math.max(1, end - start);
  for (const s of segments) {
    const k = Math.min(buckets - 1, Math.max(0, Math.floor(((Date.parse(s.spokenAt) - start) / span) * buckets)));
    out[k]! += s.text.split(/\s+/u).filter(Boolean).length;
  }
  return out;
}
