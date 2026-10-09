import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { num } from '../../shared/format';
import { useDismiss } from '../../shared/hooks';
import { Button, cx, Toggle } from '../../shared/ui/components';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { useRecorder } from './RecorderProvider';
import s from './recording.module.css';

/**
 * Indicateur d'enregistrement dans la barre supérieure : toute la table sait quand elle est enregistrée.
 * Le MJ y pilote l'enregistrement (appareil, pause, arrêt, analyse immédiate).
 */
export function RecordingBadge() {
  const { isGm } = useCurrentCampaign();
  const r = useRecorder();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);

  const live = r.live;
  const canRecord = isGm && !!r.settings?.enabled && r.sessionNo !== null;
  if (!live && !canRecord) return null;

  const status = !live ? 'off' : live.status === 'paused' ? 'paused' : 'live';
  const label = status === 'live' ? 'REC' : status === 'paused' ? 'PAUSE' : 'REC';
  const title =
    status === 'live' ? 'La session est enregistrée et transcrite' : status === 'paused' ? 'Enregistrement en pause' : 'Session non enregistrée';

  return (
    <div className={s.wrap} ref={ref}>
      <button
        type="button"
        className={cx(s.badge, status === 'live' && s.badgeLive, status === 'paused' && s.badgePaused)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        aria-label={`${label} — ${title}`}
        onClick={() => setOpen(!open)}
      >
        <span className={s.dot} aria-hidden />
        <span className={s.badgeText}>{label}</span>
        {isGm && r.holding && r.queued > 0 && <span className={s.queued}>{r.queued}</span>}
      </button>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Enregistrement de la session">
          <div className="ds-label">Enregistrement · session {live?.sessionNo ?? r.sessionNo}</div>
          {!isGm ? (
            <p className={s.note}>
              {status === 'live'
                ? 'Le MJ enregistre la session : ce qui se dit autour de la table est transcrit, puis les événements marquants sont inscrits automatiquement dans la Chronique.'
                : 'L’enregistrement est en pause.'}
            </p>
          ) : (
            <GmControls />
          )}
          {live && (
            <Link className={s.traceLink} to={`/explorer?vue=sessions&session=${live.sessionNo}`} onClick={close}>
              Voir la trace de la session →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function GmControls() {
  const r = useRecorder();
  const live = r.live;
  const elsewhere = !!live && live.status === 'live' && !r.holding;
  const a = live?.analysis;

  return (
    <div className="ds-stack" style={{ gap: 10 }}>
      <p className={s.note}>
        {!live
          ? 'Aucun enregistrement en cours.'
          : r.holding
            ? r.state === 'listening'
              ? 'Cet appareil écoute la table.'
              : 'Cet appareil tient l’enregistrement ; la reconnaissance vocale démarre…'
            : elsewhere
              ? 'Un autre appareil enregistre la session.'
              : 'Enregistrement en pause.'}
      </p>
      {!r.supported && <p className={s.warn}>Ce navigateur ne propose pas la reconnaissance vocale : utilisez Chrome ou Edge sur l’appareil qui enregistre.</p>}
      {r.error && <p className={s.warn}>{r.error}</p>}
      {r.holding && (r.interim || r.recent.length > 0) && (
        <div className={s.listen} aria-live="off">
          {r.recent.slice(-3).map((t, i) => (
            <span key={i}>{t}</span>
          ))}
          {r.interim && <em>{r.interim}</em>}
        </div>
      )}
      {live && (
        <div className={s.stats}>
          <span>
            <strong>{num(live.wordCount)}</strong> mots
          </span>
          <span>
            <strong>{a?.eventsCreated ?? 0}</strong> événements
          </span>
          <span>
            <strong>{num(a?.pendingWords ?? 0)}</strong> en attente
          </span>
        </div>
      )}
      {a && !a.available && <p className={s.warn}>Analyse indisponible : aucune clé d’API n’est configurée sur le serveur. La transcription est tout de même conservée.</p>}
      {a?.running && <p className={s.note}>Analyse en cours…</p>}
      {a?.lastError && <p className={s.warn}>Dernière analyse en échec : {a.lastError}</p>}
      <div className={s.actions}>
        {!live || live.status === 'paused' ? (
          <Button size="sm" variant="primary" disabled={r.busy} onClick={() => r.start()}>
            {live ? 'Reprendre ici' : 'Enregistrer'}
          </Button>
        ) : elsewhere ? (
          <Button size="sm" variant="secondary" disabled={r.busy} onClick={() => r.start(true)}>
            Enregistrer depuis cet appareil
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={r.busy} onClick={r.pause}>
            Pause
          </Button>
        )}
        {live && (
          <Button size="sm" variant="ghost" disabled={r.busy} onClick={r.stop}>
            Arrêter
          </Button>
        )}
        {live && a?.available && (
          <Button size="sm" variant="ghost" disabled={r.busy || a.running} onClick={r.analyze}>
            Analyser maintenant
          </Button>
        )}
      </div>
      <Toggle checked={r.autoRecord} onChange={r.setAutoRecord}>
        Enregistrer automatiquement chaque session depuis cet appareil
      </Toggle>
    </div>
  );
}
