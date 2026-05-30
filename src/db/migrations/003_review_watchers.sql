CREATE TABLE IF NOT EXISTS review_watchers (
  review_id TEXT PRIMARY KEY,
  build_run_id TEXT NOT NULL,
  task_id INT NOT NULL,
  discord_user_id TEXT NOT NULL REFERENCES user_links(discord_user_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  poll_failures INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS review_watchers_user_idx ON review_watchers (discord_user_id);
CREATE INDEX IF NOT EXISTS review_watchers_last_polled_idx ON review_watchers (last_polled_at NULLS FIRST);
