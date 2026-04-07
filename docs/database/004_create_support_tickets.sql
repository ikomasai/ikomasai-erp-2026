-- 企画者サポート（item16）向けテーブル定義
-- 連絡案件（support_tickets）と返信（ticket_messages）を作成

-- 1. 連絡案件テーブル
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no TEXT UNIQUE,
  ticket_type TEXT NOT NULL CHECK (
    ticket_type IN (
      'rule_question',
      'layout_change',
      'distribution_change',
      'damage_report',
      'emergency',
      'key_preapply',
      'start_report',
      'end_report'
    )
  ),
  ticket_status TEXT NOT NULL DEFAULT 'new' CHECK (
    ticket_status IN (
      'new',
      'acknowledged',
      'in_progress',
      'waiting_external',
      'resolved',
      'closed'
    )
  ),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('high', 'normal', 'low')
  ),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_location TEXT NOT NULL,
  event_id UUID,
  org_id UUID,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_hq_user_id UUID REFERENCES auth.users(id),
  notify_target TEXT NOT NULL DEFAULT 'none' CHECK (
    notify_target IN ('none', 'accounting', 'property', 'hq')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by
  ON public.support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_type
  ON public.support_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_status
  ON public.support_tickets(ticket_status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON public.support_tickets(created_at DESC);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_support_tickets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_tickets_updated_at();

-- 2. 返信テーブル
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id
  ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at
  ON public.ticket_messages(created_at DESC);

-- 3. RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'support_tickets_select_authenticated'
  ) THEN
    CREATE POLICY support_tickets_select_authenticated
      ON public.support_tickets
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'support_tickets_insert_authenticated'
  ) THEN
    CREATE POLICY support_tickets_insert_authenticated
      ON public.support_tickets
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'support_tickets_update_authenticated'
  ) THEN
    CREATE POLICY support_tickets_update_authenticated
      ON public.support_tickets
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ticket_messages'
      AND policyname = 'ticket_messages_select_authenticated'
  ) THEN
    CREATE POLICY ticket_messages_select_authenticated
      ON public.ticket_messages
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ticket_messages'
      AND policyname = 'ticket_messages_insert_authenticated'
  ) THEN
    CREATE POLICY ticket_messages_insert_authenticated
      ON public.ticket_messages
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- 4. Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END;
$$;

-- 5. コメント
COMMENT ON TABLE public.support_tickets IS '企画者サポート向け連絡案件';
COMMENT ON TABLE public.ticket_messages IS '連絡案件の返信スレッド';
