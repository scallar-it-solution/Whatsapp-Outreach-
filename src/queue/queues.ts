import { Queue } from 'bullmq';
import {
  DEAD_LETTER_QUEUE_NAME,
  OUTREACH_QUEUE_NAME,
  RETRY_QUEUE_NAME,
} from '../config/constants';
import { assertRedisReachable, buildRedisConnection } from './client';
import type { DeadLetterJobData, OutreachJobData, QueueCounts } from './types';
import { logger } from '../utils/logger';

let outreachQueue: Queue<OutreachJobData, unknown, string> | null = null;
let retryQueue: Queue<OutreachJobData, unknown, string> | null = null;
let deadLetterQueue: Queue<DeadLetterJobData, unknown, string> | null = null;

export function getOutreachQueue(): Queue<OutreachJobData, unknown, string> {
  if (outreachQueue === null) {
    outreachQueue = new Queue<OutreachJobData, unknown, string>(OUTREACH_QUEUE_NAME, {
      connection: buildRedisConnection(),
    });
    outreachQueue.on('error', (error) => {
      logger.warn({ service: 'queue', queue: OUTREACH_QUEUE_NAME, err: error.message }, 'queue connection error');
    });
  }
  return outreachQueue;
}

export function getRetryQueue(): Queue<OutreachJobData, unknown, string> {
  if (retryQueue === null) {
    retryQueue = new Queue<OutreachJobData, unknown, string>(RETRY_QUEUE_NAME, {
      connection: buildRedisConnection(),
    });
    retryQueue.on('error', (error) => {
      logger.warn({ service: 'queue', queue: RETRY_QUEUE_NAME, err: error.message }, 'queue connection error');
    });
  }
  return retryQueue;
}

export function getDeadLetterQueue(): Queue<DeadLetterJobData, unknown, string> {
  if (deadLetterQueue === null) {
    deadLetterQueue = new Queue<DeadLetterJobData, unknown, string>(DEAD_LETTER_QUEUE_NAME, {
      connection: buildRedisConnection(),
    });
    deadLetterQueue.on('error', (error) => {
      logger.warn({ service: 'queue', queue: DEAD_LETTER_QUEUE_NAME, err: error.message }, 'queue connection error');
    });
  }
  return deadLetterQueue;
}

export async function getQueueCounts(): Promise<QueueCounts> {
  try {
    await assertRedisReachable();
    const outreach = getOutreachQueue();
    const dead = getDeadLetterQueue();
    const [waiting, active, delayed, failed, completed, deadLetter] = await Promise.all([
      outreach.getWaitingCount(),
      outreach.getActiveCount(),
      outreach.getDelayedCount(),
      outreach.getFailedCount(),
      outreach.getCompletedCount(),
      dead.getWaitingCount(),
    ]);
    return { waiting, active, delayed, failed, completed, deadLetter };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown queue count error';
    throw new Error(`Failed to get queue counts: ${message}`);
  }
}

export async function closeQueues(): Promise<void> {
  try {
    await Promise.all([
      outreachQueue?.close(),
      retryQueue?.close(),
      deadLetterQueue?.close(),
    ]);
    outreachQueue = null;
    retryQueue = null;
    deadLetterQueue = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown queue close error';
    throw new Error(`Failed to close queues: ${message}`);
  }
}
