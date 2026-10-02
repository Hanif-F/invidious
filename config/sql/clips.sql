CREATE TABLE IF NOT EXISTS public.clips
(
  id text PRIMARY KEY CHECK (id ~ '^IVCL[a-zA-Z0-9_-]{32}$'),
  owner text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  video_id text NOT NULL,
  ucid text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  video_title text NOT NULL,
  channel_name text NOT NULL,
  video_duration integer NOT NULL,
  CHECK (end_ms - start_ms BETWEEN 5000 AND 120000),
  CHECK (end_ms <= video_duration::bigint * 1000)
);
CREATE INDEX IF NOT EXISTS clips_owner_created_idx ON public.clips (owner, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS clips_channel_created_idx ON public.clips (ucid, created_at DESC, id DESC);
GRANT ALL ON TABLE public.clips TO current_user;
