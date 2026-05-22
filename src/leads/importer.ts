import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import type { SupportedCountry } from '../config/constants';
import { getDb } from '../db/client';
import type { CampaignRow, LeadRow, UnsubscribeRow } from '../db/schema';
import { createId } from '../utils/crypto';
import { normalizePhone } from './normalizer';

export interface ImportResult {
  imported: number;
  skipped: number;
  invalid: number;
  duplicates: number;
}

type CsvRow = Record<string, string>;

const COLUMN_ALIASES: Record<string, string[]> = {
  business_name: ['business_name', 'business name', 'name', 'company', 'company_name'],
  phone: ['phone', 'international_phone', 'national_phone', 'mobile', 'mobile_phone', 'whatsapp'],
  city: ['city', 'location', 'area', 'region'],
  category: ['category', 'type', 'industry', 'business_type'],
  rating: ['rating', 'stars', 'score'],
  review_count: ['review_count', 'reviews', 'review count', 'ratings_count'],
  website: ['website', 'url', 'site'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isCsvRow(value: unknown): value is CsvRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

function getCell(row: CsvRow, field: keyof typeof COLUMN_ALIASES): string {
  const normalizedEntries = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    normalizedEntries.set(normalizeHeader(key), value.trim());
  }
  const aliases = COLUMN_ALIASES[field] ?? [];
  for (const alias of aliases) {
    const value = normalizedEntries.get(normalizeHeader(alias));
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return '';
}

function parseNullableNumber(value: string): number | null {
  if (value.length === 0) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableInteger(value: string): number | null {
  if (value.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function importCsv(
  filePath: string,
  campaignId: string,
  country: SupportedCountry,
): Promise<ImportResult> {
  try {
    const result: ImportResult = { imported: 0, skipped: 0, invalid: 0, duplicates: 0 };
    const parser = createReadStream(filePath).pipe(
      parse({
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );
    const db = getDb();

    for await (const rawRecord of parser) {
      if (!isCsvRow(rawRecord)) {
        result.skipped += 1;
        continue;
      }
      const phoneRaw = getCell(rawRecord, 'phone');
      const phone = normalizePhone(phoneRaw, country);
      if (phone === null) {
        result.invalid += 1;
        continue;
      }
      const unsubscribed = await db<UnsubscribeRow>('unsubscribes').where({ phone }).first();
      if (unsubscribed !== undefined) {
        result.skipped += 1;
        continue;
      }
      const duplicate = await db<LeadRow>('leads').where({ campaign_id: campaignId, phone }).first();
      if (duplicate !== undefined) {
        result.duplicates += 1;
        continue;
      }
      const now = new Date().toISOString();
      await db<LeadRow>('leads').insert({
        id: createId('lead'),
        campaign_id: campaignId,
        phone,
        business_name: getCell(rawRecord, 'business_name') || null,
        city: getCell(rawRecord, 'city') || null,
        country,
        category: getCell(rawRecord, 'category') || null,
        rating: parseNullableNumber(getCell(rawRecord, 'rating')),
        review_count: parseNullableInteger(getCell(rawRecord, 'review_count')),
        website: getCell(rawRecord, 'website') || null,
        source_file: filePath,
        raw_json: JSON.stringify(rawRecord),
        status: 'queued',
        resolved_jid: null,
        last_attempt_at: null,
        created_at: now,
        updated_at: now,
      });
      result.imported += 1;
    }

    const countRows = await db<LeadRow>('leads')
      .where({ campaign_id: campaignId })
      .count<{ count: number | string }[]>({ count: '*' });
    const countValue = countRows[0]?.count ?? 0;
    const totalLeads =
      typeof countValue === 'number' ? countValue : Number.parseInt(countValue, 10);
    await db<CampaignRow>('campaigns').where({ id: campaignId }).update({
      total_leads: Number.isFinite(totalLeads) ? totalLeads : 0,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown CSV import error';
    throw new Error(`Failed to import CSV: ${message}`);
  }
}
