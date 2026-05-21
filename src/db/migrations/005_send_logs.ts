import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('send_logs', (table) => {
      table.text('id').primary();
      table.text('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
      table.text('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
      table.text('sender_instance').notNullable();
      table.text('recipient_jid').notNullable();
      table.text('message_id');
      table.text('template_id');
      table.integer('attempt_count').defaultTo(1);
      table.text('evolution_status');
      table.text('final_status');
      table.text('raw_response');
      table.text('sent_at').notNullable();
      table.text('resolved_at');
    });
    await knex.schema.alterTable('send_logs', (table) => {
      table.index(['message_id']);
      table.index(['sender_instance', 'sent_at']);
      table.index(['final_status']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`005_send_logs up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('send_logs');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`005_send_logs down failed: ${message}`);
  }
}
