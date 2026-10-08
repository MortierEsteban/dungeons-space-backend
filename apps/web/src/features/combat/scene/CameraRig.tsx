import { MapControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import { OrthographicCamera as OrthoCam, PerspectiveCamera as PerspCam, Vector3 } from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { WALL_HEIGHT, type Frame } from './coords';

export type CamMode = 'iso' | 'free';

export interface CameraApi {
  zoom(factor: number): void;
  /** Pivote la vue d'un quart de tour (−1 : sens horaire). */
  rotate(dir: 1 | -1): void;
  fit(): void;
}

/** Angle polaire (depuis la verticale) : isométrie vraie ≈ 54,7°, vue libre un peu plus plongeante. */
const POLAR: Record<CamMode, number> = { iso: Math.acos(1 / Math.sqrt(3)), free: 0.86 };
const FOV = 38;
const UP = new Vector3(0, 1, 0);

interface Props {
  mode: CamMode;
  frame: Frame;
  api: RefObject<CameraApi | null>;
  controls: RefObject<MapControlsImpl | null>;
  /** Azimut courant, conservé quand on change de caméra. */
  azimuth: RefObject<number>;
}

/**
 * Caméra du plateau : orthographique en isométrie (lisible, sans déformation), perspective
 * en vue libre. Clic droit / deux doigts pour pivoter, molette / pincement pour zoomer,
 * glisser pour se déplacer. Les quarts de tour sont animés.
 */
export function CameraRig({ mode, frame, api, controls, azimuth }: Props) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const spin = useRef(0);
  /** Tant que l'utilisateur n'a pas bougé la vue, elle suit la taille du panneau. */
  const userMoved = useRef(false);

  const offsetFor = (dist: number) => new Vector3().setFromSphericalCoords(dist, POLAR[mode], azimuth.current);

  const fit = () => {
    const c = controls.current;
    const target = new Vector3(0, 0, 0);
    if (camera instanceof OrthoCam) {
      camera.position.copy(offsetFor(80));
      camera.lookAt(target);
      camera.updateMatrixWorld();
      // On projette les coins du plateau (socle et sommet des murs) dans le repère caméra.
      const hx = frame.cols / 2 + 0.4;
      const hz = frame.rows / 2 + 0.4;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [-0.5, WALL_HEIGHT]) {
        const p = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      camera.zoom = Math.max(4, Math.min(size.width / ((maxX - minX) * 1.06), size.height / ((maxY - minY) * 1.1)));
      camera.updateProjectionMatrix();
    } else if (camera instanceof PerspCam) {
      const radius = 0.5 * Math.hypot(frame.cols, frame.rows);
      const half = ((FOV / 2) * Math.PI) / 180;
      const fitH = radius / Math.tan(half);
      const fitW = radius / (Math.tan(half) * Math.max(0.3, camera.aspect));
      camera.position.copy(offsetFor(Math.max(fitH, fitW) * 0.92));
      camera.lookAt(target);
    }
    if (c) {
      c.target.copy(target);
      c.update();
    }
  };

  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    api.current = {
      fit: () => {
        userMoved.current = false;
        fitRef.current();
      },
      rotate: (dir) => {
        userMoved.current = true;
        spin.current += (dir * Math.PI) / 2;
      },
      zoom: (factor) => {
        userMoved.current = true;
        const c = controls.current;
        if (camera instanceof OrthoCam) {
          camera.zoom = Math.max(4, Math.min(260, camera.zoom * factor));
          camera.updateProjectionMatrix();
        } else if (c) {
          const off = camera.position.clone().sub(c.target);
          off.setLength(Math.max(3, Math.min(120, off.length() / factor)));
          camera.position.copy(c.target).add(off);
        }
        c?.update();
      },
    };
  });

  // Cadrage initial, à chaque changement de caméra ou de taille de carte.
  useEffect(() => {
    userMoved.current = false;
    const id = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(id);
  }, [camera, frame.cols, frame.rows]);
  useEffect(() => {
    if (!userMoved.current) fitRef.current();
  }, [size.width, size.height]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (Math.abs(spin.current) > 1e-4) {
      const step = Math.sign(spin.current) * Math.min(Math.abs(spin.current), dt * Math.PI * 1.8);
      const off = camera.position.clone().sub(c.target).applyAxisAngle(UP, step);
      camera.position.copy(c.target).add(off);
      spin.current -= step;
      c.update();
      azimuth.current = c.getAzimuthalAngle();
    }
  });

  return (
    <>
      {mode === 'iso' ? (
        <OrthographicCamera key="iso" makeDefault position={offsetFor(80).toArray()} zoom={40} near={0.1} far={400} />
      ) : (
        <PerspectiveCamera key="free" makeDefault position={offsetFor(30).toArray()} fov={FOV} near={0.1} far={400} />
      )}
      <MapControls
        key={`controls-${mode}`}
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.14}
        screenSpacePanning={false}
        zoomToCursor
        minPolarAngle={mode === 'iso' ? 0.7 : 0.18}
        maxPolarAngle={mode === 'iso' ? 1.08 : 1.32}
        minZoom={4}
        maxZoom={260}
        minDistance={3}
        maxDistance={120}
        onStart={() => void (userMoved.current = true)}
        onEnd={() => void (azimuth.current = controls.current?.getAzimuthalAngle() ?? azimuth.current)}
      />
    </>
  );
}
