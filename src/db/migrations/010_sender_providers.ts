import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.alterTable('senders', (table) => {
      table.text('provider').notNullable().defaultTo('evolution');
      table.text('waha_base_url');
      table.text('waha_session');
    });
    await knex.schema.alterTable('senders', (table) => {
      table.index(['provider', 'status']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`010_sender_providers up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.alterTable('senders', (table) => {
      table.dropIndex(['provider', 'status']);
      table.dropColumn('provider');
      table.dropColumn('waha_base_url');
      table.dropColumn('waha_session');
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`010_sender_providers down failed: ${message}`);
  }
}
