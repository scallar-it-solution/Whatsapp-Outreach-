# Evolution LID Guide

## What LID Addressing Is

WhatsApp may identify some contacts with logical IDs ending in `@lid` instead of phone-number JIDs ending in `@s.whatsapp.net`.

## `addressingMode: "lid"`

When Evolution sends a webhook with `addressingMode: "lid"` or `data.key.remoteJid` ending in `@lid`, the contact should be addressed with that LID for the same sender instance.

## Why `@s.whatsapp.net` Can Fail

For LID-mode contacts, a phone JID can remain pending or fail because WhatsApp expects the logical ID. The dispatcher therefore resolves the recipient JID before each send.

## Correct Resolution

```ts
const jid = await resolveRecipientJid('sender1', '919876543210', payload);
await client.sendTextMessage('sender1', jid, text);
```

The resolver uses inbound LID first, then a non-expired cached mapping, then `{phone}@s.whatsapp.net`.
