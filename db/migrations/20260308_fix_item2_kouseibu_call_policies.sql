-- item2: 厚生部呼び出しシステム 追補マイグレーション
-- 目的:
-- 1. 既存 migration が未適用の場合でも item2 テーブル群を作成できるようにする
-- 2. 画面実装で必要な UPDATE/INSERT 操作に対応する RLS ポリシーを補完する
-- 3. 既存オブジェクトを破壊せず、IF NOT EXISTS / DROP POLICY IF EXISTS を使って冪等にする

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_item2_admin(target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.roles r
      ON r.id = ur.role_id
    WHERE ur.user_id = target_user_id
      AND r.name = '管理者'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_item2_staff(target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.roles r
      ON r.id = ur.role_id
    WHERE ur.user_id = target_user_id
      AND r.name = '厚生部'
  )
  OR public.is_item2_admin(target_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_item2_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_item2_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_item2_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_item2_staff(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.item2_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  call_type text NOT NULL CHECK (call_type IN ('emergency', 'non_urgent')),
  purpose text NULL,
  detail text NULL,
  location_text text NOT NULL,
  status text NOT NULL DEFAULT 'unhandled' CHECK (status IN ('unhandled', 'in_progress', 'resolved')),
  assigned_to uuid[] NOT NULL DEFAULT '{}'::uuid[],
  resolved_at timestamptz NULL,
  resolved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item2_calls_assigned_to_not_null CHECK (assigned_to IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.item2_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.item2_calls(id) ON DELETE CASCADE,
  assigned_to uuid[] NOT NULL DEFAULT '{}'::uuid[],
  last_message_preview text NULL,
  last_message_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item2_chat_rooms_assigned_to_not_null CHECK (assigned_to IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.item2_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.item2_chat_rooms(id) ON DELETE CASCADE,
  author_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL DEFAULT '',
  client_temp_id text NULL,
  client_created_at timestamptz NULL,
  is_system_message boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item2_chat_messages_non_empty_body CHECK (char_length(body) >= 0),
  CONSTRAINT item2_chat_messages_room_temp_id_unique UNIQUE NULLS NOT DISTINCT (room_id, client_temp_id)
);

CREATE TABLE IF NOT EXISTS public.item2_chat_read_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.item2_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid NULL REFERENCES public.item2_chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item2_chat_read_states_room_user_unique UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.item2_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  call_id uuid NULL REFERENCES public.item2_calls(id) ON DELETE CASCADE,
  room_id uuid NULL REFERENCES public.item2_chat_rooms(id) ON DELETE CASCADE,
  message_id uuid NULL REFERENCES public.item2_chat_messages(id) ON DELETE CASCADE,
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT '',
  old_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item2_calls_requester_user_id
  ON public.item2_calls (requester_user_id);

CREATE INDEX IF NOT EXISTS idx_item2_calls_status
  ON public.item2_calls (status);

CREATE INDEX IF NOT EXISTS idx_item2_calls_call_type
  ON public.item2_calls (call_type);

CREATE INDEX IF NOT EXISTS idx_item2_calls_created_at
  ON public.item2_calls (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_item2_chat_rooms_call_id
  ON public.item2_chat_rooms (call_id);

CREATE INDEX IF NOT EXISTS idx_item2_chat_rooms_last_message_at
  ON public.item2_chat_rooms (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_item2_chat_messages_room_id_created_at
  ON public.item2_chat_messages (room_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_item2_chat_messages_author_id
  ON public.item2_chat_messages (author_id);

CREATE INDEX IF NOT EXISTS idx_item2_chat_read_states_user_id
  ON public.item2_chat_read_states (user_id);

CREATE INDEX IF NOT EXISTS idx_item2_audit_logs_call_id_created_at
  ON public.item2_audit_logs (call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_item2_audit_logs_room_id_created_at
  ON public.item2_audit_logs (room_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_item2_calls_updated_at ON public.item2_calls;
CREATE TRIGGER trg_item2_calls_updated_at
BEFORE UPDATE ON public.item2_calls
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_item2_chat_rooms_updated_at ON public.item2_chat_rooms;
CREATE TRIGGER trg_item2_chat_rooms_updated_at
BEFORE UPDATE ON public.item2_chat_rooms
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_item2_chat_messages_updated_at ON public.item2_chat_messages;
CREATE TRIGGER trg_item2_chat_messages_updated_at
BEFORE UPDATE ON public.item2_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_item2_chat_read_states_updated_at ON public.item2_chat_read_states;
CREATE TRIGGER trg_item2_chat_read_states_updated_at
BEFORE UPDATE ON public.item2_chat_read_states
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.item2_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item2_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item2_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item2_chat_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item2_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.item2_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.item2_chat_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.item2_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.item2_chat_read_states TO authenticated;
GRANT SELECT, INSERT ON TABLE public.item2_audit_logs TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.item2_calls TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.item2_chat_rooms TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.item2_chat_messages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.item2_chat_read_states TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.item2_audit_logs TO service_role;

DROP POLICY IF EXISTS item2_calls_select_policy ON public.item2_calls;
DROP POLICY IF EXISTS item2_calls_insert_policy ON public.item2_calls;
DROP POLICY IF EXISTS item2_calls_update_policy ON public.item2_calls;
DROP POLICY IF EXISTS item2_chat_rooms_select_policy ON public.item2_chat_rooms;
DROP POLICY IF EXISTS item2_chat_rooms_insert_policy ON public.item2_chat_rooms;
DROP POLICY IF EXISTS item2_chat_rooms_update_policy ON public.item2_chat_rooms;
DROP POLICY IF EXISTS item2_chat_messages_select_policy ON public.item2_chat_messages;
DROP POLICY IF EXISTS item2_chat_messages_insert_policy ON public.item2_chat_messages;
DROP POLICY IF EXISTS item2_chat_messages_update_policy ON public.item2_chat_messages;
DROP POLICY IF EXISTS item2_chat_read_states_select_policy ON public.item2_chat_read_states;
DROP POLICY IF EXISTS item2_chat_read_states_insert_policy ON public.item2_chat_read_states;
DROP POLICY IF EXISTS item2_chat_read_states_update_policy ON public.item2_chat_read_states;
DROP POLICY IF EXISTS item2_audit_logs_select_policy ON public.item2_audit_logs;
DROP POLICY IF EXISTS item2_audit_logs_insert_policy ON public.item2_audit_logs;

CREATE POLICY item2_calls_select_policy
ON public.item2_calls
FOR SELECT
USING (
  auth.uid() = requester_user_id
  OR public.is_item2_staff()
);

CREATE POLICY item2_calls_insert_policy
ON public.item2_calls
FOR INSERT
WITH CHECK (
  auth.uid() = requester_user_id
  OR public.is_item2_staff()
);

CREATE POLICY item2_calls_update_policy
ON public.item2_calls
FOR UPDATE
USING (
  public.is_item2_staff()
)
WITH CHECK (
  public.is_item2_staff()
);

CREATE POLICY item2_chat_rooms_select_policy
ON public.item2_chat_rooms
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.item2_calls calls
    WHERE calls.id = public.item2_chat_rooms.call_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_rooms_insert_policy
ON public.item2_chat_rooms
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.item2_calls calls
    WHERE calls.id = public.item2_chat_rooms.call_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_rooms_update_policy
ON public.item2_chat_rooms
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.item2_calls calls
    WHERE calls.id = public.item2_chat_rooms.call_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.item2_calls calls
    WHERE calls.id = public.item2_chat_rooms.call_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_messages_select_policy
ON public.item2_chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.item2_chat_rooms rooms
    INNER JOIN public.item2_calls calls
      ON calls.id = rooms.call_id
    WHERE rooms.id = public.item2_chat_messages.room_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_messages_insert_policy
ON public.item2_chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1
    FROM public.item2_chat_rooms rooms
    INNER JOIN public.item2_calls calls
      ON calls.id = rooms.call_id
    WHERE rooms.id = public.item2_chat_messages.room_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_messages_update_policy
ON public.item2_chat_messages
FOR UPDATE
USING (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1
    FROM public.item2_chat_rooms rooms
    INNER JOIN public.item2_calls calls
      ON calls.id = rooms.call_id
    WHERE rooms.id = public.item2_chat_messages.room_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
)
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1
    FROM public.item2_chat_rooms rooms
    INNER JOIN public.item2_calls calls
      ON calls.id = rooms.call_id
    WHERE rooms.id = public.item2_chat_messages.room_id
      AND (
        calls.requester_user_id = auth.uid()
        OR public.is_item2_staff()
      )
  )
);

CREATE POLICY item2_chat_read_states_select_policy
ON public.item2_chat_read_states
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_item2_staff()
);

CREATE POLICY item2_chat_read_states_insert_policy
ON public.item2_chat_read_states
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR public.is_item2_staff()
);

CREATE POLICY item2_chat_read_states_update_policy
ON public.item2_chat_read_states
FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.is_item2_staff()
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_item2_staff()
);

CREATE POLICY item2_audit_logs_select_policy
ON public.item2_audit_logs
FOR SELECT
USING (
  public.is_item2_staff()
);

CREATE POLICY item2_audit_logs_insert_policy
ON public.item2_audit_logs
FOR INSERT
WITH CHECK (
  public.is_item2_staff()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item2_calls;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item2_chat_rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item2_chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_read_states'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item2_chat_read_states;
  END IF;
END $$;
