import { randomUUID } from 'node:crypto';

export function createId(prefix?: string): string {
  const id = randomUUID();
  return prefix === undefined ? id : `${prefix}_${id}`;
}
