import { buildApp } from './app';
import { loadConfig } from './config';
import { seedDemo } from './seed';

const config = loadConfig();
const built = await buildApp(config);

if (config.seedDemo) {
  const seeded = await seedDemo(built.services, built.database.db);
  if (seeded) built.app.log.info('Campagne de démonstration créée (voir apps/api/src/seed.ts pour les comptes).');
}

built.app.log.info(
  config.recording.analyzer === 'claude'
    ? `Analyse des enregistrements de session : ${config.recording.model}.`
    : 'Analyse des enregistrements de session désactivée (définissez ANTHROPIC_API_KEY pour l’activer) : la transcription reste conservée.',
);

const shutdown = async (signal: string) => {
  built.app.log.info(`${signal} reçu, arrêt en cours…`);
  await built.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await built.app.listen({ host: config.host, port: config.port });
