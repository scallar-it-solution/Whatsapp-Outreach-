import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('templates', (table) => {
      table.text('id').primary();
      table.text('set_name').notNullable();
      table.text('name').notNullable();
      table.text('body').notNullable();
      table.text('country');
      table.text('category');
      table.text('ab_label');
      table.integer('active').notNullable().defaultTo(1);
      table.text('created_at').notNullable();
    });
    await knex.schema.alterTable('templates', (table) => {
      table.index(['set_name', 'active']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`004_templates up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('templates');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`004_templates down failed: ${message}`);
  }
}
