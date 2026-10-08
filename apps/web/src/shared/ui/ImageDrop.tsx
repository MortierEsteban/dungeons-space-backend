import { useRef, useState } from 'react';
import { errorMessage, http } from '../api/client';
import { Button, cx } from './components';
import s from './ui.module.css';

/** Emplacement d'image : clic ou glisser-déposer, téléversement validé côté serveur. */
export function ImageDrop({ value, onChange, label, height = 220 }: { value: string | null; onChange: (url: string | null) => void; label: string; height?: number | string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await http.upload(file)).url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ds-stack" style={{ gap: 6 }}>
      <button
        type="button"
        className={cx(s.portrait, value && s.portraitFilled)}
        style={{ height, width: '100%', borderColor: over ? 'var(--arcane-light)' : undefined, cursor: 'pointer', flexDirection: 'column', gap: 6, padding: 12 }}
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
        aria-label={`${label} : choisir une image`}
      >
        {value ? <img src={value} alt={label} /> : <span style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{busy ? 'Téléversement…' : `${label}\nCliquez ou déposez une image`}</span>}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      {value && (
        <Button variant="link" size="sm" onClick={() => onChange(null)}>
          Retirer l’image
        </Button>
      )}
      {error && <span style={{ color: 'var(--magenta-light)', fontSize: 13 }}>{error}</span>}
    </div>
  );
}
