import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('unsubscribes', (table) => {
      table.text('id').primary();
      table.text('phone').notNullable().unique();
      table.text('remote_jid');
      table.text('source');
      table.text('created_at').notNullable();
    });
    await knex.schema.alterTable('unsubscribes', (table) => {
      table.index(['created_at']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`009_unsubscribes up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('unsubscribes');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`009_unsubscribes down failed: ${message}`);
  }
}
