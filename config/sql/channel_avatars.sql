CREATE TABLE IF NOT EXISTS public.channel_avatars (
    ucid text PRIMARY KEY,
    url text NOT NULL,
    observed_at timestamptz NOT NULL
);
GRANT ALL ON TABLE public.channel_avatars TO current_user;
