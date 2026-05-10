# NanoClaw Migration Guide

Generated: 2026-05-10
Base: b8cf30830b8adc33d75537521b68023d16a51547
HEAD at generation: 0087971
Upstream: 8d57bdf (v2.0.54)

## Migration Plan

This is a v1.2.x -> v2.0.x migration. Upstream v2 is a complete rewrite with:
- New ChannelAdapter interface replacing the old Channel interface
- SQLite-based session/routing (replaces JSON state)
- Built-in attachment support (replaces custom attachment infrastructure)
- Module system (permissions, approvals, scheduling, typing, etc.)
- Container config in DB with per-group model/effort overrides

**Order of operations:**
1. Start from clean upstream/main
2. Re-add Telegram via `/add-telegram` skill (upstream skill branch available)
3. Re-add WhatsApp via `/add-whatsapp` skill
4. Port Claw-Messenger channel to v2 ChannelAdapter interface (custom work)
5. Validate build
6. Re-add other skills as needed (`/add-voice-transcription`, `/add-image-vision`, etc.)

**What does NOT need porting (now native in upstream v2):**
- Attachment type definitions and pipeline (src/types.ts, src/router.ts attachment XML)
- Container attachment passing (src/container-runner.ts ContainerAttachment)
- IPC send_file handler (src/ipc.ts)
- Image resize utilities (handled by image-vision skill)
- Voice transcription (handled by voice-transcription skill)
- Logger changes (upstream uses structured logging)

## Applied Skills

These were applied via skill branch merges and should be re-added using upstream skills:

- Telegram — `telegram/main` remote (use `/add-telegram`)
- WhatsApp — `whatsapp/main` remote (use `/add-whatsapp`)
- Voice transcription — (use `/add-voice-transcription`)
- Image vision — (use `/add-image-vision`)
- PDF reader — (use `/add-pdf-reader`)
- Reactions — (use `/add-reactions`)

## Customizations

### Claw-Messenger Channel (iMessage/RCS/SMS)

**Intent:** Add iMessage, RCS, and SMS support via a claw-messenger WebSocket proxy service. This is a fully custom channel not available upstream.

**Files:** New file `src/channels/claw-messenger.ts` (616 lines), channel registration in `src/channels/index.ts`

**Configuration (env vars):**
- `CLAW_MESSENGER_API_KEY` — API key for the proxy
- `CLAW_MESSENGER_SERVER_URL` — WebSocket URL (default: `wss://claw-messenger.onrender.com`)
- `CLAW_MESSENGER_SERVICE` — Preferred service: `iMessage`, `RCS`, or `SMS`

**JID format:**
- DM: `cm:<phone>` (e.g., `cm:+15551234567`)
- Group: `cm-group:<id>` (e.g., `cm-group:chat-abc123`)

**How to apply:**

This channel must be ported to the v2 `ChannelAdapter` interface. The v2 interface uses:
- `ChannelSetup` with `onInbound(platformId, threadId, message)` instead of `onMessage(jid, msg)`
- `InboundMessage` with `kind: 'chat'` and JSON-stringified content
- `DeliveryAddress` with `channelType`, `platformId`, `threadId`

The full original implementation is preserved below for reference. Key components to port:

1. **WsClient class** (lines 54-239) — WebSocket client with reconnect, ping/pong, request/response correlation. Can be reused as-is.

2. **Channel class** — Must be converted from `Channel` interface to `ChannelAdapter`:
   - `sendMessage(jid, text)` -> `send(platformId, threadId, content)`
   - `onMessage(jid, msg)` -> `setup.onInbound(platformId, threadId, inboundMessage)`
   - `ownsJid(jid)` -> adapter registered with channelType `'claw-messenger'`
   - `sendFile(jid, path, type, caption)` -> implement via adapter's send method
   - `setTyping(jid, isTyping)` -> implement `startTyping`/`stopTyping` hooks

3. **Attachment handling** (lines 411-478) — Download attachments, save to group folder, resize images for vision. In v2, attachment handling is built into the framework — check if the adapter needs to handle this or if the framework does.

4. **Location vCard parsing** (lines 579-608) — Parse iMessage location shares from CL.loc.vcf files. Unique to this channel.

5. **Self-registration** — In v2, channels register differently. Check `src/channels/registry.ts` for the v2 registration pattern.

**Full original source code:**

```typescript
// See /home/ubuntu/nanoclaw/src/channels/claw-messenger.ts for the complete 616-line implementation
// Key classes: WsClient (WebSocket client), ClawMessengerChannel (Channel implementation)
// Key functions: mimeToExt, parseLocationVcard
// Dependencies: fs, path, ../types.js, ./registry.js, ../env.js, ../group-folder.js, ../image.js, ../logger.js
```
