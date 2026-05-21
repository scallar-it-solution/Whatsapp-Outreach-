# Architecture

```text
CSV files -> import:csv -> SQLite/Postgres
                         |
campaign:load -> BullMQ outreach queue -> dispatcher worker -> Evolution API
                         |                                  |
                         |                                  v
Dashboard <- Fastify API/Webhook <- Evolution webhooks <- WhatsApp
                         |
                  replies, acks, LID mappings, unsubscribes
```

## Components

- Fastify API serves health endpoints, Evolution webhooks, and the EJS dashboard.
- BullMQ stores outreach jobs in Redis.
- Knex migrations manage the database schema.
- The dispatcher selects healthy senders, applies rate limits, sends through Evolution, and waits for final acknowledgement updates.
- The webhook handler records inbound replies, delivery updates, LID mappings, and sender health changes.

## Why HTTP 201 PENDING Is Not Final

Evolution can accept a send request and return HTTP 2xx while WhatsApp delivery is still unresolved. The system stores that response as `PENDING` only. It is not counted as delivery success.

## Final Success

Only webhook message updates with `SERVER_ACK`, `DELIVERY_ACK`, or `READ` resolve a send as successful. `ERROR` and five-minute pending timeouts reduce sender health and can quarantine a sender.

## LID Addressing

Some WhatsApp contacts use `@lid` identifiers instead of phone-based `@s.whatsapp.net` JIDs. When inbound webhooks contain `remoteJid` ending in `@lid`, the system stores a seven-day `(phone, sender)` mapping and uses it for future sends. Stale mappings are ignored.

## Sender Health

Health runs from 0 to 100. Delivery/read acks increase health, errors and pending timeouts reduce it, and severe payloads such as `pendingPreKey` or `stream:error 515` reduce it sharply. Senders below 30 are automatically quarantined and skipped by the dispatcher.

## Rotation

Country rotation is loaded from `config/rotations/default.yml`. The active entry is:

```text
Math.floor(Date.now() / 86400000) % rotation.length
```

Templates are selected deterministically per lead from the campaign template set, giving stable A/B distribution without a frontend build step.
