import type { Command } from 'commander';
import { closeDb, getDb } from '../../db/client';

function line(value: string): void {
  process.stdout.write(`${value}\n`);
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'unknown migrate command error'}\n`);
  process.exitCode = 1;
}

function run(action: () => Promise<void>): void {
  void action().catch(fail).finally(() => {
    void closeDb().catch(fail);
  });
}

function parseMigrationResult(value: unknown): [number, string[]] {
  if (!Array.isArray(value)) {
    return [0, []];
  }
  const batch = typeof value[0] === 'number' ? value[0] : 0;
  const files = Array.isArray(value[1])
    ? value[1].filter((item): item is string => typeof item === 'string')
    : [];
  return [batch, files];
}

export function registerMigrateCommands(program: Command): void {
  program.command('db:migrate').description('Run pending migrations').action(() => {
    run(async () => {
      try {
        const [batch, files] = parseMigrationResult(await getDb().migrate.latest());
        line(`batch ${batch} migrated ${files.length} file(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown migration error';
        throw new Error(`db:migrate failed: ${message}`);
      }
    });
  });

  program.command('db:rollback').description('Rollback last migration batch').action(() => {
    run(async () => {
      try {
        const [batch, files] = parseMigrationResult(await getDb().migrate.rollback(undefined, false));
        line(`batch ${batch} rolled back ${files.length} file(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown rollback error';
        throw new Error(`db:rollback failed: ${message}`);
      }
    });
  });
}
