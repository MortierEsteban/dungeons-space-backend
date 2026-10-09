import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
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
  /** Échelle du repère (importance, nombre de liens) : 1 par défaut. */
  size?: number;
  /** Libellé toujours lisible (nœuds majeurs). */
  pinLabel?: boolean;
  /** Nœud mineur : son libellé n'apparaît qu'au survol ou au focus (scènes très peuplées). */
  quiet?: boolean;
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
  /** Nature du lien, affichée au milieu quand l'un des deux nœuds est au premier plan. */
  label?: string;
}

export interface AxisMark {
  id: string;
  position: Vec3;
  label: string;
}

export interface GraphHandle {
  /** Centre la vue sur un nœud (animation douce). */
  focus(id: string, zoom?: number): void;
  reset(): void;
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
  /** Légende, en bas à gauche de la scène. */
  legend?: ReactNode;
  /** Vue à plat (carte 2D) : pas de rotation, glisser = se déplacer. */
  flat?: boolean;
  /** Bascule plan ↔ relief proposée dans la barre de contrôle. */
  onToggleFlat?: () => void;
  height?: number | string;
  ariaLabel: string;
  handle?: Ref<GraphHandle>;
}

const D = 1200;
const DEFAULT_CAM = { yaw: -0.6, pitch: 0.28, zoom: 1, tx: 0, ty: 0, tz: 0 };
const FLAT_CAM = { yaw: 0, pitch: 0, zoom: 1, tx: 0, ty: 0, tz: 0 };
type Cam = typeof DEFAULT_CAM;
type Gesture = { mode: 'rotate' | 'pan'; x: number; y: number; cam: Cam; moved: boolean };

/**
 * Rendu 3D léger (projection perspective maison) : les liens sont dessinés sur un canvas,
 * les nœuds sont des boutons HTML (focus clavier, lecteurs d'écran). La boucle d'animation
 * met à jour les positions sans re-rendu React : fluide jusqu'à plusieurs centaines de nœuds.
 *
 * Navigation : glisser = pivoter (ou se déplacer en vue à plat) ; clic molette, clic droit ou
 * Maj + glisser = se déplacer ; molette = zoom vers le curseur ; double-clic sur un nœud = le centrer.
 */
