import { Command } from 'commander';
import { registerCampaignCommands } from './commands/campaign';
import { registerImportCommands } from './commands/import';
import { registerMigrateCommands } from './commands/migrate';
import { registerQueueCommands } from './commands/queue';
import { registerSenderCommands } from './commands/sender';

async function main(): Promise<void> {
  try {
    const program = new Command();
    program
      .name('scallar-whatsapp-outreach')
      .description('Scallar WhatsApp outreach operations CLI')
      .version('1.0.0');

    registerSenderCommands(program);
    registerCampaignCommands(program);
    registerQueueCommands(program);
    registerImportCommands(program);
    registerMigrateCommands(program);

    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown CLI error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
