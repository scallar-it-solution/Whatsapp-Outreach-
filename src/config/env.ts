import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const optionalString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}, z.string().optional());

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return value;
}, z.boolean());

const integerFromEnv = (name: string, min: number, max?: number) =>
  z.preprocess((value) => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return Number.parseInt(value, 10);
    }
    return value;
  }, z.number().int(`${name} must be an integer`).min(min).pipe(max === undefined ? z.number().int().min(min) : z.number().int().min(min).max(max)));

const csvList = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}, z.array(z.string()));

const EnvSchema = z
  .object({
    APP_PORT: integerFromEnv('APP_PORT', 1, 65535).default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SEND_ENABLED: booleanFromEnv.default(false),
    REDIS_URL: z.string().url(),
    DB_CLIENT: z.enum(['sqlite', 'postgres']).default('sqlite'),
    SQLITE_PATH: z.string().default('./data/outreach.db'),
    DATABASE_URL: optionalString,
    EVOLUTION_BASE_URL: z.string().url(),
    EVOLUTION_API_KEY: z.string().min(1, 'EVOLUTION_API_KEY is required'),
    WAHA_API_KEY: optionalString,
    WAHA_BASE_URL: optionalString,
    ACTIVE_SENDERS: csvList.default([]),
    DEFAULT_DELAY_MIN_SECONDS: integerFromEnv('DEFAULT_DELAY_MIN_SECONDS', 0).default(45),
    DEFAULT_DELAY_MAX_SECONDS: integerFromEnv('DEFAULT_DELAY_MAX_SECONDS', 1).default(90),
    DAILY_LIMIT_PER_SENDER: integerFromEnv('DAILY_LIMIT_PER_SENDER', 1).default(80),
    QUARANTINE_FAILURE_THRESHOLD: integerFromEnv('QUARANTINE_FAILURE_THRESHOLD', 1).default(5),
    QUARANTINE_WINDOW_MINUTES: integerFromEnv('QUARANTINE_WINDOW_MINUTES', 1).default(30),
    WEBHOOK_PUBLIC_URL: z.string().url(),
    ADMIN_TOKEN: z.string().min(8, 'ADMIN_TOKEN must be at least 8 characters'),
    QUIET_HOURS_START: integerFromEnv('QUIET_HOURS_START', 0, 23).default(22),
    QUIET_HOURS_END: integerFromEnv('QUIET_HOURS_END', 0, 23).default(8),
    TEST_RECIPIENT_PHONE: z.string().min(6),
    CRM_WEBHOOK_URL: optionalString,
    CRM_API_KEY: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.DB_CLIENT === 'postgres' && value.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DB_CLIENT=postgres',
      });
    }
    if (value.DEFAULT_DELAY_MAX_SECONDS < value.DEFAULT_DELAY_MIN_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEFAULT_DELAY_MAX_SECONDS'],
        message: 'DEFAULT_DELAY_MAX_SECONDS must be >= DEFAULT_DELAY_MIN_SECONDS',
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

function parseConfig(): AppConfig {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues
        .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid environment configuration: ${details}`);
    }
    throw error;
  }
}

export const config = parseConfig();
