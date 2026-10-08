import { characterActionSchema, createCharacterSchema, noteSchema, updateCharacterSchema } from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../kernel/auth';
import { parse } from '../../kernel/errors';
import type { CampaignAccess } from '../campaigns/access';
import type { CharactersService } from './characters.service';

interface Deps {
  characters: CharactersService;
  access: CampaignAccess;
}

type P = { Params: { campaignId: string } };
type C = { Params: { characterId: string } };
type N = { Params: { noteId: string } };

export async function charactersRoutes(app: FastifyInstance, { characters, access }: Deps) {
  app.get('/characters/mine', async (request) => ({ characters: await characters.listMine(requireUser(request)) }));

  app.get<P>('/campaigns/:campaignId/characters', async (request) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    return { characters: await characters.list(request.params.campaignId, viewer) };
  });

  app.post<P>('/campaigns/:campaignId/characters', async (request, reply) => {
    const viewer = await access.viewer(request, request.params.campaignId);
    const character = await characters.create(request.params.campaignId, viewer, parse(createCharacterSchema, request.body));
    return reply.status(201).send({ character });
  });

  app.get<C>('/characters/:characterId', async (request) => ({ character: await characters.get(request.params.characterId, requireUser(request)) }));

  app.patch<C>('/characters/:characterId', async (request) => ({
    character: await characters.update(request.params.characterId, requireUser(request), parse(updateCharacterSchema, request.body)),
  }));

  app.delete<C>('/characters/:characterId', async (request, reply) => {
    await characters.remove(request.params.characterId, requireUser(request));
    return reply.status(204).send();
  });

  app.post<C>('/characters/:characterId/actions', async (request) => ({
    character: await characters.act(request.params.characterId, requireUser(request), parse(characterActionSchema, request.body)),
  }));

  app.get<C>('/characters/:characterId/notes', async (request) => ({ notes: await characters.listNotes(request.params.characterId, requireUser(request)) }));

  app.post<C>('/characters/:characterId/notes', async (request, reply) => {
    const note = await characters.createNote(request.params.characterId, requireUser(request), parse(noteSchema, request.body));
    return reply.status(201).send({ note });
  });

  app.patch<N>('/notes/:noteId', async (request) => ({
    note: await characters.updateNote(request.params.noteId, requireUser(request), parse(noteSchema.partial(), request.body)),
  }));

  app.delete<N>('/notes/:noteId', async (request, reply) => {
    await characters.deleteNote(request.params.noteId, requireUser(request));
    return reply.status(204).send();
  });
}
