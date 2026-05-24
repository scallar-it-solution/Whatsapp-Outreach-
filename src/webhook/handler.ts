import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { FinalMessageStatus } from '../config/constants';
import { getDb } from '../db/client';
import type {
  CampaignRow,
  JidMappingRow,
  LeadRow,
  MessageUpdateRow,
  ReplyRow,
  SendLogRow,
  SenderRow,
  UnsubscribeRow,
} from '../db/schema';
import { pushInterestedLeadToCrm } from '../crm/client';
import type { EvolutionWebhookPayload, JsonObject } from '../evolution/types';
import { updateSenderHealth } from '../evolution/sender-health';
import type { WahaWebhookPayload } from '../waha/types';
import { createId } from '../utils/crypto';
import { extractPhoneFromJid } from '../utils/phone';
import { logger } from '../utils/logger';
import { classifyReply } from './classifier';
import { extractAddressingMode, resolveRecipientJid } from './lid';

const WebhookPayloadSchema = z
  .object({
    event: z.string().optional(),
    instance: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  })
  .passthrough();

interface WebhookProcessResult {
  handled: boolean;
  event: string;
}

type WebhookMessageStatus = Exclude<FinalMessageStatus, 'TIMEOUT'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePayload(value: unknown): EvolutionWebhookPayload {
  return WebhookPayloadSchema.parse(value) as EvolutionWebhookPayload;
}

