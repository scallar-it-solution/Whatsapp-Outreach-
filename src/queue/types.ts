import type { SupportedCountry } from '../config/constants';

export interface OutreachJobData {
  leadId: string;
  campaignId: string;
  country: SupportedCountry;
  templateSet: string;
  preferredInstance?: string;
}

export interface DeadLetterJobData {
  originalQueue: 'outreach' | 'retry';
  reason: string;
  failedAt: string;
  original: OutreachJobData;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  deadLetter: number;
}
