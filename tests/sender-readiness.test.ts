import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, replaceDbForTests } from '../src/db/client';
import * as senderMigration from '../src/db/migrations/001_senders';
import * as updateMigration from '../src/db/migrations/006_message_updates';
import { testSenderReadiness } from '../src/senders/readiness';

async function setupDb(): Promise<Knex> {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await senderMigration.up(db);
  await updateMigration.up(db);
  replaceDbForTests(db);
  return db;
}

describe('testSenderReadiness', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('returns not ready when connection state is not open', async () => {
    const result = await testSenderReadiness('sender1', {
      client: {
        getConnectionState: async () => ({ state: 'close' }),
        sendTextMessage: async () => ({ key: { id: 'unused' } }),
      },
      timeoutMs: 10,
      pollIntervalMs: 1,
    });
    expect(result).toEqual({ ready: false, reason: 'not_connected' });
  });

  it('returns ready when DELIVERY_ACK is received', async () => {
    const result = await testSenderReadiness('sender1', {
      client: {
        getConnectionState: async () => ({ state: 'open' }),
        sendTextMessage: async () => {
          await getDb()('message_updates').insert({
            id: 'update1',
            message_id: 'msg1',
            sender_instance: 'sender1',
            status: 'DELIVERY_ACK',
            raw_payload: '{}',
            received_at: new Date().toISOString(),
          });
          return { key: { id: 'msg1' } };
        },
      },
      timeoutMs: 50,
      pollIntervalMs: 1,
    });
    expect(result.ready).toBe(true);
  });

  it('returns not ready when ERROR is received', async () => {
    const result = await testSenderReadiness('sender1', {
      client: {
        getConnectionState: async () => ({ state: 'open' }),
        sendTextMessage: async () => {
          await getDb()('message_updates').insert({
            id: 'update2',
            message_id: 'msg2',
            sender_instance: 'sender1',
            status: 'ERROR',
            raw_payload: '{}',
            received_at: new Date().toISOString(),
          });
          return { key: { id: 'msg2' } };
        },
      },
      timeoutMs: 50,
      pollIntervalMs: 1,
    });
    expect(result).toMatchObject({ ready: false, reason: 'error' });
  });

  it('returns not ready on timeout', async () => {
    const result = await testSenderReadiness('sender1', {
      client: {
        getConnectionState: async () => ({ state: 'open' }),
        sendTextMessage: async () => ({ key: { id: 'msg3' } }),
      },
      timeoutMs: 5,
      pollIntervalMs: 1,
    });
    expect(result).toMatchObject({ ready: false, reason: 'timeout' });
  });
});
