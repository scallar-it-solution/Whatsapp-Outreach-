import { Worker, type Job } from 'bullmq';
import {
  DEAD_LETTER_WARN_SIZE,
  OUTREACH_QUEUE_NAME,
  type FinalMessageStatus,
} from '../config/constants';
import { config } from '../config/env';
import { getDb, runMigrations } from '../db/client';
import type { CampaignRow, LeadRow, MessageUpdateRow, SendLogRow, UnsubscribeRow } from '../db/schema';
import { updateSenderHealth } from '../evolution/sender-health';
import { EvolutionClient } from '../evolution/client';
import { extractMessageIdFromSendResponse, isSuccessAckStatus } from '../evolution/types';
import { WahaClient } from '../waha/client';
import { extractWahaMessageId } from '../waha/types';
import { getDeadLetterQueue, getOutreachQueue } from '../queue/queues';
import { buildRedisConnection } from '../queue/client';
import type { DeadLetterJobData, OutreachJobData } from '../queue/types';
import { createId } from '../utils/crypto';
import { randomDelaySeconds, sleep } from '../utils/delay';
import { logger } from '../utils/logger';
import { maskPhone } from '../utils/phone';
import { incrementSenderSentToday, isQuietHours, secondsUntilQuietHoursEnd } from './limiter';
import { selectSender } from './router';
import { getSenderByInstance } from '../senders/service';
import { resolveRecipientJid } from '../webhook/lid';
import { renderTemplate } from '../templates/renderer';
import { selectTemplateForLead } from '../templates/rotator';

