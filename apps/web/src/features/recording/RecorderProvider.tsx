import type { RecordingDto, RecordingSettings } from '@ds/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, errorMessage, qk } from '../../shared/api/client';
import { useLocalPref } from '../../shared/hooks';
import { useToast } from '../../shared/ui/toast';
import { useCampaign } from '../campaigns/api';
import { useCurrentCampaign } from '../campaigns/CampaignContext';
import { sendAudioChunk, sendSegments, useLiveRecording, useRecordingMutations } from './api';
import { AudioCapture, SpeechCapture, speechSupported, type CaptureState } from './capture';
import { SegmentQueue } from './queue';

const FLUSH_MS = 4000;

interface RecorderValue {
  /** Réglages de la campagne (null tant qu'ils ne sont pas chargés). */
  settings: RecordingSettings | null;
  sessionNo: number | null;
  live: RecordingDto | null;
  /** Cet appareil tient l'enregistrement en cours. */
  holding: boolean;
  supported: boolean;
  state: CaptureState;
  error: string | null;
  interim: string;
  recent: string[];
  queued: number;
  autoRecord: boolean;
  setAutoRecord(on: boolean): void;
  start(takeover?: boolean): void;
  pause(): void;
  stop(): void;
  analyze(): void;
  busy: boolean;
}

const Ctx = createContext<RecorderValue | null>(null);

function deviceId(): string {
  const key = 'ds.deviceId';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'appareil-sans-stockage';
  }
}

/**
 * Enregistreur de session, monté au-dessus de toutes les pages : changer de rubrique (combat, fiches…)
 * n'interrompt jamais la capture. Seul l'appareil qui tient l'enregistrement capte le son ; après un
 * rechargement il reprend de lui-même. La transcription part par lots, sans perte ni doublon.
 */
