import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  /** PostgreSQL (production). Absent : PostgreSQL embarqué (PGlite) dans DATA_DIR. */
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default('.data'),
  JWT_SECRET: z.string().min(32).optional(),
  /** Dossier du build du front servi par l'API en production (optionnel). */
  WEB_DIST: z.string().optional(),
  /** Peuple une campagne de démonstration si la base est vide. */
  SEED_DEMO: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  database: { kind: 'postgres'; url: string } | { kind: 'pglite'; dir: string | null };
  dataDir: string;
  uploadDir: string;
  jwtSecret: string;
  webDist: string | null;
  seedDemo: boolean;
  logLevel: string;
}

const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret-change-me';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  if (e.NODE_ENV === 'production' && !e.JWT_SECRET) {
    throw new Error('JWT_SECRET (≥ 32 caractères) est obligatoire en production.');
  }
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    database: e.DATABASE_URL ? { kind: 'postgres', url: e.DATABASE_URL } : { kind: 'pglite', dir: `${e.DATA_DIR}/pglite` },
    dataDir: e.DATA_DIR,
    uploadDir: `${e.DATA_DIR}/uploads`,
    jwtSecret: e.JWT_SECRET ?? DEV_SECRET,
    webDist: e.WEB_DIST ?? null,
    seedDemo: e.SEED_DEMO ?? e.NODE_ENV === 'development',
    logLevel: e.LOG_LEVEL,
  };
}

/** Configuration de test : base en mémoire, aucun fichier persistant. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    database: { kind: 'pglite', dir: null },
    dataDir: '.data-test',
    uploadDir: '.data-test/uploads',
    jwtSecret: DEV_SECRET,
    webDist: null,
    seedDemo: false,
    logLevel: 'silent',
    ...overrides,
  };
}
