import { useAnimations, useGLTF } from '@react-three/drei';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Color, LoopOnce, Mesh, type AnimationAction, type Group, type Material, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fitModel } from './fit';

/** Décodeur Draco servi localement (aucune ressource tierce). */
const DRACO_PATH = '/draco/';

export type ModelPose = 'idle' | 'walk' | 'dead';

/** Repère les clips usuels quel que soit l'outil d'export (Mixamo, Blender, Quaternius…). */
function pickClip(names: string[], pose: ModelPose): string | undefined {
  const find = (re: RegExp) => names.find((n) => re.test(n));
  if (pose === 'walk') return find(/walk|run|move/i);
  if (pose === 'dead') return find(/death|die|dead|defeat/i);
  return find(/idle|stand|breath/i) ?? names[0];
}

interface Props {
  url: string;
  /** Taille de la créature en cases (1 = M, 2 = G…). */
  size: number;
  pose: ModelPose;
  /** Estompé (statistiques cachées, côté MJ) ou grisé (à terre). */
  ghost?: boolean;
  dim?: boolean;
}

/**
 * Modèle 3D d'un joueur : cloné (squelettes compris), mis à l'échelle de la case,
 * posé au sol et centré sur son emprise, animations idle / marche / mort si présentes.
 */
export function FittedModel({ url, size, pose, ghost, dim }: Props) {
  const { scene, animations } = useGLTF(url, DRACO_PATH);
  const root = useRef<Group>(null);

  const { object, scale, offset } = useMemo(() => {
    const object: Object3D = cloneSkinned(scene);
    object.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Matériaux propres à cette instance (estompage, grisé) sans toucher au cache partagé.
        o.material = Array.isArray(o.material) ? o.material.map((m: Material) => m.clone()) : (o.material as Material).clone();
        o.frustumCulled = false;
      }
    });
    return { object, ...fitModel(object, size) };
  }, [scene, size]);

  useEffect(
    () => () =>
      object.traverse((o) => {
        if (o instanceof Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Material) => m.dispose());
      }),
    [object],
  );

  useEffect(() => {
    object.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as (Material & { color?: Color })[]) {
        m.transparent = !!ghost;
        m.opacity = ghost ? 0.55 : 1;
        if (m.color instanceof Color) {
          const base = (m.userData.baseColor ??= m.color.clone()) as Color;
          m.color.copy(base);
          if (dim) m.color.multiplyScalar(0.35);
        }
        m.needsUpdate = true;
      }
    });
  }, [object, ghost, dim]);

  const { actions, names } = useAnimations(animations, root);
  const current = useRef<AnimationAction | null>(null);
  useEffect(() => {
    const name = pickClip(names, pose);
    const next = name ? actions[name] : null;
    if (!next || next === current.current) return;
    next.reset();
    if (pose === 'dead') {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    next.fadeIn(0.25).play();
    current.current?.fadeOut(0.25);
    current.current = next;
  }, [actions, names, pose]);

  // Sans clip de mort, la créature bascule sur le flanc.
  const hasDeath = !!pickClip(names, 'dead');
  return (
    <group ref={root} rotation={[0, 0, pose === 'dead' && !hasDeath ? Math.PI / 2.1 : 0]} position={[0, pose === 'dead' && !hasDeath ? 0.18 * size : 0, 0]}>
      <primitive object={object} scale={scale} position={offset} />
    </group>
  );
}

/** Un modèle cassé ne doit jamais faire tomber le plateau : on retombe sur le jeton. */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  override state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  override componentDidCatch(error: unknown) {
    console.warn('Modèle 3D illisible, retour au jeton :', error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
