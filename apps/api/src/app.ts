import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config';
import { openDatabase, type Database } from './infra/db/client';
import { NullRealtime, SocketRealtime, type Realtime } from './infra/realtime';
import { registerAuth } from './kernel/auth';
import { errorHandler } from './kernel/errors';
import { CampaignAccess, SessionClock } from './modules/campaigns/access';
import { campaignsRoutes } from './modules/campaigns/campaigns.routes';
import { CampaignsService } from './modules/campaigns/campaigns.service';
import { charactersRoutes } from './modules/characters/characters.routes';
import { CharactersService } from './modules/characters/characters.service';
import { chronicleRoutes } from './modules/chronicle/chronicle.routes';
import { ChronicleService } from './modules/chronicle/chronicle.service';
import { combatRoutes } from './modules/combat/combat.routes';
import { CombatService } from './modules/combat/combat.service';
import { compendiumRoutes } from './modules/compendium/compendium.routes';
import { CompendiumService } from './modules/compendium/compendium.service';
import { constellationRoutes } from './modules/constellation/constellation.routes';
import { ConstellationService } from './modules/constellation/constellation.service';
import { identityRoutes } from './modules/identity/identity.routes';
import { IdentityService } from './modules/identity/identity.service';
import { readCookie, SESSION_COOKIE, TokenService } from './modules/identity/tokens';
import { ClaudeSessionAnalyzer, type SessionAnalyzer } from './modules/recording/analyzer';
import { recordingRoutes } from './modules/recording/recording.routes';
import { RecordingService } from './modules/recording/recording.service';
import { uploadsRoutes } from './modules/uploads/uploads.routes';
import '@ds/rules'; // enregistre le ruleset D&D 5e

export interface BuiltApp {
  app: FastifyInstance;
  database: Database;
  realtime: Realtime;
  services: ReturnType<typeof composeServices>;
  close(): Promise<void>;
}

/**
 * Racine de composition : chaque module expose ses services ; les dépendances entre modules
 * sont explicites ici (injection par constructeur), sans conteneur magique.
 */
function composeServices(database: Database, realtime: Realtime, config: AppConfig, extra: { analyzer: SessionAnalyzer | null; onError: (err: unknown, message: string) => void }) {
  const { db } = database;
  const tokens = new TokenService(config.jwtSecret);
  const identity = new IdentityService(db);
  const access = new CampaignAccess(db);
  const clock = new SessionClock(db);
  const chronicle = new ChronicleService(db, realtime, clock, identity);
  const campaigns = new CampaignsService(db, access, chronicle, realtime);
  const constellation = new ConstellationService(db, realtime);
  const characters = new CharactersService(db, access, chronicle, constellation, realtime, clock);
  const combat = new CombatService(db, access, chronicle, characters, realtime);
  const compendium = new CompendiumService(db, characters);
  const recording = new RecordingService({
    db,
    realtime,
    chronicle,
    identity,
    characters,
    constellation,
    config: config.recording,
    analyzer: extra.analyzer,
    audioDir: path.join(config.dataDir, 'recordings'),
    onError: extra.onError,
  });
  campaigns.onSessionEnded((campaignId, sessionNo) => void recording.sessionEnded(campaignId, sessionNo).catch((err) => extra.onError(err, 'Arrêt de l’enregistrement en échec')));
  return { tokens, identity, access, clock, chronicle, campaigns, constellation, characters, combat, compendium, recording };
}

export interface BuildOptions {
  realtime?: 'socket' | 'none';
  database?: Database;
  /** Analyseur des enregistrements ; par défaut, celui de la configuration (Claude ou aucun). */
  analyzer?: SessionAnalyzer | null;
}

export async function buildApp(config: AppConfig, options: BuildOptions = {}): Promise<BuiltApp> {
  const database = options.database ?? (await openDatabase(config));
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: true,
  });

  // Le temps réel s'attache au serveur HTTP de Fastify ; il authentifie via le même cookie de session.
  let realtime: Realtime = new NullRealtime();
  const lazy = { services: null as ReturnType<typeof composeServices> | null };
  if (options.realtime !== 'none') {
    realtime = new SocketRealtime(app.server, {
      authenticate: async (cookie) => (await lazy.services!.tokens.verify(readCookie(cookie, SESSION_COOKIE)))?.userId ?? null,
      roleOf: (campaignId, userId) => lazy.services!.access.roleOf(campaignId, userId),
    });
  }
  const analyzer = options.analyzer !== undefined ? options.analyzer : config.recording.analyzer === 'claude' ? new ClaudeSessionAnalyzer(config.recording.model) : null;
  const services = composeServices(database, realtime, config, { analyzer, onError: (err, message) => app.log.error({ err }, message) });
  lazy.services = services;

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart);
  await app.register(fastifyRateLimit, { global: false });
  app.setErrorHandler(errorHandler);
  registerAuth(app, services.tokens, config.env === 'production');

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }));
      await identityRoutes(api, { identity: services.identity, campaigns: services.campaigns, tokens: services.tokens, secureCookies: config.env === 'production' });
      await campaignsRoutes(api, services);
      await chronicleRoutes(api, services);
      await charactersRoutes(api, services);
      await combatRoutes(api, services);
      await constellationRoutes(api, { ...services, db: database.db });
      await compendiumRoutes(api, services);
      await recordingRoutes(api, services);
      await uploadsRoutes(api, { uploadDir: config.uploadDir });
      api.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Route inconnue.' } }));
    },
    { prefix: '/api' },
  );

  await app.register(fastifyStatic, { root: path.resolve(config.uploadDir), prefix: '/uploads/', decorateReply: false, maxAge: '7d', immutable: true });

  // En production, l'API sert aussi le front (SPA) : une seule origine, cookies simples.
  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: path.resolve(config.webDist), prefix: '/', wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) return reply.sendFile('index.html');
      return reply.status(404).send({ error: { code: 'not_found', message: 'Route inconnue.' } });
    });
  }

  return {
    app,
    database,
    realtime,
    services,
    async close() {
      if (realtime instanceof SocketRealtime) await realtime.close();
      await services.recording.drain();
      await app.close();
      await database.close();
    },
  };
}
