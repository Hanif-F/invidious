CREATE TABLE IF NOT EXISTS public.watch_history
(
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text,
  channel_name text,
  channel_id text,
  release_date date,
  latest_watched date,
  archived_dates date[] NOT NULL DEFAULT '{}',
  length_seconds integer CHECK (length_seconds > 0),
  PRIMARY KEY (email, video_id)
);
