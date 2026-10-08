import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks';
import { cx } from '../ui/components';
import s from './graph.module.css';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GraphNode {
  id: string;
  label: string;
  color: string;
  position: Vec3;
  /** Exclu par les filtres : fortement estompé. */
  muted?: boolean;
  shape?: 'diamond' | 'circle';
  /** Libellé secondaire (type, session…). */
  hint?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  color: string;
  width?: number;
  opacity?: number;
  /** Les rayons (axe → nœud) ne comptent pas pour le voisinage. */
  kind?: 'link' | 'spoke';
  dashed?: boolean;
  arrow?: boolean;
}

export interface AxisMark {
  id: string;
  position: Vec3;
  label: string;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Repères (axe des sessions) : reliés entre eux par un filet or. */
  axis?: AxisMark[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Mode « relier » : curseur en croix, le clic choisit une cible. */
  linking?: boolean;
  /** Filtres et bandeaux : superposés à la scène, ou placés au-dessus sur petit écran. */
  overlay?: ReactNode;
  height?: number | string;
  ariaLabel: string;
}

const D = 1200;
const DEFAULT_CAM = { yaw: -0.6, pitch: 0.28, zoom: 1 };

/**
 * Rendu 3D léger (projection perspective maison) : les liens sont dessinés sur un canvas,
 * les nœuds sont des boutons HTML (focus clavier, lecteurs d'écran). La boucle d'animation
 * met à jour les positions sans re-rendu React : fluide jusqu'à plusieurs centaines de nœuds.
 */
export function Graph3D({ nodes, edges, axis = [], selectedId, onSelect, linking, overlay, height = '100%', ariaLabel }: Props) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());
  const axisEls = useRef(new Map<string, HTMLDivElement>());
  const cam = useRef({ ...DEFAULT_CAM });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const dirty = useRef(true);
  const size = useRef({ w: 800, h: 600 });
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const focusId = hover ?? selectedId;
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (!focusId) return set;
    set.add(focusId);
    for (const e of edges) {
      if (e.kind === 'spoke') continue;
      if (e.from === focusId) set.add(e.to);
      if (e.to === focusId) set.add(e.from);
    }
    return set;
  }, [edges, focusId]);

  const positions = useMemo(() => {
    const map = new Map<string, Vec3>();
    nodes.forEach((n) => map.set(n.id, n.position));
    axis.forEach((a) => map.set(a.id, a.position));
    return map;
  }, [nodes, axis]);

  /** Étendue de la scène : sert à cadrer la caméra. */
  const extent = useMemo(() => {
    let m = 150;
    for (const p of positions.values()) m = Math.max(m, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
    return m;
  }, [positions]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = size.current;
    const { yaw, pitch, zoom } = cam.current;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = ((0.82 * Math.min(w, h * 1.6) * D) / (extent * 2 + 380)) * zoom;
    const project = (p: Vec3) => {
      const x1 = p.x * cy - p.z * sy;
      const z1 = p.x * sy + p.z * cy;
      const y1 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;
      const k = f / (D + z2);
      return { x: w / 2 + x1 * k, y: h / 2 + y1 * k, z: z2, depth: k / (f / D) };
    };
    const proj = new Map<string, ReturnType<typeof project>>();
    for (const [id, p] of positions) proj.set(id, project(p));

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Axe des sessions.
    ctx.strokeStyle = 'rgba(201,169,106,.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < axis.length - 1; i++) {
      const a = proj.get(axis[i]!.id)!;
      const b = proj.get(axis[i + 1]!.id)!;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const e of edges) {
      const a = proj.get(e.from);
      const b = proj.get(e.to);
      if (!a || !b) continue;
      const hot = e.kind !== 'spoke' && focusId !== null && (e.from === focusId || e.to === focusId);
      const depth = Math.max(0.15, Math.min(1, (a.depth + b.depth) / 2 - 0.35));
      const base = e.opacity ?? (e.kind === 'spoke' ? 0.16 : 0.32);
      ctx.globalAlpha = hot ? 0.95 : focusId ? base * 0.4 : base * (e.kind === 'spoke' ? 1 : depth);
      ctx.strokeStyle = hot ? '#7cc6ff' : e.color;
      ctx.lineWidth = hot ? Math.max(2, e.width ?? 1) : (e.width ?? 1);
      ctx.shadowBlur = hot ? 8 : 0;
      ctx.shadowColor = 'rgba(79,179,255,.85)';
      ctx.setLineDash(e.dashed ? [5, 5] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (e.arrow) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const tipX = b.x - Math.cos(ang) * 14;
        const tipY = b.y - Math.sin(ang) * 14;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.4) * 9, tipY - Math.sin(ang - 0.4) * 9);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang + 0.4) * 9, tipY - Math.sin(ang + 0.4) * 9);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    for (const [id, el] of nodeEls.current) {
      const p = proj.get(id);
      if (!p) continue;
      const scale = Math.max(0.55, Math.min(1.45, p.depth));
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      el.style.zIndex = String(Math.round(2000 - p.z) + (el.dataset.focus === 'on' ? 2000 : 0));
      el.style.setProperty('--depth', String(Math.max(0.45, Math.min(1, 0.35 + p.depth * 0.6))));
      el.style.setProperty('--label', String(Math.max(0, Math.min(0.9, (p.depth - 0.75) * 2.2))));
    }
    for (const [id, el] of axisEls.current) {
      const p = proj.get(id);
      if (p) el.style.transform = `translate3d(${p.x}px, ${p.y + 28}px, 0) translate(-50%, -50%)`;
    }
  }, [axis, edges, extent, focusId, positions]);

  // Redessine après chaque rendu React (données, sélection, survol).
  useLayoutEffect(() => {
    dirty.current = true;
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      size.current = { w: r.width, h: r.height };
      dirty.current = true;
    });
    ro.observe(el);
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      if (auto && !reduce && !drag.current && !selectedId && !hover) {
        cam.current.yaw += 0.0018;
        dirty.current = true;
      }
      if (dirty.current) {
        dirty.current = false;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [auto, draw, hover, selectedId]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      cam.current.yaw = d.yaw + dx * 0.006;
      cam.current.pitch = Math.max(-1.3, Math.min(1.3, d.pitch + dy * 0.005));
      dirty.current = true;
    };
    const up = () => {
      setTimeout(() => (drag.current = null), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  // Zoom à la molette sans faire défiler la page.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.zoom = Math.max(0.45, Math.min(2.8, cam.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      dirty.current = true;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const setCam = (patch: Partial<typeof DEFAULT_CAM>) => {
    Object.assign(cam.current, patch);
    dirty.current = true;
  };

  return (
    <div className={s.root} style={{ height }}>
      {narrow && overlay}
      <div
        ref={stageRef}
        className={cx(s.stage, linking && s.linking)}
        aria-label={ariaLabel}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { x: e.clientX, y: e.clientY, yaw: cam.current.yaw, pitch: cam.current.pitch, moved: false };
        }}
        onClick={(e) => {
          if (drag.current?.moved || (e.target as HTMLElement).closest('button')) return;
          if (!linking) onSelect(null);
        }}
      >
        <canvas ref={canvasRef} className={s.canvas} aria-hidden />
        {axis.map((a) => (
          <div
            key={a.id}
            ref={(el) => {
              if (el) axisEls.current.set(a.id, el);
              else axisEls.current.delete(a.id);
            }}
            className={s.axisLabel}
          >
            {a.label}
          </div>
        ))}
        {nodes.map((n) => {
          const selected = n.id === selectedId;
          const inFocus = neighbours.has(n.id);
          const dimmed = focusId !== null && !inFocus;
          return (
            <button
              key={n.id}
              type="button"
              ref={(el) => {
                if (el) nodeEls.current.set(n.id, el);
                else nodeEls.current.delete(n.id);
              }}
              data-focus={selected || n.id === hover ? 'on' : 'off'}
              className={cx(s.node, selected && s.selected, inFocus && s.inFocus, dimmed && s.dimmed, n.muted && s.muted)}
              style={{ '--c': n.color } as CSSProperties}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover((h) => (h === n.id ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              aria-pressed={selected}
              aria-label={`${n.label}${n.hint ? ` — ${n.hint}` : ''}`}
            >
              <span className={n.shape === 'circle' ? s.circle : s.gem} />
              <span className={s.label}>{n.label}</span>
            </button>
          );
        })}
        {!narrow && overlay}
      </div>
      <div className={s.controls}>
        <button type="button" className={cx(s.ctrl, auto && s.ctrlOn)} aria-pressed={auto} onClick={() => setAuto(!auto)}>
          Rotation auto
        </button>
        <button type="button" className={s.ctrl} onClick={() => setCam(DEFAULT_CAM)}>
          Recentrer
        </button>
        <button
          type="button"
          className={s.ctrl}
          title="Vue à plat (2D)"
          onClick={() => {
            setAuto(false);
            setCam({ yaw: 0, pitch: 0, zoom: 1 });
          }}
        >
          Frise
        </button>
        <button type="button" className={s.ctrl} aria-label="Dézoomer" onClick={() => setCam({ zoom: Math.max(0.45, cam.current.zoom / 1.15) })}>
          −
        </button>
        <button type="button" className={s.ctrl} aria-label="Zoomer" onClick={() => setCam({ zoom: Math.min(2.8, cam.current.zoom * 1.15) })}>
          +
        </button>
        <span className={s.hint}>Glisser : pivoter · Molette : zoom · Clic : ouvrir</span>
      </div>
    </div>
  );
}
