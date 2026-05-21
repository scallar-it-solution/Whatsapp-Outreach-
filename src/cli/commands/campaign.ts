import type { Command } from 'commander';
import { closeDb, runMigrations } from '../../db/client';
import {
  createCampaign,
  getCampaignStatusBreakdown,
  listCampaigns,
  loadCampaignToQueue,
} from '../../campaigns/service';
import { closeQueues } from '../../queue/queues';

interface CampaignCreateOptions {
  name: string;
  country: string;
  templateSet: string;
  sourceFile?: string;
}

function line(value: string): void {
  process.stdout.write(`${value}\n`);
}

function fail(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : 'unknown campaign command error'}\n`);
  process.exitCode = 1;
}

function run(action: () => Promise<void>): void {
  void action().catch(fail).finally(() => {
    void closeQueues().catch(fail);
    void closeDb().catch(fail);
  });
}

export function registerCampaignCommands(program: Command): void {
  program
    .command('campaign:create')
    .requiredOption('--name <name>')
    .requiredOption('--country <country>')
    .requiredOption('--template-set <templateSet>')
    .option('--source-file <sourceFile>')
    .description('Create a campaign')
    .action((options: CampaignCreateOptions) => {
      run(async () => {
        try {
          await runMigrations();
          const campaign = await createCampaign(options);
          line(JSON.stringify(campaign, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown campaign create error';
          throw new Error(`campaign:create failed: ${message}`);
        }
      });
    });

  program.command('campaign:list').description('List campaigns').action(() => {
    run(async () => {
      try {
        await runMigrations();
        const campaigns = await listCampaigns();
        line('ID                                    NAME                 COUNTRY      STATUS      SENT/FAILED');
        for (const campaign of campaigns) {
          line(
            `${campaign.id.padEnd(38)} ${campaign.name.padEnd(20)} ${campaign.country.padEnd(12)} ${campaign.status.padEnd(11)} ${campaign.sent_count}/${campaign.failed_count}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown campaign list error';
        throw new Error(`campaign:list failed: ${message}`);
      }
    });
  });

  program.command('campaign:load <campaign-id>').description('Enqueue queued leads').action((campaignId: string) => {
    run(async () => {
      try {
        await runMigrations();
        const result = await loadCampaignToQueue(campaignId);
        line(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown campaign load error';
        throw new Error(`campaign:load failed: ${message}`);
      }
    });
  });

  program.command('campaign:status <campaign-id>').description('Print campaign lead status breakdown').action((campaignId: string) => {
    run(async () => {
      try {
        await runMigrations();
        const breakdown = await getCampaignStatusBreakdown(campaignId);
        for (const row of breakdown) {
          line(`${row.status.padEnd(14)} ${row.count}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown campaign status error';
        throw new Error(`campaign:status failed: ${message}`);
      }
    });
  });
}
