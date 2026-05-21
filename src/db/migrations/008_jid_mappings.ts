import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('jid_mappings', (table) => {
      table.text('id').primary();
      table.text('phone').notNullable();
      table.text('sender_instance').notNullable();
      table.text('resolved_jid').notNullable();
      table.text('addressing_mode');
      table.text('source');
      table.text('expires_at');
      table.text('created_at').notNullable();
      table.unique(['phone', 'sender_instance']);
    });
    await knex.schema.alterTable('jid_mappings', (table) => {
      table.index(['resolved_jid', 'sender_instance']);
      table.index(['expires_at']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`008_jid_mappings up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('jid_mappings');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`008_jid_mappings down failed: ${message}`);
  }
}