export function Graph3D({ nodes, edges, axis = [], selectedId, onSelect, linking, overlay, legend, flat = false, onToggleFlat, height = '100%', ariaLabel, handle }: Props) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());
  /** Taille de chaque nœud (repère + étiquette), mesurée une fois : sert à éviter les chevauchements d'étiquettes. */
  const nodeBoxes = useRef(new Map<string, { w: number; h: number }>());
  const axisEls = useRef(new Map<string, HTMLDivElement>());
  const cam = useRef<Cam>({ ...(flat ? FLAT_CAM : DEFAULT_CAM) });
  const anim = useRef<{ from: Cam; to: Cam; t0: number } | null>(null);
  const drag = useRef<Gesture | null>(null);
  const dirty = useRef(true);
  const size = useRef({ w: 800, h: 600 });
  const [auto, setAuto] = useState(!flat);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const titleFont = useRef<string | null>(null);

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

  /** Boîte englobante de la scène : centre et demi-étendues, pour cadrer la caméra. */
  const bounds = useMemo(() => {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of positions.values()) {
      for (const k of ['x', 'y', 'z'] as const) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
    }
    if (!positions.size) return { center: { x: 0, y: 0, z: 0 }, hx: 150, hy: 150, hz: 150 };
    const half = (k: 'x' | 'y' | 'z') => Math.max(60, (max[k] - min[k]) / 2);
    return { center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, hx: half('x'), hy: half('y'), hz: half('z') };
  }, [positions]);

  /** Échelle écran (pixels par unité monde) au plan du centre visé : la scène entière tient à l'écran au zoom 1. */
  const scaleOf = useCallback((c: Cam) => {
    const { w, h } = size.current;
    const r = Math.max(bounds.hx, bounds.hy, bounds.hz);
    const ex = flat ? bounds.hx : r;
    const ey = flat ? bounds.hy : r;
    return Math.min((w * 0.9) / (2 * ex + 140), (h * 0.86) / (2 * ey + 90)) * c.zoom;
  }, [bounds, flat]);

  /** Vue d'ensemble : centrée sur la scène. */
  const home = useCallback((): Cam => ({ ...(flat ? FLAT_CAM : DEFAULT_CAM), tx: bounds.center.x, ty: bounds.center.y, tz: bounds.center.z }), [bounds, flat]);
  const userMoved = useRef(false);
  // Tant que l'utilisateur n'a pas bougé la vue, elle suit la scène (chargement, filtres, plan ↔ relief).
  useEffect(() => {
    if (userMoved.current) return;
    const h = home();
    Object.assign(cam.current, { tx: h.tx, ty: h.ty, tz: h.tz });
    dirty.current = true;
  }, [home]);

  /** Axes écran (droite, bas) exprimés dans le repère du monde, pour la caméra courante. */
  const axes = (c: Cam) => {
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    return { right: { x: cy, y: 0, z: -sy }, down: { x: -sy * sp, y: cp, z: -cy * sp } };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = size.current;
    const { yaw, pitch, tx, ty, tz } = cam.current;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = scaleOf(cam.current) * D;
    const project = (p: Vec3) => {
      const px = p.x - tx, py = p.y - ty, pz = p.z - tz;
      const x1 = px * cy - pz * sy;
      const z1 = px * sy + pz * cy;
      const y1 = py * cp - z1 * sp;
      const z2 = py * sp + z1 * cp;
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
    const labels: { x: number; y: number; text: string; color: string }[] = [];
    for (const e of edges) {
      const a = proj.get(e.from);
      const b = proj.get(e.to);
      if (!a || !b) continue;
      const hot = e.kind !== 'spoke' && focusId !== null && (e.from === focusId || e.to === focusId);
      const depth = flat ? 1 : Math.max(0.15, Math.min(1, (a.depth + b.depth) / 2 - 0.35));
      const base = e.opacity ?? (e.kind === 'spoke' ? 0.16 : 0.32);
      ctx.globalAlpha = hot ? 0.95 : focusId ? base * 0.4 : base * (e.kind === 'spoke' ? 1 : depth);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = hot ? Math.max(2.2, (e.width ?? 1) + 0.6) : (e.width ?? 1);
      ctx.shadowBlur = hot ? 10 : 0;
      ctx.shadowColor = e.color;
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
      if (hot && e.label) labels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: e.label, color: e.color });
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // Nature des liens du nœud au premier plan : petites étiquettes au milieu des traits.
    titleFont.current ??= getComputedStyle(document.documentElement).getPropertyValue('--font-title').trim() || 'serif';
    ctx.font = `600 11px ${titleFont.current}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
      const wText = ctx.measureText(l.text).width + 12;
      ctx.fillStyle = 'rgba(11,9,18,.88)';
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(l.x - wText / 2, l.y - 9, wText, 18, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f3e6c4';
      ctx.fillText(l.text, l.x, l.y + 0.5);
    }

    const z = cam.current.zoom;
    const labelled: { el: HTMLButtonElement; id: string; x: number; y: number; z: number; scale: number; label: number }[] = [];
    for (const [id, el] of nodeEls.current) {
      const p = proj.get(id);
      if (!p) continue;
      const scale = Math.max(0.55, Math.min(1.45, flat ? Math.min(1.2, 0.75 + z * 0.25) : p.depth)) * Number(el.dataset.size ?? 1);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      el.style.zIndex = String(Math.round(2000 - p.z) + (el.dataset.focus === 'on' ? 2000 : 0));
      el.style.setProperty('--depth', String(flat ? 1 : Math.max(0.45, Math.min(1, 0.35 + p.depth * 0.6))));
      const label = el.dataset.pin === 'on' ? 0.95 : el.dataset.quiet === 'on' ? 0 : flat ? Math.max(0, Math.min(0.9, (z - 1.3) * 2)) : Math.max(0, Math.min(0.9, (p.depth - 0.75) * 2.2));
      labelled.push({ el, id, x: p.x, y: p.y, z: p.z, scale, label });
    }
    // Étiquettes sans chevauchement : les épinglées puis les plus proches passent d'abord, les autres
    // s'effacent (le survol et le focus les font toujours apparaître).
    const placed: [number, number, number, number][] = [];
    labelled.sort((a, b) => Number(b.el.dataset.pin === 'on') - Number(a.el.dataset.pin === 'on') || a.z - b.z);
    for (const n of labelled) {
      let label = n.label;
      if (label > 0.05) {
        let box = nodeBoxes.current.get(n.id);
        if (!box) {
          box = { w: n.el.offsetWidth, h: n.el.offsetHeight };
          nodeBoxes.current.set(n.id, box);
        }
        const hw = (box.w * n.scale) / 2 + 2;
        const hh = (box.h * n.scale) / 2;
        const r: [number, number, number, number] = [n.x - hw, n.y - hh, n.x + hw, n.y + hh];
        if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) label = 0;
        else placed.push(r);
      }
      n.el.style.setProperty('--label', String(label));
    }
    for (const [id, el] of axisEls.current) {
      const p = proj.get(id);
      if (p) el.style.transform = `translate3d(${p.x}px, ${p.y + 28}px, 0) translate(-50%, -50%)`;
    }
  }, [axis, edges, flat, focusId, positions, scaleOf]);

  // Redessine après chaque rendu React (données, sélection, survol).
  useLayoutEffect(() => {
    dirty.current = true;
  });

  const animateTo = useCallback((patch: Partial<Cam>) => {
    anim.current = { from: { ...cam.current }, to: { ...cam.current, ...patch }, t0: performance.now() };
    dirty.current = true;
  }, []);

  // Passage plan ↔ relief : la caméra rejoint la vue correspondante.
  useEffect(() => {
    setAuto(!flat);
    animateTo(flat ? { yaw: 0, pitch: 0 } : { yaw: DEFAULT_CAM.yaw, pitch: DEFAULT_CAM.pitch });
  }, [flat, animateTo]);

  useImperativeHandle(
    handle,
    () => ({
      focus(id, zoom) {
        const p = positions.get(id);
        if (!p) return;
        setAuto(false);
        animateTo({ tx: p.x, ty: p.y, tz: p.z, zoom: Math.max(cam.current.zoom, zoom ?? 1.5) });
      },
      reset() {
        (userMoved.current = false, animateTo(home()));
      },
    }),
    [positions, animateTo, home],
  );

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
    const tick = (now: number) => {
      const a = anim.current;
      if (a) {
        const t = reduce ? 1 : Math.min(1, (now - a.t0) / 450);
        const k = 1 - Math.pow(1 - t, 3);
        const lerp = (x: number, y: number) => x + (y - x) * k;
        cam.current = { yaw: lerp(a.from.yaw, a.to.yaw), pitch: lerp(a.from.pitch, a.to.pitch), zoom: lerp(a.from.zoom, a.to.zoom), tx: lerp(a.from.tx, a.to.tx), ty: lerp(a.from.ty, a.to.ty), tz: lerp(a.from.tz, a.to.tz) };
        if (t >= 1) anim.current = null;
        dirty.current = true;
      } else if (auto && !flat && !reduce && !drag.current && !selectedId && !hover) {
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
  }, [auto, draw, flat, hover, selectedId]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.mode === 'pan') {
        const k = scaleOf(d.cam);
        const { right, down } = axes(d.cam);
        cam.current.tx = d.cam.tx - (right.x * dx + down.x * dy) / k;
        cam.current.ty = d.cam.ty - (right.y * dx + down.y * dy) / k;
        cam.current.tz = d.cam.tz - (right.z * dx + down.z * dy) / k;
      } else {
        cam.current.yaw = d.cam.yaw + dx * 0.006;
        cam.current.pitch = Math.max(-1.3, Math.min(1.3, d.cam.pitch + dy * 0.005));
      }
      dirty.current = true;
    };
    const up = () => {
      setPanning(false);
      setTimeout(() => (drag.current = null), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [scaleOf]);

  // Zoom à la molette vers le curseur, sans faire défiler la page.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      anim.current = null;
      userMoved.current = true;
      const before = { ...cam.current };
      const zoom = Math.max(0.3, Math.min(5, before.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const k1 = scaleOf(before);
      const k2 = scaleOf({ ...before, zoom });
      const { right, down } = axes(before);
      const d = 1 / k1 - 1 / k2;
      cam.current = {
        ...before,
        zoom,
        tx: before.tx + (right.x * mx + down.x * my) * d,
        ty: before.ty + (right.y * mx + down.y * my) * d,
        tz: before.tz + (right.z * mx + down.z * my) * d,
      };
      dirty.current = true;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [scaleOf]);

  const zoomBy = (factor: number) => animateTo({ zoom: Math.max(0.3, Math.min(5, cam.current.zoom * factor)) });

  return (
    <div className={s.root} style={{ height }}>
      {narrow && overlay}
      <div
        ref={stageRef}
        className={cx(s.stage, linking && s.linking, (panning || flat) && s.panMode)}
        aria-label={ariaLabel}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.button === 1 && e.preventDefault() /* pas de défilement automatique au clic molette */}
        onPointerDown={(e) => {
          if (e.button === 0 && (e.target as HTMLElement).closest('button')) return;
          const pan = e.button === 1 || e.button === 2 || e.shiftKey || flat;
          anim.current = null;
          setAuto(false);
          setPanning(pan);
          userMoved.current = true;
          drag.current = { mode: pan ? 'pan' : 'rotate', x: e.clientX, y: e.clientY, cam: { ...cam.current }, moved: false };
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
                nodeBoxes.current.delete(n.id);
              }}
              data-focus={selected || n.id === hover ? 'on' : 'off'}
              data-pin={(n.pinLabel || inFocus) && !n.muted ? 'on' : 'off'}
              data-size={n.size ?? 1}
              data-quiet={n.quiet ? 'on' : 'off'}
              className={cx(s.node, selected && s.selected, inFocus && s.inFocus, dimmed && s.dimmed, n.muted && s.muted)}
              style={{ '--c': n.color } as CSSProperties}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => {
                // Clic molette ou droit sur un nœud : on se déplace quand même.
                if (e.button !== 0) return;
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setAuto(false);
                animateTo({ tx: n.position.x, ty: n.position.y, tz: n.position.z, zoom: Math.max(cam.current.zoom, 1.6) });
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
        {legend && <div className={s.legend}>{legend}</div>}
      </div>
      <div className={s.controls}>
        {!flat && (
          <button type="button" className={cx(s.ctrl, auto && s.ctrlOn)} aria-pressed={auto} onClick={() => setAuto(!auto)}>
            Rotation auto
          </button>
        )}
        {onToggleFlat && (
          <button type="button" className={cx(s.ctrl, flat && s.ctrlOn)} aria-pressed={flat} onClick={onToggleFlat} title="Vue à plat (carte) ou en relief (3D)">
            {flat ? 'Vue à plat' : 'Vue en relief'}
          </button>
        )}
        <button type="button" className={s.ctrl} onClick={() => (userMoved.current = false, animateTo(home()))}>
          Recentrer
        </button>
        {selectedId && (
          <button type="button" className={s.ctrl} onClick={() => { const p = positions.get(selectedId); if (p) animateTo({ tx: p.x, ty: p.y, tz: p.z, zoom: Math.max(cam.current.zoom, 1.5) }); }}>
            Centrer la sélection
          </button>
        )}
        <button type="button" className={s.ctrl} aria-label="Dézoomer" onClick={() => zoomBy(1 / 1.25)}>
          −
        </button>
        <button type="button" className={s.ctrl} aria-label="Zoomer" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <span className={s.hint}>
          {flat ? 'Glisser : se déplacer' : 'Glisser : pivoter · Clic molette, clic droit ou Maj + glisser : se déplacer'} · Molette : zoom · Double-clic : centrer
        </span>
      </div>
    </div>
  );
}
