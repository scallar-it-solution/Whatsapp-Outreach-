import { JID_MAPPING_TTL_DAYS } from '../config/constants';
import { getDb } from '../db/client';
import type { AddressingMode, JidMappingRow } from '../db/schema';
import type { EvolutionWebhookPayload } from '../evolution/types';
import { createId } from '../utils/crypto';
import { digitsOnly } from '../utils/phone';

function remoteJidFromPayload(payload?: EvolutionWebhookPayload): string | null {
  return payload?.data?.key?.remoteJid ?? payload?.data?.remoteJid ?? null;
}

function mappingExpiry(): string {
  return new Date(Date.now() + JID_MAPPING_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function extractAddressingMode(payload: EvolutionWebhookPayload): AddressingMode {
  const remoteJid = remoteJidFromPayload(payload);
  if (payload.data?.addressingMode === 'lid' || remoteJid?.endsWith('@lid') === true) {
    return 'lid';
  }
  return 'default';
}

export async function resolveRecipientJid(
  instance: string,
  phone: string,
  inboundPayload?: EvolutionWebhookPayload,
): Promise<string> {
  try {
    const db = getDb();
    const normalizedPhone = digitsOnly(phone);
    const inboundRemoteJid = remoteJidFromPayload(inboundPayload);
    if (inboundRemoteJid?.endsWith('@lid') === true) {
      if (normalizedPhone.length > 0) {
        const now = new Date().toISOString();
        await db<JidMappingRow>('jid_mappings')
          .insert({
            id: createId('jid'),
            phone: normalizedPhone,
            sender_instance: instance,
            resolved_jid: inboundRemoteJid,
            addressing_mode: 'lid',
            source: 'inbound',
            expires_at: mappingExpiry(),
            created_at: now,
          })
          .onConflict(['phone', 'sender_instance'])
          .merge({
            resolved_jid: inboundRemoteJid,
            addressing_mode: 'lid',
            source: 'inbound',
            expires_at: mappingExpiry(),
          });
      }
      return inboundRemoteJid;
    }

    const mapping = await db<JidMappingRow>('jid_mappings')
      .where({ phone: normalizedPhone, sender_instance: instance })
      .andWhere((builder) => {
        void builder.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
      })
      .first();
    if (mapping !== undefined) {
      return mapping.resolved_jid;
    }
    return `${normalizedPhone}@s.whatsapp.net`;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown LID resolution error';
    throw new Error(`Failed to resolve recipient JID: ${message}`);
  }
}
