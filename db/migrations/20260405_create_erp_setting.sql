-- ERP共有設定テーブルを追加
-- 本部サポートで保存した設定を巡回サポート含む全端末で利用する

CREATE TABLE IF NOT EXISTS public."ERP_setting" (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_setting_updated_at
  ON public."ERP_setting"(updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_erp_setting_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_setting_updated_at ON public."ERP_setting";
CREATE TRIGGER trg_erp_setting_updated_at
  BEFORE UPDATE ON public."ERP_setting"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_erp_setting_updated_at();

CREATE OR REPLACE FUNCTION public.can_manage_erp_setting(target_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
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
      AND COALESCE(r.permissions->'screens', '[]'::jsonb) @> '["item13"]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_erp_setting(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_erp_setting(UUID) TO service_role;

ALTER TABLE public."ERP_setting" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_setting_select_authenticated ON public."ERP_setting";
DROP POLICY IF EXISTS erp_setting_insert_hq ON public."ERP_setting";
DROP POLICY IF EXISTS erp_setting_update_hq ON public."ERP_setting";
DROP POLICY IF EXISTS erp_setting_delete_hq ON public."ERP_setting";

CREATE POLICY erp_setting_select_authenticated
ON public."ERP_setting"
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY erp_setting_insert_hq
ON public."ERP_setting"
FOR INSERT
WITH CHECK (public.can_manage_erp_setting());

CREATE POLICY erp_setting_update_hq
ON public."ERP_setting"
FOR UPDATE
USING (public.can_manage_erp_setting())
WITH CHECK (public.can_manage_erp_setting());

CREATE POLICY erp_setting_delete_hq
ON public."ERP_setting"
FOR DELETE
USING (public.can_manage_erp_setting());

INSERT INTO public."ERP_setting" (key, value, description)
VALUES (
  'evaluationFormUrl',
  to_jsonb('https://docs.google.com/forms/d/e/1FAIpQLSfcBhmp3X4Z3ARM6UFkvCH6WW4hXvg6-s6hhNuBKKaAjKmZhg/viewform?embedded=true'::text),
  '本部サポートで管理する共有評価フォームURL'
)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ERP_setting'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."ERP_setting";
  END IF;
END;
$$;

COMMENT ON TABLE public."ERP_setting" IS 'ERP共有設定';
