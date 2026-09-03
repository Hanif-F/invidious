-- Table: public.playback_positions

CREATE TABLE IF NOT EXISTS public.playback_positions
(
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    video_id text NOT NULL,
    position_seconds integer NOT NULL CHECK (position_seconds >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, video_id)
);

CREATE INDEX IF NOT EXISTS playback_positions_email_updated_idx
    ON public.playback_positions (email, updated_at DESC);

GRANT ALL ON TABLE public.playback_positions TO current_user;
