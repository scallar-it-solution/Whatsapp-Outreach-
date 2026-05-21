import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/leads/normalizer';

describe('normalizePhone', () => {
  it('normalizes valid UAE mobile numbers', () => {
    expect(normalizePhone('+971 50 123 4567', 'UAE')).toBe('971501234567');
    expect(normalizePhone('0501234567', 'UAE')).toBe('971501234567');
  });

  it('rejects UAE landlines', () => {
    expect(normalizePhone('+971 4 123 4567', 'UAE')).toBeNull();
  });

  it('normalizes valid Australian mobile numbers', () => {
    expect(normalizePhone('+61 412 345 678', 'Australia')).toBe('61412345678');
    expect(normalizePhone('0412345678', 'Australia')).toBe('61412345678');
  });

  it('rejects Australian landlines', () => {
    expect(normalizePhone('+61 2 1234 5678', 'Australia')).toBeNull();
  });

  it('normalizes valid India mobile numbers', () => {
    expect(normalizePhone('+91 9876543210', 'India')).toBe('919876543210');
  });

  it('normalizes India 10-digit numbers without country code', () => {
    expect(normalizePhone('9876543210', 'India')).toBe('919876543210');
  });

  it('rejects empty and garbage values', () => {
    expect(normalizePhone('', 'India')).toBeNull();
    expect(normalizePhone('not a phone', 'UAE')).toBeNull();
  });
});
