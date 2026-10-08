import type { Server as HttpServer } from 'node:http';
import type { CampaignChange, ClientToServerEvents, Role, ServerToClientEvents } from '@ds/shared';
import { Server } from 'socket.io';

type Io = Server<ClientToServerEvents, ServerToClientEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export interface RealtimeAuth {
  /** Identifie l'utilisateur à partir des cookies du handshake. */
  authenticate(cookieHeader: string | undefined): Promise<string | null>;
  roleOf(campaignId: string, userId: string): Promise<Role | null>;
}

const room = (campaignId: string, role: Role) => `campaign:${campaignId}:${role}`;

/**
 * Port de diffusion temps réel. Chaque campagne a deux salons (MJ / joueurs) : le serveur
 * choisit ce que chaque salon reçoit, le filtrage de visibilité ne dépend jamais du client.
 */
export interface Realtime {
  /** `players` : undefined = même contenu que le MJ ; null = rien pour les joueurs. */
  toCampaign<E extends EventName>(campaignId: string, event: E, gm: Payload<E>, players?: Payload<E> | null): void;
  /** Contenu personnalisé par joueur (ex. visibilité `party_member`). */
  toUsers<E extends EventName>(campaignId: string, userIds: string[], event: E, payload: Payload<E>): void;
  changed(campaignId: string, what: CampaignChange, id?: string): void;
}

export class SocketRealtime implements Realtime {
  readonly io: Io;

  constructor(server: HttpServer, auth: RealtimeAuth) {
    this.io = new Server(server, { path: '/socket.io', serveClient: false, cors: { origin: false } });
    this.io.use(async (socket, next) => {
      const userId = await auth.authenticate(socket.handshake.headers.cookie).catch(() => null);
      if (!userId) return next(new Error('unauthorized'));
      socket.data.userId = userId;
      next();
    });
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId as string;
      void socket.join(`user:${userId}`);
      socket.on('subscribe', async ({ campaignId }, ack) => {
        const role = await auth.roleOf(String(campaignId), userId).catch(() => null);
        if (!role) return ack?.({ ok: false, error: 'not_member' });
        await socket.join([room(campaignId, role), `campaign:${campaignId}`]);
        ack?.({ ok: true, role });
      });
      socket.on('unsubscribe', ({ campaignId }) => {
        void socket.leave(room(campaignId, 'gm'));
        void socket.leave(room(campaignId, 'player'));
        void socket.leave(`campaign:${campaignId}`);
      });
    });
  }

  private emitTo(rooms: string | string[], event: EventName, payload: unknown): void {
    // Le typage générique de Socket.IO ne se propage pas à travers notre union d'événements.
    (this.io.to(rooms) as unknown as { emit(ev: string, p: unknown): void }).emit(event, payload);
  }

  toCampaign<E extends EventName>(campaignId: string, event: E, gm: Payload<E>, players?: Payload<E> | null): void {
    this.emitTo(room(campaignId, 'gm'), event, gm);
    if (players === null) return;
    this.emitTo(room(campaignId, 'player'), event, players === undefined ? gm : players);
  }

  toUsers<E extends EventName>(_campaignId: string, userIds: string[], event: E, payload: Payload<E>): void {
    if (userIds.length === 0) return;
    // Le client ignore ce qui ne concerne pas la campagne qu'il affiche (campaignId dans la charge utile).
    this.emitTo(
      userIds.map((id) => `user:${id}`),
      event,
      payload,
    );
  }

  changed(campaignId: string, what: CampaignChange, id?: string): void {
    this.io.to(`campaign:${campaignId}`).emit('campaign:changed', { campaignId, what, ...(id ? { id } : {}) });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.io.close(() => resolve()));
  }
}

/** Implémentation silencieuse (tests unitaires, scripts). */
export class NullRealtime implements Realtime {
  readonly sent: { event: string; campaignId: string; gm: unknown; players: unknown }[] = [];
  toCampaign<E extends EventName>(campaignId: string, event: E, gm: Payload<E>, players?: Payload<E> | null): void {
    this.sent.push({ event, campaignId, gm, players: players === undefined ? gm : players });
  }
  toUsers(): void {}
  changed(): void {}
}
