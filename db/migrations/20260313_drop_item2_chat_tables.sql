-- item2: チャット機能撤去
-- 目的:
-- 1. item2 のチャット専用テーブルを削除する
-- 2. 監査ログに残っているチャット専用カラムを削除する
-- 3. Supabase Realtime publication からチャットテーブルを外す

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_read_states'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.item2_chat_read_states;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.item2_chat_messages;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'item2_chat_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.item2_chat_rooms;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.item2_audit_logs
  DROP COLUMN IF EXISTS room_id,
  DROP COLUMN IF EXISTS message_id;

DROP TABLE IF EXISTS public.item2_chat_read_states;
DROP TABLE IF EXISTS public.item2_chat_messages;
DROP TABLE IF EXISTS public.item2_chat_rooms;
