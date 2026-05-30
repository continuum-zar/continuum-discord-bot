CREATE TABLE IF NOT EXISTS build_watchers (
  run_id TEXT PRIMARY KEY,
  task_id INT NOT NULL,
  discord_user_id TEXT NOT NULL REFERENCES user_links(discord_user_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  mode TEXT NOT NULL,
  poll_failures INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS build_watchers_user_idx ON build_watchers (discord_user_id);
CREATE INDEX IF NOT EXISTS build_watchers_last_polled_idx ON build_watchers (last_polled_at NULLS FIRST);
