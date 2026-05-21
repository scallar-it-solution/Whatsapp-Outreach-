import type { Command } from 'commander';
import { closeDb, runMigrations } from '../../db/client';
import type { SenderRow, SenderStatus } from '../../db/schema';
import {
  listSenders,
  resumeSender,
  syncSendersFromEvolution,
  updateSenderStatus,
} from '../../senders/service';
import { testSenderReadiness } from '../../senders/readiness';

function line(value: string): void {
  process.stdout.write(`${value}\n`);
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'unknown sender command error'}\n`);
  process.exitCode = 1;
}

function formatSender(sender: SenderRow): string {
  const readiness = sender.last_health_check_at === null ? 'never_tested' : sender.last_health_check_at;
  return [
    sender.instance_name.padEnd(24),
    sender.status.padEnd(12),
    String(sender.health_score).padEnd(8),
    `${sender.sent_today}/${sender.daily_limit}`.padEnd(10),
    readiness,
  ].join('  ');
}

function run(action: () => Promise<void>): void {
  void action().catch(fail).finally(() => {
    void closeDb().catch(fail);
  });
}

async function setStatus(instance: string, status: SenderStatus): Promise<void> {
  try {
    await runMigrations();
    await updateSenderStatus(instance, status);
    line(`sender ${instance} set to ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown status update error';
    throw new Error(`sender status command failed: ${message}`);
  }
}

export function registerSenderCommands(program: Command): void {
  program.command('sender:list').description('Print all senders as a table').action(() => {
    run(async () => {
      try {
        await runMigrations();
        const senders = await listSenders();
        line('INSTANCE                  STATUS        HEALTH    SENT       READINESS');
        for (const sender of senders) {
          line(formatSender(sender));
        }
        const neverTested = senders.filter((sender) => sender.last_health_check_at === null);
        if (neverTested.length > 0) {
          line(`warning: ${neverTested.length} sender(s) have never passed a readiness test`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown sender list error';
        throw new Error(`sender:list failed: ${message}`);
      }
    });
  });

  program.command('sender:test <instance>').description('Run readiness test').action((instance: string) => {
    run(async () => {
      try {
        await runMigrations();
        const result = await testSenderReadiness(instance);
        line(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown sender test error';
        throw new Error(`sender:test failed: ${message}`);
      }
    });
  });

  program.command('sender:pause <instance>').description('Pause sender').action((instance: string) => {
    run(() => setStatus(instance, 'paused'));
  });

  program.command('sender:resume <instance>').description('Resume sender').action((instance: string) => {
    run(async () => {
      try {
        await runMigrations();
        await resumeSender(instance);
        line(`sender ${instance} resumed with health_score=100`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown sender resume error';
        throw new Error(`sender:resume failed: ${message}`);
      }
    });
  });

  program.command('sender:quarantine <instance>').description('Quarantine sender').action((instance: string) => {
    run(() => setStatus(instance, 'quarantined'));
  });

  program.command('sender:sync-from-evolution').description('Sync Evolution instances').action(() => {
    run(async () => {
      try {
        await runMigrations();
        const count = await syncSendersFromEvolution();
        line(`synced ${count} sender(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown sender sync error';
        throw new Error(`sender:sync-from-evolution failed: ${message}`);
      }
    });
  });
}
