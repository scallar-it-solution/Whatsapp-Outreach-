import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('replies', (table) => {
      table.text('id').primary();
      table.text('lead_id').references('id').inTable('leads').onDelete('SET NULL');
      table.text('sender_instance').notNullable();
      table.text('remote_jid').notNullable();
      table.text('addressing_mode');
      table.text('message_id');
      table.text('message_text');
      table.text('classification');
      table.text('raw_payload');
      table.text('received_at').notNullable();
    });
    await knex.schema.alterTable('replies', (table) => {
      table.index(['classification', 'received_at']);
      table.index(['remote_jid']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`007_replies up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('replies');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`007_replies down failed: ${message}`);
  }
}
