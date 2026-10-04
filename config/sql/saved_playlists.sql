CREATE TABLE IF NOT EXISTS public.saved_playlists (
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    source_id text NOT NULL,
    metadata text NOT NULL,
    seed_video_id text,
    saved_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, source_id)
);
GRANT ALL ON TABLE public.saved_playlists TO current_user;
