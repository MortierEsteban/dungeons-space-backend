import type { EventDto } from './chronicle';
import type { CombatEventEnvelope } from './combat';

export type CampaignChange = 'members' | 'settings' | 'characters' | 'constellation' | 'session' | 'encounters' | 'recording';

/** Messages serveur → client (Socket.IO). */
export interface ServerToClientEvents {
  'chronicle:event': (event: EventDto) => void;
  'combat:events': (payload: { encounterId: string; events: CombatEventEnvelope[] }) => void;
  'campaign:changed': (payload: { campaignId: string; what: CampaignChange; id?: string }) => void;
}

/** Messages client → serveur. */
export interface ClientToServerEvents {
  subscribe: (payload: { campaignId: string }, ack: (res: { ok: boolean; role?: 'gm' | 'player'; error?: string }) => void) => void;
  unsubscribe: (payload: { campaignId: string }) => void;
}
