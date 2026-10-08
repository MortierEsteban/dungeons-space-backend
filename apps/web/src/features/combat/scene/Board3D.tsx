import type { Cell } from '@ds/rules';
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { NeutralToneMapping } from 'three';
import { useLocalPref } from '../../../shared/hooks';
import { cx } from '../../../shared/ui/components';
import type { BoardProps } from '../Board';
import s from '../combat.module.css';
import type { CameraApi } from './CameraRig';
import type { AttackFx } from './support';
import { Scene, type Ambiance, type ScenePrefs } from './Scene';

const DEFAULT_PREFS: ScenePrefs = { cam: 'iso', grid: true, lowWalls: false, ambiance: 'dusk' };
const AMBIANCES: { value: Ambiance; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'dusk', label: 'Crépuscule' },
  { value: 'night', label: 'Nuit' },
];

/**
 * Plateau de bataille en 3D (vue isométrique ou libre). Mêmes commandes, mêmes règles et
 * mêmes outils de MJ que le plateau 2D : seul le rendu change. Chargé à la demande.
 */
export default function Board3D(props: BoardProps & { effects: AttackFx[] }) {
  const [stored, setPrefs] = useLocalPref<ScenePrefs>('board3d', DEFAULT_PREFS);
  const prefs = { ...DEFAULT_PREFS, ...stored };
  const set = (patch: Partial<ScenePrefs>) => setPrefs({ ...prefs, ...patch });
  const [measure, setMeasure] = useState<{ a: Cell; b: Cell } | null>(null);
  const api = useRef<CameraApi | null>(null);
  const azimuth = useRef(Math.PI / 4);

  // Raccourcis : Q / E pour pivoter, R pour recentrer (hors champs de saisie).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      const k = e.key.toLowerCase();
      if (k === 'q') api.current?.rotate(1);
      else if (k === 'e') api.current?.rotate(-1);
      else if (k === 'r') api.current?.fit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div className={s.boardWrap}>
      <div
        className={cx(s.viewport3d, s[`amb_${prefs.ambiance}`], (props.tool !== 'select' || props.targeting || !!props.aim) && s.crosshair)}
        role="application"
        aria-label={`Carte de bataille en 3D, ${props.state.map.cols} × ${props.state.map.rows} cases`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = NeutralToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <Scene {...props} prefs={prefs} api={api} azimuth={azimuth} measure={measure} setMeasure={setMeasure} />
        </Canvas>
      </div>

      <div className={s.zoomControls}>
        <button type="button" onClick={() => api.current?.zoom(1 / 1.2)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" onClick={() => api.current?.zoom(1.2)} aria-label="Zoomer">
          +
        </button>
        <button type="button" onClick={() => api.current?.rotate(1)} aria-label="Pivoter vers la gauche (Q)" title="Pivoter (Q)">
          ⟲
        </button>
        <button type="button" onClick={() => api.current?.rotate(-1)} aria-label="Pivoter vers la droite (E)" title="Pivoter (E)">
          ⟳
        </button>
        <button type="button" onClick={() => api.current?.fit()} title="Recentrer (R)">
          Recentrer
        </button>
        {measure && (
          <button type="button" onClick={() => setMeasure(null)}>
            Effacer la mesure
          </button>
        )}
      </div>

      <div className={s.viewToggles} role="group" aria-label="Réglages de la vue 3D">
        <button type="button" aria-pressed={prefs.cam === 'iso'} onClick={() => set({ cam: prefs.cam === 'iso' ? 'free' : 'iso' })} title="Isométrique ou caméra libre">
          {prefs.cam === 'iso' ? 'Isométrique' : 'Vue libre'}
        </button>
        <button type="button" aria-pressed={prefs.grid} onClick={() => set({ grid: !prefs.grid })}>
          Grille
        </button>
        <button type="button" aria-pressed={prefs.lowWalls} onClick={() => set({ lowWalls: !prefs.lowWalls })} title="Abaisser les murs pour voir derrière">
          Murs bas
        </button>
        <select value={prefs.ambiance} onChange={(e) => set({ ambiance: e.target.value as Ambiance })} aria-label="Ambiance lumineuse">
          {AMBIANCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <span className={s.hint3d}>Glisser : déplacer · Clic droit : pivoter · Molette : zoom</span>
    </div>
  );
}
