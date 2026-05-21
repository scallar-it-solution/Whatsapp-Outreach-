import { getDb } from '../db/client';
import type { SenderRow } from '../db/schema';
import { ensureDailyCounterFresh, hasDailyCapacity, isQuietHours } from './limiter';

export async function selectSender(
  campaignCountry: string,
  preferredInstance?: string,
): Promise<SenderRow | null> {
  try {
    if (isQuietHours(campaignCountry)) {
      return null;
    }
    let query = getDb()<SenderRow>('senders')
      .where({ status: 'active' })
      .where('health_score', '>=', 50)
      .orderBy('health_score', 'desc');
    if (preferredInstance !== undefined) {
      query = query.andWhere({ instance_name: preferredInstance });
    }
    const candidates = await query;
    for (const candidate of candidates) {
      const fresh = await ensureDailyCounterFresh(candidate);
      if (hasDailyCapacity(fresh)) {
        return fresh;
      }
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sender routing error';
    throw new Error(`Failed to select sender: ${message}`);
  }
}
