export const APP_NAME = 'scallar-whatsapp-outreach';

export const SUPPORTED_COUNTRIES = ['UAE', 'Australia', 'India'] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export function isSupportedCountry(value: string): value is SupportedCountry {
  return SUPPORTED_COUNTRIES.includes(value as SupportedCountry);
}

export const SUCCESS_ACK_STATUSES = ['SERVER_ACK', 'DELIVERY_ACK', 'READ'] as const;

export const FINAL_MESSAGE_STATUSES = [
  'PENDING',
  'SERVER_ACK',
  'DELIVERY_ACK',
  'READ',
  'ERROR',
  'TIMEOUT',
] as const;

export type FinalMessageStatus = (typeof FINAL_MESSAGE_STATUSES)[number];

export const JID_MAPPING_TTL_DAYS = 7;

export const DEAD_LETTER_WARN_SIZE = 500;

export const COUNTRY_TIMEZONES: Record<SupportedCountry, string> = {
  UAE: 'Asia/Dubai',
  Australia: 'Australia/Sydney',
  India: 'Asia/Kolkata',
};

export const OUTREACH_QUEUE_NAME = 'outreach';
export const RETRY_QUEUE_NAME = 'retry';
export const DEAD_LETTER_QUEUE_NAME = 'deadletter';
