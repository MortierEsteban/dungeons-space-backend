import {
  cellKey,
  footprint,
  getCondition,
  gridDistance,
  reachableCells,
  zoneCells,
  type Cell,
  type CombatState,
  type ObjectKind,
  type TerrainKind,
  type ZoneShape,
} from '@ds/rules';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { num } from '../../shared/format';
import { cx } from '../../shared/ui/components';
import type { CommandInput } from './api';
import s from './combat.module.css';

export type Tool = 'select' | 'terrain' | 'zone' | 'object' | 'measure';

export interface ToolOptions {
  brush: TerrainKind | 'erase';
  zone: { shape: ZoneShape; size: number; direction: number; color: string; label: string };
  objectKind: ObjectKind;
}

export interface FloatText {
  id: number;
  combatantId: string;
  text: string;
  color: string;
  big?: boolean;
}

export const OBJECT_META: Record<ObjectKind, { label: string; abbr: string; light?: { radius: number; color: string } }> = {
  chest: { label: 'Coffre', abbr: 'CF' },
  barrel: { label: 'Tonneau', abbr: 'TN' },
  door: { label: 'Porte', abbr: 'PT' },
  campfire: { label: 'Feu de camp', abbr: 'FE', light: { radius: 3, color: 'rgba(240,150,80,.32)' } },
  torch: { label: 'Torche', abbr: 'TO', light: { radius: 4, color: 'rgba(255,214,140,.22)' } },
  trap: { label: 'Piège', abbr: 'PG' },
  altar: { label: 'Autel', abbr: 'AU' },
  statue: { label: 'Statue', abbr: 'ST' },
};

export const TERRAIN_META: Record<TerrainKind, { label: string; bg: string }> = {
  wall: { label: 'Mur', bg: '#2b2331' },
  difficult: { label: 'Difficile', bg: 'repeating-linear-gradient(45deg, rgba(201,169,106,.32) 0 3px, transparent 3px 9px)' },
  water: { label: 'Eau', bg: 'rgba(79,179,255,.26)' },
  lava: { label: 'Lave', bg: 'radial-gradient(circle, rgba(240,120,70,.7), rgba(176,48,106,.5))' },
  vegetation: { label: 'Végétation', bg: 'rgba(120,160,90,.32)' },
};

const CELL = 46;

/** Contrat commun aux plateaux 2D et 3D. */
export interface BoardProps {
  state: CombatState;
  isGm: boolean;
  userId: string;
  tool: Tool;
  options: ToolOptions;
  selectedId: string | null;
  selectedObjectId: string | null;
  onSelect(id: string | null): void;
  onSelectObject(id: string | null): void;
  /** Mode ciblage (attaque) : le clic sur un pion appelle onTarget. */
  targeting: boolean;
  onTarget(id: string): void;
  floats: FloatText[];
  readOnly?: boolean;
  send(cmd: CommandInput): void;
}

