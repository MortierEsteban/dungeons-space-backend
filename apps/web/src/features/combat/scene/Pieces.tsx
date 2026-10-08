import { getCondition, type Combatant } from '@ds/rules';
import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';
import { cx } from '../../../shared/ui/components';
import type { FloatText } from '../Board';
import s from '../combat.module.css';
import { footprintCenter, type Frame } from './coords';
import { modelHeight } from './fit';
import { FittedModel, ModelBoundary, type ModelPose } from './model';
import { beaconMaterial, useAnimatedMaterial, useDisposable } from './shaders';
import { loadImage, SIDE_COLOR, tokenFace } from './textures';

const BAND_PCT = { Indemne: 1, Blessé: 0.7, Sanglant: 0.45, Agonisant: 0.2, 'À terre': 0 } as const;
export const hpPct = (c: Combatant) => (c.hp !== null && c.maxHp ? c.hp / c.maxHp : BAND_PCT[c.hpBand]);
const BAND_ORDER = Object.keys(BAND_PCT);

/** Vitesse de glissement d'un pion (cases par seconde). */
const GLIDE = 6.5;

interface PieceProps {
  c: Combatant;
  frame: Frame;
  selected: boolean;
  active: boolean;
  targeting: boolean;
  /** Statistiques cachées aux joueurs (le MJ voit le pion estompé). */
  veiled: boolean;
  floats: FloatText[];
  onDown(e: ThreeEvent<PointerEvent>, id: string): void;
}

/** Jeton simple par défaut : une pièce frappée aux couleurs du camp (portrait ou initiales). */
export function Coin({ c, dim, ghost }: { c: Pick<Combatant, 'short' | 'side' | 'size' | 'portraitUrl'>; dim?: boolean; ghost?: boolean }) {
  const [portrait, setPortrait] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    setPortrait(null);
    if (c.portraitUrl) loadImage(c.portraitUrl).then((img) => live && setPortrait(img), () => undefined);
    return () => void (live = false);
  }, [c.portraitUrl]);
  const face = useMemo(() => tokenFace(c.short, c.side, portrait), [c.short, c.side, portrait]);
  useDisposable(face);
  const r = 0.4 * c.size;
  const h = 0.13 * Math.sqrt(c.size);
  const tone = dim ? '#555' : '#ffffff';
  const opacity = ghost ? 0.5 : 1;
  return (
    <group>
      <mesh castShadow receiveShadow position-y={h / 2}>
        <cylinderGeometry args={[r, r * 1.05, h, 48]} />
        <meshStandardMaterial attach="material-0" color={dim ? '#3a3540' : SIDE_COLOR[c.side]} metalness={0.75} roughness={0.32} transparent={ghost} opacity={opacity} />
        <meshStandardMaterial attach="material-1" map={face} color={tone} emissiveMap={face} emissive="#ffffff" emissiveIntensity={dim ? 0.04 : 0.32} roughness={0.55} metalness={0.15} transparent={ghost} opacity={opacity} />
        <meshStandardMaterial attach="material-2" color="#120d18" transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position-y={h} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[r * 0.985, 0.018 * c.size, 8, 64]} />
        <meshStandardMaterial color={dim ? '#5a5248' : '#e8d3a0'} metalness={0.9} roughness={0.25} transparent={ghost} opacity={opacity} />
      </mesh>
    </group>
  );
}