export function RecorderProvider({ children }: { children: ReactNode }) {
  const { campaignId, isGm } = useCurrentCampaign();
  const { data: campaign } = useCampaign(campaignId);
  const { data: live = null, isSuccess: liveLoaded } = useLiveRecording(campaignId, isGm);
  const mutations = useRecordingMutations(campaignId ?? '');
  const client = useQueryClient();
  const toast = useToast();
  const device = useMemo(deviceId, []);
  const [autoRecord, setAutoRecord] = useLocalPref(`recording.auto.${campaignId ?? 'none'}`, false);
  const [state, setState] = useState<CaptureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [queued, setQueued] = useState(0);
  const autoTried = useRef<string | null>(null);

  const settings = campaign?.settings.recording ?? null;
  const open = campaign?.currentSession && !campaign.currentSession.endedAt ? campaign.currentSession : null;
  const holding = isGm && !!live && live.status === 'live' && live.deviceId === device;
  const recordingId = holding ? live!.id : null;

  const queue = useMemo(() => (recordingId ? new SegmentQueue(`ds.recording.queue.${recordingId}`) : null), [recordingId]);
  const audioQueue = useRef<{ part: number; index: number; blob: Blob }[]>([]);

  const lost = useCallback(
    (message: string) => {
      toast(message, 'error');
      void client.invalidateQueries({ queryKey: qk.recordings(campaignId ?? 'none') });
    },
    [client, toast, campaignId],
  );

  /** Envoie ce qui attend (transcription puis audio). */
  const flush = useCallback(async () => {
    if (!campaignId || !recordingId || !queue) return;
    for (let guard = 0; queue.size && guard < 20; guard++) {
      const batch = queue.batch(100);
      try {
        await sendSegments(campaignId, recordingId, { deviceId: device, segments: batch });
        queue.ack(batch.map((s) => s.clientSeq));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) lost(err.message);
        break;
      } finally {
        setQueued(queue.size);
      }
    }
    while (audioQueue.current.length) {
      const next = audioQueue.current[0]!;
      const res = await sendAudioChunk(campaignId, recordingId, device, next.part, next.index, next.blob).catch(() => null);
      if (!res) break;
      if (!res.ok && res.status !== 409) break;
      // 409 : morceau hors séquence (partie remplacée) — on l'abandonne plutôt que de bloquer la file.
      audioQueue.current.shift();
    }
  }, [campaignId, recordingId, queue, device, lost]);

  // Capture : active tant que cet appareil tient un enregistrement en direct.
  useEffect(() => {
    if (!holding || !queue || !live) return;
    queue.ensureSeq(live.nextClientSeq);
    setQueued(queue.size);
    setError(null);
    const speech = new SpeechCapture({
      lang: 'fr-FR',
      onSegment: (seg) => {
        queue.push(seg);
        setQueued(queue.size);
        setRecent((xs) => [...xs.slice(-4), seg.text]);
      },
      onInterim: setInterim,
      onState: (st, message) => {
        setState(st);
        setError(message ?? null);
      },
    });
    speech.start();
    let audio: AudioCapture | null = null;
    if (settings?.keepAudio) {
      const part = live.audio?.parts.length ?? 0;
      let index = 0;
      audio = new AudioCapture({ onChunk: (blob) => audioQueue.current.push({ part, index: index++, blob }), onError: setError });
      void audio.start();
    }
    const timer = setInterval(() => void flush(), FLUSH_MS);
    const beforeUnload = () => void flush();
    window.addEventListener('pagehide', beforeUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', beforeUnload);
      speech.stop();
      audio?.stop();
      setInterim('');
      void flush();
    };
    // Volontairement limité : la capture ne redémarre (nouvelle partie audio) que si l'enregistrement tenu change.
  }, [holding, queue, settings?.keepAudio]);

  // Démarrage automatique : session ouverte, enregistrement activé, cet appareil désigné.
  useEffect(() => {
    if (!isGm || !campaignId || !settings?.enabled || !autoRecord || !open || !liveLoaded || live) return;
    const key = `${campaignId}:${open.number}`;
    if (autoTried.current === key) return;
    autoTried.current = key;
    mutations.start.mutate({ deviceId: device }, { onError: (e) => setError(errorMessage(e)) });
  }, [isGm, campaignId, settings?.enabled, autoRecord, open, liveLoaded, live, device, mutations.start]);

  const value: RecorderValue = {
    settings,
    sessionNo: open?.number ?? live?.sessionNo ?? null,
    live,
    holding,
    supported: speechSupported(),
    state,
    error,
    interim,
    recent,
    queued,
    autoRecord,
    setAutoRecord,
    busy: mutations.start.isPending || mutations.pause.isPending || mutations.stop.isPending || mutations.analyze.isPending,
    start: (takeover = false) =>
      mutations.start.mutate({ deviceId: device, takeover }, { onError: (e) => toast(errorMessage(e), 'error') }),
    pause: () => {
      if (!live) return;
      void flush().finally(() => mutations.pause.mutate(live.id, { onError: (e) => toast(errorMessage(e), 'error') }));
    },
    stop: () => {
      if (!live) return;
      void flush().finally(() =>
        mutations.stop.mutate(live.id, {
          onSuccess: () => toast('Enregistrement terminé : la fin de la transcription est en cours d’analyse.', 'success'),
          onError: (e) => toast(errorMessage(e), 'error'),
        }),
      );
    },
    analyze: () => {
      if (!live) return;
      void flush().finally(() =>
        mutations.analyze.mutate(live.id, {
          onSuccess: (r) => toast(r.created ? `${r.created} événement${r.created > 1 ? 's' : ''} inscrit${r.created > 1 ? 's' : ''} dans la Chronique.` : 'Rien de nouveau à inscrire.', 'success'),
          onError: (e) => toast(errorMessage(e), 'error'),
        }),
      );
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecorder(): RecorderValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRecorder hors de RecorderProvider');
  return v;
}
