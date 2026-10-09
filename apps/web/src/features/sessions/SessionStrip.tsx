import { eventTypeDef, type EventDto, type TranscriptSegmentDto } from '@ds/shared';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { laneOf, LANES, packLane, speechHistogram } from './journal';
import s from './sessions.module.css';

export interface StripEvent {
  event: EventDto;
  at: number;
  weight: number;
  /** Retenu par le niveau de détail : sinon dessiné en petit et estompé. */
  shown: boolean;
}

interface Props {
  events: StripEvent[];
  segments: TranscriptSegmentDto[];
  start: number;
  end: number;
  selectedId: string | null;
  onSelect(id: string): void;
  range: [number, number] | null;
  onRange(range: [number, number] | null): void;
}

const LABEL_W = 92;
const RIGHT = 14;
const LANE_H = 34;
const ROW = 5;
const HIST_H = 34;
const AXIS_H = 22;

const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function tickStep(spanMs: number): number {
  const minutes = spanMs / 60_000;
  return ([5, 10, 15, 30, 60, 120].find((m) => minutes / m <= 8) ?? 240) * 60_000;
}

/**
 * Frise d'une session : un couloir par nature d'événement, le temps en abscisse, la densité de parole
 * en bas. Les points sont dimensionnés par leur poids et empilés quand ils se touchent ; seuls les plus
 * lourds portent une étiquette. Glisser sur la frise sélectionne une période.
 */
export function SessionStrip({ events, segments, start, end, selectedId, onSelect, range, onRange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(() => {
    const used = new Set(events.map((e) => laneOf(e.event.category)));
    return LANES.map((l, i) => ({ ...l, index: i })).filter((l) => used.has(l.index) || l.id === 'story');
  }, [events]);
  const laneY = new Map(lanes.map((l, row) => [l.index, AXIS_H + row * LANE_H + LANE_H / 2]));
  const height = AXIS_H + lanes.length * LANE_H + (segments.length ? HIST_H : 0) + 6;
  const span = Math.max(60_000, end - start);
  const inner = Math.max(100, width - LABEL_W - RIGHT);
  const x = (t: number) => LABEL_W + ((t - start) / span) * inner;
  const tAt = (px: number) => start + ((px - LABEL_W) / inner) * span;

  const points = useMemo(() => {
    const byLane = new Map<number, { id: string; x: number; r: number }[]>();
    const all = events.map((e) => {
      const lane = laneOf(e.event.category);
      const r = e.shown ? 2.5 + e.weight * 5 : 1.8;
      const p = { id: e.event.id, x: LABEL_W + ((e.at - start) / span) * inner, r };
      byLane.set(lane, [...(byLane.get(lane) ?? []), p]);
      return { ...e, lane, x: p.x, r };
    });
    const offsets = new Map<string, number>();
    for (const items of byLane.values()) for (const [id, dy] of packLane(items, ROW, 5)) offsets.set(id, dy);
    return all.map((p) => ({ ...p, dy: offsets.get(p.event.id) ?? 0 }));
  }, [events, start, span, inner]);

  // Étiquettes : les plus lourds d'abord, sans chevauchement dans un même couloir.
  const labels = useMemo(() => {
    const taken = new Map<number, [number, number][]>();
    const out: { id: string; x: number; lane: number; text: string }[] = [];
    for (const p of [...points].filter((p) => p.shown && p.weight >= 0.7).sort((a, b) => b.weight - a.weight)) {
      const text = p.event.title.length > 28 ? `${p.event.title.slice(0, 27)}…` : p.event.title;
      const w = text.length * 6.2;
      const box: [number, number] = [p.x - w / 2, p.x + w / 2];
      if (box[0] < LABEL_W || box[1] > width - 2) continue;
      const lane = taken.get(p.lane) ?? [];
      if (lane.some(([a, b]) => box[0] < b + 8 && box[1] > a - 8)) continue;
      lane.push(box);
      taken.set(p.lane, lane);
      out.push({ id: p.event.id, x: p.x, lane: p.lane, text });
    }
    return out;
  }, [points, width]);

  const step = tickStep(span);
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t);

  const buckets = Math.max(10, Math.floor(inner / 6));
  const hist = useMemo(() => speechHistogram(segments, start, end, buckets), [segments, start, end, buckets]);
  const histMax = Math.max(1, ...hist);
  const histTop = AXIS_H + lanes.length * LANE_H + 4;

  const local = (e: ReactPointerEvent) => e.clientX - (ref.current?.getBoundingClientRect().left ?? 0);
  const sel = drag ? [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)] : range ? [x(range[0]), x(range[1])] : null;

  return (
    <div ref={ref} className={s.strip}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Frise de la session : événements par nature au fil du temps"
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[data-point]')) return;
          const px = local(e);
          if (px < LABEL_W) return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setDrag({ from: px, to: px });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, to: Math.max(LABEL_W, Math.min(width - RIGHT, local(e))) })}
        onPointerUp={() => {
          if (!drag) return;
          const [a, b] = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
          onRange(b - a < 6 ? null : [tAt(a), tAt(b)]);
          setDrag(null);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={AXIS_H - 4} y2={height - 4} className={s.tick} />
            <text x={x(t)} y={12} className={s.tickLabel} textAnchor="middle">
              {clock.format(t)}
            </text>
          </g>
        ))}
        {lanes.map((l, row) => (
          <g key={l.id}>
            <rect x={LABEL_W} y={AXIS_H + row * LANE_H} width={inner} height={LANE_H} className={row % 2 ? s.laneOdd : s.laneEven} />
            <text x={LABEL_W - 10} y={AXIS_H + row * LANE_H + LANE_H / 2 + 4} className={s.laneLabel} textAnchor="end">
              {l.label}
            </text>
          </g>
        ))}
        {segments.length > 0 && (
          <g>
            <text x={LABEL_W - 10} y={histTop + HIST_H / 2 + 4} className={s.laneLabel} textAnchor="end">
              Parole
            </text>
            {hist.map((n, k) => {
              const h = (n / histMax) * (HIST_H - 6);
              return n ? <rect key={k} x={LABEL_W + (k / buckets) * inner} y={histTop + HIST_H - 4 - h} width={Math.max(1, inner / buckets - 1)} height={h} className={s.histBar} /> : null;
            })}
          </g>
        )}
        {sel && <rect x={sel[0]} y={AXIS_H} width={Math.max(1, sel[1]! - sel[0]!)} height={height - AXIS_H - 4} className={s.range} />}
        {[...points]
          .sort((a, b) => a.weight - b.weight)
          .map((p) => {
            const def = eventTypeDef(p.event.type);
            const cy = (laneY.get(p.lane) ?? AXIS_H) + p.dy;
            const selected = p.event.id === selectedId;
            return (
              <circle
                key={p.event.id}
                data-point
                cx={p.x}
                cy={cy}
                r={selected ? p.r + 2 : p.r}
                fill={def.color}
                opacity={p.shown ? 0.35 + p.weight * 0.65 : 0.22}
                className={selected ? s.pointSelected : s.point}
                onClick={() => onSelect(p.event.id)}
              >
                <title>{`${clock.format(p.at)} · ${def.label} — ${p.event.title}`}</title>
              </circle>
            );
          })}
        {labels.map((l) => (
          <text key={l.id} x={l.x} y={(laneY.get(l.lane) ?? AXIS_H) - 11} className={s.pointLabel} textAnchor="middle">
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
