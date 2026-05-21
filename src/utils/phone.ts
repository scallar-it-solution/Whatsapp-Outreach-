export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskPhone(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) {
    return 'unknown';
  }
  const digits = digitsOnly(value);
  if (digits.length <= 4) {
    return '****';
  }
  return `****${digits.slice(-4)}`;
}

export function extractPhoneFromJid(jid: string): string | null {
  const prefix = jid.split('@')[0];
  if (prefix === undefined) {
    return null;
  }
  const digits = digitsOnly(prefix);
  return digits.length > 0 ? digits : null;
}
