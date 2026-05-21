# Troubleshooting

## Messages Stuck in PENDING

Check whether Evolution is sending `MESSAGES_UPDATE` webhooks to `WEBHOOK_PUBLIC_URL`. A send response alone is not final. Verify `/webhook/evolution` is reachable through nginx and that queue workers are not blocked.

## `pendingPreKey`

This usually indicates WhatsApp encryption session trouble. The sender health drops sharply. Run `sender:test`, reconnect the Evolution instance if needed, and do not resume until a final ack arrives.

## `stream:error 515`

The system subtracts 40 health points and may quarantine the sender. Reconnect the sender in Evolution and run a readiness test.

## Sender Auto-Quarantined Unexpectedly

Inspect `/senders`, `message_updates`, and `send_logs`. Quarantine happens when health drops below 30 or when failures exceed `QUARANTINE_FAILURE_THRESHOLD` inside `QUARANTINE_WINDOW_MINUTES`.

## Queue Not Processing

Check Redis, worker logs, and `SEND_ENABLED`. If `SEND_ENABLED=false`, jobs are requeued every 60 seconds without sending.

## Webhook Not Receiving Events

Confirm nginx routes to the Fastify app and Evolution is configured with the public webhook URL. Use:

```bash
curl http://localhost:3000/health
```

## LID Messages Not Matched to Leads

Check `jid_mappings`. A LID reply can only be matched if a phone mapping exists or the remote JID is phone-based. Run a smoke interaction to create the mapping and retry.
