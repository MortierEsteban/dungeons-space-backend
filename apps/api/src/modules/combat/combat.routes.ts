import { createEncounterSchema } from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../kernel/auth';
import { parse } from '../../kernel/errors';
import type { CampaignAccess } from '../campaigns/access';
import type { CombatService } from './combat.service';

interface Deps {
  combat: CombatService;
  access: CampaignAccess;
}

type P = { Params: { campaignId: string } };
type E = { Params: { encounterId: string } };

export async function combatRoutes(app: FastifyInstance, { combat, access }: Deps) {
  app.get<P>('/campaigns/:campaignId/encounters', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { encounters: await combat.list(request.params.campaignId, viewer) };
  });

  app.post<P>('/campaigns/:campaignId/encounters', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    const encounter = await combat.create(request.params.campaignId, viewer, parse(createEncounterSchema, request.body));
    return reply.status(201).send({ encounter });
  });

  app.get<E>('/encounters/:encounterId', async (request) => ({ encounter: await combat.get(request.params.encounterId, requireUser(request)) }));

  app.get<E>('/encounters/:encounterId/events', async (request) => ({ events: await combat.stream(request.params.encounterId, requireUser(request)) }));

  /** Commandes de combat : le serveur décide, journalise et diffuse (temps réel via Socket.IO). */
  app.post<E>('/encounters/:encounterId/commands', async (request) => ({
    events: await combat.command(request.params.encounterId, requireUser(request), request.body),
  }));

  app.delete<E>('/encounters/:encounterId', async (request, reply) => {
    await combat.remove(request.params.encounterId, requireUser(request));
    return reply.status(204).send();
  });
}
