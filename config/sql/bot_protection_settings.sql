CREATE TABLE IF NOT EXISTS public.bot_protection_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    enabled boolean NOT NULL DEFAULT false,
    duration_hours integer NOT NULL DEFAULT 12 CHECK (duration_hours IN (1, 12, 24)),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);
INSERT INTO public.bot_protection_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;
