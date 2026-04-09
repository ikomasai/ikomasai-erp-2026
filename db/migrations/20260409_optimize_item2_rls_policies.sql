-- item2: RLS ポリシーのパフォーマンス最適化
-- 目的:
-- 1. is_item2_staff() を (SELECT ...) でラップし、セッションあたり1回の評価に最適化する
-- 2. Supabase 公式ベストプラクティスに準拠
--    https://supabase.com/docs/guides/database/postgres/row-level-security#policies-with-security-definer-functions
-- 3. 既存ポリシーを冪等に再定義（DROP IF EXISTS → CREATE）

-- ============================================================
-- item2_calls ポリシー
-- ============================================================

DROP POLICY IF EXISTS item2_calls_select_policy ON public.item2_calls;
CREATE POLICY item2_calls_select_policy
ON public.item2_calls
FOR SELECT
USING (
  auth.uid() = requester_user_id
  OR (SELECT public.is_item2_staff())
);

DROP POLICY IF EXISTS item2_calls_insert_policy ON public.item2_calls;
CREATE POLICY item2_calls_insert_policy
ON public.item2_calls
FOR INSERT
WITH CHECK (
  auth.uid() = requester_user_id
  OR (SELECT public.is_item2_staff())
);

DROP POLICY IF EXISTS item2_calls_update_policy ON public.item2_calls;
CREATE POLICY item2_calls_update_policy
ON public.item2_calls
FOR UPDATE
USING (
  (SELECT public.is_item2_staff())
)
WITH CHECK (
  (SELECT public.is_item2_staff())
);

-- ============================================================
-- item2_audit_logs ポリシー
-- ============================================================

DROP POLICY IF EXISTS item2_audit_logs_select_policy ON public.item2_audit_logs;
CREATE POLICY item2_audit_logs_select_policy
ON public.item2_audit_logs
FOR SELECT
USING (
  (SELECT public.is_item2_staff())
);

DROP POLICY IF EXISTS item2_audit_logs_insert_policy ON public.item2_audit_logs;
CREATE POLICY item2_audit_logs_insert_policy
ON public.item2_audit_logs
FOR INSERT
WITH CHECK (
  (SELECT public.is_item2_staff())
);
