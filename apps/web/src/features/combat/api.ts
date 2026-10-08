import { applyCombatEvent, type CombatCommand, type CombatState } from '@ds/rules';
import type { CombatEventEnvelope, CreateEncounterInput, EncounterDto, EncounterSummaryDto, ServerToClientEvents } from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, http, qk } from '../../shared/api/client';
import { getSocket } from '../../shared/realtime/socket';

export function useEncounters(campaignId: string | null) {
  return useQuery({
    queryKey: qk.encounters(campaignId ?? 'none'),
    queryFn: async () => (await http.get<{ encounters: EncounterSummaryDto[] }>(`/campaigns/${campaignId}/encounters`)).encounters,
    enabled: !!campaignId,
  });
}

export function useEncounterAdmin(campaignId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: qk.encounters(campaignId) });
  return {
    create: useMutation({ mutationFn: async (input: CreateEncounterInput) => (await http.post<{ encounter: EncounterDto }>(`/campaigns/${campaignId}/encounters`, input)).encounter, onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => http.del(`/encounters/${id}`), onSuccess: refresh }),
  };
}

export type CommandInput = { [K in CombatCommand['type']]: Omit<Partial<Extract<CombatCommand, { type: K }>>, 'type'> & Pick<Extract<CombatCommand, { type: K }>, 'type'> }[CombatCommand['type']];

interface CombatSync {
  encounter: EncounterDto | null;
  state: CombatState | null;
  log: CombatEventEnvelope[];
  loading: boolean;
  error: string | null;
  send(cmd: CommandInput | Record<string, unknown>): Promise<CombatEventEnvelope[] | null>;
  sending: boolean;
}

/**
 * État d'un combat côté client : instantané initial + événements (REST et temps réel)
 * appliqués avec le même réducteur que le serveur. Dédoublonnage par séquence ;
 * resynchronisation complète après une reconnexion (CMB-52).
 */
export function useCombat(encounterId: string, onEvents?: (events: CombatEventEnvelope[]) => void): CombatSync {
  const [encounter, setEncounter] = useState<EncounterDto | null>(null);
  const [state, setState] = useState<CombatState | null>(null);
  const [log, setLog] = useState<CombatEventEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastSeq = useRef(0);
  const listener = useRef(onEvents);
  listener.current = onEvents;
  const client = useQueryClient();

  const apply = useCallback((envelopes: CombatEventEnvelope[]) => {
    const fresh = envelopes.filter((e) => e.seq > lastSeq.current).sort((a, b) => a.seq - b.seq);
    if (fresh.length === 0) return;
    lastSeq.current = fresh[fresh.length - 1]!.seq;
    setState((s) => fresh.reduce<CombatState | null>((acc, e) => applyCombatEvent(acc, e.event), s));
    setLog((l) => [...fresh.slice().reverse(), ...l].slice(0, 200));
    listener.current?.(fresh);
  }, []);

  const load = useCallback(async () => {
    try {
      const [{ encounter: enc }, { events }] = await Promise.all([
        http.get<{ encounter: EncounterDto }>(`/encounters/${encounterId}`),
        http.get<{ events: CombatEventEnvelope[] }>(`/encounters/${encounterId}/events`),
      ]);
      lastSeq.current = enc.lastSeq;
      setEncounter(enc);
      setState(enc.state);
      setLog(events.slice(-200).reverse());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [encounterId]);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const onCombat: ServerToClientEvents['combat:events'] = (payload) => {
      if (payload.encounterId === encounterId) apply(payload.events);
    };
    const onReconnect = () => void load();
    socket.on('combat:events', onCombat);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('combat:events', onCombat);
      socket.io.off('reconnect', onReconnect);
    };
  }, [encounterId, apply, load]);

  const send = useCallback(
    async (cmd: CommandInput | Record<string, unknown>) => {
      setSending(true);
      try {
        const { events } = await http.post<{ events: CombatEventEnvelope[] }>(`/encounters/${encounterId}/commands`, cmd);
        apply(events);
        if (encounter) void client.invalidateQueries({ queryKey: qk.encounters(encounter.campaignId) });
        return events;
      } catch (e) {
        setError(errorMessage(e));
        setTimeout(() => setError(null), 3500);
        return null;
      } finally {
        setSending(false);
      }
    },
    [encounterId, apply, encounter, client],
  );

  return { encounter, state, log, loading: !state && !error, error, send, sending };
}
