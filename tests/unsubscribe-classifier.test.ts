import { describe, expect, it } from 'vitest';
import { classifyReply } from '../src/webhook/classifier';

describe('classifyReply', () => {
  it('classifies unsubscribe messages', () => {
    expect(classifyReply('STOP')).toBe('unsubscribed');
    expect(classifyReply('not interested')).toBe('unsubscribed');
  });

  it('classifies interested messages', () => {
    expect(classifyReply('YES DEMO')).toBe('interested');
    expect(classifyReply('Tell me more')).toBe('interested');
    expect(classifyReply('ok')).toBe('interested');
    expect(classifyReply('haan details bhejo')).toBe('interested');
    expect(classifyReply('जी डेमो चाहिए')).toBe('interested');
    expect(classifyReply('نعم ارسل تفاصيل')).toBe('interested');
  });

  it('classifies neutral messages', () => {
    expect(classifyReply('hello')).toBe('neutral');
    expect(classifyReply('Thank you for contacting us. We are currently unavailable.')).toBe('neutral');
  });

  it('lets unsubscribe win when both classes match', () => {
    expect(classifyReply('YES but do not contact again')).toBe('unsubscribed');
  });
});
