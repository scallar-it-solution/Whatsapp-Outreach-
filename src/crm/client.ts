import { config } from '../config/env';
import type { CampaignRow, LeadRow } from '../db/schema';
import { logger } from '../utils/logger';
import { maskPhone } from '../utils/phone';

interface InterestedCrmInput {
  lead: LeadRow;
  campaign: CampaignRow | null;
  replyText: string;
  senderInstance: string;
  remoteJid: string;
  receivedAt: string;
}

interface CrmLeadPayload {
  lastName: string;
  accountName?: string;
  phoneNumber: string;
  website?: string;
  addressCity?: string;
  addressCountry?: string;
  status: string;
  description: string;
}

interface CrmCreateResponse {
  id?: string;
  name?: string;
}

export interface CrmPushResult {
  pushed: boolean;
  crmId?: string;
  skippedReason?: 'not_configured';
}

export class CrmClientError extends Error {
  public readonly statusCode: number;
  public readonly body: string;

  public constructor(statusCode: number, body: string) {
    super(`CRM API returned ${statusCode}`);
    this.name = 'CrmClientError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

function leadEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/api/v1/Lead')) {
    return trimmed;
  }
  if (trimmed.endsWith('/api/v1')) {
    return `${trimmed}/Lead`;
  }
  return `${trimmed}/api/v1/Lead`;
}

function compact(value: string | null | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function crmDisplayName(lead: LeadRow): string {
  return compact(lead.business_name) ?? `WhatsApp Lead ${maskPhone(lead.phone)}`;
}

function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function buildDescription(input: InterestedCrmInput): string {
  const parts = [
    'Interested WhatsApp reply from Scallar outreach.',
    `Reply: ${input.replyText}`,
    `Campaign: ${input.campaign?.name ?? input.lead.campaign_id}`,
    `Country: ${input.lead.country}`,
    `City: ${input.lead.city ?? 'unknown'}`,
    `Category: ${input.lead.category ?? input.campaign?.category ?? 'unknown'}`,
    `Sender: ${input.senderInstance}`,
    `Received at: ${input.receivedAt}`,
    `Remote JID: ${input.remoteJid}`,
  ];
  return parts.join('\n');
}

function buildPayload(input: InterestedCrmInput): CrmLeadPayload {
  const name = crmDisplayName(input.lead);
  const payload: CrmLeadPayload = {
    lastName: name,
    phoneNumber: formatPhone(input.lead.phone),
    status: 'Assigned',
    description: buildDescription(input),
  };
  const accountName = compact(input.lead.business_name);
  const website = compact(input.lead.website);
  const city = compact(input.lead.city);
  if (accountName !== undefined) {
    payload.accountName = accountName;
  }
  if (website !== undefined) {
    payload.website = website;
  }
  if (city !== undefined) {
    payload.addressCity = city;
  }
  payload.addressCountry = input.lead.country;
  return payload;
}

function parseCreateResponse(value: unknown): CrmCreateResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
  };
}

export async function pushInterestedLeadToCrm(input: InterestedCrmInput): Promise<CrmPushResult> {
  try {
    if (config.CRM_WEBHOOK_URL === undefined || config.CRM_API_KEY === undefined) {
      return { pushed: false, skippedReason: 'not_configured' };
    }
    const response = await fetch(leadEndpoint(config.CRM_WEBHOOK_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.CRM_API_KEY,
      },
      body: JSON.stringify(buildPayload(input)),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new CrmClientError(response.status, body);
    }
    const parsed = parseCreateResponse(body.trim().length > 0 ? JSON.parse(body) : {});
    logger.info(
      { service: 'crm', crmId: parsed.id, phone: maskPhone(input.lead.phone) },
      'interested lead pushed to CRM',
    );
    return { pushed: true, crmId: parsed.id };
  } catch (error) {
    if (error instanceof CrmClientError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'unknown CRM push error';
    throw new Error(`Failed to push interested lead to CRM: ${message}`);
  }
}
