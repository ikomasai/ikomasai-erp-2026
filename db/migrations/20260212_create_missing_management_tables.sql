-- 管理部統合システム: 未整備テーブル補完
-- 対象: keys / key_reservations / patrol_checks / radio_logs

CREATE TABLE IF NOT EXISTS public.keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  location_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.key_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_no TEXT UNIQUE,
  key_id UUID REFERENCES public.keys(id) ON DELETE SET NULL,
  key_code TEXT,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL DEFAULT '',
  event_location TEXT NOT NULL DEFAULT '',
  requested_at_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  decision_note TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patrol_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patrol_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  location_text TEXT NOT NULL,
  check_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  memo TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radio_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'hq',
  channel TEXT NOT NULL DEFAULT 'main',
  message TEXT NOT NULL,
  location_text TEXT,
  related_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  related_task_id UUID REFERENCES public.patrol_tasks(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keys_location_id ON public.keys(location_id);
CREATE INDEX IF NOT EXISTS idx_keys_is_active ON public.keys(is_active);
CREATE INDEX IF NOT EXISTS idx_keys_created_at ON public.keys(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_key_reservations_status ON public.key_reservations(status);
CREATE INDEX IF NOT EXISTS idx_key_reservations_requested_by ON public.key_reservations(requested_by);
CREATE INDEX IF NOT EXISTS idx_key_reservations_key_id ON public.key_reservations(key_id);
CREATE INDEX IF NOT EXISTS idx_key_reservations_created_at ON public.key_reservations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patrol_checks_location_id ON public.patrol_checks(location_id);
CREATE INDEX IF NOT EXISTS idx_patrol_checks_checked_at ON public.patrol_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_patrol_checks_patrol_user_id ON public.patrol_checks(patrol_user_id);

CREATE INDEX IF NOT EXISTS idx_radio_logs_channel ON public.radio_logs(channel);
CREATE INDEX IF NOT EXISTS idx_radio_logs_created_at ON public.radio_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.generate_key_reservation_no()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  generated_no TEXT;
BEGIN
  generated_no := 'KR-' ||
    TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' ||
    UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
  RETURN generated_no;
END;
$$;

ALTER TABLE public.key_reservations
  ALTER COLUMN reservation_no SET DEFAULT public.generate_key_reservation_no();

UPDATE public.key_reservations
SET reservation_no = public.generate_key_reservation_no()
WHERE reservation_no IS NULL OR LENGTH(TRIM(reservation_no)) = 0;

CREATE OR REPLACE FUNCTION public.set_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keys_updated_at ON public.keys;
CREATE TRIGGER trg_keys_updated_at
  BEFORE UPDATE ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_keys_updated_at();

CREATE OR REPLACE FUNCTION public.set_key_reservations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_key_reservations_updated_at ON public.key_reservations;
CREATE TRIGGER trg_key_reservations_updated_at
  BEFORE UPDATE ON public.key_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_key_reservations_updated_at();

ALTER TABLE public.keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'keys' AND policyname = 'keys_select_authenticated'
  ) THEN
    CREATE POLICY keys_select_authenticated
      ON public.keys
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'keys' AND policyname = 'keys_insert_authenticated'
  ) THEN
    CREATE POLICY keys_insert_authenticated
      ON public.keys
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'keys' AND policyname = 'keys_update_authenticated'
  ) THEN
    CREATE POLICY keys_update_authenticated
      ON public.keys
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_reservations'
      AND policyname = 'key_reservations_select_authenticated'
  ) THEN
    CREATE POLICY key_reservations_select_authenticated
      ON public.key_reservations
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_reservations'
      AND policyname = 'key_reservations_insert_authenticated'
  ) THEN
    CREATE POLICY key_reservations_insert_authenticated
      ON public.key_reservations
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_reservations'
      AND policyname = 'key_reservations_update_authenticated'
  ) THEN
    CREATE POLICY key_reservations_update_authenticated
      ON public.key_reservations
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_checks'
      AND policyname = 'patrol_checks_select_authenticated'
  ) THEN
    CREATE POLICY patrol_checks_select_authenticated
      ON public.patrol_checks
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_checks'
      AND policyname = 'patrol_checks_insert_authenticated'
  ) THEN
    CREATE POLICY patrol_checks_insert_authenticated
      ON public.patrol_checks
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radio_logs'
      AND policyname = 'radio_logs_select_authenticated'
  ) THEN
    CREATE POLICY radio_logs_select_authenticated
      ON public.radio_logs
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radio_logs'
      AND policyname = 'radio_logs_insert_authenticated'
  ) THEN
    CREATE POLICY radio_logs_insert_authenticated
      ON public.radio_logs
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'keys'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.keys;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'key_reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.key_reservations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'patrol_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patrol_checks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'radio_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.radio_logs;
  END IF;
END;
$$;

COMMENT ON TABLE public.keys IS '鍵マスタ';
COMMENT ON TABLE public.key_reservations IS '鍵予約（事前申請）';
COMMENT ON TABLE public.patrol_checks IS '定常巡回ログ';
COMMENT ON TABLE public.radio_logs IS '無線ログ';
