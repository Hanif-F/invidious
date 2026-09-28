CREATE TABLE IF NOT EXISTS public.chat_timing_offsets
(
    email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    video_id text NOT NULL,
    offset_ms integer NOT NULL CHECK (offset_ms BETWEEN -3600000 AND 3600000),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, video_id)
);

CREATE INDEX IF NOT EXISTS chat_timing_offsets_email_updated_idx
    ON public.chat_timing_offsets (email, updated_at DESC);

GRANT ALL ON TABLE public.chat_timing_offsets TO current_user;
