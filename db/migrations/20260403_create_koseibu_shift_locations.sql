-- Item6 厚生部場所管理
-- 既存環境に対しても再実行しやすいように IF NOT EXISTS を多めに使う

CREATE OR REPLACE FUNCTION public.has_role(target_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
SECURITY DEFINER
SET search_path = public
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
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('厚生部') AND public.has_role('部長');
$$;

GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_koseibu_manager() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.koseibu_shift_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  description text,
  display_member_count integer NOT NULL DEFAULT 3,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (display_member_count BETWEEN 0 AND 10)
);

ALTER TABLE public.koseibu_shift_locations
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS display_member_count integer,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS is_active boolean,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.koseibu_shift_locations
SET
  display_order = COALESCE(display_order, 0),
  display_member_count = COALESCE(display_member_count, 3),
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_koseibu_shift_locations_is_active
  ON public.koseibu_shift_locations (is_active);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_locations_display_order
  ON public.koseibu_shift_locations (display_order, name);

ALTER TABLE public.koseibu_shift_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS koseibu_shift_locations_select_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_select_policy
ON public.koseibu_shift_locations
FOR SELECT
USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS koseibu_shift_locations_insert_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_insert_policy
ON public.koseibu_shift_locations
FOR INSERT
WITH CHECK (public.is_koseibu_manager() OR public.has_role('管理者'));

DROP POLICY IF EXISTS koseibu_shift_locations_update_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_update_policy
ON public.koseibu_shift_locations
FOR UPDATE
USING (public.is_koseibu_manager() OR public.has_role('管理者'))
WITH CHECK (public.is_koseibu_manager() OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_locations IS '厚生部シフトで使用する場所マスタ';

CREATE TABLE IF NOT EXISTS public.koseibu_shift_current_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_id uuid NOT NULL REFERENCES public.koseibu_shift_locations(id) ON DELETE RESTRICT,
  location_name_snapshot text NOT NULL,
  latitude_snapshot double precision NOT NULL,
  longitude_snapshot double precision NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.koseibu_shift_current_locations
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS location_name_snapshot text,
  ADD COLUMN IF NOT EXISTS latitude_snapshot double precision,
  ADD COLUMN IF NOT EXISTS longitude_snapshot double precision,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_user_id_unique
  ON public.koseibu_shift_current_locations (user_id);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_location_id
  ON public.koseibu_shift_current_locations (location_id);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_updated_at
  ON public.koseibu_shift_current_locations (updated_at DESC);

ALTER TABLE public.koseibu_shift_current_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS koseibu_shift_current_locations_select_policy ON public.koseibu_shift_current_locations;
CREATE POLICY koseibu_shift_current_locations_select_policy
ON public.koseibu_shift_current_locations
FOR SELECT
USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS koseibu_shift_current_locations_insert_policy ON public.koseibu_shift_current_locations;
CREATE POLICY koseibu_shift_current_locations_insert_policy
ON public.koseibu_shift_current_locations
FOR INSERT
WITH CHECK ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'));

DROP POLICY IF EXISTS koseibu_shift_current_locations_update_policy ON public.koseibu_shift_current_locations;
CREATE POLICY koseibu_shift_current_locations_update_policy
ON public.koseibu_shift_current_locations
FOR UPDATE
USING ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'))
WITH CHECK ((auth.uid() = user_id AND public.has_role('厚生部')) OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_current_locations IS '厚生部メンバーの現在地';

CREATE TABLE IF NOT EXISTS public.koseibu_shift_location_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.koseibu_shift_locations(id) ON DELETE SET NULL,
  location_name_snapshot text NOT NULL,
  latitude_snapshot double precision,
  longitude_snapshot double precision,
  action_type text NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'self_register')),
  operated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.koseibu_shift_location_logs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS location_name_snapshot text,
  ADD COLUMN IF NOT EXISTS latitude_snapshot double precision,
  ADD COLUMN IF NOT EXISTS longitude_snapshot double precision,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS operated_by uuid,
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_koseibu_shift_location_logs_created_at
  ON public.koseibu_shift_location_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_location_logs_operated_by
  ON public.koseibu_shift_location_logs (operated_by);

ALTER TABLE public.koseibu_shift_location_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS koseibu_shift_location_logs_select_policy ON public.koseibu_shift_location_logs;
CREATE POLICY koseibu_shift_location_logs_select_policy
ON public.koseibu_shift_location_logs
FOR SELECT
USING (public.has_any_role(ARRAY['厚生部', '管理者']));

DROP POLICY IF EXISTS koseibu_shift_location_logs_insert_policy ON public.koseibu_shift_location_logs;
CREATE POLICY koseibu_shift_location_logs_insert_policy
ON public.koseibu_shift_location_logs
FOR INSERT
WITH CHECK ((auth.uid() = operated_by AND public.has_role('厚生部')) OR public.has_role('管理者'));

COMMENT ON TABLE public.koseibu_shift_location_logs IS '厚生部シフト場所の登録履歴';

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.koseibu_shift_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.koseibu_shift_current_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.koseibu_shift_location_logs;
