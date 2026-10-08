import { buildApp } from './app';
import { loadConfig } from './config';
import { seedDemo } from './seed';

const config = loadConfig();
const built = await buildApp(config);

if (config.seedDemo) {
  const seeded = await seedDemo(built.services, built.database.db);
  if (seeded) built.app.log.info('Campagne de démonstration créée (voir apps/api/src/seed.ts pour les comptes).');
}

const shutdown = async (signal: string) => {
  built.app.log.info(`${signal} reçu, arrêt en cours…`);
  await built.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await built.app.listen({ host: config.host, port: config.port });