/** Plateau de bataille : rendu DOM en couches, toutes les décisions passent par le serveur. */
export function Board({ state, isGm, userId, tool, options, selectedId, selectedObjectId, onSelect, onSelectObject, targeting, onTarget, floats, readOnly, send }: BoardProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [hover, setHover] = useState<Cell | null>(null);
  const [ghost, setGhost] = useState<{ id: string; cell: Cell } | null>(null);
  const [measure, setMeasure] = useState<{ a: Cell; b: Cell } | null>(null);
  const [stroke, setStroke] = useState<Cell[]>([]);
  const gesture = useRef<{ kind: 'pan' | 'token' | 'paint' | 'measure' | 'object'; startX: number; startY: number; viewX: number; viewY: number; id?: string } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const { cols, rows } = state.map;

  const userMoved = useRef(false);
  const fit = () => {
    const el = viewport.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const zoom = Math.max(0.3, Math.min(1.4, (r.width - 32) / (cols * CELL), (r.height - 32) / (rows * CELL)));
    setView({ zoom, x: (r.width - cols * CELL * zoom) / 2, y: (r.height - rows * CELL * zoom) / 2 });
  };

  // Cadrage : toute la carte visible, recalculé tant que l'utilisateur n'a ni déplacé ni zoomé la vue.
  useLayoutEffect(() => {
    userMoved.current = false;
    fit();
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => !userMoved.current && fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows]);

  const cellAt = (clientX: number, clientY: number): Cell => {
    const r = viewport.current!.getBoundingClientRect();
    const size = CELL * view.zoom;
    return { x: Math.floor((clientX - r.left - view.x) / size), y: Math.floor((clientY - r.top - view.y) / size) };
  };
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows;

  const controllable = (id: string) => {
    const c = state.combatants[id];
    return !!c && !readOnly && (isGm || c.ownerUserId === userId);
  };

  // Portée de déplacement du pion sélectionné (CMB-21), selon le mouvement restant.
  const reach = useMemo(() => {
    if (!selectedId || readOnly) return new Map<string, number>();
    const c = state.combatants[selectedId];
    if (!c?.position || !(isGm || c.ownerUserId === userId)) return new Map<string, number>();
    const remaining = state.status === 'active' && state.activeId === c.id ? Math.max(0, c.speed - c.resources.movementUsed) : c.speed;
    return reachableCells(state, c.id, remaining);
  }, [state, selectedId, readOnly, isGm, userId]);

  const zoneOverlays = useMemo(
    () => state.map.zones.map((z) => ({ zone: z, cells: zoneCells(z, cols, rows) })),
    [state.map.zones, cols, rows],
  );
  const previewZone = tool === 'zone' && hover && inside(hover) && !readOnly ? zoneCells({ id: 'preview', ...options.zone, origin: hover }, cols, rows) : [];

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    userMoved.current = true;
    setView((v) => {
      const zoom = Math.max(0.3, Math.min(2.5, v.zoom * factor));
      const r = viewport.current!.getBoundingClientRect();
      const px = (cx ?? r.left + r.width / 2) - r.left;
      const py = (cy ?? r.top + r.height / 2) - r.top;
      return { zoom, x: px - ((px - v.x) * zoom) / v.zoom, y: py - ((py - v.y) * zoom) / v.zoom };
    });
  };

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
      gesture.current = null;
      setGhost(null);
      return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-token],[data-object]');
    const base = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };

    if (target?.dataset.token) {
      const id = target.dataset.token;
      if (targeting) {
        onTarget(id);
        return;
      }
      onSelect(id);
      if (tool === 'select' && controllable(id)) {
        gesture.current = { kind: 'token', id, ...base };
        setGhost({ id, cell: state.combatants[id]!.position ?? cell });
      } else gesture.current = { kind: 'pan', ...base };
      return;
    }
    if (target?.dataset.object) {
      onSelectObject(target.dataset.object);
      if (isGm && tool === 'select' && !readOnly) gesture.current = { kind: 'object', id: target.dataset.object, ...base };
      return;
    }
    if (readOnly || !inside(cell) || tool === 'select') {
      if (tool === 'select') {
        onSelect(null);
        onSelectObject(null);
      }
      gesture.current = { kind: 'pan', ...base };
      return;
    }
    if (tool === 'terrain' && isGm) {
      gesture.current = { kind: 'paint', ...base };
      setStroke([cell]);
    } else if (tool === 'measure') {
      gesture.current = { kind: 'measure', ...base };
      setMeasure({ a: cell, b: cell });
    } else if (tool === 'zone') {
      send({ type: 'add_zone', ...options.zone, origin: cell });
    } else if (tool === 'object' && isGm) {
      send({ type: 'add_object', kind: options.objectKind, position: cell });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt((pinch.current.zoom * (d / pinch.current.dist)) / view.zoom, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    if (!hover || hover.x !== cell.x || hover.y !== cell.y) setHover(cell);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      userMoved.current = true;
      setView((v) => ({ ...v, x: g.viewX + e.clientX - g.startX, y: g.viewY + e.clientY - g.startY }));
    }
    else if (g.kind === 'token' && inside(cell)) setGhost({ id: g.id!, cell });
    else if (g.kind === 'paint' && inside(cell)) setStroke((st) => (st.some((c) => c.x === cell.x && c.y === cell.y) ? st : [...st, cell]));
    else if (g.kind === 'measure') setMeasure((m) => (m ? { ...m, b: cell } : m));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (g.kind === 'token' && ghost) {
      const from = state.combatants[g.id!]?.position;
      if (from && (from.x !== ghost.cell.x || from.y !== ghost.cell.y)) send({ type: 'move', combatantId: g.id!, to: ghost.cell });
      setGhost(null);
    } else if (g.kind === 'paint' && stroke.length) {
      send({ type: 'paint_terrain', cells: stroke, terrain: options.brush === 'erase' ? null : options.brush });
      setStroke([]);
    } else if (g.kind === 'object' && inside(cell)) {
      const obj = state.map.objects.find((o) => o.id === g.id);
      if (obj && (obj.position.x !== cell.x || obj.position.y !== cell.y)) send({ type: 'update_object', objectId: obj.id, patch: { position: cell } });
    }
  };

  const ghostCost = ghost && reach.size ? reach.get(cellKey(ghost.cell)) : undefined;
  const size = CELL;
  const order = Object.values(state.combatants);

  return (
    <div className={s.boardWrap}>
      <div
        ref={viewport}
        className={cx(s.viewport, (tool !== 'select' || targeting) && s.crosshair)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="application"
        aria-label={`Carte de bataille ${cols} × ${rows} cases`}
      >
        <div className={s.world} style={{ width: cols * size, height: rows * size, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {state.map.background && <img className={s.mapImage} src={state.map.background} alt="" draggable={false} />}
          <div className={s.grid} style={{ backgroundSize: `${size}px ${size}px` }} />
          {Object.entries(state.map.terrain).map(([k, t]) => {
            const [x, y] = k.split(',').map(Number) as [number, number];
            return x < cols && y < rows ? <div key={k} className={cx(s.cell, t === 'wall' && s.wall)} style={{ left: x * size, top: y * size, width: size, height: size, background: TERRAIN_META[t].bg }} /> : null;
          })}
          {stroke.map((c) => (
            <div key={`st${cellKey(c)}`} className={s.cell} style={{ left: c.x * size, top: c.y * size, width: size, height: size, background: options.brush === 'erase' ? 'rgba(176,48,106,.25)' : TERRAIN_META[options.brush].bg, opacity: 0.7 }} />
          ))}
          {[...reach.keys()].map((k) => {
            const [x, y] = k.split(',').map(Number) as [number, number];
            return <div key={`r${k}`} className={s.reach} style={{ left: x * size, top: y * size, width: size, height: size, opacity: ghost ? 0.2 : 0.09 }} />;
          })}
          {state.map.objects
            .filter((o) => OBJECT_META[o.kind].light)
            .map((o) => {
              const l = OBJECT_META[o.kind].light!;
              const r = (l.radius + 0.5) * size;
              return <div key={`l${o.id}`} className={s.light} style={{ left: (o.position.x + 0.5) * size - r, top: (o.position.y + 0.5) * size - r, width: r * 2, height: r * 2, background: `radial-gradient(circle, ${l.color}, transparent 70%)` }} />;
            })}
          {zoneOverlays.map(({ zone, cells }) => (
            <div key={zone.id}>
              {cells.map((c) => (
                <div key={cellKey(c)} className={s.zoneCell} style={{ left: c.x * size, top: c.y * size, width: size, height: size, background: `${zone.color}38`, borderColor: `${zone.color}aa` }} />
              ))}
              {zone.label && (
                <div className={s.zoneLabel} style={{ left: (zone.origin.x + 0.5) * size, top: (zone.origin.y + 0.5) * size }}>
                  {zone.label}
                </div>
              )}
            </div>
          ))}
          {previewZone.map((c) => (
            <div key={`pz${cellKey(c)}`} className={s.zoneCell} style={{ left: c.x * size, top: c.y * size, width: size, height: size, background: `${options.zone.color}22`, borderColor: `${options.zone.color}66` }} />
          ))}
          {state.map.objects.map((o) => {
            const meta = OBJECT_META[o.kind];
            const hidden = o.secret && !o.revealed;
            return (
              <div
                key={o.id}
                data-object={o.id}
                className={cx(s.object, selectedObjectId === o.id && s.objectSelected, hidden && s.objectSecret, o.kind === 'door' && o.open && s.objectOpen)}
                style={{ left: o.position.x * size + 6, top: o.position.y * size + 6, width: size - 12, height: size - 12 }}
                title={`${o.label || meta.label}${o.kind === 'door' ? (o.open ? ' (ouverte)' : ' (fermée)') : ''}${hidden ? ' — secret' : ''}`}
              >
                {meta.abbr}
              </div>
            );
          })}
          {tool === 'object' && hover && inside(hover) && !readOnly && (
            <div className={cx(s.object, s.objectSecret)} style={{ left: hover.x * size + 6, top: hover.y * size + 6, width: size - 12, height: size - 12, opacity: 0.5 }}>
              {OBJECT_META[options.objectKind].abbr}
            </div>
          )}
          {tool === 'terrain' && hover && inside(hover) && !readOnly && <div className={s.hoverCell} style={{ left: hover.x * size, top: hover.y * size, width: size, height: size }} />}
          {order.map((c) => {
            if (!c.position) return null;
            const pos = ghost?.id === c.id ? ghost.cell : c.position;
            const dead = c.hpBand === 'À terre';
            const pct = c.hp !== null && c.maxHp ? c.hp / c.maxHp : { Indemne: 1, Blessé: 0.7, Sanglant: 0.45, Agonisant: 0.2, 'À terre': 0 }[c.hpBand];
            const ring = c.side === 'ally' ? 'var(--arcane)' : c.side === 'enemy' ? 'var(--magenta)' : 'var(--gold)';
            const active = state.activeId === c.id && state.status === 'active';
            return (
              <div
                key={c.id}
                data-token={c.id}
                className={cx(s.token, selectedId === c.id && s.tokenSelected, active && s.tokenActive, dead && s.tokenDead, c.hidden && isGm && s.tokenHidden, targeting && s.tokenTarget, ghost?.id === c.id && s.tokenDragging)}
                style={{ left: pos.x * size, top: pos.y * size, width: c.size * size, height: c.size * size, '--ring': ring } as CSSProperties}
                title={`${c.name}${c.hp !== null ? ` · ${c.hp}/${c.maxHp} PV` : ` · ${c.hpBand}`}${c.ac !== null ? ` · CA ${c.ac}` : ''}`}
              >
                <div className={s.disc} style={{ background: c.side === 'ally' ? '#1d2f4a' : '#3a1428', fontSize: Math.round(size * c.size * 0.27) }}>
                  {c.short}
                </div>
                <div className={s.tokenHp}>
                  <div style={{ width: `${pct * 100}%`, background: pct < 0.34 ? 'var(--magenta-light)' : c.side === 'ally' ? 'var(--arcane)' : 'var(--gold)' }} />
                </div>
                {c.conditions.length > 0 && (
                  <div className={s.pips}>
                    {c.conditions.slice(0, 4).map((x) => (
                      <span key={x.name} title={x.name} style={{ background: getCondition(x.name)?.color ?? 'var(--gold)' }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {ghost && (
            <div className={s.ghostCost} style={{ left: (ghost.cell.x + 0.5) * size, top: ghost.cell.y * size - 6 }}>
              {ghostCost !== undefined ? `${num(ghostCost)} m` : 'hors de portée'}
            </div>
          )}
          {measure && (
            <svg className={s.measure} width={cols * size} height={rows * size} aria-hidden>
              <line x1={(measure.a.x + 0.5) * size} y1={(measure.a.y + 0.5) * size} x2={(measure.b.x + 0.5) * size} y2={(measure.b.y + 0.5) * size} />
              <text x={(measure.b.x + 0.5) * size + 10} y={(measure.b.y + 0.5) * size - 10}>
                {`${num(gridDistance(measure.a, measure.b, state.settings.diagonalRule) * state.map.cellMeters)} m · ${gridDistance(measure.a, measure.b, state.settings.diagonalRule)} cases`}
              </text>
            </svg>
          )}
          {floats.map((f) => {
            const c = state.combatants[f.combatantId];
            if (!c?.position) return null;
            const center = footprint(c.position, c.size);
            const cx2 = (center.reduce((a, p) => a + p.x, 0) / center.length + 0.5) * size;
            const cy2 = (center.reduce((a, p) => a + p.y, 0) / center.length + 0.5) * size;
            return (
              <div key={f.id} className={s.float} style={{ left: cx2, top: cy2, color: f.color, fontSize: f.big ? 30 : 20 }}>
                {f.text}
              </div>
            );
          })}
        </div>
      </div>
      <div className={s.zoomControls}>
        <button type="button" onClick={() => zoomAt(1 / 1.15)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" onClick={() => zoomAt(1.15)} aria-label="Zoomer">
          +
        </button>
        <button
          type="button"
          onClick={() => {
            userMoved.current = false;
            fit();
          }}
        >
          Recentrer
        </button>
        {measure && (
          <button type="button" onClick={() => setMeasure(null)}>
            Effacer la mesure
          </button>
        )}
      </div>
    </div>
  );
}

export const conditionColor = (name: string) => getCondition(name)?.color ?? 'var(--gold)';
