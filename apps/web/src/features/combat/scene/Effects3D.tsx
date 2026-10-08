import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { AdditiveBlending, QuadraticBezierCurve3, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { FX_FLIGHT as FLIGHT, FX_IMPACT as IMPACT, type AttackFx } from './support';


const TRAIL = 7;

/**
 * Trajectoire en arc (plus haute si la cible est loin) ; la traînée est faite de
 * sphères additives qui suivent la tête avec un léger retard. Critique : gerbe d'or
 * et onde de choc plus large ; raté : le projectile file au-delà de la cible et s'éteint.
 */
export function AttackEffect({ fx, from, to }: { fx: AttackFx; from: [number, number]; to: [number, number] }) {
  const start = useRef<number | null>(null);
  const trail = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  const sparks = useRef<Group>(null);
  const color = fx.crit ? '#ffd98a' : fx.hit ? '#f08ab8' : '#a8b8d8';

  // Trajectoire figée au lancement : le projectile ne suit pas un pion qui bouge ensuite.
  const [curve] = useState(() => {
    const a = new Vector3(from[0], 0.7, from[1]);
    let b = new Vector3(to[0], 0.55, to[1]);
    if (!fx.hit) b = b.clone().add(b.clone().sub(a).setY(0).normalize().multiplyScalar(1.2)).setY(0.3);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.8 + a.distanceTo(b) * 0.18;
    return new QuadraticBezierCurve3(a, mid, b);
  });
  const sparkDirs = useMemo(
    () => Array.from({ length: fx.crit ? 14 : 8 }, (_, i) => new Vector3(Math.cos(i * 2.4), 0.6 + ((i * 37) % 10) / 10, Math.sin(i * 2.4)).normalize()),
    [fx.crit],
  );

  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    const p = Math.min(1, t / FLIGHT);
    trail.current?.children.forEach((child, i) => {
      const k = Math.max(0, p - i * 0.05);
      child.position.copy(curve.getPoint(k));
      child.visible = t < FLIGHT + (fx.hit ? 0 : 0.25) && k > 0;
      ((child as Mesh).material as MeshBasicMaterial).opacity = (1 - i / TRAIL) * (fx.hit ? 1 : Math.max(0, 1 - (t - FLIGHT) * 4));
    });
    const it = (t - FLIGHT) / IMPACT;
    const show = fx.hit && it >= 0 && it <= 1;
    const end = curve.getPoint(1);
    if (ring.current) {
      ring.current.visible = show;
      ring.current.position.set(end.x, 0.03, end.z);
      ring.current.scale.setScalar(0.2 + it * (fx.crit ? 2.4 : 1.4));
      (ring.current.material as MeshBasicMaterial).opacity = Math.max(0, 1 - it);
    }
    if (flash.current) {
      flash.current.visible = show && it < 0.5;
      flash.current.position.copy(end);
      flash.current.scale.setScalar((fx.crit ? 0.7 : 0.45) * (1 + it * 2));
      (flash.current.material as MeshBasicMaterial).opacity = Math.max(0, 1 - it * 2);
    }
    sparks.current?.children.forEach((child, i) => {
      child.visible = show;
      const d = sparkDirs[i]!;
      const r = it * (fx.crit ? 1.6 : 0.9);
      child.position.set(end.x + d.x * r, Math.max(0.03, end.y + d.y * r - it * it * 1.2), end.z + d.z * r);
      ((child as Mesh).material as MeshBasicMaterial).opacity = Math.max(0, 1 - it);
    });
  });

  return (
    <group>
      <group ref={trail}>
        {Array.from({ length: TRAIL }, (_, i) => (
          <mesh key={i} scale={(fx.crit ? 0.16 : 0.12) * (1 - i / (TRAIL + 2))} visible={false}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color={color} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.7, 0.85, 48]} />
        <meshBasicMaterial color={color} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color={color} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={sparks}>
        {sparkDirs.map((_, i) => (
          <mesh key={i} scale={0.05} visible={false}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={color} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
