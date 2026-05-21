import pino from 'pino';
import { APP_NAME } from '../config/constants';

export const logger = pino({
  base: {
    app: APP_NAME,
  },
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: ['apikey', 'apiKey', 'EVOLUTION_API_KEY', 'CRM_API_KEY', 'authorization'],
    censor: '[redacted]',
  },
});

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
