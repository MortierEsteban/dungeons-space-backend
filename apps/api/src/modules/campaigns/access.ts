import type { Role } from '@ds/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Executor } from '../../infra/db/client';
import { requireUser } from '../../kernel/auth';
import { forbidden, notFound } from '../../kernel/errors';
import { gameSessions, memberships } from './campaigns.tables';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);

export interface Viewer {
  userId: string;
  role: Role;
}

/**
 * Autorisation par campagne et par rôle, vérifiée côté serveur sur chaque ressource (NFR sécurité).
 * Un non-membre reçoit une 404 : on ne révèle pas l'existence d'une campagne.
 */
export class CampaignAccess {
  constructor(private readonly db: Executor) {}

  async roleOf(campaignId: string, userId: string): Promise<Role | null> {
    if (!isUuid(campaignId) || !isUuid(userId)) return null;
    const row = await this.db.query.memberships.findFirst({
      where: and(eq(memberships.campaignId, campaignId), eq(memberships.userId, userId)),
    });
    return row?.role ?? null;
  }

  async require(campaignId: string, userId: string): Promise<Role> {
    const role = await this.roleOf(campaignId, userId);
    if (!role) throw notFound('Campagne introuvable.');
    return role;
  }

  /** Utilisateur connecté + son rôle dans la campagne (404 s'il n'en est pas membre). */
  async viewer(request: FastifyRequest, campaignId: string): Promise<Viewer> {
    const userId = requireUser(request);
    return { userId, role: await this.require(campaignId, userId) };
  }

  async requireGm(campaignId: string, userId: string): Promise<void> {
    const role = await this.require(campaignId, userId);
    if (role !== 'gm') throw forbidden('Réservé au Maître du Jeu.');
  }
}

/** Numéro de la session en cours (ou de la dernière jouée) : horodatage narratif des événements. */
export class SessionClock {
  constructor(private readonly db: Executor) {}

  async current(campaignId: string, exec: Executor = this.db): Promise<number | null> {
    const last = await exec.query.gameSessions.findFirst({
      where: eq(gameSessions.campaignId, campaignId),
      orderBy: desc(gameSessions.number),
    });
    return last?.number ?? null;
  }
}
