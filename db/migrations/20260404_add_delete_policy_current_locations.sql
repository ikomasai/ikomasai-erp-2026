-- koseibu_shift_current_locations に DELETE ポリシーを追加
-- 厚生部員は自分の現在地レコードを削除可能、管理者は全レコードを削除可能
-- 場所の論理削除時に紐づく現在地レコードをクリアするために必要

DROP POLICY IF EXISTS koseibu_shift_current_locations_delete_policy ON public.koseibu_shift_current_locations;
CREATE POLICY koseibu_shift_current_locations_delete_policy
ON public.koseibu_shift_current_locations
FOR DELETE
USING (
  (auth.uid() = user_id AND public.has_role('厚生部'))
  OR public.has_role('管理者')
  OR public.is_koseibu_manager()
);
