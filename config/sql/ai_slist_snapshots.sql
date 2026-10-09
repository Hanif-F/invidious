CREATE TABLE IF NOT EXISTS public.ai_slist_snapshots (
    kind text PRIMARY KEY CHECK (kind IN ('blocklist', 'warnlist')),
    body text NOT NULL,
    updated_at timestamptz NOT NULL
);
GRANT ALL ON TABLE public.ai_slist_snapshots TO current_user;
