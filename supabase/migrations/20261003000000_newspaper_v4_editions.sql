-- AI editions (newspaper v4): fictional issues generated from real BTC candles
-- and the chat's voice. Additive; no existing data is touched.
CREATE TABLE IF NOT EXISTS public.newspaper_v4_editions (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  model text NOT NULL,
  prompt_version text NOT NULL,
  fingerprint text NOT NULL,
  input_data jsonb NOT NULL,
  output_data jsonb,
  usage jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS newspaper_v4_editions_created ON public.newspaper_v4_editions(created_at DESC);
ALTER TABLE public.newspaper_v4_editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newspaper_v4_editions FROM anon, authenticated;
-- Access is exclusively through the server's PostgreSQL connection.
