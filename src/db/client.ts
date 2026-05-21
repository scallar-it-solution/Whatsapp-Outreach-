import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import knex, { type Knex } from 'knex';
import { config } from '../config/env';

let dbInstance: Knex | null = null;

function migrationSettings(): Knex.MigratorConfig {
  const distMigrations = resolve(process.cwd(), 'dist', 'db', 'migrations');
  if (existsSync(distMigrations)) {
    return {
      directory: distMigrations,
      extension: 'js',
    };
  }
  return {
    directory: resolve(process.cwd(), 'src', 'db', 'migrations'),
    extension: 'ts',
  };
}

export function createKnexConfig(): Knex.Config {
  if (config.DB_CLIENT === 'postgres') {
    return {
      client: 'pg',
      connection: config.DATABASE_URL,
      migrations: migrationSettings(),
      pool: {
        min: 0,
        max: 10,
      },
    };
  }

  if (config.SQLITE_PATH !== ':memory:') {
    mkdirSync(dirname(resolve(config.SQLITE_PATH)), { recursive: true });
  }

  return {
    client: 'better-sqlite3',
    connection: {
      filename: config.SQLITE_PATH,
    },
    useNullAsDefault: true,
    migrations: migrationSettings(),
  };
}

export function getDb(): Knex {
  if (dbInstance === null) {
    dbInstance = knex(createKnexConfig());
  }
  return dbInstance;
}

export function replaceDbForTests(testDb: Knex): void {
  dbInstance = testDb;
}

export async function closeDb(): Promise<void> {
  try {
    if (dbInstance !== null) {
      await dbInstance.destroy();
      dbInstance = null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown db shutdown error';
    throw new Error(`Failed to close database: ${message}`);
  }
}

export async function runMigrations(): Promise<void> {
  try {
    await getDb().migrate.latest();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown migration error';
    throw new Error(`Failed to run migrations: ${message}`);
  }
}
