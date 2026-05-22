import type { ReplyClassification } from '../db/schema';

const INTERESTED_KEYWORDS = [
  'DEMO',
  'YES',
  'YEAH',
  'YUP',
  'INTERESTED',
  'PRICE',
  'PRICING',
  'COST',
  'RATE',
  'RATES',
  'DETAILS',
  'CALL',
  'CALL ME',
  'CALL BACK',
  'SEND',
  'OK',
  'OKAY',
  'SHARE',
  'WALKTHROUGH',
  'INFO',
  'MORE INFO',
  'HOW',
  'WHAT',
  'TELL ME',
  'SHOW',
  'BROCHURE',
  'QUOTE',
  'QUOTATION',
  'CONTACT',
];

const UNSUBSCRIBE_KEYWORDS = [
  'STOP',
  'NOT INTERESTED',
  'NO THANKS',
  'REMOVE',
  'UNSUBSCRIBE',
  'DONT CONTACT',
  'DO NOT CONTACT',
  'BLOCK',
];

const INTERESTED_PHRASES = [
  'HAAN',
  'HAN',
  'HAA',
  'HA',
  'JI',
  'THEEK HAI',
  'THIK HAI',
  'BATAYE',
  'BATAO',
  'BHEJO',
  'SEND KARO',
  'CALL KARO',
  'KITNA',
  'KITNE',
  'KYA PRICE',
  'DEMO CHAHIYE',
  'MUJHE DETAILS',
  'MUJHE INFO',
  'हाँ',
  'हा',
  'जी',
  'ठीक',
  'बताइए',
  'बताओ',
  'भेजो',
  'डेमो',
  'कीमत',
  'कॉल',
  'نعم',
  'مهتم',
  'سعر',
  'تفاصيل',
  'اتصل',
];

const NEUTRAL_AUTO_REPLY_PHRASES = [
  'THANK YOU FOR CONTACTING',
  'THANKS FOR CONTACTING',
  'WE ARE UNAVAILABLE',
  'WE ARE CURRENTLY UNAVAILABLE',
  'CURRENTLY UNAVAILABLE',
  'OUT OF OFFICE',
  'AUTO REPLY',
  'AUTOREPLY',
  'AUTOMATED REPLY',
  'AWAY MESSAGE',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function hasKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(^|\\b)${escapeRegex(keyword)}(\\b|$)`, 'i').test(text);
}

export function classifyReply(text: string): ReplyClassification {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();
  if (UNSUBSCRIBE_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword))) {
    return 'unsubscribed';
  }
  if (NEUTRAL_AUTO_REPLY_PHRASES.some((phrase) => upper.includes(phrase))) {
    return 'neutral';
  }
  if (INTERESTED_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword))) {
    return 'interested';
  }
  if (INTERESTED_PHRASES.some((phrase) => upper.includes(phrase))) {
    return 'interested';
  }
  return 'neutral';
}
