import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('message_updates', (table) => {
      table.text('id').primary();
      table.text('message_id').notNullable();
      table.text('sender_instance').notNullable();
      table.text('status').notNullable();
      table.text('raw_payload');
      table.text('received_at').notNullable();
    });
    await knex.schema.alterTable('message_updates', (table) => {
      table.index(['message_id', 'sender_instance']);
      table.index(['status', 'received_at']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`006_message_updates up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('message_updates');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`006_message_updates down failed: ${message}`);
  }
}
