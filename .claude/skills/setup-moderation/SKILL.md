---
name: setup-moderation
description: Wire an agent group to moderate a chat — wakes on every message (not just mentions) and acts on ToS violations. Walks the operator through picking the chat, creating or reusing a moderator agent group, writing the rules, and flipping the wiring. Triggers on "moderate", "moderation", "set up moderator", "tos enforcement".
---

# Set Up a Moderator Agent

Wire an agent to wake on **every** message in a chat (not just mentions or DMs) so it can detect and respond to ToS violations.

The mechanism is already built — `engage_mode='pattern'` with `engage_pattern='.'` on the wiring matches every message. This skill is the operational walkthrough: pick the chat, pick or create the moderator agent, write the rules, flip the wiring. No new code; one `ncl wirings update` call does the wake-on-all switch.

> **Where the loop-avoidance comes from.** The WhatsApp adapter already drops the bot's own outbound echoes via `isOwnEcho` (`src/channels/whatsapp.ts`). Telegram, Discord, etc. drop them at the adapter layer too. The moderator never sees its own warnings as new inbound — see the comment block above `isOwnEcho` for the full reasoning.

## Preconditions

Before running through this skill:

1. The channel adapter is set up and a `messaging_groups` row exists for the chat you want to moderate. Run `ncl messaging-groups list` to confirm. If the chat isn't there, ask the operator to first @-mention the bot in that chat (auto-creates the row) or wire it via `/manage-channels`.
2. An owner is provisioned (`ncl roles list --role owner`). If not, send the operator to `/init-first-agent`.

## Step 1 — Pick the messaging group to moderate

```bash
ncl messaging-groups list
```

Ask the operator which one. Confirm by `ncl messaging-groups get <id>` so they see the chat name + platform.

## Step 2 — Pick or create the moderator agent group

The moderator should usually be a **separate agent group** from your default assistant. Mixing them means every off-topic message in the moderated chat wakes your default agent's session — noisy, expensive, and the prompt would have to context-switch between "helpful assistant" and "stern moderator."

Ask the operator:

- **Use existing agent group**: list with `ncl groups list`, pick one. Skip to Step 4.
- **Create a new moderator agent group**: continue to Step 3.

## Step 3 — Create the moderator agent group

```bash
ncl groups create \
  --name "Moderator" \
  --folder "moderator"
```

This makes `groups/moderator/` with the default scaffold. Replace its `CLAUDE.md` with the policy template:

```bash
cp .claude/skills/setup-moderation/policy-template.md groups/moderator/CLAUDE.md
```

Then open `groups/moderator/CLAUDE.md` with the operator and walk them through customizing the policy section (group name, specific rules, tone, what to ignore).

## Step 4 — Flip the wiring to wake on every message

Find the wiring row:

```bash
ncl wirings list
```

…then flip its engage mode:

```bash
ncl wirings update <wiring-id> \
  --engage-mode pattern \
  --engage-pattern .
```

That's the whole switch. The router (`src/router.ts:373-374`) treats `engage_pattern='.'` as match-everything, so the moderator now sees every message in that chat.

If you want the moderator to also see context from messages it doesn't act on (useful for "thread-aware" moderation), also set `--ignored-message-policy accumulate`. Otherwise leave it as `drop` (the default) — every message engages anyway.

## Step 5 — Verify

Confirm by reading the wiring back:

```bash
ncl wirings get <wiring-id>
```

Then send a normal (non-mention, non-violating) message in the moderated chat. The moderator's session should wake but produce no outbound (the policy template instructs it to stay silent when there's no violation). Check `data/v2-sessions/moderator/<session>/outbound.db` is quiet.

Send a clearly violating message. The moderator should respond with a warning.

## What this skill does NOT install

Two things were deliberately left for later (tracked as deferred work, see #4 in the workspace task list — *"Full moderation option (#3): trunk throttle + role exemption"*):

- **Hard per-user warning throttle.** Today the moderator self-throttles by following the policy template (which says: don't warn the same user twice in 5 minutes). This is advisory — if the agent forgets, there's nothing in the router stopping it. A future change adds a `moderation_state` table + router-side check.
- **Hard owner/admin exemption.** Today the policy template tells the moderator to ignore messages from the owner. Again advisory — the router still wakes the agent on owner messages and pays the LLM cost. A future `sender_scope='exempt_privileged'` enum value would skip the wake entirely.

If the operator needs hard enforcement now (e.g. a moderated chat with thousands of users), promote those tasks before deploying.

## Action tools

The lean install only gives the moderator `send_message` (warn in chat) and `react` (emoji-flag a violation). The heavier actions — `delete_message`, `remove_participant` — are channel-specific and not yet wired. When they land, this skill will gain a "Step 6 — enable enforcement actions" section that walks through enabling them per-wiring and confirming the admin-approval gate is in place.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Moderator wakes but never responds | Policy is too strict / threshold too high. Edit `groups/moderator/CLAUDE.md`. |
| Moderator warns the operator on their own messages | Owner-exemption isn't enforced yet — restate the rule clearly in the policy file. Or wait for the deferred trunk-side exemption. |
| Bot warns its own previous warning | `sentMessageCache` evicted between send and echo. Cache holds 256 entries (`SENT_MESSAGE_CACHE_MAX`). Bump it if the moderated chat is high-volume *and* the host is also producing a lot of other outbound. |
| Wake fires twice per inbound | Two wirings on the same messaging group both match. Check `ncl wirings list` for the messaging_group_id and remove the duplicate. |
| Operator's own typed messages don't wake the moderator | Confirm `ASSISTANT_HAS_OWN_NUMBER=false` (operator's number is the bot's). If true, the operator's messages are on a separate number and won't appear as fromMe — they'll route normally. |
