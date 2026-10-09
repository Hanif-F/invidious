CREATE TABLE IF NOT EXISTS public.channel_handles (
    ucid text PRIMARY KEY,
    handle text,
    checked_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS channel_handles_expiry_idx ON public.channel_handles (expires_at);
GRANT ALL ON TABLE public.channel_handles TO current_user;
