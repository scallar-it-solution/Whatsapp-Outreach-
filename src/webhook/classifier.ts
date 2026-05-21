import type { ReplyClassification } from '../db/schema';

const INTERESTED_KEYWORDS = [
  'DEMO',
  'YES',
  'INTERESTED',
  'PRICE',
  'DETAILS',
  'CALL',
  'SEND',
  'OK',
  'SHARE',
  'WALKTHROUGH',
  'INFO',
  'HOW',
  'WHAT',
  'TELL ME',
  'SHOW',
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function hasKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(^|\\b)${escapeRegex(keyword)}(\\b|$)`, 'i').test(text);
}

export function classifyReply(text: string): ReplyClassification {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (UNSUBSCRIBE_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword))) {
    return 'unsubscribed';
  }
  if (INTERESTED_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword))) {
    return 'interested';
  }
  return 'neutral';
}
