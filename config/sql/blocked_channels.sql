CREATE TABLE IF NOT EXISTS public.blocked_channels
(
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  ucid text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, ucid)
);
GRANT ALL ON TABLE public.blocked_channels TO current_user;
