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

## Token lifetime

Continuum issues 30-minute access tokens and 24-hour refresh tokens (with rotation). The bot proactively refreshes when <5 minutes remain on the access token. **If a user is inactive for more than 24 hours, the refresh chain breaks and they must `/link` again** — this is expected.

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
7. Wait 30+ minutes, send a message → bot still works (silent refresh).
8. Wait >24h, send a message → bot prompts to re-link.

## Architecture

See `../plan.md` in the workspace for the full spec.
