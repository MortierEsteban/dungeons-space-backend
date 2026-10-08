import { campaignSettingsSchema, createLinkSchema, createNodeSchema, updateLinkSchema, updateNodeSchema } from '@ds/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../infra/db/client';
import { parse } from '../../kernel/errors';
import type { CampaignAccess } from '../campaigns/access';
import { campaigns } from '../campaigns/campaigns.tables';
import type { ConstellationService } from './constellation.service';

interface Deps {
  constellation: ConstellationService;
  access: CampaignAccess;
  db: Db;
}

type P = { Params: { campaignId: string } };
type PI = { Params: { campaignId: string; id: string } };

export async function constellationRoutes(app: FastifyInstance, { constellation, access, db }: Deps) {
  const playerViewEnabled = async (campaignId: string) => {
    const row = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId), columns: { settings: true } });
    return row ? campaignSettingsSchema.parse(row.settings).playerConstellation : false;
  };

  app.get<P>('/campaigns/:campaignId/constellation', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return constellation.get(request.params.campaignId, viewer, await playerViewEnabled(request.params.campaignId));
  });

  app.get<P>('/campaigns/:campaignId/constellation/suggestions', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { suggestions: await constellation.suggestions(request.params.campaignId, viewer) };
  });

  app.post<P>('/campaigns/:campaignId/constellation/nodes', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return reply.status(201).send({ node: await constellation.createNode(request.params.campaignId, viewer, parse(createNodeSchema, request.body)) });
  });

  app.patch<PI>('/campaigns/:campaignId/constellation/nodes/:id', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { node: await constellation.updateNode(request.params.campaignId, viewer, request.params.id, parse(updateNodeSchema, request.body)) };
  });

  app.delete<PI>('/campaigns/:campaignId/constellation/nodes/:id', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await constellation.deleteNode(request.params.campaignId, viewer, request.params.id);
    return reply.status(204).send();
  });

  app.post<P>('/campaigns/:campaignId/constellation/links', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return reply.status(201).send({ links: await constellation.createLink(request.params.campaignId, viewer, parse(createLinkSchema, request.body)) });
  });

  app.patch<PI>('/campaigns/:campaignId/constellation/links/:id', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { link: await constellation.updateLink(request.params.campaignId, viewer, request.params.id, parse(updateLinkSchema, request.body)) };
  });

  app.delete<PI>('/campaigns/:campaignId/constellation/links/:id', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    await constellation.deleteLink(request.params.campaignId, viewer, request.params.id);
    return reply.status(204).send();
  });
}
