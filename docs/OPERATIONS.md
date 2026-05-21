# Operations

## Daily Checklist

- Check `/health` and `/metrics/basic`.
- Run `npx tsx src/cli/index.ts queue:status`.
- Review `/senders` for health below 70.
- Review `/deadletter` for failed jobs.
- Run readiness tests before enabling a new sender.

## Pause All Senders

```bash
npx tsx src/cli/index.ts sender:pause sender1
npx tsx src/cli/index.ts sender:pause sender2
```

For an immediate global stop, set `SEND_ENABLED=false` and restart the worker.

## Resume a Quarantined Sender

```bash
npx tsx src/cli/index.ts sender:test sender1
npx tsx src/cli/index.ts sender:resume sender1
```

Only resume after a successful readiness test.

## Manual Country Rotation

```bash
npx tsx src/cli/index.ts campaign:create --name "Manual UAE" --country UAE --template-set uae-realestate --source-file ./leads/uae.csv
npx tsx src/cli/index.ts import:csv --file ./leads/uae.csv --campaign <campaign-id> --country UAE
npx tsx src/cli/index.ts campaign:load <campaign-id>
```

## Ack Rates

Use:

```bash
curl http://localhost:3000/metrics/basic
```

Success means `SERVER_ACK`, `DELIVERY_ACK`, or `READ`.

## Export Interested Leads

SQLite:

```bash
sqlite3 -header -csv data/outreach.db "select * from leads where status='interested';" > interested-leads.csv
```
