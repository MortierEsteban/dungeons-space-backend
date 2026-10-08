import { cellKey, reachableCells, zoneCells, type Cell } from '@ds/rules';
import { Sparkles, Stars } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Plane, Raycaster, SRGBColorSpace, TextureLoader, Vector2, Vector3, type Texture } from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { num } from '../../../shared/format';
import type { BoardProps } from '../Board';
import { CameraRig, type CameraApi, type CamMode } from './CameraRig';
import { cellAt, footprintCenter, gridGeometry, inside, type Frame } from './coords';
import { AttackEffect } from './Effects3D';
import type { AttackFx } from './support';
import { CellField, HoverCell, Measure, MovePath, ZoneField } from './Overlays3D';
import { GhostPiece, Piece } from './Pieces';
import { Prop3D } from './Props3D';
import { useDisposable } from './shaders';
import { Fog3D } from './Fog3D';
import { Terrain3D } from './Terrain3D';
import { flagstoneTexture } from './textures';

export type Ambiance = 'day' | 'dusk' | 'night';

export interface ScenePrefs {
  cam: CamMode;
  grid: boolean;
  lowWalls: boolean;
  ambiance: Ambiance;
}

/** Éclairage par ambiance : la nuit, ce sont les torches et les feux qui font la scène. */
const LIGHTING: Record<Ambiance, { sky: string; ground: string; hemi: number; sun: string; sunI: number; sunPos: [number, number, number]; fire: number }> = {
  day: { sky: '#fff6e8', ground: '#4a3f55', hemi: 1.5, sun: '#fff1d6', sunI: 2.1, sunPos: [-0.5, 1, -0.35], fire: 1.2 },
  dusk: { sky: '#c4b0f0', ground: '#2a1830', hemi: 0.95, sun: '#ffb27a', sunI: 1.7, sunPos: [-0.9, 0.55, -0.4], fire: 3.5 },
  night: { sky: '#5d5c9e', ground: '#0e0a14', hemi: 0.32, sun: '#9db8ff', sunI: 0.55, sunPos: [0.4, 1, -0.6], fire: 8 },
};

/** Carte importée par le MJ, recadrée « cover » comme sur le plateau 2D. */
function useMapTexture(url: string | null, frame: Frame): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    if (!url) return setTex(null);
    let live = true;
    new TextureLoader().load(
      url,
      (t) => {
        if (!live) return t.dispose();
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        setTex(t);
      },
      undefined,
      () => live && setTex(null),
    );
    return () => void (live = false);
  }, [url]);
  useDisposable(tex);
  useEffect(() => {
    const img = tex?.image as { width: number; height: number } | undefined;
    if (!tex || !img) return;
    const mapAspect = frame.cols / frame.rows;
    const imgAspect = img.width / img.height;
    tex.repeat.set(imgAspect > mapAspect ? mapAspect / imgAspect : 1, imgAspect > mapAspect ? 1 : imgAspect / mapAspect);
    tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
    tex.needsUpdate = true;
  }, [tex, frame.cols, frame.rows]);
  return tex;
}

function Board({ frame, background, grid }: { frame: Frame; background: string | null; grid: boolean }) {
  const map = useMapTexture(background, frame);
  const stones = useMemo(() => {
    const t = flagstoneTexture().clone();
    t.repeat.set(frame.cols / 2, frame.rows / 2);
    t.needsUpdate = true;
    return t;
  }, [frame.cols, frame.rows]);
  useDisposable(stones);
  const lines = useMemo(() => gridGeometry(frame), [frame]);
  useDisposable(lines);
  const W = frame.cols;
  const H = frame.rows;
  const rim = 0.32;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={map ?? stones} roughness={0.92} metalness={0} />
      </mesh>
      {/* Socle de la table : bois sombre et filet doré, la carte devient un diorama. */}
      <mesh position-y={-0.36} receiveShadow castShadow>
        <boxGeometry args={[W + rim * 2, 0.7, H + rim * 2]} />
        <meshStandardMaterial color="#1c1322" roughness={0.75} metalness={0.1} />
      </mesh>
      {(
        [
          [0, -(H / 2 + rim / 2), W + rim * 2, rim],
          [0, H / 2 + rim / 2, W + rim * 2, rim],
          [-(W / 2 + rim / 2), 0, rim, H],
          [W / 2 + rim / 2, 0, rim, H],
        ] as const
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.025, z]} receiveShadow>
          <boxGeometry args={[w, 0.05, d]} />
          <meshStandardMaterial color="#c9a96a" metalness={0.85} roughness={0.32} />
        </mesh>
      ))}
      {grid && (
        <lineSegments geometry={lines}>
          <lineBasicMaterial color={map ? '#f3e6c4' : '#c9a96a'} transparent opacity={map ? 0.22 : 0.3} depthWrite={false} />
        </lineSegments>
      )}
    </group>
  );
}

