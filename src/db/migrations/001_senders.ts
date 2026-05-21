import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.schema.createTable('senders', (table) => {
      table.text('id').primary();
      table.text('instance_name').notNullable().unique();
      table.text('phone_number');
      table.text('label');
      table.text('status').notNullable();
      table.integer('daily_limit').notNullable().defaultTo(80);
      table.integer('delay_min_sec').notNullable().defaultTo(45);
      table.integer('delay_max_sec').notNullable().defaultTo(90);
      table.integer('sent_today').notNullable().defaultTo(0);
      table.float('health_score').notNullable().defaultTo(100);
      table.text('last_error');
      table.text('last_health_check_at');
      table.integer('supports_lid').notNullable().defaultTo(0);
      table.text('notes');
      table.text('created_at').notNullable();
      table.text('updated_at').notNullable();
    });
    await knex.schema.alterTable('senders', (table) => {
      table.index(['status', 'health_score']);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`001_senders up failed: ${message}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.dropTableIfExists('senders');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`001_senders down failed: ${message}`);
  }
}