function GroundRing({ inner, outer, color, opacity = 0.9, spin = 0, pulse = 0 }: { inner: number; outer: number; color: string; opacity?: number; spin?: number; pulse?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    if (spin) m.rotation.z = clock.elapsedTime * spin;
    if (pulse) m.scale.setScalar(1 + Math.sin(clock.elapsedTime * pulse) * 0.06);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.014}>
      <ringGeometry args={[inner, outer, 64, 1, 0, spin ? Math.PI * 1.7 : Math.PI * 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Beacon({ radius, color }: { radius: number; color: string }) {
  const mat = useAnimatedMaterial(() => beaconMaterial(color), [color]);
  return (
    <mesh position-y={1.3} material={mat}>
      <cylinderGeometry args={[radius, radius * 1.1, 2.6, 40, 1, true]} />
    </mesh>
  );
}

/**
 * Une créature sur le plateau : pion (ou modèle 3D), halo du camp, anneaux d'état,
 * plaque de nom et barre de vie. Glisse vers sa nouvelle case, s'oriente dans le sens
 * de la marche, tremble quand elle encaisse et tombe quand elle est à terre.
 */
export function Piece({ c, frame, selected, active, targeting, veiled, floats, onDown }: PieceProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const [moving, setMoving] = useState(false);
  const dead = c.hpBand === 'À terre';
  const [tx, tz] = c.position ? footprintCenter(frame, c.position, c.size) : [0, 0];

  const motion = useRef({ x: tx, z: tz, from: 0, yaw: c.side === 'enemy' ? -Math.PI / 2 : Math.PI / 2, shake: 0, moving: false });

  // Encaisse un coup : tremblement bref (PV en baisse, ou bande qui se dégrade si PV masqués).
  const prev = useRef({ hp: c.hp, band: c.hpBand });
  useEffect(() => {
    const p = prev.current;
    const hurt = c.hp !== null && p.hp !== null ? c.hp < p.hp : BAND_ORDER.indexOf(c.hpBand) > BAND_ORDER.indexOf(p.band);
    if (hurt) motion.current.shake = 1;
    prev.current = { hp: c.hp, band: c.hpBand };
  }, [c.hp, c.hpBand]);

  useFrame(({ clock }, dt) => {
    const m = motion.current;
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;
    const dx = tx - m.x;
    const dz = tz - m.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.005) {
      if (!m.moving) {
        m.moving = true;
        m.from = dist;
        setMoving(true);
      }
      const step = Math.min(dist, GLIDE * dt);
      m.x += (dx / dist) * step;
      m.z += (dz / dist) * step;
      const targetYaw = Math.atan2(dx, dz);
      const delta = Math.atan2(Math.sin(targetYaw - m.yaw), Math.cos(targetYaw - m.yaw));
      m.yaw += delta * Math.min(1, dt * 12);
    } else if (m.moving) {
      m.moving = false;
      m.x = tx;
      m.z = tz;
      setMoving(false);
    }
    // Saut de puce du jeton pendant le déplacement, flottement de la créature active.
    const progress = m.moving && m.from > 0 ? 1 - dist / m.from : 0;
    const hop = !c.modelUrl && m.moving ? Math.sin(progress * Math.PI) * Math.min(0.5, m.from * 0.12) : 0;
    const bob = active && !dead && !c.modelUrl ? 0.05 + Math.sin(clock.elapsedTime * 2.6) * 0.04 : 0;
    m.shake = Math.max(0, m.shake - dt * 2.2);
    const shake = m.shake > 0 ? Math.sin(clock.elapsedTime * 70) * 0.07 * m.shake : 0;
    g.position.set(m.x + shake, 0, m.z);
    b.position.y = hop + bob;
    b.rotation.y = c.modelUrl ? m.yaw : 0;
  });

  if (!c.position) return null;
  const color = SIDE_COLOR[c.side];
  const r = 0.4 * c.size;
  const pose: ModelPose = dead ? 'dead' : moving ? 'walk' : 'idle';
  const head = c.modelUrl ? modelHeight(c.size) + 0.25 : 0.42 + (active ? 0.12 : 0);
  const pct = hpPct(c);
  const coin = <Coin c={c} dim={dead} ghost={veiled} />;

  return (
    <group
      ref={root}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onDown(e, c.id);
      }}
      onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
      onPointerOut={() => setHover(false)}
    >
      {/* Zone de prise généreuse : un modèle fin reste facile à attraper. */}
      <mesh position-y={c.modelUrl ? head / 2 : 0.2}>
        <cylinderGeometry args={[r * 1.05, r * 1.05, c.modelUrl ? head : 0.45, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <GroundRing inner={r * 1.02} outer={r * 1.14} color={dead ? '#5a5248' : color} opacity={dead ? 0.4 : 0.85} />
      {selected && <GroundRing inner={r * 1.2} outer={r * 1.3} color="#e8d3a0" spin={0.9} />}
      {targeting && !dead && <GroundRing inner={r * 1.2} outer={r * 1.34} color="#f2b3cf" pulse={7} />}
      {active && !dead && (
        <>
          <GroundRing inner={r * 1.36} outer={r * 1.46} color="#7cc6ff" pulse={3.2} />
          <Beacon radius={r * 1.05} color="#4fb3ff" />
        </>
      )}

      <group ref={body}>
        {c.modelUrl ? (
          <ModelBoundary resetKey={c.modelUrl} fallback={coin}>
            <Suspense fallback={coin}>
              <FittedModel url={c.modelUrl} size={c.size} pose={pose} ghost={veiled} dim={dead} />
            </Suspense>
          </ModelBoundary>
        ) : (
          coin
        )}
      </group>

      <Html position={[0, head, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className={cx(s.plate, dead && s.plateDead)}>
          {(hover || selected || active) && <span className={s.plateName}>{c.name}</span>}
          <span className={s.plateHp}>
            <span style={{ width: `${pct * 100}%`, background: pct < 0.34 ? 'var(--magenta-light)' : c.side === 'ally' ? 'var(--arcane)' : 'var(--gold)' }} />
          </span>
          {c.conditions.length > 0 && (
            <span className={s.platePips}>
              {c.conditions.slice(0, 5).map((x) => (
                <span key={x.name} title={x.name} style={{ background: getCondition(x.name)?.color ?? 'var(--gold)' }} />
              ))}
            </span>
          )}
        </div>
      </Html>

      {floats.map((f) => (
        <Html key={f.id} position={[0, head + 0.3, 0]} center zIndexRange={[40, 31]} style={{ pointerEvents: 'none' }}>
          <div className={s.float3d} style={{ color: f.color, fontSize: f.big ? 30 : 22 }}>
            {f.text}
          </div>
        </Html>
      ))}
    </group>
  );
}

/** Aperçu translucide pendant qu'on fait glisser un pion. */
export function GhostPiece({ c, frame, cell }: { c: Combatant; frame: Frame; cell: { x: number; y: number } }) {
  const [x, z] = footprintCenter(frame, cell, c.size);
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 0.08 + Math.sin(clock.elapsedTime * 5) * 0.03;
  });
  return (
    <group position={[x, 0, z]}>
      <GroundRing inner={0.42 * c.size} outer={0.5 * c.size} color="#7cc6ff" />
      <group ref={ref}>
        <Coin c={c} ghost />
      </group>
    </group>
  );
}

