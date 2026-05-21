import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('leads', (table) => {
      table.text('id').primary();
      table.text('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
      table.text('phone').notNullable();
      table.text('business_name');
      table.text('city');
      table.text('country').notNullable();
      table.text('category');
      table.float('rating');
      table.integer('review_count');
      table.text('website');
      table.text('source_file');
      table.text('raw_json');
      table.text('status').notNullable();
      table.text('resolved_jid');
      table.text('last_attempt_at');
      table.text('created_at').notNullable();
      table.text('updated_at').notNullable();
      table.unique(['campaign_id', 'phone']);
    });
    await knex.schema.alterTable('leads', (table) => {
      table.index(['status', 'country']);
      table.index(['phone']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`003_leads up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('leads');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`003_leads down failed: ${message}`);
  }
}
