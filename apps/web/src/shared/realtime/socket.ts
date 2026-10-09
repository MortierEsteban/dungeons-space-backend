import type { ClientToServerEvents, ServerToClientEvents } from '@ds/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { qk } from '../api/client';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** Connexion unique, ouverte après authentification (le cookie de session sert au handshake). */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, autoConnect: false, reconnectionDelayMax: 5000 });
  }
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** État de la connexion temps réel (affiché dans la barre supérieure). */
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(() => socket?.connected ?? false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    setConnected(s.connected);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, []);
  return connected;
}

/**
 * Abonnement aux événements d'une campagne : la Chronique, les fiches, la Constellation
 * se rafraîchissent d'elles-mêmes pendant la session (CHR-12). Réabonnement après reconnexion (CMB-52).
 */
export function useCampaignRealtime(campaignId: string | null): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!campaignId) return;
    const s = getSocket();
    const subscribe = () => s.emit('subscribe', { campaignId }, () => undefined);
    const onEvent: ServerToClientEvents['chronicle:event'] = (event) => {
      if (event.campaignId !== campaignId) return;
      void client.invalidateQueries({ queryKey: qk.events(campaignId) });
      void client.invalidateQueries({ queryKey: ['campaign', campaignId, 'recordings', 'trace'] });
      void client.invalidateQueries({ queryKey: qk.campaign(campaignId), exact: true });
    };
    const onChange: ServerToClientEvents['campaign:changed'] = ({ campaignId: id, what, id: entityId }) => {
      if (id !== campaignId) return;
      if (what === 'characters') {
        void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
        void client.invalidateQueries({ queryKey: qk.myCharacters });
        if (entityId) void client.invalidateQueries({ queryKey: qk.character(entityId), exact: true });
      } else if (what === 'constellation') {
        void client.invalidateQueries({ queryKey: qk.constellation(campaignId) });
        void client.invalidateQueries({ queryKey: qk.eventLinks(campaignId) });
      } else if (what === 'encounters') {
        void client.invalidateQueries({ queryKey: qk.encounters(campaignId) });
      } else if (what === 'recording') {
        void client.invalidateQueries({ queryKey: qk.recordings(campaignId) });
      } else {
        void client.invalidateQueries({ queryKey: qk.campaign(campaignId) });
        void client.invalidateQueries({ queryKey: qk.campaigns });
      }
    };
    subscribe();
    s.on('connect', subscribe);
    s.on('chronicle:event', onEvent);
    s.on('campaign:changed', onChange);
    return () => {
      s.emit('unsubscribe', { campaignId });
      s.off('connect', subscribe);
      s.off('chronicle:event', onEvent);
      s.off('campaign:changed', onChange);
    };
  }, [campaignId, client]);
}
