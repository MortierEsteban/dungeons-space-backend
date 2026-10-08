import { lazy, Suspense, useRef, useState } from 'react';
import { errorMessage, http } from '../../shared/api/client';
import { Button, cx } from '../../shared/ui/components';
import s from './combat.module.css';

const ModelPreview = lazy(() => import('./scene/ModelPreview'));

const MAX_MODEL_MB = 32;

/**
 * Import d'un modèle 3D (glTF binaire .glb, textures embarquées) : clic ou glisser-déposer,
 * validé côté serveur. Sans modèle, la créature garde son jeton simple.
 */
export function ModelDrop({ value, onChange, name, preview = true, disabled }: { value: string | null; onChange(url: string | null): void; name: string; preview?: boolean; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (!/\.glb$/i.test(file.name)) return setError('Choisissez un fichier .glb (glTF binaire). Exportez-le depuis Blender, HeroForge, Mixamo…');
    if (file.size > MAX_MODEL_MB * 1024 * 1024) return setError(`Modèle trop lourd (${MAX_MODEL_MB} Mo maximum).`);
    setBusy(true);
    try {
      onChange((await http.upload(file)).url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.modelDrop}>
      {preview && (
        <Suspense fallback={<div className={s.modelPreview} />}>
          <ModelPreview url={value} name={name} />
        </Suspense>
      )}
      {!disabled && (
        <button
          type="button"
          className={cx(s.modelZone, over && s.modelZoneOver)}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files[0]);
          }}
        >
          {busy ? 'Téléversement…' : value ? 'Remplacer le modèle 3D (.glb)' : 'Importer un modèle 3D (.glb)'}
          <span className="ds-help">Cliquez ou déposez un fichier · {MAX_MODEL_MB} Mo max · animations « idle », « walk », « death » reconnues</span>
        </button>
      )}
      <input ref={input} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      {value && !disabled && (
        <Button variant="link" size="sm" onClick={() => onChange(null)}>
          Revenir au jeton simple
        </Button>
      )}
      {error && <span style={{ color: 'var(--magenta-light)', fontSize: 13 }}>{error}</span>}
    </div>
  );
}
