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
  /**
   * Poids d'affichage (0–1, 0,5 par défaut) : taille du repère et ordre d'apparition des étiquettes
   * quand on zoome. Les plus lourds se lisent de loin, les détails n'apparaissent qu'en s'approchant.
   */
  weight?: number;
  /** Repère majeur (personnage, mort, trahison…) : son étiquette se lit dès la vue d'ensemble. */
  landmark?: boolean;
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

/** Un fil suivi à travers la scène (ex. le parcours d'un personnage), dans l'ordre. */
export interface GraphThread {
  ids: string[];
  color: string;
  /** Nœud courant du fil (mis en avant). */
  current?: string | null;
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
  /** Fil suivi : tracé lumineux, ses nœuds restent au premier plan. */
  thread?: GraphThread | null;
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
const DEFAULT_CAM = { yaw: -0.5, pitch: 0.22, zoom: 1, tx: 0, ty: 0, tz: 0 };
const FLAT_CAM = { yaw: 0, pitch: 0, zoom: 1, tx: 0, ty: 0, tz: 0 };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
/** Constante de temps de l'amortissement de la caméra (ms) : les gestes restent fluides sans à-coups. */
const DAMPING_MS = 70;
const PITCH_LIMIT = 1.1;
type Cam = typeof DEFAULT_CAM;
type Gesture = { mode: 'rotate' | 'pan'; x: number; y: number; cam: Cam; moved: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampZoom = (z: number) => clamp(z, MIN_ZOOM, MAX_ZOOM);
/** Taille du repère en pixels selon le poids : de 9 px (détail) à 24 px (moment clé). */
export const markerSize = (weight = 0.5) => Math.round(9 + clamp(weight, 0, 1) * 15);

/**
 * Seuil de poids à partir duquel une étiquette apparaît, selon le zoom effectif : à la vue d'ensemble seuls
 * les repères majeurs sont nommés ; en s'approchant, les événements se dévoilent du plus lourd au plus léger.
 */
export function labelAlpha(weight: number, zoom: number): number {
  const threshold = 1.02 - (zoom - 1) * 0.5;
  return clamp((weight - threshold + 0.08) / 0.08, 0, 1);
}

/** Distance (en sauts, au plus 2) depuis les nœuds de départ, sans compter les rayons de l'axe. */
export function hops(edges: readonly GraphEdge[], from: Iterable<string>, max = 2): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: string[] = [];
  for (const id of from) if (!dist.has(id)) (dist.set(id, 0), frontier.push(id));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === 'spoke') continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  for (let d = 1; d <= max && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const n of adj.get(id) ?? []) if (!dist.has(n)) (dist.set(n, d), next.push(n));
    frontier = next;
  }
  return dist;
}

/**
 * Rendu 3D léger (projection perspective maison) : les liens sont dessinés sur un canvas,
 * les nœuds sont des boutons HTML (focus clavier, lecteurs d'écran) ancrés sur leur repère :
 * les traits aboutissent toujours au point, l'étiquette se place à côté.
 *
 * Lisibilité progressive : vue d'ensemble = repères majeurs nommés, le zoom dévoile le reste par poids ;
 * sélectionner un nœud estompe tout ce qui ne lui est pas lié et nomme ses voisins directs.
 *
 * Navigation : glisser = pivoter (ou se déplacer en vue à plat) ; clic molette, clic droit ou
 * Maj + glisser = se déplacer ; molette = zoom vers le curseur ; double-clic sur un nœud = le centrer.
 * Tous les gestes passent par une caméra amortie : pas de saut, même avec un pavé tactile.
 */
