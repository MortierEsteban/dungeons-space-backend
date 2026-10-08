import type { MapObject, TerrainKind } from '@ds/rules';
import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { AdditiveBlending, type Group, type PointLight } from 'three';
import { OBJECT_META } from '../Board';
import s from '../combat.module.css';
import { cellCenter, cellRandom, type Frame } from './coords';

const WOOD = '#6b4a2f';
const WOOD_DARK = '#3e2a1b';
const IRON = '#3b3a42';
const GOLD = '#c9a96a';
const STONE = '#77708a';
/** Lumières réelles des flammes (couleurs opaques, portée reprise du plateau 2D). */
const FIRE_LIGHT = { radius: OBJECT_META.campfire.light!.radius, color: '#ff9a4a' };
const TORCH_LIGHT = { radius: OBJECT_META.torch.light!.radius, color: '#ffd08a' };

/** Flamme vivante : deux cônes additifs qui vacillent, et une vraie lumière qui danse avec eux. */
function Flame({ y, scale = 1, light, intensity }: { y: number; scale?: number; light: { radius: number; color: string } | null; intensity: number }) {
  const outer = useRef<Group>(null);
  const lamp = useRef<PointLight>(null);
  const seed = useRef(Math.random() * 100);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed.current;
    const f = 0.82 + Math.sin(t) * 0.08 + Math.sin(t * 2.7) * 0.06 + Math.sin(t * 5.3) * 0.04;
    outer.current?.scale.set(scale * (1.05 - f * 0.1), scale * f * 1.1, scale * (1.05 - f * 0.1));
    if (lamp.current) lamp.current.intensity = intensity * f;
  });
  return (
    <group position-y={y}>
      <group ref={outer}>
        <mesh position-y={0.16}>
          <coneGeometry args={[0.11, 0.36, 12, 1, true]} />
          <meshBasicMaterial color="#ff7a2a" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position-y={0.12}>
          <coneGeometry args={[0.06, 0.24, 10, 1, true]} />
          <meshBasicMaterial color="#ffe08a" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      {light && <pointLight ref={lamp} color={light.color} distance={light.radius + 1.5} decay={1.4} intensity={intensity} position-y={0.35} />}
    </group>
  );
}

function Chest({ open }: { open: boolean }) {
  const lid = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = lid.current;
    if (g) g.rotation.x += ((open ? -1.9 : 0) - g.rotation.x) * Math.min(1, dt * 8);
  });
  return (
    <group>
      <mesh castShadow receiveShadow position-y={0.17}>
        <boxGeometry args={[0.62, 0.34, 0.42]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.36, 0.44]} />
          <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      <group ref={lid} position={[0, 0.34, -0.21]}>
        <mesh castShadow position={[0, 0.06, 0.21]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.21, 0.21, 0.62, 16, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
      </group>
      {open && (
        <mesh position-y={0.33}>
          <boxGeometry args={[0.52, 0.02, 0.32]} />
          <meshBasicMaterial color="#ffd27a" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Barrel() {
  return (
    <group>
      <mesh castShadow receiveShadow position-y={0.3}>
        <cylinderGeometry args={[0.24, 0.24, 0.6, 18]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[0.12, 0.48].map((y) => (
        <mesh key={y} position-y={y} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.245, 0.018, 6, 24]} />
          <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Porte : orientée d'après les murs voisins, elle pivote sur ses gonds quand on l'ouvre. */
function Door({ open, alongX }: { open: boolean; alongX: boolean }) {
  const leaf = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = leaf.current;
    if (g) g.rotation.y += ((open ? -Math.PI / 2 : 0) - g.rotation.y) * Math.min(1, dt * 7);
  });
  return (
    <group rotation-y={alongX ? 0 : Math.PI / 2}>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} castShadow position={[x, 0.6, 0]}>
          <boxGeometry args={[0.12, 1.2, 0.2]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.2, 0]}>
        <boxGeometry args={[1.12, 0.14, 0.22]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <group ref={leaf} position={[-0.44, 0, 0]}>
        <mesh castShadow receiveShadow position={[0.44, 0.56, 0]}>
          <boxGeometry args={[0.88, 1.1, 0.07]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0.74, 0.56, 0.05]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Campfire({ intensity }: { intensity: number }) {
  const rnd = cellRandom(1, 2, 3);
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3]} scale={0.07 + rnd() * 0.03}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#5c5560" roughness={1} flatShading />
          </mesh>
        );
      })}
      {[0, Math.PI / 2.5, -Math.PI / 2.5].map((r) => (
        <mesh key={r} castShadow position-y={0.07} rotation={[0, r, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.05, 0.46, 8]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={1} />
        </mesh>
      ))}
      <mesh position-y={0.04}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshBasicMaterial color="#ff5a1a" toneMapped={false} />
      </mesh>
      <Flame y={0.06} scale={1.3} light={FIRE_LIGHT} intensity={intensity * 1.4} />
    </group>
  );
}

