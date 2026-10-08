import {
  createCampaignSchema,
  endSessionSchema,
  eventTypeDef,
  inviteSchema,
  joinCampaignSchema,
  startSessionSchema,
  updateCampaignSchema,
} from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../kernel/auth';
import { parse, unauthorized } from '../../kernel/errors';
import type { ChronicleService } from '../chronicle/chronicle.service';
import type { IdentityService } from '../identity/identity.service';
import type { CampaignAccess } from './access';
import type { CampaignsService } from './campaigns.service';

interface Deps {
  campaigns: CampaignsService;
  access: CampaignAccess;
  identity: IdentityService;
  chronicle: ChronicleService;
}

type P = { Params: { campaignId: string } };

export async function campaignsRoutes(app: FastifyInstance, { campaigns, access, identity, chronicle }: Deps) {
  const me = async (request: Parameters<typeof requireUser>[0]) => {
    const user = await identity.get(requireUser(request));
    if (!user) throw unauthorized();
    return user;
  };

  app.get('/campaigns', async (request) => ({ campaigns: await campaigns.listMine(requireUser(request)) }));

  app.get('/campaigns/discover', async (request) => ({ campaigns: await campaigns.discover(requireUser(request)) }));

  app.post('/campaigns', async (request, reply) => {
    const userId = requireUser(request);
    return reply.status(201).send({ campaign: await campaigns.create(userId, parse(createCampaignSchema, request.body)) });
  });

  app.post('/campaigns/join', async (request) => {
    const { code } = parse(joinCampaignSchema, request.body);
    return { campaign: await campaigns.joinByCode(code, await me(request)) };
  });

  app.post<P>('/campaigns/:campaignId/apply', async (request) => ({ campaign: await campaigns.joinPublic(request.params.campaignId, await me(request)) }));

  app.get<P>('/campaigns/:campaignId', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { campaign: await campaigns.get(request.params.campaignId, viewer) };
  });

  app.patch<P>('/campaigns/:campaignId', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { campaign: await campaigns.update(request.params.campaignId, viewer, parse(updateCampaignSchema, request.body)) };
  });

  app.delete<P>('/campaigns/:campaignId', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await campaigns.remove(request.params.campaignId, viewer);
    return reply.status(204).send();
  });

  app.post<P>('/campaigns/:campaignId/code', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { joinCode: await campaigns.regenerateCode(request.params.campaignId, viewer) };
  });

  app.post<P>('/campaigns/:campaignId/invitations', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await campaigns.invite(request.params.campaignId, viewer, parse(inviteSchema, request.body).email);
    return reply.status(204).send();
  });

  app.delete<{ Params: { campaignId: string; invitationId: string } }>('/campaigns/:campaignId/invitations/:invitationId', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await campaigns.revokeInvite(request.params.campaignId, viewer, request.params.invitationId);
    return reply.status(204).send();
  });

  app.delete<{ Params: { campaignId: string; userId: string } }>('/campaigns/:campaignId/members/:userId', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await campaigns.removeMember(request.params.campaignId, viewer, request.params.userId);
    return reply.status(204).send();
  });

  app.get<P>('/campaigns/:campaignId/sessions', async (request) => {
    await access.viewer(request, request.params.campaignId);
    return { sessions: await campaigns.listSessions(request.params.campaignId) };
  });

  app.post<P>('/campaigns/:campaignId/sessions', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    const { title } = parse(startSessionSchema, request.body);
    return reply.status(201).send({ session: await campaigns.startSession(request.params.campaignId, viewer, title) });
  });

  app.post<P>('/campaigns/:campaignId/sessions/end', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    const { summary } = parse(endSessionSchema, request.body);
    return { session: await campaigns.endSession(request.params.campaignId, viewer, summary) };
  });

  /** Récapitulatif de session généré depuis la Chronique (CHR-10, version gabarit). */
  app.get<{ Params: { campaignId: string; number: string } }>('/campaigns/:campaignId/sessions/:number/recap', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    const sessionNo = Number(request.params.number);
    const page = await chronicle.query(request.params.campaignId, viewer, { sessionNo, minImportance: 2, limit: 50 });
    const highlights = page.events.filter((e) => !e.retracted && e.category !== 'session').reverse();
    const lines = highlights.map((e) => `• ${eventTypeDef(e.type).label} — ${e.title}${e.text ? ` : ${e.text}` : ''}`);
    return {
      sessionNo,
      highlights,
      text: lines.length ? `Lors de la session ${sessionNo} :\n${lines.join('\n')}` : `La session ${sessionNo} n’a pas encore d’événements marquants.`,
    };
  });
}
