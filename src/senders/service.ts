import { config } from '../config/env';
import { getDb } from '../db/client';
import type { SenderProvider, SenderRow, SenderStatus } from '../db/schema';
import { EvolutionClient } from '../evolution/client';
import { createId } from '../utils/crypto';

export interface SenderInput {
  instanceName: string;
  phoneNumber?: string;
  label?: string;
  status?: SenderStatus;
  supportsLid?: boolean;
  notes?: string;
  provider?: SenderProvider;
  wahaBaseUrl?: string;
  wahaSession?: string;
}

export async function upsertSender(input: SenderInput): Promise<void> {
  try {
    const now = new Date().toISOString();
    const row = {
      id: createId('snd'),
      instance_name: input.instanceName,
      phone_number: input.phoneNumber ?? null,
      label: input.label ?? input.instanceName,
      status: input.status ?? 'active',
      daily_limit: config.DAILY_LIMIT_PER_SENDER,
      delay_min_sec: config.DEFAULT_DELAY_MIN_SECONDS,
      delay_max_sec: config.DEFAULT_DELAY_MAX_SECONDS,
      sent_today: 0,
      health_score: 100,
      last_error: null,
      last_health_check_at: null,
      supports_lid: input.supportsLid === true ? 1 : 0,
      notes: input.notes ?? null,
      provider: input.provider ?? 'evolution',
      waha_base_url: input.wahaBaseUrl ?? null,
      waha_session: input.wahaSession ?? null,
      created_at: now,
      updated_at: now,
    };
    await getDb()<SenderRow>('senders')
      .insert(row)
      .onConflict('instance_name')
      .merge({
        phone_number: row.phone_number,
        label: row.label,
        supports_lid: row.supports_lid,
        notes: row.notes,
        provider: row.provider,
        waha_base_url: row.waha_base_url,
        waha_session: row.waha_session,
        updated_at: now,
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender upsert error';
    throw new Error(`Failed to upsert sender: ${message}`);
  }
}

export async function autoRegisterActiveSenders(): Promise<void> {
  try {
    for (const instanceName of config.ACTIVE_SENDERS) {
      await upsertSender({ instanceName, status: 'active' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown active sender registration error';
    throw new Error(`Failed to auto-register active senders: ${message}`);
  }
}

export async function listSenders(): Promise<SenderRow[]> {
  try {
    return await getDb()<SenderRow>('senders').orderBy('instance_name', 'asc');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender list error';
    throw new Error(`Failed to list senders: ${message}`);
  }
}

export async function getSenderByInstance(instance: string): Promise<SenderRow | null> {
  try {
    const sender = await getDb()<SenderRow>('senders').where({ instance_name: instance }).first();
    return sender ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender lookup error';
    throw new Error(`Failed to get sender: ${message}`);
  }
}

export async function updateSenderStatus(instance: string, status: SenderStatus): Promise<void> {
  try {
    await getDb()<SenderRow>('senders')
      .where({ instance_name: instance })
      .update({ status, updated_at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender status error';
    throw new Error(`Failed to update sender status: ${message}`);
  }
}

export async function resumeSender(instance: string): Promise<void> {
  try {
    await getDb()<SenderRow>('senders').where({ instance_name: instance }).update({
      status: 'active',
      health_score: 100,
      last_error: null,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender resume error';
    throw new Error(`Failed to resume sender: ${message}`);
  }
}

export async function syncSendersFromEvolution(client = new EvolutionClient()): Promise<number> {
  try {
    const instances = await client.getInstances();
    for (const instance of instances) {
      await upsertSender({
        instanceName: instance.instanceName,
        phoneNumber: instance.owner,
        label: instance.profileName ?? instance.instanceName,
        status: instance.status === 'open' ? 'active' : 'paused',
      });
    }
    return instances.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown Evolution sync error';
    throw new Error(`Failed to sync senders from Evolution: ${message}`);
  }
}
