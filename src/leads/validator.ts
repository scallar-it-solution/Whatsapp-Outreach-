import type { SupportedCountry } from '../config/constants';
import { normalizePhone } from './normalizer';

export function isValidMobileNumber(raw: string, country: SupportedCountry): boolean {
  return normalizePhone(raw, country) !== null;
}
