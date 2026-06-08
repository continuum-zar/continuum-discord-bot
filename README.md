# continuum-discord-bot

Chat with Continuum from Discord DMs. Linked users can:
- Ask natural-language questions about their projects ("What's blocked on Acme App?")
- Query task lists, snapshots, and project Q&A
- Create tasks, update statuses, and add comments via confirmation buttons

Calls the existing Continuum REST API directly with per-user OAuth tokens. No backend changes required.

## Quick start (local development)

```bash
cp .env.example .env
# Fill in DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, OPENAI_API_KEY,
# CONTINUUM_OAUTH_REDIRECT_URI, BOT_PUBLIC_URL, TOKEN_ENCRYPTION_KEY,
# BOT_STATE_SIGNING_KEY, DATABASE_URL

npm install
npm run dev
```

The bot will:
1. Apply DB migrations.
2. Register itself with Continuum's OAuth server (or reuse a stored `client_id`).
3. Register slash commands globally.
4. Start the Discord gateway connection and the Express OAuth callback server.

## Discord Developer Portal setup

1. Create a new application at <https://discord.com/developers/applications>.
2. **Bot** tab → Add Bot → copy token into `DISCORD_BOT_TOKEN`.
3. **Bot** tab → enable **Message Content Intent**.
4. **OAuth2 → General** → set redirect URI to `${BOT_PUBLIC_URL}/oauth/callback`.
5. Copy the application ID into `DISCORD_APPLICATION_ID`.
6. Invite the bot to a server (optional): use the OAuth2 URL Generator with scopes `bot applications.commands`.

## Deployment (Railway)

1. Create a Postgres plugin in the project; copy `DATABASE_URL`.
2. Add the env vars from `.env.example`.
3. Deploy — Railway builds the Dockerfile automatically.
4. Health check: `GET /health` on the public URL.

## Session lifetime

The bot's session is bound to the **refresh-token chain**, not to a fixed timer. Continuum issues short-lived access tokens (currently 30 min) and 24-hour refresh tokens with rotation; the bot transparently introspects the access-token expiry, refreshes when <5 minutes remain, and rotates the refresh token on every refresh. Practical implications:

- A linked user can stay idle past the access-token TTL and the next command will still work — the bot refreshes silently.
- A session only ends when the refresh token is no longer valid: either >24h of inactivity (the refresh window) or a refresh-chain break (e.g., the server rejects the refresh token). In either case the link is deleted and the user must `/link` again.
- No fixed 30-minute session ceiling is enforced anywhere in the bot.

## Slash commands

| Command | Purpose |
|---------|---------|
| `/link` | Begin OAuth; replies with an auth URL (ephemeral) |
| `/unlink` | Forget your Continuum credentials |
| `/status` | Show linked username + token health |
| `/projects` | Quick list of your projects (Phase 2) |
| `/help` | Example phrases (Phase 2) |

## Manual test checklist

1. `/link` → consent in browser → success page → `/status` shows linked username.
2. DM "What projects do I have?" → bot lists projects.
3. DM "What's the status of <project>?" → snapshot or RAG answer.
4. DM "Create task X in <project>" → preview embed → Confirm → task visible in web app.
5. DM "Mark task 42 done" → confirm → status updated.
6. `/unlink` → subsequent DMs prompt to `/link` again.
7. Wait past the access-token TTL (30+ min today) but under 24h, send a message → bot still works (silent refresh).
8. Wait >24h, send a message → bot prompts to re-link.

## Architecture

See `../plan.md` in the workspace for the full spec.
