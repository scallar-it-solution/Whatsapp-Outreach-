import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceDbForTests, closeDb, getDb } from '../src/db/client';
import * as jidMigration from '../src/db/migrations/008_jid_mappings';
import { resolveRecipientJid } from '../src/webhook/lid';

async function setupDb(): Promise<Knex> {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await jidMigration.up(db);
  replaceDbForTests(db);
  return db;
}

describe('resolveRecipientJid', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('uses @lid JID from inbound payload and caches it', async () => {
    const jid = await resolveRecipientJid('sender1', '919876543210', {
      event: 'MESSAGES_UPSERT',
      instance: 'sender1',
      data: { key: { remoteJid: 'abc123@lid' } },
    });
    expect(jid).toBe('abc123@lid');
    const mapping = await getDb()('jid_mappings').where({ phone: '919876543210' }).first();
    expect(mapping.resolved_jid).toBe('abc123@lid');
  });

  it('uses cached non-expired mapping', async () => {
    await getDb()('jid_mappings').insert({
      id: 'jid1',
      phone: '919876543210',
      sender_instance: 'sender1',
      resolved_jid: 'cached@lid',
      addressing_mode: 'lid',
      source: 'inbound',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      created_at: new Date().toISOString(),
    });
    await expect(resolveRecipientJid('sender1', '919876543210')).resolves.toBe('cached@lid');
  });

  it('constructs default JID without mapping', async () => {
    await expect(resolveRecipientJid('sender1', '919876543210')).resolves.toBe('919876543210@s.whatsapp.net');
  });

  it('ignores expired mappings', async () => {
    await getDb()('jid_mappings').insert({
      id: 'jid2',
      phone: '919876543210',
      sender_instance: 'sender1',
      resolved_jid: 'expired@lid',
      addressing_mode: 'lid',
      source: 'inbound',
      expires_at: new Date(Date.now() - 60000).toISOString(),
      created_at: new Date().toISOString(),
    });
    await expect(resolveRecipientJid('sender1', '919876543210')).resolves.toBe('919876543210@s.whatsapp.net');
  });
});
