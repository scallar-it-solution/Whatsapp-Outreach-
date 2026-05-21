# scallar-whatsapp-outreach

Production-grade WhatsApp outreach for Scallar IT Solutions. It imports leads, rotates templates, routes messages across healthy Evolution API senders, tracks final delivery acknowledgements, handles replies and unsubscribes, and provides a Fastify/EJS operations dashboard.

## Prerequisites

- Node.js 20+
- Redis 7+
- Evolution API instance(s)
- Docker Compose v2, optional

## First Run Setup

```bash
cp .env.example .env
npm install
npx tsx src/cli/index.ts db:migrate
npx tsx src/cli/index.ts sender:sync-from-evolution
npm run webhook
```

## Import a UAE CSV

```bash
npx tsx src/cli/index.ts campaign:create --name "UAE Real Estate" --country UAE --template-set uae-realestate --source-file ./leads/uae.csv
npx tsx src/cli/index.ts import:csv --file ./leads/uae.csv --campaign <campaign-id> --country UAE
```

## Sender Readiness

```bash
npx tsx src/cli/index.ts sender:test sender1
```

## Load and Run Safely

```bash
npx tsx src/cli/index.ts campaign:load <campaign-id>
SEND_ENABLED=false npm run worker
```

## Live Worker

```bash
SEND_ENABLED=true npm run worker
```

## Monitor Queue

```bash
npx tsx src/cli/index.ts queue:status
```

Dashboard: `http://localhost:3000/?token=<ADMIN_TOKEN>`

## Stop All Sending Immediately

Set `SEND_ENABLED=false` and restart the worker:

```bash
SEND_ENABLED=false npm run worker
```

To pause senders without restarting:

```bash
npx tsx src/cli/index.ts sender:pause sender1
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `APP_PORT` | yes | Fastify port. |
| `NODE_ENV` | yes | `development`, `production`, or `test`. |
| `SEND_ENABLED` | yes | Must be `true` before Evolution sends occur. Defaults safe. |
| `REDIS_URL` | yes | Redis connection URL for BullMQ. |
| `DB_CLIENT` | yes | `sqlite` or `postgres`. |
| `SQLITE_PATH` | sqlite | SQLite database path. |
| `DATABASE_URL` | postgres | Postgres connection string. |
| `EVOLUTION_BASE_URL` | yes | Evolution API base URL. |
| `EVOLUTION_API_KEY` | yes | Evolution API key. |
| `ACTIVE_SENDERS` | no | Comma-separated Evolution instance names. |
| `DEFAULT_DELAY_MIN_SECONDS` | yes | Minimum per-sender pacing delay. |
| `DEFAULT_DELAY_MAX_SECONDS` | yes | Maximum per-sender pacing delay. |
| `DAILY_LIMIT_PER_SENDER` | yes | Daily send cap per sender. |
| `QUARANTINE_FAILURE_THRESHOLD` | yes | Failures before quarantine. |
| `QUARANTINE_WINDOW_MINUTES` | yes | Failure window for quarantine. |
| `WEBHOOK_PUBLIC_URL` | yes | Public Evolution webhook URL. |
| `ADMIN_TOKEN` | yes | Dashboard token. |
| `QUIET_HOURS_START` | yes | Start hour, 24h local country time. |
| `QUIET_HOURS_END` | yes | End hour, 24h local country time. |
| `TEST_RECIPIENT_PHONE` | yes | Smoke-test recipient. |
| `CRM_WEBHOOK_URL` | no | Optional CRM webhook. |
| `CRM_API_KEY` | no | Optional CRM API key. |