type Gesture = { kind: 'click' | 'token' | 'paint' | 'measure' | 'object'; x: number; y: number; id?: string };

interface SceneProps extends BoardProps {
  effects: AttackFx[];
  prefs: ScenePrefs;
  api: RefObject<CameraApi | null>;
  azimuth: RefObject<number>;
  measure: { a: Cell; b: Cell } | null;
  setMeasure: Dispatch<SetStateAction<{ a: Cell; b: Cell } | null>>;
}

/** Tout ce qui vit dans le canevas WebGL : décor, pions, superpositions et gestes. */
export function Scene(p: SceneProps) {
  const { state, isGm, userId, tool, options, selectedId, selectedObjectId, onSelect, onSelectObject, targeting, onTarget, floats, fog, readOnly, send, effects, prefs, measure, setMeasure, aim, markedIds = [], flashes = [] } = p;
  const frame = useMemo<Frame>(() => ({ cols: state.map.cols, rows: state.map.rows }), [state.map.cols, state.map.rows]);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useRef<MapControlsImpl | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [ghost, setGhost] = useState<{ id: string; cell: Cell } | null>(null);
  const [stroke, setStroke] = useState<Cell[]>([]);
  const [dragObject, setDragObject] = useState<Cell | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Set<number>());

  // Rayon caméra → plan du sol : la case sous le pointeur, où qu'il soit sur le canevas.
  const ray = useMemo(() => ({ caster: new Raycaster(), ndc: new Vector2(), ground: new Plane(new Vector3(0, 1, 0), 0), hit: new Vector3() }), []);
  const cellFromClient = (clientX: number, clientY: number): Cell | null => {
    const r = gl.domElement.getBoundingClientRect();
    ray.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.caster.setFromCamera(ray.ndc, camera);
    return ray.caster.ray.intersectPlane(ray.ground, ray.hit) ? cellAt(frame, ray.hit.x, ray.hit.z) : null;
  };

  const lockCamera = (locked: boolean) => {
    if (controls.current) controls.current.enabled = !locked;
  };

  const controllable = (id: string) => {
    const c = state.combatants[id];
    return !!c && !readOnly && (isGm || c.ownerUserId === userId);
  };

  // Portée de déplacement du pion sélectionné, selon le mouvement restant (comme en 2D).
  const reach = useMemo(() => {
    if (!selectedId || readOnly) return [] as Cell[];
    const c = state.combatants[selectedId];
    if (!c?.position || !(isGm || c.ownerUserId === userId)) return [];
    const remaining = state.status === 'active' && state.activeId === c.id ? Math.max(0, c.speed - c.resources.movementUsed) : c.speed;
    return [...reachableCells(state, c.id, remaining).keys()].map((k) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { x, y };
    });
  }, [state, selectedId, readOnly, isGm, userId]);
  const reachCost = useMemo(() => {
    const c = selectedId ? state.combatants[selectedId] : undefined;
    if (!c?.position || !ghost) return undefined;
    const remaining = state.status === 'active' && state.activeId === c.id ? Math.max(0, c.speed - c.resources.movementUsed) : c.speed;
    return reachableCells(state, c.id, remaining).get(cellKey(ghost.cell));
  }, [state, selectedId, ghost]);

  const zones = useMemo(() => state.map.zones.map((z) => ({ zone: z, cells: zoneCells(z, frame.cols, frame.rows) })), [state.map.zones, frame]);
  const preview = useMemo(
    () => (!aim && tool === 'zone' && hover && inside(frame, hover) && !readOnly ? zoneCells({ id: 'preview', ...options.zone, origin: hover }, frame.cols, frame.rows) : []),
    [aim, tool, hover, frame, readOnly, options.zone],
  );
  // Visée d'un sort de zone : gabarit sous le curseur, ou épinglé.
  const aimZone = aim ? (aim.pinned ?? (hover && inside(frame, hover) ? aim.zoneAt(hover) : null)) : null;
  const aimCells = useMemo(() => (aimZone ? zoneCells({ ...aimZone, id: 'aim' }, frame.cols, frame.rows) : []), [aimZone?.origin.x, aimZone?.origin.y, aimZone?.direction, aimZone?.size, aimZone?.shape, frame]);

  // Gestes : le pointeur est suivi au niveau du document pour ne jamais « perdre » un glisser.
  const latest = useRef({ state, ghost, stroke, dragObject, tool, options, send });
  latest.current = { state, ghost, stroke, dragObject, tool, options, send };
  useEffect(() => {
    const el = gl.domElement;
    const cancel = () => {
      gesture.current = null;
      setGhost(null);
      setStroke([]);
      setDragObject(null);
      lockCamera(false);
    };
    const down = (e: PointerEvent) => {
      pointers.current.add(e.pointerId);
      if (pointers.current.size > 1 && gesture.current) cancel();
    };
    const move = (e: PointerEvent) => {
      const cell = cellFromClient(e.clientX, e.clientY);
      setHover((h) => (cell && inside(frame, cell) ? (h && h.x === cell.x && h.y === cell.y ? h : cell) : null));
      const g = gesture.current;
      if (!g || !cell || !inside(frame, cell)) return;
      if (g.kind === 'token') setGhost((gh) => (gh && (gh.cell.x !== cell.x || gh.cell.y !== cell.y) ? { ...gh, cell } : gh));
      else if (g.kind === 'paint') setStroke((st) => (st.some((c) => c.x === cell.x && c.y === cell.y) ? st : [...st, cell]));
      else if (g.kind === 'measure') setMeasure((m) => (m ? { ...m, b: cell } : m));
      else if (g.kind === 'object') setDragObject(cell);
    };
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      gesture.current = null;
      lockCamera(false);
      if (!g) return;
      const { state: st, ghost: gh, stroke: sk, dragObject: dob, options: opt, send: sd, tool: tl } = latest.current;
      if (g.kind === 'click' && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) {
        onSelect(null);
        onSelectObject(null);
      } else if (g.kind === 'token' && gh) {
        const from = st.combatants[g.id!]?.position;
        if (from && (from.x !== gh.cell.x || from.y !== gh.cell.y)) sd({ type: 'move', combatantId: g.id!, to: gh.cell });
        setGhost(null);
      } else if (g.kind === 'paint' && sk.length) {
        if (tl === 'fog') sd({ type: 'reveal_cells', cells: sk, revealed: opt.fogBrush === 'reveal' });
        else sd({ type: 'paint_terrain', cells: sk, terrain: opt.brush === 'erase' ? null : opt.brush });
        setStroke([]);
      } else if (g.kind === 'object' && dob) {
        const obj = st.map.objects.find((o) => o.id === g.id);
        if (obj && (obj.position.x !== dob.x || obj.position.y !== dob.y)) sd({ type: 'update_object', objectId: obj.id, patch: { position: dob } });
        setDragObject(null);
      }
    };
    const leave = () => setHover(null);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Les valeurs changeantes sont lues via `latest` ; seuls caméra et cadre réinstallent les écouteurs.
  }, [gl, camera, frame]);

  const onTokenDown = (e: ThreeEvent<PointerEvent>, id: string) => {
    const at = state.combatants[id]?.position;
    if (aim && at) return aim.onAim(at);
    if (targeting) return onTarget(id);
    onSelect(id);
    onSelectObject(null);
    if (tool === 'select' && controllable(id)) {
      gesture.current = { kind: 'token', id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      lockCamera(true);
      setGhost({ id, cell: state.combatants[id]!.position! });
    }
  };

  const onObjectDown = (e: ThreeEvent<PointerEvent>, id: string) => {
    onSelectObject(id);
    onSelect(null);
    if (isGm && tool === 'select' && !readOnly) {
      gesture.current = { kind: 'object', id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      lockCamera(true);
    }
  };

  const onGroundDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const { clientX, clientY } = e.nativeEvent;
    const cell = cellFromClient(clientX, clientY);
    if (aim && cell && inside(frame, cell)) return aim.onAim(cell);
    if (readOnly || tool === 'select' || !cell || !inside(frame, cell)) {
      // Glisser = déplacer la vue (contrôles caméra) ; simple clic = désélection.
      if (tool === 'select') gesture.current = { kind: 'click', x: clientX, y: clientY };
      return;
    }
    if ((tool === 'terrain' || tool === 'fog') && isGm) {
      gesture.current = { kind: 'paint', x: clientX, y: clientY };
      lockCamera(true);
      setStroke([cell]);
    } else if (tool === 'measure') {
      gesture.current = { kind: 'measure', x: clientX, y: clientY };
      lockCamera(true);
      setMeasure({ a: cell, b: cell });
    } else if (tool === 'zone') {
      send({ type: 'add_zone', ...options.zone, origin: cell });
    } else if (tool === 'object' && isGm) {
      send({ type: 'add_object', kind: options.objectKind, position: cell });
    }
  };

  const light = LIGHTING[prefs.ambiance];
  const span = Math.max(frame.cols, frame.rows) / 2 + 3;
  const sunDir = new Vector3(...light.sunPos).normalize().multiplyScalar(span * 1.6);
  const strokeColor = tool === 'fog' ? (options.fogBrush === 'reveal' ? '#bfe4ff' : '#4a2a4e') : options.brush === 'erase' ? '#b0306a' : options.brush === 'wall' ? '#c9a96a' : options.brush === 'water' ? '#4fb3ff' : options.brush === 'lava' ? '#f08a50' : options.brush === 'vegetation' ? '#8fbf6a' : '#e8d3a0';
  const ghostC = ghost ? state.combatants[ghost.id] : undefined;
  const center = (id: string): [number, number] | null => {
    const c = state.combatants[id];
    return c?.position ? footprintCenter(frame, c.position, c.size) : null;
  };

  return (
    <>
      <CameraRig mode={prefs.cam} frame={frame} api={p.api} controls={controls} azimuth={p.azimuth} />

      <hemisphereLight args={[light.sky, light.ground, light.hemi]} />
      <directionalLight
        castShadow
        color={light.sun}
        intensity={light.sunI}
        position={sunDir.toArray()}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 4}
      />
      {prefs.cam === 'free' && (
        <>
          <Stars radius={140} depth={50} count={2500} factor={5} saturation={0.4} fade speed={0.4} />
          <fog attach="fog" args={['#0b0912', span * 2.2, span * 6]} />
        </>
      )}
      <Sparkles count={Math.round(frame.cols * frame.rows * 0.12)} scale={[frame.cols, 2.4, frame.rows]} position-y={1.3} size={2.2} speed={0.25} opacity={prefs.ambiance === 'day' ? 0.25 : 0.7} color={prefs.ambiance === 'night' ? '#7cc6ff' : '#e8d3a0'} />

      <Board frame={frame} background={state.map.background} grid={prefs.grid} />
      {/* Capteur du sol : reçoit les clics hors pions et objets. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} onPointerDown={onGroundDown}>
        <planeGeometry args={[frame.cols + 60, frame.rows + 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <Terrain3D frame={frame} terrain={state.map.terrain} lowWalls={prefs.lowWalls} />
      {fog && <Fog3D frame={frame} fog={fog} />}
      {stroke.length > 0 && <CellField frame={frame} cells={stroke} color={strokeColor} fill={0.45} curtain={0.25} />}
      {reach.length > 0 && <CellField frame={frame} cells={reach} color="#4fb3ff" fill={ghost ? 0.2 : 0.1} curtain={ghost ? 0.35 : 0.12} strength={0.7} />}
      {zones.map(({ zone, cells }) => (
        <ZoneField key={zone.id} frame={frame} zone={zone} cells={cells} />
      ))}
      {preview.length > 0 && <CellField frame={frame} cells={preview} color={options.zone.color} fill={0.12} curtain={0.5} strength={0.6} />}
      {aimZone && aimCells.length > 0 && <ZoneField frame={frame} zone={{ ...aimZone, id: 'aim' }} cells={aimCells} />}
      {flashes.map((f) => (
        <CellField key={f.id} frame={frame} cells={zoneCells({ ...f.zone, id: 'flash' }, frame.cols, frame.rows)} color={f.zone.color} fill={0.55} curtain={1.6} strength={1.4} />
      ))}
      {markedIds.map((id, i) => {
        const c = state.combatants[id];
        return c?.position ? <HoverCell key={`m${id}${i}`} frame={frame} cell={c.position} color="#f2b3cf" /> : null;
      })}
      {hover && !readOnly && (tool === 'terrain' || tool === 'fog' || tool === 'object' || tool === 'zone') && <HoverCell frame={frame} cell={hover} color={tool === 'terrain' || tool === 'fog' ? strokeColor : '#e8d3a0'} />}
      {dragObject && <HoverCell frame={frame} cell={dragObject} color="#7cc6ff" />}

      {state.map.objects.map((o) => (
        <Prop3D key={o.id} o={o} frame={frame} terrain={state.map.terrain} selected={selectedObjectId === o.id} lightLevel={light.fire} onDown={onObjectDown} />
      ))}

      {Object.values(state.combatants).map((c) => (
        <Piece
          key={c.id}
          c={c}
          frame={frame}
          selected={selectedId === c.id}
          active={state.status === 'active' && state.activeId === c.id}
          targeting={targeting}
          veiled={isGm && c.hidden}
          floats={floats.filter((f) => f.combatantId === c.id)}
          onDown={onTokenDown}
        />
      ))}
      {ghost && ghostC?.position && (ghost.cell.x !== ghostC.position.x || ghost.cell.y !== ghostC.position.y) && (
        <>
          <GhostPiece c={ghostC} frame={frame} cell={ghost.cell} />
          <MovePath frame={frame} from={ghostC.position} to={ghost.cell} size={ghostC.size} ok={reachCost !== undefined} label={reachCost !== undefined ? `${num(reachCost)} m` : 'hors de portée'} />
        </>
      )}
      {measure && <Measure frame={frame} a={measure.a} b={measure.b} state={state} />}

      {effects.map((fx) => {
        const from = center(fx.attackerId);
        const to = center(fx.targetId);
        return from && to ? <AttackEffect key={fx.id} fx={fx} from={from} to={to} /> : null;
      })}
    </>
  );
}

