import { config } from '../config/env';
import type { FinalMessageStatus } from '../config/constants';
import { getDb } from '../db/client';
import type { MessageUpdateRow, SenderRow } from '../db/schema';
import { logger } from '../utils/logger';

export type SenderHealthEvent =
  | FinalMessageStatus
  | 'PENDING_TIMEOUT'
  | 'PENDING_PREKEY'
  | 'STREAM_ERROR_515'
  | 'SMOKE_TEST_SUCCESS';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function containsNeedle(value: unknown, needle: string): boolean {
  if (typeof value === 'string') {
    return value.toLowerCase().includes(needle.toLowerCase());
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsNeedle(item, needle));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, item]) => key === needle || containsNeedle(item, needle));
  }
  return false;
}

function scoreDelta(event: SenderHealthEvent, rawPayload?: unknown): number {
  if (containsNeedle(rawPayload, 'pendingPreKey')) {
    return -30;
  }
  if (containsNeedle(rawPayload, 'stream:error 515') || containsNeedle(rawPayload, '515')) {
    return -40;
  }
  switch (event) {
    case 'DELIVERY_ACK':
    case 'READ':
      return 5;
    case 'SERVER_ACK':
      return 2;
    case 'PENDING_TIMEOUT':
    case 'TIMEOUT':
      return -10;
    case 'ERROR':
      return -20;
    case 'PENDING_PREKEY':
      return -30;
    case 'STREAM_ERROR_515':
      return -40;
    case 'SMOKE_TEST_SUCCESS':
      return 20;
    case 'PENDING':
      return 0;
  }
}

export async function updateSenderHealth(
  instance: string,
  event: SenderHealthEvent,
  rawPayload?: unknown,
): Promise<void> {
  try {
    const db = getDb();
    const sender = await db<SenderRow>('senders').where({ instance_name: instance }).first();
    if (sender === undefined) {
      return;
    }
    const nextScore = clampScore(sender.health_score + scoreDelta(event, rawPayload));
    const now = new Date().toISOString();
    const updates: Partial<SenderRow> = {
      health_score: nextScore,
      updated_at: now,
    };
    if (event === 'ERROR' || event === 'PENDING_TIMEOUT' || event === 'TIMEOUT') {
      updates.last_error = event;
    }
    if (nextScore < 30) {
      updates.status = 'quarantined';
      logger.warn({ service: 'sender-health', instance, health_score: nextScore }, 'sender quarantined by health score');
    }
    await db<SenderRow>('senders').where({ instance_name: instance }).update(updates);
    await quarantineIfFailureThresholdReached(instance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown health update error';
    throw new Error(`Failed to update sender health: ${message}`);
  }
}

async function quarantineIfFailureThresholdReached(instance: string): Promise<void> {
  try {
    const windowStart = new Date(
      Date.now() - config.QUARANTINE_WINDOW_MINUTES * 60 * 1000,
    ).toISOString();
    const failures = await getDb()<MessageUpdateRow>('message_updates')
      .where({ sender_instance: instance })
      .where('received_at', '>=', windowStart)
      .andWhere((builder) => {
        void builder
          .where({ status: 'ERROR' })
          .orWhereLike('raw_payload', '%pendingPreKey%')
          .orWhereLike('raw_payload', '%stream:error 515%');
      })
      .count<{ count: number | string }[]>({ count: '*' });
    const countValue = failures[0]?.count ?? 0;
    const count = typeof countValue === 'number' ? countValue : Number.parseInt(countValue, 10);
    if (Number.isFinite(count) && count >= config.QUARANTINE_FAILURE_THRESHOLD) {
      await getDb()<SenderRow>('senders')
        .where({ instance_name: instance })
        .update({ status: 'quarantined', updated_at: new Date().toISOString() });
      logger.warn({ service: 'sender-health', instance, failures: count }, 'sender quarantined by failure threshold');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown quarantine threshold error';
    throw new Error(`Failed to evaluate quarantine threshold: ${message}`);
  }
}
