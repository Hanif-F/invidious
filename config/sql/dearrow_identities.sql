CREATE TABLE IF NOT EXISTS public.dearrow_identities
(
  email text PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  ciphertext text NOT NULL
);
GRANT ALL ON TABLE public.dearrow_identities TO current_user;
