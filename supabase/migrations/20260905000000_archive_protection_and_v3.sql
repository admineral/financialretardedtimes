-- Additive archive protection. No existing records or caches are removed.
CREATE OR REPLACE FUNCTION public.protect_chat_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Archived chat history cannot be deleted';
  END IF;
  IF TG_TABLE_NAME = 'tv_user_activity_messages' THEN
    IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.username IS DISTINCT FROM OLD.username OR NEW.date IS DISTINCT FROM OLD.date THEN
      RAISE EXCEPTION 'Archive source identity is immutable';
    END IF;
    IF jsonb_typeof(NEW.messages) IS DISTINCT FROM 'array' THEN
      NEW.messages := OLD.messages;
    ELSE
      -- The UPSERT holds the row lock. Keep every old object, including duplicates,
      -- and append only new objects; an empty/partial scrape cannot replace history.
      NEW.messages := COALESCE(OLD.messages, '[]'::jsonb) || COALESCE((
        SELECT jsonb_agg(n.value ORDER BY n.ordinality)
        FROM jsonb_array_elements(NEW.messages) WITH ORDINALITY AS n(value, ordinality)
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(OLD.messages, '[]'::jsonb)) o(value) WHERE o.value = n.value)
      ), '[]'::jsonb);
    END IF;
  ELSIF TG_TABLE_NAME = 'tv_user_activity_daily' THEN
    NEW.message_count := GREATEST(OLD.message_count, NEW.message_count);
  ELSIF TG_TABLE_NAME = 'tv_chat_messages' THEN
    -- Existing sync uses insert-on-conflict; archive source bodies are immutable.
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.text IS DISTINCT FROM OLD.text OR NEW.time IS DISTINCT FROM OLD.time OR NEW.username IS DISTINCT FROM OLD.username THEN
      RAISE EXCEPTION 'Archived message content is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='preserve_profile_messages') THEN
    CREATE TRIGGER preserve_profile_messages BEFORE UPDATE OR DELETE ON public.tv_user_activity_messages FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='preserve_profile_counts') THEN
    CREATE TRIGGER preserve_profile_counts BEFORE UPDATE OR DELETE ON public.tv_user_activity_daily FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='preserve_room_messages') THEN
    CREATE TRIGGER preserve_room_messages BEFORE UPDATE OR DELETE ON public.tv_chat_messages FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='preserve_profiles') THEN
    CREATE TRIGGER preserve_profiles BEFORE DELETE ON public.tv_user_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.newspaper_v3_runs (
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
CREATE INDEX IF NOT EXISTS newspaper_v3_runs_created ON public.newspaper_v3_runs(created_at DESC);
ALTER TABLE public.newspaper_v3_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newspaper_v3_runs FROM anon, authenticated;
-- Access is exclusively through the server's PostgreSQL connection.
