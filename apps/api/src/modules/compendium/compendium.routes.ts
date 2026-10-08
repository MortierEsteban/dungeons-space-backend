import { creationSchema, giveCreationSchema } from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../kernel/auth';
import { parse } from '../../kernel/errors';
import type { CompendiumService } from './compendium.service';

const querySchema = z.object({ q: z.string().max(120).optional(), kind: z.enum(['spell', 'monster', 'item']).optional() });

type I = { Params: { id: string } };

export async function compendiumRoutes(app: FastifyInstance, { compendium }: { compendium: CompendiumService }) {
  /** Crédits & licences (exigence CC-BY, CNT-02) : public. */
  app.get('/rulesets', async () => ({ rulesets: compendium.rulesets() }));

  app.get('/compendium', async (request) => {
    requireUser(request);
    const { q, kind } = parse(querySchema, request.query);
    return { entries: compendium.search(q, kind) };
  });

  app.get<I>('/compendium/:id', async (request) => {
    requireUser(request);
    return { entry: compendium.entry(request.params.id) };
  });

  app.get('/creations', async (request) => ({ creations: await compendium.listCreations(requireUser(request)) }));

  app.post('/creations', async (request, reply) => {
    const creation = await compendium.create(requireUser(request), parse(creationSchema, request.body));
    return reply.status(201).send({ creation });
  });

  app.put<I>('/creations/:id', async (request) => ({
    creation: await compendium.update(request.params.id, requireUser(request), parse(creationSchema, request.body)),
  }));

  app.delete<I>('/creations/:id', async (request, reply) => {
    await compendium.remove(request.params.id, requireUser(request));
    return reply.status(204).send();
  });

  app.post<I>('/creations/:id/give', async (request) => {
    const { characterId, qty } = parse(giveCreationSchema, request.body);
    return { character: await compendium.give(request.params.id, requireUser(request), characterId, qty) };
  });
}
