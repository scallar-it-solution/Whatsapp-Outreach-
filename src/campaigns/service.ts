import { isSupportedCountry } from '../config/constants';
import { getDb } from '../db/client';
import type { CampaignRow, CampaignStatus, LeadRow, UnsubscribeRow } from '../db/schema';
import { getOutreachQueue } from '../queue/queues';
import { assertRedisReachable } from '../queue/client';
import type { OutreachJobData } from '../queue/types';
import { createId } from '../utils/crypto';
import { loadTemplatesFromConfig } from '../templates/loader';

export interface CreateCampaignInput {
  name: string;
  country: string;
  templateSet: string;
  sourceFile?: string;
  category?: string;
}

export interface CampaignLoadResult {
  enqueued: number;
  skippedUnsubscribed: number;
}

export interface CampaignStatusBreakdown {
  status: string;
  count: number;
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignRow> {
  try {
    if (!isSupportedCountry(input.country)) {
      throw new Error(`Unsupported country: ${input.country}`);
    }
    await loadTemplatesFromConfig();
    const now = new Date().toISOString();
    const campaign: CampaignRow = {
      id: createId('camp'),
      name: input.name,
      country: input.country,
      category: input.category ?? null,
      source_file: input.sourceFile ?? null,
      template_set: input.templateSet,
      status: 'draft',
      total_leads: 0,
      sent_count: 0,
      failed_count: 0,
      created_at: now,
      started_at: null,
      completed_at: null,
    };
    await getDb()<CampaignRow>('campaigns').insert(campaign);
    return campaign;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown campaign create error';
    throw new Error(`Failed to create campaign: ${message}`);
  }
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  try {
    return await getDb()<CampaignRow>('campaigns').orderBy('created_at', 'desc');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown campaign list error';
    throw new Error(`Failed to list campaigns: ${message}`);
  }
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<void> {
  try {
    const updates: Partial<CampaignRow> = { status };
    if (status === 'active') {
      updates.started_at = new Date().toISOString();
    }
    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }
    await getDb()<CampaignRow>('campaigns').where({ id: campaignId }).update(updates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown campaign status error';
    throw new Error(`Failed to update campaign status: ${message}`);
  }
}

export async function loadCampaignToQueue(campaignId: string): Promise<CampaignLoadResult> {
  try {
    const db = getDb();
    const campaign = await db<CampaignRow>('campaigns').where({ id: campaignId }).first();
    if (campaign === undefined) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    const leads = await db<LeadRow>('leads')
      .where({ campaign_id: campaignId, status: 'queued' })
      .orderBy('created_at', 'asc');
    let enqueued = 0;
    let skippedUnsubscribed = 0;
    await assertRedisReachable();
    const queue = getOutreachQueue();
    for (const lead of leads) {
      const unsubscribed = await db<UnsubscribeRow>('unsubscribes').where({ phone: lead.phone }).first();
      if (unsubscribed !== undefined) {
        skippedUnsubscribed += 1;
        await db<LeadRow>('leads')
          .where({ id: lead.id })
          .update({ status: 'unsubscribed', updated_at: new Date().toISOString() });
        continue;
      }
      const data: OutreachJobData = {
        leadId: lead.id,
        campaignId,
        country: campaign.country,
        templateSet: campaign.template_set,
      };
      await queue.add('send-lead', data, {
        jobId: lead.id,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: false,
      });
      enqueued += 1;
    }
    if (enqueued > 0) {
      await updateCampaignStatus(campaignId, 'active');
    }
    return { enqueued, skippedUnsubscribed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown campaign load error';
    throw new Error(`Failed to load campaign to queue: ${message}`);
  }
}

export async function getCampaignStatusBreakdown(
  campaignId: string,
): Promise<CampaignStatusBreakdown[]> {
  try {
    const rows = await getDb()<LeadRow>('leads')
      .where({ campaign_id: campaignId })
      .select('status')
      .count<{ status: string; count: number | string }[]>({ count: '*' })
      .groupBy('status');
    return rows.map((row) => ({
      status: row.status,
      count: typeof row.count === 'number' ? row.count : Number.parseInt(row.count, 10),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown campaign breakdown error';
    throw new Error(`Failed to get campaign status breakdown: ${message}`);
  }
}
