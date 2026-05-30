CREATE TABLE IF NOT EXISTS bot_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_links (
  discord_user_id TEXT PRIMARY KEY,
  continuum_user_id TEXT NOT NULL,
  continuum_username TEXT,
  refresh_token_ciphertext BYTEA NOT NULL,
  refresh_token_iv BYTEA NOT NULL,
  refresh_token_tag BYTEA NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY,
  discord_user_id TEXT NOT NULL REFERENCES user_links(discord_user_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  message_id TEXT,
  channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS pending_actions_user_idx ON pending_actions (discord_user_id);
CREATE INDEX IF NOT EXISTS pending_actions_expires_idx ON pending_actions (expires_at);

CREATE TABLE IF NOT EXISTS conversation_history (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL REFERENCES user_links(discord_user_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversation_history_user_idx
  ON conversation_history (discord_user_id, created_at DESC);
