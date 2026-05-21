import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, replaceDbForTests } from '../src/db/client';
import * as m001 from '../src/db/migrations/001_senders';
import * as m002 from '../src/db/migrations/002_campaigns';
import * as m003 from '../src/db/migrations/003_leads';
import * as m004 from '../src/db/migrations/004_templates';
import * as m005 from '../src/db/migrations/005_send_logs';
import * as m006 from '../src/db/migrations/006_message_updates';
import * as m007 from '../src/db/migrations/007_replies';
import * as m008 from '../src/db/migrations/008_jid_mappings';
import * as m009 from '../src/db/migrations/009_unsubscribes';
import { processEvolutionWebhook } from '../src/webhook/handler';

async function setupDb(): Promise<Knex> {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  await m001.up(db);
  await m002.up(db);
  await m003.up(db);
  await m004.up(db);
  await m005.up(db);
  await m006.up(db);
  await m007.up(db);
  await m008.up(db);
  await m009.up(db);
  replaceDbForTests(db);
  return db;
}

async function seedCore(): Promise<void> {
  const now = new Date().toISOString();
  await getDb()('senders').insert({
    id: 'sender1',
    instance_name: 'sender1',
    phone_number: null,
    label: 'sender1',
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
  });
  await getDb()('campaigns').insert({
    id: 'camp1',
    name: 'Campaign',
    country: 'India',
    category: null,
    source_file: null,
    template_set: 'india-it',
    status: 'active',
    total_leads: 1,
    sent_count: 0,
    failed_count: 0,
    created_at: now,
    started_at: now,
    completed_at: null,
  });
  await getDb()('leads').insert({
    id: 'lead1',
    campaign_id: 'camp1',
    phone: '919876543210',
    business_name: 'Acme',
    city: 'Delhi',
    country: 'India',
    category: null,
    rating: null,
    review_count: null,
    website: null,
    source_file: null,
    raw_json: null,
    status: 'sent',
    resolved_jid: null,
    last_attempt_at: null,
    created_at: now,
    updated_at: now,
  });
}

describe('processEvolutionWebhook', () => {
  beforeEach(async () => {
    await setupDb();
    await seedCore();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('parses MESSAGES_UPSERT and updates lead reply state', async () => {
    const result = await processEvolutionWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'sender1',
      data: {
        key: { remoteJid: '919876543210@s.whatsapp.net', id: 'in1' },
        message: { conversation: 'YES DEMO' },
      },
    });
    expect(result.handled).toBe(true);
    const lead = await getDb()('leads').where({ id: 'lead1' }).first();
    const reply = await getDb()('replies').first();
    expect(lead.status).toBe('interested');
    expect(reply.classification).toBe('interested');
  });

  it('updates send log status from MESSAGES_UPDATE', async () => {
    const now = new Date().toISOString();
    await getDb()('send_logs').insert({
      id: 'log1',
      lead_id: 'lead1',
      campaign_id: 'camp1',
      sender_instance: 'sender1',
      recipient_jid: '919876543210@s.whatsapp.net',
      message_id: 'msg1',
      template_id: null,
      attempt_count: 1,
      evolution_status: 'PENDING',
      final_status: 'PENDING',
      raw_response: '{}',
      sent_at: now,
      resolved_at: null,
    });
    await processEvolutionWebhook({
      event: 'MESSAGES_UPDATE',
      instance: 'sender1',
      data: {
        key: { id: 'msg1' },
        status: 'DELIVERY_ACK',
      },
    });
    const log = await getDb()('send_logs').where({ id: 'log1' }).first();
    expect(log.final_status).toBe('DELIVERY_ACK');
  });

  it('handles unknown event types gracefully', async () => {
    const result = await processEvolutionWebhook({ event: 'SOMETHING_ELSE', instance: 'sender1', data: {} });
    expect(result).toEqual({ handled: false, event: 'SOMETHING_ELSE' });
  });
});
