import { rollDice, systemRng } from '@ds/rules';
import { correctEventSchema, createEventLinkSchema, createEventSchema, eventQuerySchema, rollSchema, type RollResultDto } from '@ds/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { parse } from '../../kernel/errors';
import type { CampaignAccess } from '../campaigns/access';
import type { ChronicleService } from './chronicle.service';

interface Deps {
  chronicle: ChronicleService;
  access: CampaignAccess;
}

type CampaignParams = { Params: { campaignId: string } };

export async function chronicleRoutes(app: FastifyInstance, { chronicle, access }: Deps) {
  const viewer = (request: FastifyRequest, campaignId: string) => access.viewer(request, campaignId);

  app.get<CampaignParams>('/campaigns/:campaignId/events', async (request) => {
    const v = await viewer(request, request.params.campaignId);
    return chronicle.query(request.params.campaignId, v, parse(eventQuerySchema, request.query));
  });

  app.post<CampaignParams>('/campaigns/:campaignId/events', async (request, reply) => {
    const v = await viewer(request, request.params.campaignId);
    const event = await chronicle.createNarrative(request.params.campaignId, v, parse(createEventSchema, request.body));
    return reply.status(201).send({ event });
  });

  app.post<{ Params: { campaignId: string; eventId: string } }>('/campaigns/:campaignId/events/:eventId/corrections', async (request) => {
    const v = await viewer(request, request.params.campaignId);
    return { event: await chronicle.correct(request.params.campaignId, request.params.eventId, v, parse(correctEventSchema, request.body)) };
  });

  app.post<{ Params: { campaignId: string; eventId: string } }>('/campaigns/:campaignId/events/:eventId/reveal', async (request) => {
    const v = await viewer(request, request.params.campaignId);
    return { event: await chronicle.reveal(request.params.campaignId, request.params.eventId, v) };
  });

  app.get<CampaignParams>('/campaigns/:campaignId/event-links', async (request) => {
    const v = await viewer(request, request.params.campaignId);
    return { links: await chronicle.listLinks(request.params.campaignId, v) };
  });

  app.post<CampaignParams>('/campaigns/:campaignId/event-links', async (request, reply) => {
    const v = await viewer(request, request.params.campaignId);
    const { fromId, toId } = parse(createEventLinkSchema, request.body);
    return reply.status(201).send({ link: await chronicle.createLink(request.params.campaignId, v, fromId, toId) });
  });

  app.delete<{ Params: { campaignId: string; linkId: string } }>('/campaigns/:campaignId/event-links/:linkId', async (request, reply) => {
    const v = await viewer(request, request.params.campaignId);
    await chronicle.deleteLink(request.params.campaignId, v, request.params.linkId);
    return reply.status(204).send();
  });

  /** Jet de dés autoritaire côté serveur, journalisé dans la Chronique (CMB-40). */
  app.post<CampaignParams>('/campaigns/:campaignId/rolls', async (request): Promise<RollResultDto> => {
    const v = await viewer(request, request.params.campaignId);
    const input = parse(rollSchema, request.body);
    const roll = rollDice(input.notation, systemRng);
    const secret = v.role === 'gm' && input.secret;
    const crit = roll.natural === 20 ? ' — critique !' : roll.natural === 1 ? ' — échec critique' : '';
    const row = await chronicle.appendAndPublish({
      campaignId: request.params.campaignId,
      type: 'dice.rolled',
      title: `${input.label} : ${roll.total}${crit}`,
      text: `${roll.notation} → ${roll.terms.map((t) => (t.rolls.length ? `[${t.rolls.join(', ')}]` : t.subtotal)).join(' ')}`,
      visibility: secret ? 'gm_only' : 'players',
      payload: { notation: roll.notation, total: roll.total, natural: roll.natural ?? null, terms: roll.terms, characterId: input.characterId ?? null },
      actors: [],
      source: v.role === 'gm' ? 'gm' : 'player',
      authorId: v.userId,
    });
    return {
      label: input.label,
      notation: roll.notation,
      rolls: roll.terms.flatMap((t) => t.kept),
      total: roll.total,
      natural: roll.natural ?? null,
      eventId: row.id,
    };
  });
}
