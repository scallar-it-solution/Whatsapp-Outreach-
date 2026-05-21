import type { Command } from 'commander';
import { isSupportedCountry } from '../../config/constants';
import { closeDb, runMigrations } from '../../db/client';
import { importCsv } from '../../leads/importer';

interface ImportOptions {
  file: string;
  campaign: string;
  country: string;
}

function line(value: string): void {
  process.stdout.write(`${value}\n`);
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'unknown import command error'}\n`);
  process.exitCode = 1;
}

function run(action: () => Promise<void>): void {
  void action().catch(fail).finally(() => {
    void closeDb().catch(fail);
  });
}

export function registerImportCommands(program: Command): void {
  program
    .command('import:csv')
    .requiredOption('--file <path>')
    .requiredOption('--campaign <id>')
    .requiredOption('--country <country>')
    .description('Import CSV leads into a campaign')
    .action((options: ImportOptions) => {
      run(async () => {
        try {
          await runMigrations();
          if (!isSupportedCountry(options.country)) {
            throw new Error(`unsupported country: ${options.country}`);
          }
          const result = await importCsv(options.file, options.campaign, options.country);
          line(JSON.stringify(result, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown import csv error';
          throw new Error(`import:csv failed: ${message}`);
        }
      });
    });
}
