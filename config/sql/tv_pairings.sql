-- Grants contain hashes, never plaintext device codes or tokens.
CREATE TABLE IF NOT EXISTS public.tv_pairings (
  device_hash text PRIMARY KEY,
  user_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
  account_email text REFERENCES public.users(email) ON DELETE SET NULL,
  -- No session FK: logout must not acquire a pairing lock while holding the
  -- session row. Redemption locks account, pairing, then session.
  approving_session text,
  poll_after timestamptz NOT NULL,
  poll_interval integer NOT NULL DEFAULT 5 CHECK (poll_interval >= 5)
);
CREATE INDEX IF NOT EXISTS tv_pairings_expiry_idx ON public.tv_pairings (expires_at);
GRANT ALL ON TABLE public.tv_pairings TO current_user;
