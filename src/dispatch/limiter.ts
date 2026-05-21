import { config } from '../config/env';
import { COUNTRY_TIMEZONES, isSupportedCountry, type SupportedCountry } from '../config/constants';
import { getDb } from '../db/client';
import type { SenderRow } from '../db/schema';

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localHour(country: SupportedCountry, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: COUNTRY_TIMEZONES[country],
  });
  const hourText = formatter.formatToParts(date).find((part) => part.type === 'hour')?.value ?? '0';
  const hour = Number.parseInt(hourText, 10);
  return Number.isFinite(hour) ? hour : 0;
}

export function isQuietHours(country: string, date = new Date()): boolean {
  if (!isSupportedCountry(country)) {
    return false;
  }
  const start = config.QUIET_HOURS_START;
  const end = config.QUIET_HOURS_END;
  if (start === end) {
    return false;
  }
  const hour = localHour(country, date);
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

export function secondsUntilQuietHoursEnd(country: string, date = new Date()): number {
  if (!isSupportedCountry(country) || !isQuietHours(country, date)) {
    return 0;
  }
  const end = config.QUIET_HOURS_END;
  const maxSeconds = 24 * 60 * 60;
  for (let seconds = 60; seconds <= maxSeconds; seconds += 60) {
    const candidate = new Date(date.getTime() + seconds * 1000);
    if (localHour(country, candidate) === end && !isQuietHours(country, candidate)) {
      return seconds;
    }
  }
  return maxSeconds;
}

export function hasDailyCapacity(sender: SenderRow): boolean {
  return sender.sent_today < sender.daily_limit;
}

export async function ensureDailyCounterFresh(sender: SenderRow): Promise<SenderRow> {
  try {
    if (sender.updated_at.slice(0, 10) === utcDateKey(new Date())) {
      return sender;
    }
    const now = new Date().toISOString();
    await getDb()<SenderRow>('senders')
      .where({ id: sender.id })
      .update({ sent_today: 0, updated_at: now });
    return { ...sender, sent_today: 0, updated_at: now };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown daily reset error';
    throw new Error(`Failed to refresh daily counter: ${message}`);
  }
}

export async function incrementSenderSentToday(instance: string): Promise<void> {
  try {
    await getDb()<SenderRow>('senders')
      .where({ instance_name: instance })
      .increment('sent_today', 1)
      .update({ updated_at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown increment error';
    throw new Error(`Failed to increment sender daily counter: ${message}`);
  }
}
