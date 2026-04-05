-- Item6 厚生部場所管理用テーブル定義
-- Supabase の SQL Editor で実行してください

-- 0. 役職判定ヘルパー
CREATE OR REPLACE FUNCTION public.has_role(target_role text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = target_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(target_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = ANY (target_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_koseibu_manager()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.has_role('厚生部') AND public.has_role('部長');
$$;

-- 1. 厚生部場所マスタ
CREATE TABLE IF NOT EXISTS public.koseibu_shift_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_koseibu_shift_locations_is_active
  ON public.koseibu_shift_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_locations_display_order
  ON public.koseibu_shift_locations(display_order, name);

ALTER TABLE public.koseibu_shift_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "koseibu_shift_locations_select_policy" ON public.koseibu_shift_locations;
CREATE POLICY "koseibu_shift_locations_select_policy" ON public.koseibu_shift_locations
  FOR SELECT
  USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS "koseibu_shift_locations_insert_policy" ON public.koseibu_shift_locations;
CREATE POLICY "koseibu_shift_locations_insert_policy" ON public.koseibu_shift_locations
  FOR INSERT
  WITH CHECK (public.has_role('厚生部') OR public.has_role('管理者'));

DROP POLICY IF EXISTS "koseibu_shift_locations_update_policy" ON public.koseibu_shift_locations;
CREATE POLICY "koseibu_shift_locations_update_policy" ON public.koseibu_shift_locations
  FOR UPDATE
  USING (public.has_role('厚生部') OR public.has_role('管理者'))
  WITH CHECK (public.has_role('厚生部') OR public.has_role('管理者'));

DROP POLICY IF EXISTS "koseibu_shift_locations_delete_policy" ON public.koseibu_shift_locations;
CREATE POLICY "koseibu_shift_locations_delete_policy" ON public.koseibu_shift_locations
  FOR DELETE
  USING (public.has_role('厚生部') OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_locations IS '厚生部シフトで使用する場所マスタ';

-- 2. 厚生部メンバーの現在地
CREATE TABLE IF NOT EXISTS public.koseibu_shift_current_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.koseibu_shift_locations(id) ON DELETE RESTRICT,
  location_name_snapshot TEXT NOT NULL,
  latitude_snapshot DOUBLE PRECISION NOT NULL,
  longitude_snapshot DOUBLE PRECISION NOT NULL,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_location_id
  ON public.koseibu_shift_current_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_updated_at
  ON public.koseibu_shift_current_locations(updated_at DESC);

ALTER TABLE public.koseibu_shift_current_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "koseibu_shift_current_locations_select_policy" ON public.koseibu_shift_current_locations;
CREATE POLICY "koseibu_shift_current_locations_select_policy" ON public.koseibu_shift_current_locations
  FOR SELECT
  USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS "koseibu_shift_current_locations_insert_policy" ON public.koseibu_shift_current_locations;
CREATE POLICY "koseibu_shift_current_locations_insert_policy" ON public.koseibu_shift_current_locations
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'));

DROP POLICY IF EXISTS "koseibu_shift_current_locations_update_policy" ON public.koseibu_shift_current_locations;
CREATE POLICY "koseibu_shift_current_locations_update_policy" ON public.koseibu_shift_current_locations
  FOR UPDATE
  USING ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'))
  WITH CHECK ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_current_locations IS '厚生部メンバーの現在地';

-- 3. 厚生部場所登録履歴
CREATE TABLE IF NOT EXISTS public.koseibu_shift_location_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.koseibu_shift_locations(id) ON DELETE SET NULL,
  location_name_snapshot TEXT NOT NULL,
  latitude_snapshot DOUBLE PRECISION,
  longitude_snapshot DOUBLE PRECISION,
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'self_register')),
  operated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_koseibu_shift_location_logs_created_at
  ON public.koseibu_shift_location_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_location_logs_operated_by
  ON public.koseibu_shift_location_logs(operated_by);

ALTER TABLE public.koseibu_shift_location_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "koseibu_shift_location_logs_select_policy" ON public.koseibu_shift_location_logs;
CREATE POLICY "koseibu_shift_location_logs_select_policy" ON public.koseibu_shift_location_logs
  FOR SELECT
  USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS "koseibu_shift_location_logs_insert_policy" ON public.koseibu_shift_location_logs;
CREATE POLICY "koseibu_shift_location_logs_insert_policy" ON public.koseibu_shift_location_logs
  FOR INSERT
  WITH CHECK ((auth.uid() = operated_by AND public.has_role('厚生部')) OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_location_logs IS '厚生部シフト場所の登録履歴';

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.koseibu_shift_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.koseibu_shift_current_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.koseibu_shift_location_logs;
