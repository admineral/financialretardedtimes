-- Small persistent statistics; no source history is copied, removed or rewritten.
CREATE TABLE IF NOT EXISTS public.archive_inventory_cache (
  room_id text PRIMARY KEY,
  format_version text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archive_inventory_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.archive_inventory_cache FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS archive_room_time_id ON public.tv_chat_messages(room_id,time,id);
CREATE INDEX IF NOT EXISTS archive_profile_room_date ON public.tv_user_activity_messages(room_id,date);
