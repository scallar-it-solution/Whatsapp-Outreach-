import type { SupportedCountry } from '../config/constants';
import { digitsOnly } from '../utils/phone';

export function normalizePhone(raw: string, country: SupportedCountry): string | null {
  try {
    const digits = digitsOnly(raw);
    if (digits.length === 0) {
      return null;
    }
    switch (country) {
      case 'UAE':
        return normalizeUae(digits);
      case 'Australia':
        return normalizeAustralia(digits);
      case 'India':
        return normalizeIndia(digits);
    }
  } catch {
    return null;
  }
}

function normalizeUae(digits: string): string | null {
  const national = digits.startsWith('971')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return /^5\d{8}$/.test(national) ? `971${national}` : null;
}

function normalizeAustralia(digits: string): string | null {
  const national = digits.startsWith('61')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return /^4\d{8}$/.test(national) ? `61${national}` : null;
}

function normalizeIndia(digits: string): string | null {
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `91${national}` : null;
}