export function Graph3D({ nodes, edges, axis = [], thread = null, selectedId, onSelect, linking, overlay, legend, flat = false, onToggleFlat, height = '100%', ariaLabel, handle }: Props) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());
  /** Taille de chaque étiquette, mesurée une fois : sert à éviter les chevauchements. */
  const labelBoxes = useRef(new Map<string, { w: number; h: number }>());
  const axisEls = useRef(new Map<string, HTMLDivElement>());
  /** Caméra affichée, et caméra visée : la première rejoint la seconde en douceur à chaque image. */
  const cam = useRef<Cam>({ ...(flat ? FLAT_CAM : DEFAULT_CAM) });
  const goal = useRef<Cam>({ ...cam.current });
  const drag = useRef<Gesture | null>(null);
  const dirty = useRef(true);
  const size = useRef({ w: 800, h: 600 });
  const [auto, setAuto] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const titleFont = useRef<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /** Sélection ou fil suivi : tout ce qui n'y est pas lié s'efface. */
  const focusMode = selectedId !== null || (thread?.ids.length ?? 0) > 0;
  const dist = useMemo(() => {
    const roots = [...(selectedId ? [selectedId] : [])];
    const d = hops(edges, roots, 2);
    for (const id of thread?.ids ?? []) d.set(id, Math.min(d.get(id) ?? 1, 1));
    return d;
  }, [edges, selectedId, thread]);
  const hoverSet = useMemo(() => {
    if (!hover) return new Set<string>();
    return new Set(hops(edges, [hover], 1).keys());
  }, [edges, hover]);

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
  const boundsKey = `${bounds.center.x}|${bounds.center.y}|${bounds.center.z}|${bounds.hx}|${bounds.hy}|${bounds.hz}`;

  /**
   * Demi-étendues écran (en unités monde) d'une boîte vue sous l'orientation donnée : la scène est cadrée
   * telle qu'on la voit, pas selon le pire cas de rotation (la Chronique, longue et plate, remplit l'écran).
   */
  const extents = useCallback((b: { hx: number; hy: number; hz: number }, yaw: number, pitch: number) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    let ex = 0, ey = 0;
    for (const x of [-b.hx, b.hx]) for (const y of [-b.hy, b.hy]) for (const z of [-b.hz, b.hz]) {
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      ex = Math.max(ex, Math.abs(x1));
      ey = Math.max(ey, Math.abs(y * cp - z1 * sp));
    }
    return { ex, ey };
  }, []);

  /** Échelle écran (pixels par unité monde) au plan du centre visé : la scène entière tient à l'écran au zoom 1. */
  const scaleOf = useCallback(
    (c: Cam) => {
      const { w, h } = size.current;
      const home = flat ? FLAT_CAM : DEFAULT_CAM;
      const { ex, ey } = extents(bounds, home.yaw, home.pitch);
      // En relief, une marge pour la perspective et les rotations modestes.
      const m = flat ? 1 : 1.3;
      return Math.min((w * 0.9) / (2 * ex * m + 180), (h * 0.86) / (2 * ey * m + 90)) * c.zoom;
    },
    [boundsKey, flat, extents],
  );

  /** Vue d'ensemble : centrée sur la scène. */
  const home = useCallback(
    (): Cam => ({ ...(flat ? FLAT_CAM : DEFAULT_CAM), tx: bounds.center.x, ty: bounds.center.y, tz: bounds.center.z }),
    [boundsKey, flat],
  );
  const userMoved = useRef(false);
  const framed = useRef(false);
  // Tant que l'utilisateur n'a pas bougé la vue, elle suit la scène (chargement, filtres, plan ↔ relief).
  useEffect(() => {
    if (userMoved.current) return;
    const h = home();
    const target = { tx: h.tx, ty: h.ty, tz: h.tz, zoom: h.zoom };
    Object.assign(goal.current, target);
    // Premier cadrage : immédiat (pas de travelling depuis l'origine au chargement).
    if (!framed.current) Object.assign(cam.current, target);
    framed.current = true;
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
    const z = cam.current.zoom;
    const scaleAt = (p: { depth: number }) => (flat ? clamp(0.75 + z * 0.25, 0.55, 1.2) : clamp(p.depth, 0.55, 1.45));
    /** Rayon écran du repère d'un nœud : les flèches s'arrêtent à son bord. */
    const radius = (id: string) => {
      const n = byId.get(id);
      const p = proj.get(id);
      return n && p ? (markerSize(n.weight) * scaleAt(p)) / 2 + 3 : 4;
    };

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
    const near = (id: string) => (dist.get(id) ?? 9) <= 1;
    const labels: { x: number; y: number; text: string; color: string; hovered: boolean }[] = [];
    for (const e of edges) {
      const a = proj.get(e.from);
      const b = proj.get(e.to);
      if (!a || !b) continue;
      const spoke = e.kind === 'spoke';
      const hot = !spoke && ((hover !== null && (e.from === hover || e.to === hover)) || (selectedId !== null && (e.from === selectedId || e.to === selectedId)));
      const depth = flat ? 1 : clamp((a.depth + b.depth) / 2 - 0.35, 0.15, 1);
      const base = e.opacity ?? (spoke ? 0.16 : 0.32);
      let alpha = base * (spoke ? 1 : depth);
      if (hot) alpha = 0.95;
      else if (focusMode) alpha = !spoke && near(e.from) && near(e.to) ? Math.max(base, 0.3) : spoke ? base * 0.25 : 0.025;
      else if (hover) alpha *= 0.45;
      if (byId.get(e.from)?.muted || byId.get(e.to)?.muted) alpha *= hot ? 1 : 0.3;
      ctx.globalAlpha = alpha;
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
        const r = radius(e.to);
        const tipX = b.x - Math.cos(ang) * r;
        const tipY = b.y - Math.sin(ang) * r;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.4) * 8, tipY - Math.sin(ang - 0.4) * 8);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang + 0.4) * 8, tipY - Math.sin(ang + 0.4) * 8);
        ctx.stroke();
      }
      if (hot && e.label) labels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: e.label, color: e.color, hovered: hover !== null && (e.from === hover || e.to === hover) });
    }
    // Fil suivi : un tracé continu, lumineux, d'un nœud au suivant.
    if (thread && thread.ids.length > 1) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = thread.color;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = thread.color;
      ctx.beginPath();
      let started = false;
      for (const id of thread.ids) {
        const p = proj.get(id);
        if (!p) continue;
        if (started) ctx.lineTo(p.x, p.y);
        else (ctx.moveTo(p.x, p.y), (started = true));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // Nature des liens du nœud au premier plan : petites étiquettes au milieu des traits.
    titleFont.current ??= getComputedStyle(document.documentElement).getPropertyValue('--font-title').trim() || 'serif';
    ctx.font = `600 11px ${titleFont.current}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Un nœud très relié produirait un mur d'étiquettes : au-delà de quelques liens, seul le survol les nomme,
    // et deux étiquettes ne se chevauchent jamais.
    const taken: [number, number, number, number][] = [];
    const busy = labels.length > 8;
    for (const l of labels) {
      if (busy && !l.hovered) continue;
      const wText = ctx.measureText(l.text).width + 12;
      const box: [number, number, number, number] = [l.x - wText / 2, l.y - 9, l.x + wText / 2, l.y + 9];
      if (taken.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
      taken.push(box);
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

    type Placed = { el: HTMLButtonElement; id: string; x: number; y: number; z: number; scale: number; label: number; priority: number };
    const list: Placed[] = [];
    for (const [id, el] of nodeEls.current) {
      const p = proj.get(id);
      const n = byId.get(id);
      if (!p || !n) continue;
      const scale = scaleAt(p);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      const forced = id === hover || id === selectedId || id === thread?.current;
      el.style.zIndex = String(Math.round(2000 - p.z) + (forced ? 4000 : focusMode && near(id) ? 2000 : 0));
      el.style.setProperty('--depth', String(flat ? 1 : clamp(0.35 + p.depth * 0.6, 0.45, 1)));
      let label: number;
      let priority: number;
      if (forced) (label = 1, priority = 4);
      else if (n.muted) (label = 0, priority = 0);
      else if (focusMode) (label = near(id) ? 1 : 0, priority = 3);
      else if (hover && hoverSet.has(id)) (label = 1, priority = 3);
      else if (n.landmark) (label = 0.95, priority = 2);
      else (label = labelAlpha(n.weight ?? 0.5, flat ? z : z * p.depth) * 0.9, priority = 1);
      list.push({ el, id, x: p.x, y: p.y, z: p.z, scale, label, priority: priority + (n.weight ?? 0.5) * 0.5 });
    }
    // Étiquettes sans chevauchement : les plus prioritaires (survol, sélection, voisins, repères, poids) passent d'abord.
    const placed: [number, number, number, number][] = [];
    list.sort((a, b) => b.priority - a.priority || a.z - b.z);
    for (const n of list) {
      let label = n.label;
      if (label > 0.05) {
        const labelEl = n.el.lastElementChild as HTMLElement | null;
        let box = labelBoxes.current.get(n.id);
        if (!box && labelEl) {
          box = { w: labelEl.offsetWidth, h: labelEl.offsetHeight };
          labelBoxes.current.set(n.id, box);
        }
        if (box) {
          const m = markerSize(byId.get(n.id)?.weight);
          const x0 = n.x + (m / 2 + 6) * n.scale;
          const r: [number, number, number, number] = [x0 - 2, n.y - (box.h * n.scale) / 2, x0 + box.w * n.scale + 2, n.y + (box.h * n.scale) / 2];
          if (n.priority < 4 && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) label = 0;
          else placed.push(r);
        }
      }
      n.el.style.setProperty('--label', String(label));
      n.el.dataset.label = label > 0.05 ? 'on' : 'off';
    }
    for (const [id, el] of axisEls.current) {
      const p = proj.get(id);
      if (p) el.style.transform = `translate3d(${p.x}px, ${p.y + 28}px, 0) translate(-50%, -50%)`;
    }
  }, [axis, byId, dist, edges, flat, focusMode, hover, hoverSet, positions, scaleOf, selectedId, thread]);

  // Redessine après chaque rendu React (données, sélection, survol).
  useLayoutEffect(() => {
    dirty.current = true;
  });

  const animateTo = useCallback((patch: Partial<Cam>) => {
    Object.assign(goal.current, patch);
    dirty.current = true;
  }, []);
  const centerOn = useCallback(
    (id: string, zoom = 1.6) => {
      const p = positions.get(id);
      if (!p) return;
      setAuto(false);
      userMoved.current = true;
      animateTo({ tx: p.x, ty: p.y, tz: p.z, zoom: Math.max(goal.current.zoom, zoom) });
    },
    [positions, animateTo],
  );

  /** Cadre un groupe de nœuds (centre et zoom), dans l'orientation actuelle. */
  const frame = useCallback(
    (ids: Iterable<string>) => {
      const pts = [...ids].map((id) => positions.get(id)).filter((p): p is Vec3 => !!p);
      if (!pts.length) return;
      const lo = { x: Infinity, y: Infinity, z: Infinity };
      const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const p of pts) for (const k of ['x', 'y', 'z'] as const) ((lo[k] = Math.min(lo[k], p[k])), (hi[k] = Math.max(hi[k], p[k])));
      const g = goal.current;
      const { ex, ey } = extents({ hx: (hi.x - lo.x) / 2, hy: (hi.y - lo.y) / 2, hz: (hi.z - lo.z) / 2 }, g.yaw, g.pitch);
      const { w, h } = size.current;
      // Place pour les étiquettes à droite des repères.
      const needed = Math.min((w * 0.8) / (2 * ex + 260), (h * 0.75) / (2 * ey + 80));
      const zoom = clamp(needed / scaleOf({ ...g, zoom: 1 }), 0.8, 3);
      setAuto(false);
      userMoved.current = true;
      animateTo({ tx: (lo.x + hi.x) / 2, ty: (lo.y + hi.y) / 2, tz: (lo.z + hi.z) / 2, zoom });
    },
    [positions, extents, scaleOf, animateTo],
  );

  // Focus : la sélection et ses voisins directs (et, sur un fil suivi, les étapes voisines) remplissent la vue.
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || framedFor.current === selectedId) {
      framedFor.current = selectedId;
      return;
    }
    framedFor.current = selectedId;
    const ids = new Set(hops(edges, [selectedId], 1).keys());
    const i = thread?.ids.indexOf(selectedId) ?? -1;
    if (i >= 0) for (const j of [i - 1, i + 1]) if (thread!.ids[j]) ids.add(thread!.ids[j]!);
    frame(ids);
    // Uniquement quand la sélection change : modifier les filtres ne doit pas déplacer la caméra.
  }, [selectedId]);

  // Passage plan ↔ relief : la caméra rejoint la vue correspondante.
  useEffect(() => {
    if (flat) setAuto(false);
    animateTo(flat ? { yaw: 0, pitch: 0 } : { yaw: DEFAULT_CAM.yaw, pitch: DEFAULT_CAM.pitch });
  }, [flat, animateTo]);

  useImperativeHandle(
    handle,
    () => ({
      focus: (id, zoom) => {
        framedFor.current = id;
        centerOn(id, zoom ?? 1.5);
      },
      reset() {
        userMoved.current = false;
        animateTo(home());
      },
    }),
    [centerOn, animateTo, home],
  );

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const autoRef = useRef(false);
  autoRef.current = auto && !flat && !selectedId && !hover;

  // Boucle d'animation unique : amortissement de la caméra, rotation automatique, dessin si besoin.
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
    let last = performance.now();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const g = goal.current;
      if (autoRef.current && !reduce && !drag.current) g.yaw += 0.00011 * dt;
      const c = cam.current;
      const k = reduce ? 1 : 1 - Math.exp(-dt / DAMPING_MS);
      let moving = false;
      for (const key of ['yaw', 'pitch', 'zoom', 'tx', 'ty', 'tz'] as const) {
        const delta = g[key] - c[key];
        const eps = key === 'yaw' || key === 'pitch' ? 1e-4 : key === 'zoom' ? 1e-4 : 0.05;
        if (Math.abs(delta) <= eps) c[key] = g[key];
        else ((c[key] += delta * k), (moving = true));
      }
      if (moving) dirty.current = true;
      if (dirty.current) {
        dirty.current = false;
        drawRef.current();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) <= 4) return;
      d.moved = true;
      if (d.mode === 'pan') {
        const k = scaleOf(d.cam);
        const { right, down } = axes(d.cam);
        goal.current.tx = d.cam.tx - (right.x * dx + down.x * dy) / k;
        goal.current.ty = d.cam.ty - (right.y * dx + down.y * dy) / k;
        goal.current.tz = d.cam.tz - (right.z * dx + down.z * dy) / k;
      } else {
        goal.current.yaw = d.cam.yaw + dx * 0.005;
        goal.current.pitch = clamp(d.cam.pitch + dy * 0.004, -PITCH_LIMIT, PITCH_LIMIT);
      }
      dirty.current = true;
    };
    const up = () => {
      setPanning(false);
      setTimeout(() => (drag.current = null), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [scaleOf]);

  // Zoom à la molette vers le curseur, sans faire défiler la page. Les deltas sont normalisés
  // (souris à crans, pavé tactile, défilement par lignes) puis bornés : pas d'emballement.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const delta = clamp(e.deltaY * unit, -100, 100);
      const before = { ...goal.current };
      const zoom = clampZoom(before.zoom * Math.exp(-delta * 0.0018));
      if (zoom === before.zoom) return;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const k1 = scaleOf(before);
      const k2 = scaleOf({ ...before, zoom });
      const { right, down } = axes(before);
      const d = 1 / k1 - 1 / k2;
      Object.assign(goal.current, {
        zoom,
        tx: before.tx + (right.x * mx + down.x * my) * d,
        ty: before.ty + (right.y * mx + down.y * my) * d,
        tz: before.tz + (right.z * mx + down.z * my) * d,
      });
      dirty.current = true;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [scaleOf]);

  const zoomBy = (factor: number) => animateTo({ zoom: clampZoom(goal.current.zoom * factor) });

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
          setAuto(false);
          setPanning(pan);
          userMoved.current = true;
          // Le geste repart de la position visée : pas de rattrapage brusque d'une animation en cours.
          drag.current = { mode: pan ? 'pan' : 'rotate', x: e.clientX, y: e.clientY, cam: { ...goal.current }, moved: false };
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
          const d = dist.get(n.id);
          const tier = !focusMode ? (hover && !hoverSet.has(n.id) ? 'dim' : 'on') : d === undefined ? 'far' : d >= 2 ? 'dim' : 'on';
          const m = markerSize(n.weight);
          return (
            <button
              key={n.id}
              type="button"
              ref={(el) => {
                if (el) nodeEls.current.set(n.id, el);
                else nodeEls.current.delete(n.id);
                labelBoxes.current.delete(n.id);
              }}
              data-tier={tier}
              className={cx(s.node, selected && s.selected, n.id === thread?.current && s.current, (d ?? 9) <= 1 && focusMode && s.inFocus, n.muted && s.muted)}
              style={{ '--c': n.color, '--m': `${m}px` } as CSSProperties}
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
                centerOn(n.id);
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
        <button type="button" className={s.ctrl} onClick={() => ((userMoved.current = false), animateTo(home()))}>
          Recentrer
        </button>
        {selectedId && (
          <button type="button" className={s.ctrl} onClick={() => centerOn(selectedId, 1.5)}>
            Centrer la sélection
          </button>
        )}
        <span className={s.zoomGroup}>
          <button type="button" className={s.ctrl} aria-label="Dézoomer" onClick={() => zoomBy(1 / 1.3)}>
            −
          </button>
          <button type="button" className={s.ctrl} aria-label="Zoomer" onClick={() => zoomBy(1.3)}>
            +
          </button>
        </span>
        <span className={s.hint}>
          {flat ? 'Glisser : se déplacer' : 'Glisser : pivoter · Clic droit ou Maj + glisser : se déplacer'} · Molette : zoom (dévoile les détails) · Double-clic : centrer
        </span>
      </div>
    </div>
  );
}
