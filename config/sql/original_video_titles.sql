CREATE TABLE IF NOT EXISTS public.original_video_titles (
    video_id text PRIMARY KEY,
    title text,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS original_video_titles_expiry_idx ON public.original_video_titles (expires_at);
GRANT ALL ON TABLE public.original_video_titles TO current_user;
