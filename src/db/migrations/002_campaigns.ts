import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('campaigns', (table) => {
      table.text('id').primary();
      table.text('name').notNullable();
      table.text('country').notNullable();
      table.text('category');
      table.text('source_file');
      table.text('template_set').notNullable();
      table.text('status').notNullable();
      table.integer('total_leads').defaultTo(0);
      table.integer('sent_count').defaultTo(0);
      table.integer('failed_count').defaultTo(0);
      table.text('created_at').notNullable();
      table.text('started_at');
      table.text('completed_at');
    });
    await knex.schema.alterTable('campaigns', (table) => {
      table.index(['status', 'country']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`002_campaigns up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('campaigns');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`002_campaigns down failed: ${message}`);
  }
}
