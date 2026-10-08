import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import type { AppConfig } from '../../config';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Une requête peut s'exécuter sur la base ou dans une transaction en cours. */
export type Executor = Db | Tx;

export interface Database {
  db: Db;
  close(): Promise<void>;
}

function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../drizzle'), // src/infra/db → apps/api/drizzle
    path.resolve(here, '../drizzle'), // dist → apps/api/drizzle
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(process.cwd(), 'apps/api/drizzle'),
  ];
  const found = candidates.find((c) => existsSync(path.join(c, 'meta', '_journal.json')));
  if (!found) throw new Error(`Migrations introuvables (cherché dans ${candidates.join(', ')})`);
  return found;
}

/**
 * PostgreSQL partout : serveur réel en production (DATABASE_URL), PGlite (PostgreSQL compilé
 * en WebAssembly, embarqué) en développement et en test — aucune installation requise.
 */
export async function openDatabase(config: AppConfig): Promise<Database> {
  const folder = migrationsFolder();
  if (config.database.kind === 'postgres') {
    const pool = new pg.Pool({ connectionString: config.database.url, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: folder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const dir = config.database.dir;
  if (dir) mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: folder });
  return { db: db as unknown as Db, close: () => client.close() };
}
