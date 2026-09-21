CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON public.auth_rate_limits (expires_at);
