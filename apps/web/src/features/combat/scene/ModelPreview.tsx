import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useState } from 'react';
import { NeutralToneMapping } from 'three';
import s from '../combat.module.css';
import { FittedModel, ModelBoundary, type ModelPose } from './model';
import { Coin } from './Pieces';

/** Vitrine du modèle 3D d'un personnage : il tourne lentement sur son jeton. */
export default function ModelPreview({ url, name, side = 'ally', height, still }: { url: string | null; name: string; side?: 'ally' | 'enemy' | 'neutral'; height?: number; still?: boolean }) {
  const [pose, setPose] = useState<ModelPose>('idle');
  const short = name.slice(0, 2).toUpperCase();
  const coin = <Coin c={{ short, side, size: 1, portraitUrl: null }} />;
  return (
    <div className={s.modelPreview} style={height ? { height } : undefined} onPointerEnter={() => setPose('walk')} onPointerLeave={() => setPose('idle')}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.6, 1.3, 2.2], fov: 35 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => void (gl.toneMapping = NeutralToneMapping)}
      >
        <hemisphereLight args={['#f3e6c4', '#26182e', 1.4]} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} castShadow />
        <pointLight position={[-2, 1.5, -1.5]} intensity={6} color="#4fb3ff" />
        <group position-y={url ? -0.45 : -0.05}>
          {url ? (
            <ModelBoundary resetKey={url} fallback={coin}>
              <Suspense fallback={coin}>
                <FittedModel url={url} size={1} pose={pose} />
              </Suspense>
            </ModelBoundary>
          ) : (
            coin
          )}
          <ContactShadows opacity={0.6} scale={3} blur={2.4} far={2} />
        </group>
        <OrbitControls autoRotate autoRotateSpeed={1.6} enablePan={false} enableZoom={!still} enableRotate={!still} minDistance={1.4} maxDistance={6} target={[0, 0.1, 0]} />
      </Canvas>
      {!url && !still && <span className={s.modelPreviewMsg} style={{ alignItems: 'flex-end' }}>Jeton par défaut</span>}
    </div>
  );
}
