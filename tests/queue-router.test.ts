import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, replaceDbForTests } from '../src/db/client';
import * as senderMigration from '../src/db/migrations/001_senders';
import { selectSender } from '../src/dispatch/router';

async function setupDb(): Promise<Knex> {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await senderMigration.up(db);
  replaceDbForTests(db);
  return db;
}

async function insertSender(instance: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const now = new Date().toISOString();
  await getDb()('senders').insert({
    id: instance,
    instance_name: instance,
    phone_number: null,
    label: instance,
    status: 'active',
    daily_limit: 80,
    delay_min_sec: 1,
    delay_max_sec: 1,
    sent_today: 0,
    health_score: 100,
    last_error: null,
    last_health_check_at: now,
    supports_lid: 0,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  });
}

describe('selectSender', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('selects an active sender below daily limit', async () => {
    await insertSender('sender1');
    await expect(selectSender('India')).resolves.toMatchObject({ instance_name: 'sender1' });
  });

  it('skips paused senders', async () => {
    await insertSender('sender1', { status: 'paused' });
    await expect(selectSender('India')).resolves.toBeNull();
  });

  it('skips senders above daily limit', async () => {
    await insertSender('sender1', { daily_limit: 1, sent_today: 1 });
    await expect(selectSender('India')).resolves.toBeNull();
  });

  it('skips senders with low health', async () => {
    await insertSender('sender1', { health_score: 49 });
    await expect(selectSender('India')).resolves.toBeNull();
  });

  it('returns null when no senders are available', async () => {
    await expect(selectSender('India')).resolves.toBeNull();
  });
});
