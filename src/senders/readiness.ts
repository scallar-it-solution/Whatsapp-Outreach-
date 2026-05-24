import { config } from '../config/env';
import { getDb } from '../db/client';
import type { MessageUpdateRow, SenderRow } from '../db/schema';
import type { ConnectionStateResponse, SendMessageResponse } from '../evolution/types';
import { extractMessageIdFromSendResponse, isSuccessAckStatus } from '../evolution/types';
import { EvolutionClient } from '../evolution/client';
import { updateSenderHealth } from '../evolution/sender-health';
import { createId } from '../utils/crypto';
import { sleep } from '../utils/delay';

export interface ReadinessResult {
  ready: boolean;
  reason?: string;
  messageId?: string;
}

interface ReadinessClient {
  getConnectionState(instance: string): Promise<ConnectionStateResponse>;
  sendTextMessage(instance: string, to: string, text: string): Promise<SendMessageResponse>;
}

export interface ReadinessOptions {
  client?: ReadinessClient;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function testSenderReadiness(
  instanceName: string,
  options: ReadinessOptions = {},
): Promise<ReadinessResult> {
  try {
    const client = options.client ?? new EvolutionClient();
    const connection = await client.getConnectionState(instanceName);
    if (connection.state !== 'open') {
      await recordReadiness(instanceName, false, 'not_connected');
      return { ready: false, reason: 'not_connected' };
    }

    const response = await client.sendTextMessage(
      instanceName,
      config.TEST_RECIPIENT_PHONE,
      'Scallar sender readiness smoke test. Please ignore.',
    );
    const messageId = extractMessageIdFromSendResponse(response);
    if (messageId === null) {
      await recordReadiness(instanceName, false, 'missing_message_id');
      return { ready: false, reason: 'missing_message_id' };
    }

    const result = await waitForReadinessAck(
      instanceName,
      messageId,
      options.timeoutMs ?? 30000,
      options.pollIntervalMs ?? 2000,
    );
    await recordReadiness(instanceName, result.ready, result.reason ?? null);
    if (result.ready) {
      await updateSenderHealth(instanceName, 'SMOKE_TEST_SUCCESS');
    }
    return { ...result, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown readiness error';
    await recordReadiness(instanceName, false, message);
    return { ready: false, reason: message };
  }
}

async function waitForReadinessAck(
  instanceName: string,
  messageId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<ReadinessResult> {
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const update = await getDb()<MessageUpdateRow>('message_updates')
        .where({ sender_instance: instanceName, message_id: messageId })
        .orderBy('received_at', 'desc')
        .first();
      if (update !== undefined) {
        if (isSuccessAckStatus(update.status)) {
          return { ready: true };
        }
        if (update.status === 'ERROR') {
          const reason =
            update.raw_payload !== null && update.raw_payload.includes('pendingPreKey')
              ? 'pendingPreKey'
              : 'error';
          return { ready: false, reason };
        }
      }
      await sleep(pollIntervalMs);
    }
    return { ready: false, reason: 'timeout' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown readiness polling error';
    throw new Error(`Failed while polling readiness ack: ${message}`);
  }
}

async function recordReadiness(
  instanceName: string,
  ready: boolean,
  reason: string | null,
): Promise<void> {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const sender = await db<SenderRow>('senders').where({ instance_name: instanceName }).first();
    if (sender === undefined) {
      await db<SenderRow>('senders').insert({
        id: createId('snd'),
        instance_name: instanceName,
        phone_number: null,
        label: instanceName,
        status: ready ? 'active' : 'paused',
        daily_limit: config.DAILY_LIMIT_PER_SENDER,
        delay_min_sec: config.DEFAULT_DELAY_MIN_SECONDS,
        delay_max_sec: config.DEFAULT_DELAY_MAX_SECONDS,
        sent_today: 0,
        health_score: ready ? 100 : 80,
        last_error: reason,
        last_health_check_at: now,
        supports_lid: 0,
        notes: null,
        provider: 'evolution',
        waha_base_url: null,
        waha_session: null,
        created_at: now,
        updated_at: now,
      });
      return;
    }
    const delta = ready ? 20 : reason === 'timeout' ? -10 : -20;
    const healthScore = Math.max(0, Math.min(100, sender.health_score + delta));
    await db<SenderRow>('senders')
      .where({ instance_name: instanceName })
      .update({
        last_health_check_at: now,
        last_error: ready ? null : reason,
        health_score: healthScore,
        status: healthScore < 30 ? 'quarantined' : sender.status,
        updated_at: now,
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown readiness record error';
    throw new Error(`Failed to record sender readiness: ${message}`);
  }
}