export function createOutreachWorker(): Worker<OutreachJobData, unknown, string> {
  const worker = new Worker<OutreachJobData, unknown, string>(
    OUTREACH_QUEUE_NAME,
    async (job: Job<OutreachJobData, unknown, string>) => {
      try {
        return await processOutreachJob(job.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown dispatch job error';
        logger.error({ service: 'dispatcher', err: message, jobId: job.id }, 'dispatch job failed');
        await moveToDeadLetter(job.data, message);
        return { ok: false, error: message };
      }
    },
    {
      connection: buildRedisConnection('worker'),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error(
      { service: 'dispatcher', jobId: job?.id, err: error.message },
      'worker marked job failed',
    );
  });
  worker.on('completed', (job) => {
    logger.debug({ service: 'dispatcher', jobId: job.id }, 'worker completed job');
  });
  return worker;
}

async function processOutreachJob(data: OutreachJobData): Promise<{ ok: boolean; status: string }> {
  try {
    if (!config.SEND_ENABLED) {
      logger.warn({ service: 'dispatcher', campaignId: data.campaignId }, 'SEND_ENABLED=false; requeueing job');
      await requeueOutreachJob(data, 60000);
      return { ok: true, status: 'send_disabled_requeued' };
    }

    if (isQuietHours(data.country)) {
      const delayMs = secondsUntilQuietHoursEnd(data.country) * 1000;
      await requeueOutreachJob(data, delayMs);
      return { ok: true, status: 'quiet_hours_requeued' };
    }

    if (data.preferredInstance !== undefined) {
      const preferred = await getSenderByInstance(data.preferredInstance);
      if (preferred === null || preferred.status !== 'active') {
        await moveToDeadLetter(data, 'preferred sender is not active');
        return { ok: false, status: 'deadletter_preferred_sender_inactive' };
      }
      if (preferred.sent_today >= preferred.daily_limit) {
        const alternate = await selectSender(data.country);
        if (alternate === null) {
          await moveToDeadLetter(data, 'preferred sender daily limit reached and no alternate sender');
          return { ok: false, status: 'deadletter_sender_limit' };
        }
        data = { ...data, preferredInstance: alternate.instance_name };
      }
    }

    const sender = await selectSender(data.country, data.preferredInstance);
    if (sender === null) {
      await moveToDeadLetter(data, 'no active sender with capacity and health >= 50');
      return { ok: false, status: 'deadletter_no_sender' };
    }

    const db = getDb();
    const lead = await db<LeadRow>('leads').where({ id: data.leadId }).first();
    if (lead === undefined) {
      await moveToDeadLetter(data, 'lead not found');
      return { ok: false, status: 'deadletter_missing_lead' };
    }
    if (lead.status !== 'queued') {
      logger.info(
        { service: 'dispatcher', leadId: lead.id, status: lead.status },
        'skipped lead that is no longer queued',
      );
      return { ok: true, status: `lead_${lead.status}_skipped` };
    }

    const unsubscribed = await db<UnsubscribeRow>('unsubscribes').where({ phone: lead.phone }).first();
    if (unsubscribed !== undefined) {
      await db<LeadRow>('leads')
        .where({ id: lead.id })
        .update({ status: 'unsubscribed', updated_at: new Date().toISOString() });
      logger.info({ service: 'dispatcher', phone: maskPhone(lead.phone) }, 'dropped unsubscribed lead');
      return { ok: true, status: 'unsubscribed_dropped' };
    }

    const recipientJid =
      sender.provider === 'waha'
        ? `${lead.phone}@c.us`
        : await resolveRecipientJid(sender.instance_name, lead.phone);
    const template = await selectTemplateForLead(data.templateSet, lead.id);
    const text = renderTemplate(template.body, {
      business_name: lead.business_name,
      city: lead.city,
      category: lead.category,
      country: lead.country,
    });

    const response =
      sender.provider === 'waha'
        ? await new WahaClient(sender.waha_base_url).sendTextMessage(
            sender.waha_session ?? 'default',
            recipientJid,
            text,
          )
        : await new EvolutionClient().sendTextMessage(sender.instance_name, recipientJid, text);
    const messageId =
      sender.provider === 'waha'
        ? extractWahaMessageId(response)
        : extractMessageIdFromSendResponse(response);
    const now = new Date().toISOString();
    const logId = createId('log');
    await db<SendLogRow>('send_logs').insert({
      id: logId,
      lead_id: lead.id,
      campaign_id: data.campaignId,
      sender_instance: sender.instance_name,
      recipient_jid: recipientJid,
      message_id: messageId,
      template_id: template.id,
      attempt_count: 1,
      evolution_status: `${sender.provider}:${response.status ?? 'PENDING'}`,
      final_status: 'PENDING',
      raw_response: JSON.stringify(response),
      sent_at: now,
      resolved_at: null,
    });
    await db<LeadRow>('leads')
      .where({ id: lead.id })
      .update({ last_attempt_at: now, resolved_jid: recipientJid, updated_at: now });
    await incrementSenderSentToday(sender.instance_name);

    const finalStatus = messageId === null ? 'TIMEOUT' : await pollFinalStatus(sender.instance_name, messageId);
    await finishSendLog(logId, data.campaignId, lead.id, finalStatus);
    if (finalStatus === 'ERROR' || finalStatus === 'TIMEOUT') {
      await updateSenderHealth(sender.instance_name, finalStatus === 'TIMEOUT' ? 'PENDING_TIMEOUT' : 'ERROR', response);
    }

    const delaySeconds = randomDelaySeconds(sender.delay_min_sec, sender.delay_max_sec);
    await sleep(delaySeconds * 1000);
    return { ok: isSuccessAckStatus(finalStatus), status: finalStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown dispatch process error';
    throw new Error(`Failed to process outreach job: ${message}`);
  }
}

async function pollFinalStatus(instance: string, messageId: string): Promise<FinalMessageStatus> {
  try {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() <= deadline) {
      const update = await getDb()<MessageUpdateRow>('message_updates')
        .where({ sender_instance: instance, message_id: messageId })
        .orderBy('received_at', 'desc')
        .first();
      if (update !== undefined && update.status !== 'PENDING') {
        return update.status;
      }
      await sleep(5000);
    }
    return 'TIMEOUT';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown ack polling error';
    throw new Error(`Failed to poll final status: ${message}`);
  }
}

async function finishSendLog(
  logId: string,
  campaignId: string,
  leadId: string,
  finalStatus: FinalMessageStatus,
): Promise<void> {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    await db<SendLogRow>('send_logs')
      .where({ id: logId })
      .update({ final_status: finalStatus, resolved_at: now });
    if (isSuccessAckStatus(finalStatus)) {
      await db<LeadRow>('leads').where({ id: leadId }).update({ status: 'sent', updated_at: now });
      await db<CampaignRow>('campaigns').where({ id: campaignId }).increment('sent_count', 1);
    } else if (finalStatus === 'ERROR' || finalStatus === 'TIMEOUT') {
      await db<LeadRow>('leads').where({ id: leadId }).update({ status: 'failed', updated_at: now });
      await db<CampaignRow>('campaigns').where({ id: campaignId }).increment('failed_count', 1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown send log finish error';
    throw new Error(`Failed to finish send log: ${message}`);
  }
}

async function requeueOutreachJob(data: OutreachJobData, delayMs: number): Promise<void> {
  try {
    await getOutreachQueue().add('send-lead', data, {
      delay: Math.max(1000, delayMs),
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown requeue error';
    throw new Error(`Failed to requeue outreach job: ${message}`);
  }
}

async function moveToDeadLetter(data: OutreachJobData, reason: string): Promise<void> {
  try {
    const deadQueue = getDeadLetterQueue();
    const deadLetter: DeadLetterJobData = {
      originalQueue: 'outreach',
      reason,
      failedAt: new Date().toISOString(),
      original: data,
    };
    await deadQueue.add('dead-letter', deadLetter, {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });
    const count = await deadQueue.getWaitingCount();
    if (count > DEAD_LETTER_WARN_SIZE) {
      logger.warn({ service: 'dispatcher', deadLetterCount: count }, 'dead-letter queue size exceeded warning threshold');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown dead-letter error';
    throw new Error(`Failed to move job to dead-letter queue: ${message}`);
  }
}

export async function runWorkerProcess(): Promise<void> {
  try {
    await runMigrations();
    const worker = createOutreachWorker();
    logger.info({ service: 'dispatcher' }, 'outreach worker started');
    const shutdown = async (): Promise<void> => {
      try {
        await worker.close();
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown worker shutdown error';
        logger.error({ service: 'dispatcher', err: message }, 'worker shutdown failed');
        process.exit(1);
      }
    };
    process.on('SIGINT', () => {
      void shutdown();
    });
    process.on('SIGTERM', () => {
      void shutdown();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown worker start error';
    logger.error({ service: 'dispatcher', err: message }, 'worker failed to start');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runWorkerProcess();
}