function Torch({ intensity }: { intensity: number }) {
  return (
    <group>
      <mesh castShadow position-y={0.45}>
        <cylinderGeometry args={[0.035, 0.05, 0.9, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={1} />
      </mesh>
      <mesh position-y={0.92}>
        <cylinderGeometry args={[0.08, 0.05, 0.1, 10]} />
        <meshStandardMaterial color={IRON} metalness={0.7} roughness={0.4} />
      </mesh>
      <Flame y={0.96} scale={0.8} light={TORCH_LIGHT} intensity={intensity} />
    </group>
  );
}

function Trap({ secret }: { secret: boolean }) {
  const spikes = [-0.2, 0, 0.2].flatMap((x) => [-0.2, 0, 0.2].map((z) => [x, z] as const));
  return (
    <group>
      <mesh receiveShadow position-y={0.02}>
        <boxGeometry args={[0.8, 0.04, 0.8]} />
        <meshStandardMaterial color={secret ? '#b0306a' : IRON} transparent={secret} opacity={secret ? 0.45 : 1} metalness={0.5} roughness={0.5} />
      </mesh>
      {spikes.map(([x, z]) => (
        <mesh key={`${x},${z}`} castShadow position={[x, 0.11, z]}>
          <coneGeometry args={[0.045, 0.16, 6]} />
          <meshStandardMaterial color="#9a96a8" metalness={0.8} roughness={0.3} transparent={secret} opacity={secret ? 0.45 : 1} />
        </mesh>
      ))}
    </group>
  );
}

function Altar() {
  const rune = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = rune.current;
    if (!g) return;
    g.rotation.y = clock.elapsedTime * 0.8;
    g.position.y = 0.72 + Math.sin(clock.elapsedTime * 2) * 0.04;
  });
  return (
    <group>
      <mesh castShadow receiveShadow position-y={0.08}>
        <boxGeometry args={[0.9, 0.16, 0.6]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position-y={0.34}>
        <boxGeometry args={[0.7, 0.36, 0.44]} />
        <meshStandardMaterial color="#8c84a0" roughness={0.85} />
      </mesh>
      <group ref={rune}>
        <mesh rotation-x={Math.PI / 4} rotation-z={Math.PI / 4}>
          <octahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial color="#7cc6ff" emissive="#4fb3ff" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Statue() {
  return (
    <group>
      <mesh castShadow receiveShadow position-y={0.12}>
        <boxGeometry args={[0.66, 0.24, 0.66]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh castShadow position-y={0.62}>
        <capsuleGeometry args={[0.16, 0.5, 6, 12]} />
        <meshStandardMaterial color="#a39cb4" roughness={0.75} />
      </mesh>
      <mesh castShadow position-y={1.05}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color="#a39cb4" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0.2, 0.75, 0]} rotation-z={-0.5}>
        <boxGeometry args={[0.05, 0.7, 0.05]} />
        <meshStandardMaterial color="#8c84a0" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}

interface PropProps {
  o: MapObject;
  frame: Frame;
  terrain: Record<string, TerrainKind>;
  selected: boolean;
  /** Intensité des flammes selon l'ambiance (plus fortes la nuit). */
  lightLevel: number;
  onDown(e: ThreeEvent<PointerEvent>, id: string): void;
}

/** Décor posé par le MJ : coffres, portes, feux… en volume, interactifs, éclairés. */
export function Prop3D({ o, frame, terrain, selected, lightLevel, onDown }: PropProps) {
  const [hover, setHover] = useState(false);
  const [x, z] = cellCenter(frame, o.position);
  const hidden = o.secret && !o.revealed;
  const wallAt = (dx: number, dy: number) => terrain[`${o.position.x + dx},${o.position.y + dy}`] === 'wall';
  const meta = OBJECT_META[o.kind];
  let body;
  switch (o.kind) {
    case 'chest':
      body = <Chest open={o.open} />;
      break;
    case 'barrel':
      body = <Barrel />;
      break;
    case 'door':
      body = <Door open={o.open} alongX={!(wallAt(0, -1) || wallAt(0, 1)) || wallAt(-1, 0) || wallAt(1, 0)} />;
      break;
    case 'campfire':
      body = <Campfire intensity={lightLevel} />;
      break;
    case 'torch':
      body = <Torch intensity={lightLevel} />;
      break;
    case 'trap':
      body = <Trap secret={hidden} />;
      break;
    case 'altar':
      body = <Altar />;
      break;
    case 'statue':
      body = <Statue />;
      break;
  }
  return (
    <group
      position={[x, 0, z]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onDown(e, o.id);
      }}
      onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
      onPointerOut={() => setHover(false)}
    >
      <mesh position-y={0.4}>
        <boxGeometry args={[0.9, 0.8, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {(selected || hidden) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <ringGeometry args={[0.46, 0.52, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={selected ? '#7cc6ff' : '#e07aa8'} transparent opacity={0.9} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {body}
      {(hover || selected) && (
        <Html position={[0, 1.1, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className={s.plate}>
            <span className={s.plateName}>
              {o.label || meta.label}
              {o.kind === 'door' || o.kind === 'chest' ? (o.open ? ' · ouvert' : ' · fermé') : ''}
              {hidden ? ' · secret' : ''}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
