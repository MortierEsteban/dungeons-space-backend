import type { AppendSegmentsInput, RecordingDto, SessionTraceDto, StartRecordingInput, TranscriptPageDto, TranscriptSearchDto, TranscriptSegmentDto } from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { http, qk, toQuery } from '../../shared/api/client';

/** Enregistrement en cours de la campagne (toute la table voit l'indicateur). */
export function useLiveRecording(campaignId: string | null, poll = false) {
  return useQuery({
    queryKey: qk.liveRecording(campaignId ?? 'none'),
    queryFn: async () => (await http.get<{ recording: RecordingDto | null }>(`/campaigns/${campaignId}/recordings/live`)).recording,
    enabled: !!campaignId,
    // Le MJ suit l'avancement de l'analyse ; les changements d'état arrivent aussi en temps réel.
    refetchInterval: poll ? 15_000 : false,
  });
}

export function useRecordings(campaignId: string | null) {
  return useQuery({
    queryKey: [...qk.recordings(campaignId ?? 'none'), 'all'],
    queryFn: async () => (await http.get<{ recordings: RecordingDto[] }>(`/campaigns/${campaignId}/recordings`)).recordings,
    enabled: !!campaignId,
  });
}

export function useSessionTrace(campaignId: string | null, sessionNo: number | null) {
  return useQuery({
    queryKey: qk.sessionTrace(campaignId ?? 'none', sessionNo ?? -1),
    queryFn: () => http.get<SessionTraceDto>(`/campaigns/${campaignId}/sessions/${sessionNo}/trace`),
    enabled: !!campaignId && sessionNo !== null,
  });
}

/**
 * Transcription d'une session, chargée par pages puis complétée au fil de l'eau pendant l'enregistrement
 * (seuls les nouveaux segments sont demandés).
 */
export function useTranscript(campaignId: string | null, sessionNo: number | null, enabled: boolean, live: boolean) {
  const [segments, setSegments] = useState<TranscriptSegmentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const cursor = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setSegments([]);
    cursor.current = 0;
  }, [campaignId, sessionNo]);

  useEffect(() => {
    if (!enabled || !campaignId || sessionNo === null) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        for (;;) {
          const page = await http.get<TranscriptPageDto>(`/campaigns/${campaignId}/sessions/${sessionNo}/transcript${toQuery({ after: cursor.current, limit: 1000 })}`);
          if (cancelled) return;
          cursor.current += page.segments.length;
          if (page.segments.length) setSegments((xs) => [...xs, ...page.segments]);
          if (page.nextAfter === null) break;
        }
      } catch {
        /* réessayé au prochain tour */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, sessionNo, enabled, tick]);

  useEffect(() => {
    if (!live || !enabled) return;
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [live, enabled]);

  return { segments, loading, refresh: () => setTick((n) => n + 1) };
}

/** Recherche dans toutes les transcriptions de la campagne (au moins deux caractères). */
export function useTranscriptSearch(campaignId: string | null, q: string, sessionNo: number | null, enabled = true) {
  const query = q.trim();
  return useQuery({
    queryKey: [...qk.recordings(campaignId ?? 'none'), 'search', query, sessionNo],
    queryFn: () => http.get<TranscriptSearchDto>(`/campaigns/${campaignId}/transcript/search${toQuery({ q: query, sessionNo: sessionNo ?? undefined, limit: 100 })}`),
    enabled: enabled && !!campaignId && query.length >= 2,
    placeholderData: (prev) => prev,
  });
}

export function useRecordingMutations(campaignId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: qk.recordings(campaignId) });
  const base = `/campaigns/${campaignId}/recordings`;
  return {
    start: useMutation({ mutationFn: async (input: StartRecordingInput) => (await http.post<{ recording: RecordingDto }>(base, input)).recording, onSuccess: refresh }),
    pause: useMutation({ mutationFn: async (id: string) => (await http.post<{ recording: RecordingDto }>(`${base}/${id}/pause`)).recording, onSuccess: refresh }),
    stop: useMutation({ mutationFn: async (id: string) => (await http.post<{ recording: RecordingDto }>(`${base}/${id}/stop`)).recording, onSuccess: refresh }),
    analyze: useMutation({
      mutationFn: (id: string) => http.post<{ created: number; recording: RecordingDto }>(`${base}/${id}/analyze`),
      onSuccess: () => {
        refresh();
        void client.invalidateQueries({ queryKey: qk.events(campaignId) });
      },
    }),
  };
}

export const sendSegments = (campaignId: string, recordingId: string, input: AppendSegmentsInput) =>
  http.post<{ accepted: number; recording: RecordingDto }>(`/campaigns/${campaignId}/recordings/${recordingId}/segments`, input);

/** Envoi brut d'un morceau d'audio (pas de JSON). */
export async function sendAudioChunk(campaignId: string, recordingId: string, deviceId: string, part: number, index: number, blob: Blob): Promise<Response> {
  return fetch(`/api/campaigns/${campaignId}/recordings/${recordingId}/audio/${part}/${index}?deviceId=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': blob.type || 'audio/webm' },
    body: blob,
  });
}

export const audioUrl = (campaignId: string, recordingId: string, part: number) => `/api/campaigns/${campaignId}/recordings/${recordingId}/audio/${part}`;
