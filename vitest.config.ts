import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'test';
process.env.APP_PORT ??= '3000';
process.env.SEND_ENABLED ??= 'false';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.DB_CLIENT ??= 'sqlite';
process.env.SQLITE_PATH ??= ':memory:';
process.env.EVOLUTION_BASE_URL ??= 'https://example.invalid';
process.env.EVOLUTION_API_KEY ??= 'test_key';
process.env.ACTIVE_SENDERS ??= '';
process.env.DEFAULT_DELAY_MIN_SECONDS ??= '1';
process.env.DEFAULT_DELAY_MAX_SECONDS ??= '1';
process.env.DAILY_LIMIT_PER_SENDER ??= '80';
process.env.QUARANTINE_FAILURE_THRESHOLD ??= '5';
process.env.QUARANTINE_WINDOW_MINUTES ??= '30';
process.env.WEBHOOK_PUBLIC_URL ??= 'https://example.invalid/webhook/evolution';
process.env.ADMIN_TOKEN ??= 'test_admin_token';
process.env.QUIET_HOURS_START ??= '0';
process.env.QUIET_HOURS_END ??= '0';
process.env.TEST_RECIPIENT_PHONE ??= '+919999999999';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});