function parseWahaPayload(value: unknown): WahaWebhookPayload {
  return z
    .object({
      event: z.string().optional(),
      session: z.string().optional(),
      payload: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .parse(value) as WahaWebhookPayload;
}

function normalizeEvent(event: string | undefined): string {
  return (event ?? 'UNKNOWN').replace(/[.-]/g, '_').toUpperCase();
}

function extractInstance(payload: EvolutionWebhookPayload): string {
  return payload.instance ?? payload.data?.instance ?? payload.sender ?? 'unknown';
}

function extractRemoteJid(payload: EvolutionWebhookPayload): string | null {
  return payload.data?.key?.remoteJid ?? payload.data?.remoteJid ?? null;
}

function extractMessageId(payload: EvolutionWebhookPayload): string | null {
  return payload.data?.key?.id ?? payload.data?.messageId ?? payload.data?.id ?? null;
}

function extractStatusMessageId(payload: EvolutionWebhookPayload): string | null {
  return payload.data?.keyId ?? payload.data?.key?.id ?? payload.data?.messageId ?? payload.data?.id ?? null;
}

function extractStringFromMessage(message: unknown): string | null {
  if (!isRecord(message)) {
    return null;
  }
  const direct = message.conversation;
  if (typeof direct === 'string') {
    return direct;
  }
  const extended = message.extendedTextMessage;
  if (isRecord(extended) && typeof extended.text === 'string') {
    return extended.text;
  }
  const image = message.imageMessage;
  if (isRecord(image) && typeof image.caption === 'string') {
    return image.caption;
  }
  const nested = message.ephemeralMessage;
  if (isRecord(nested)) {
    const nestedMessage = nested.message;
    const text = extractStringFromMessage(nestedMessage);
    if (text !== null) {
      return text;
    }
  }
  return null;
}

function extractMessageText(payload: EvolutionWebhookPayload): string {
  const data = payload.data;
  if (data === undefined) {
    return '';
  }
  if (typeof data.text === 'string') {
    return data.text;
  }
  if (typeof data.body === 'string') {
    return data.body;
  }
  return extractStringFromMessage(data.message) ?? '';
}

function mapStatus(value: string | number | undefined): WebhookMessageStatus {
  if (typeof value === 'number') {
    if (value === 2) {
      return 'SERVER_ACK';
    }
    if (value === 3) {
      return 'DELIVERY_ACK';
    }
    if (value >= 4) {
      return 'READ';
    }
    return 'PENDING';
  }
  const normalized = (value ?? 'PENDING').toUpperCase();
  if (normalized.includes('READ')) {
    return 'READ';
  }
  if (normalized.includes('DELIVERY')) {
    return 'DELIVERY_ACK';
  }
  if (normalized.includes('SERVER')) {
    return 'SERVER_ACK';
  }
  if (normalized.includes('ERROR') || normalized.includes('FAILED')) {
    return 'ERROR';
  }
  return 'PENDING';
}

function mapWahaAck(value: string | number | undefined): WebhookMessageStatus {
  if (typeof value === 'number') {
    if (value < 0) {
      return 'ERROR';
    }
    if (value === 1) {
      return 'SERVER_ACK';
    }
    if (value === 2) {
      return 'DELIVERY_ACK';
    }
    if (value >= 3) {
      return 'READ';
    }
    return 'PENDING';
  }
  const normalized = (value ?? 'PENDING').toUpperCase();
  if (normalized === 'ERROR') {
    return 'ERROR';
  }
  if (normalized === 'SERVER') {
    return 'SERVER_ACK';
  }
  if (normalized === 'DEVICE') {
    return 'DELIVERY_ACK';
  }
  if (normalized === 'READ' || normalized === 'PLAYED') {
    return 'READ';
  }
  return 'PENDING';
}

function extractWahaRawMessageId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value.split('_');
  return parts.length > 0 ? parts[parts.length - 1] ?? null : value;
}

async function findLeadForInbound(
  instance: string,
  remoteJid: string,
): Promise<{ lead: LeadRow | null; phone: string | null }> {
  try {
    const db = getDb();
    const mapping = await db<JidMappingRow>('jid_mappings')
      .where({ sender_instance: instance, resolved_jid: remoteJid })
      .first();
    const phone = mapping?.phone ?? extractPhoneFromJid(remoteJid);
    if (phone === null) {
      return { lead: null, phone: null };
    }
    const lead = await db<LeadRow>('leads').where({ phone }).orderBy('created_at', 'desc').first();
    return { lead: lead ?? null, phone };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown inbound lead lookup error';
    throw new Error(`Failed to find inbound lead: ${message}`);
  }
}

export async function processEvolutionWebhook(
  rawPayload: unknown,
): Promise<WebhookProcessResult> {
  try {
    const payload = parsePayload(rawPayload);
    const event = normalizeEvent(payload.event);
    if (event === 'MESSAGES_UPSERT') {
      await handleMessagesUpsert(payload);
      return { handled: true, event };
    }
    if (event === 'MESSAGES_UPDATE') {
      await handleMessagesUpdate(payload);
      return { handled: true, event };
    }
    if (event === 'CONNECTION_UPDATE') {
      await handleConnectionUpdate(payload);
      return { handled: true, event };
    }
    logger.info({ service: 'webhook', event }, 'unknown webhook event ignored');
    return { handled: false, event };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown webhook processing error';
    throw new Error(`Failed to process Evolution webhook: ${message}`);
  }
}

export async function processWahaWebhook(rawPayload: unknown): Promise<WebhookProcessResult> {
  try {
    const payload = parseWahaPayload(rawPayload);
    const event = normalizeEvent(payload.event);
    if (event === 'MESSAGE_ACK') {
      await handleWahaMessageAck(payload);
      return { handled: true, event };
    }
    if (event === 'MESSAGE' || event === 'MESSAGE_ANY') {
      await handleWahaMessage(payload);
      return { handled: true, event };
    }
    logger.info({ service: 'webhook', event }, 'unknown WAHA webhook event ignored');
    return { handled: false, event };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown WAHA webhook processing error';
    throw new Error(`Failed to process WAHA webhook: ${message}`);
  }
}

async function getWahaSenderInstance(payload: WahaWebhookPayload): Promise<string> {
  try {
    const session = payload.session ?? 'default';
    const sender = await getDb()<SenderRow>('senders')
      .where({ provider: 'waha', waha_session: session })
      .orderBy('updated_at', 'desc')
      .first();
    return sender?.instance_name ?? session;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown WAHA sender lookup error';
    throw new Error(`Failed to resolve WAHA sender instance: ${message}`);
  }
}

async function handleMessagesUpsert(payload: EvolutionWebhookPayload): Promise<void> {
  try {
    const db = getDb();
    const instance = extractInstance(payload);
    const remoteJid = extractRemoteJid(payload);
    if (remoteJid === null) {
      throw new Error('MESSAGES_UPSERT missing remoteJid');
    }
    const found = await findLeadForInbound(instance, remoteJid);
    const phoneForResolution = found.phone ?? extractPhoneFromJid(remoteJid) ?? '';
    const resolvedJid = await resolveRecipientJid(instance, phoneForResolution, payload);
    const text = extractMessageText(payload);
    const classification = classifyReply(text);
    const now = new Date().toISOString();
    await db<ReplyRow>('replies').insert({
      id: createId('reply'),
      lead_id: found.lead?.id ?? null,
      sender_instance: instance,
      remote_jid: resolvedJid,
      addressing_mode: extractAddressingMode(payload),
      message_id: extractMessageId(payload),
      message_text: text,
      classification,
      raw_payload: JSON.stringify(payload),
      received_at: now,
    });
    if (found.lead !== null) {
      const previousStatus = found.lead.status;
      const leadStatus =
        classification === 'interested'
          ? 'interested'
          : classification === 'unsubscribed'
            ? 'unsubscribed'
            : 'replied';
      await db<LeadRow>('leads')
        .where({ id: found.lead.id })
        .update({ status: leadStatus, updated_at: now });
      if (classification === 'interested' && previousStatus !== 'interested') {
        try {
          const campaign = await db<CampaignRow>('campaigns')
            .where({ id: found.lead.campaign_id })
            .first();
          await pushInterestedLeadToCrm({
            lead: found.lead,
            campaign: campaign ?? null,
            replyText: text,
            senderInstance: instance,
            remoteJid: resolvedJid,
            receivedAt: now,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown CRM push error';
          logger.error({ service: 'crm', err: message }, 'interested lead CRM push failed');
        }
      }
    }
    if (classification === 'unsubscribed' && phoneForResolution.length > 0) {
      await db<UnsubscribeRow>('unsubscribes')
        .insert({
          id: createId('unsub'),
          phone: phoneForResolution,
          remote_jid: remoteJid,
          source: 'reply',
          created_at: now,
        })
        .onConflict('phone')
        .merge({ remote_jid: remoteJid, source: 'reply' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown upsert webhook error';
    throw new Error(`Failed to handle MESSAGES_UPSERT: ${message}`);
  }
}

async function handleMessagesUpdate(payload: EvolutionWebhookPayload): Promise<void> {
  try {
    const db = getDb();
    const instance = extractInstance(payload);
    const messageId = extractStatusMessageId(payload);
    if (messageId === null) {
      throw new Error('MESSAGES_UPDATE missing message id');
    }
    const status = mapStatus(payload.data?.status);
    const now = new Date().toISOString();
    await db<MessageUpdateRow>('message_updates').insert({
      id: createId('upd'),
      message_id: messageId,
      sender_instance: instance,
      status,
      raw_payload: JSON.stringify(payload),
      received_at: now,
    });
    const sendLog = await db<SendLogRow>('send_logs').where({ message_id: messageId }).first();
    if (sendLog !== undefined) {
      await db<SendLogRow>('send_logs')
        .where({ id: sendLog.id })
        .update({ final_status: status, resolved_at: now });
      const lead = await db<LeadRow>('leads').where({ id: sendLog.lead_id }).first();
      const remoteJid = extractRemoteJid(payload);
      if (lead !== undefined && remoteJid?.endsWith('@lid') === true) {
        await resolveRecipientJid(instance, lead.phone, payload);
      }
    }
    await updateSenderHealth(instance, status, payload as JsonObject);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown update webhook error';
    throw new Error(`Failed to handle MESSAGES_UPDATE: ${message}`);
  }
}

async function handleConnectionUpdate(payload: EvolutionWebhookPayload): Promise<void> {
  try {
    const instance = extractInstance(payload);
    const state = payload.data?.state;
    logger.info({ service: 'webhook', instance, state }, 'connection update received');
    if (state === 'close' || state === 'conflict') {
      await getDb()<SenderRow>('senders')
        .where({ instance_name: instance })
        .update({ status: 'paused', updated_at: new Date().toISOString() });
      logger.warn({ service: 'webhook', instance, state }, 'sender paused by connection update');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown connection webhook error';
    throw new Error(`Failed to handle CONNECTION_UPDATE: ${message}`);
  }
}

async function handleWahaMessageAck(payload: WahaWebhookPayload): Promise<void> {
  try {
    const db = getDb();
    const instance = await getWahaSenderInstance(payload);
    const messageId = extractWahaRawMessageId(payload.payload?.id);
    if (messageId === null) {
      throw new Error('WAHA message.ack missing payload.id');
    }
    const status = mapWahaAck(
      typeof payload.payload?.ackName === 'string' || typeof payload.payload?.ackName === 'number'
        ? payload.payload.ackName
        : typeof payload.payload?.ack === 'string' || typeof payload.payload?.ack === 'number'
          ? payload.payload.ack
          : undefined,
    );
    const now = new Date().toISOString();
    await db<MessageUpdateRow>('message_updates').insert({
      id: createId('upd'),
      message_id: messageId,
      sender_instance: instance,
      status,
      raw_payload: JSON.stringify(payload),
      received_at: now,
    });
    const sendLog = await db<SendLogRow>('send_logs').where({ message_id: messageId }).first();
    if (sendLog !== undefined) {
      await db<SendLogRow>('send_logs')
        .where({ id: sendLog.id })
        .update({ final_status: status, resolved_at: now });
    }
    await updateSenderHealth(instance, status, payload as JsonObject);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown WAHA ack error';
    throw new Error(`Failed to handle WAHA message ack: ${message}`);
  }
}

async function handleWahaMessage(payload: WahaWebhookPayload): Promise<void> {
  try {
    const message = payload.payload;
    if (message === undefined) {
      throw new Error('WAHA message missing payload');
    }
    if (message.fromMe === true) {
      return;
    }
    const instance = await getWahaSenderInstance(payload);
    const remoteJid =
      typeof message.from === 'string'
        ? message.from
        : typeof message.to === 'string'
          ? message.to
          : null;
    if (remoteJid === null) {
      throw new Error('WAHA message missing remote jid');
    }
    const text = typeof message.body === 'string' ? message.body : '';
    const found = await findLeadForInbound(instance, remoteJid);
    const classification = classifyReply(text);
    const now = new Date().toISOString();
    await getDb()<ReplyRow>('replies').insert({
      id: createId('reply'),
      lead_id: found.lead?.id ?? null,
      sender_instance: instance,
      remote_jid: remoteJid,
      addressing_mode: remoteJid.endsWith('@lid') ? 'lid' : 'default',
      message_id: typeof message.id === 'string' ? message.id : null,
      message_text: text,
      classification,
      raw_payload: JSON.stringify(payload),
      received_at: now,
    });
    if (found.lead !== null) {
      const previousStatus = found.lead.status;
      const leadStatus =
        classification === 'interested'
          ? 'interested'
          : classification === 'unsubscribed'
            ? 'unsubscribed'
            : 'replied';
      await getDb()<LeadRow>('leads')
        .where({ id: found.lead.id })
        .update({ status: leadStatus, updated_at: now });
      if (classification === 'interested' && previousStatus !== 'interested') {
        try {
          const campaign = await getDb()<CampaignRow>('campaigns')
            .where({ id: found.lead.campaign_id })
            .first();
          await pushInterestedLeadToCrm({
            lead: found.lead,
            campaign: campaign ?? null,
            replyText: text,
            senderInstance: instance,
            remoteJid,
            receivedAt: now,
          });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : 'unknown CRM push error';
          logger.error({ service: 'crm', err: messageText }, 'WAHA interested lead CRM push failed');
        }
      }
    }
    if (classification === 'unsubscribed' && found.phone !== null) {
      await getDb()<UnsubscribeRow>('unsubscribes')
        .insert({
          id: createId('unsub'),
          phone: found.phone,
          remote_jid: remoteJid,
          source: 'reply',
          created_at: now,
        })
        .onConflict('phone')
        .merge({ remote_jid: remoteJid, source: 'reply' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown WAHA message error';
    throw new Error(`Failed to handle WAHA message: ${message}`);
  }
}

export function registerWebhookRoutes(app: FastifyInstance): void {
  try {
    app.post('/webhook/evolution', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await processEvolutionWebhook(request.body);
        await reply.code(200).send({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown webhook route error';
        logger.error({ service: 'webhook', err: message }, 'webhook failed');
        await reply.code(400).send({ ok: false, error: message });
      }
    });
    app.post('/webhook/waha', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await processWahaWebhook(request.body);
        await reply.code(200).send({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown WAHA webhook route error';
        logger.error({ service: 'webhook', err: message }, 'WAHA webhook failed');
        await reply.code(400).send({ ok: false, error: message });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown webhook register error';
    throw new Error(`Failed to register webhook routes: ${message}`);
  }
}
