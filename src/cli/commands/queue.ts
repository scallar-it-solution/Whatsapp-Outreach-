import type { Command } from 'commander';
import { getDeadLetterQueue, getOutreachQueue, getQueueCounts, closeQueues } from '../../queue/queues';

interface FlushOptions {
  confirm?: boolean;
}

function line(value: string): void {
  process.stdout.write(`${value}\n`);
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'unknown queue command error'}\n`);
  process.exitCode = 1;
}

function run(action: () => Promise<void>): void {
  void action().catch(fail).finally(() => {
    void closeQueues().catch(fail);
  });
}

export function registerQueueCommands(program: Command): void {
  program.command('queue:status').description('Print queue sizes').action(() => {
    run(async () => {
      try {
        const counts = await getQueueCounts();
        line(JSON.stringify(counts, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown queue status error';
        throw new Error(`queue:status failed: ${message}`);
      }
    });
  });

  program
    .command('queue:flush')
    .option('--confirm', 'confirm destructive queue drain')
    .description('Remove all pending jobs')
    .action((options: FlushOptions) => {
      run(async () => {
        try {
          if (options.confirm !== true) {
            throw new Error('queue:flush requires --confirm');
          }
          await getOutreachQueue().drain(true);
          line('pending outreach jobs flushed');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown queue flush error';
          throw new Error(`queue:flush failed: ${message}`);
        }
      });
    });

  program.command('queue:retry-dead').description('Move dead-letter jobs back to outreach').action(() => {
    run(async () => {
      try {
        const dead = getDeadLetterQueue();
        const outreach = getOutreachQueue();
        const jobs = await dead.getJobs(['waiting', 'delayed', 'failed'], 0, 500, false);
        for (const job of jobs) {
          await outreach.add('send-lead', job.data.original, {
            attempts: 1,
            removeOnComplete: 1000,
            removeOnFail: false,
          });
          await job.remove();
        }
        line(`retried ${jobs.length} dead-letter job(s)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown retry-dead error';
        throw new Error(`queue:retry-dead failed: ${message}`);
      }
    });
  });
}
