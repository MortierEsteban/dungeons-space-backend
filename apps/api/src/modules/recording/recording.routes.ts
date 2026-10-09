import { appendSegmentsSchema, startRecordingSchema, transcriptQuerySchema, transcriptSearchSchema } from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, parse } from '../../kernel/errors';
import type { CampaignAccess } from '../campaigns/access';
import type { RecordingService } from './recording.service';

interface Deps {
  recording: RecordingService;
  access: CampaignAccess;
}

type P = { Params: { campaignId: string } };
type R = { Params: { campaignId: string; recordingId: string } };

const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'application/octet-stream'];
const nonNegative = (message: string) => (raw: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw badRequest(message);
  return n;
};
const sessionNumber = nonNegative('Numéro de session invalide.');
const counter = nonNegative('Numéro de morceau invalide.');

export async function recordingRoutes(app: FastifyInstance, { recording, access }: Deps) {
  // Les morceaux d'audio arrivent bruts (pas de multipart : un envoi toutes les quelques secondes).
  app.addContentTypeParser(AUDIO_TYPES, { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  app.get<P>('/campaigns/:campaignId/recordings', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    const { sessionNo } = parse(z.object({ sessionNo: z.coerce.number().int().min(0).optional() }), request.query);
    return { recordings: await recording.list(request.params.campaignId, v, sessionNo) };
  });

  app.get<P>('/campaigns/:campaignId/recordings/live', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return { recording: await recording.live(request.params.campaignId, v) };
  });

  app.post<P>('/campaigns/:campaignId/recordings', async (request, reply) => {
    const v = await access.viewer(request, request.params.campaignId);
    return reply.status(201).send({ recording: await recording.start(request.params.campaignId, v, parse(startRecordingSchema, request.body)) });
  });

  app.post<R>('/campaigns/:campaignId/recordings/:recordingId/pause', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return { recording: await recording.pause(request.params.campaignId, v, request.params.recordingId) };
  });

  app.post<R>('/campaigns/:campaignId/recordings/:recordingId/stop', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return { recording: await recording.stop(request.params.campaignId, v, request.params.recordingId) };
  });

  app.post<R>('/campaigns/:campaignId/recordings/:recordingId/segments', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return recording.appendSegments(request.params.campaignId, v, request.params.recordingId, parse(appendSegmentsSchema, request.body));
  });

  app.post<R>('/campaigns/:campaignId/recordings/:recordingId/analyze', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return recording.analyzeNow(request.params.campaignId, v, request.params.recordingId);
  });

  app.put<{ Params: { campaignId: string; recordingId: string; part: string; index: string }; Querystring: { deviceId?: string } }>(
    '/campaigns/:campaignId/recordings/:recordingId/audio/:part/:index',
    async (request) => {
      const v = await access.viewer(request, request.params.campaignId);
      const part = counter(request.params.part);
      const index = counter(request.params.index);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw badRequest('Morceau audio vide.');
      const mime = String(request.headers['content-type'] ?? 'audio/webm').split(';')[0]!;
      return recording.appendAudio(request.params.campaignId, v, request.params.recordingId, { part, index, deviceId: String(request.query.deviceId ?? ''), mime, data: request.body });
    },
  );

  app.get<{ Params: { campaignId: string; recordingId: string; part: string } }>('/campaigns/:campaignId/recordings/:recordingId/audio/:part', async (request, reply) => {
    const v = await access.viewer(request, request.params.campaignId);
    const audio = await recording.audio(request.params.campaignId, v, request.params.recordingId, counter(request.params.part), request.headers.range);
    reply.status(audio.status).header('accept-ranges', 'bytes').header('cache-control', 'private, no-store');
    for (const [k, value] of Object.entries(audio.headers)) reply.header(k, value);
    if (!('stream' in audio)) return reply.send();
    return reply.type(audio.mime).header('content-length', audio.size).send(audio.stream);
  });

  /** Trace complète d'une session : enregistrements et événements de toutes catégories. */
  app.get<{ Params: { campaignId: string; number: string } }>('/campaigns/:campaignId/sessions/:number/trace', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return recording.trace(request.params.campaignId, v, sessionNumber(request.params.number));
  });

  app.get<{ Params: { campaignId: string; number: string } }>('/campaigns/:campaignId/sessions/:number/transcript', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return recording.transcript(request.params.campaignId, v, sessionNumber(request.params.number), parse(transcriptQuerySchema, request.query));
  });

  /** Recherche dans toutes les transcriptions de la campagne. */
  app.get<P>('/campaigns/:campaignId/transcript/search', async (request) => {
    const v = await access.viewer(request, request.params.campaignId);
    return recording.search(request.params.campaignId, v, parse(transcriptSearchSchema, request.query));
  });
}
