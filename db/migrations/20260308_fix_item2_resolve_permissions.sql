-- item2: 対応終了ステータス更新向けの権限補強
-- 目的:
-- 1. 厚生部/管理者ロール判定を name/display_name 両対応にする
-- 2. item2_calls の UPDATE ポリシーを冪等に補完し、厚生部側が resolved 更新できるようにする

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
      AND (
        r.name = '管理者'
        OR r.display_name = '管理者'
      )
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
      AND (
        r.name = '厚生部'
        OR r.display_name = '厚生部'
      )
  )
  OR public.is_item2_admin(target_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_item2_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_item2_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_item2_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_item2_staff(uuid) TO service_role;

ALTER TABLE public.item2_calls ENABLE ROW LEVEL SECURITY;
GRANT UPDATE ON TABLE public.item2_calls TO authenticated;

DROP POLICY IF EXISTS item2_calls_update_policy ON public.item2_calls;
CREATE POLICY item2_calls_update_policy
ON public.item2_calls
FOR UPDATE
USING (
  public.is_item2_staff()
)
WITH CHECK (
  public.is_item2_staff()
);
