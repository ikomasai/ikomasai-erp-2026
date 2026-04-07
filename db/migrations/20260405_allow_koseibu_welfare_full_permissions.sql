-- Item6 厚生部場所管理 権限拡張
-- 厚生部員は登録のみ、厚生部長は編集・削除を可能にする

DROP POLICY IF EXISTS koseibu_shift_locations_update_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_update_policy
ON public.koseibu_shift_locations
FOR UPDATE
USING (public.is_koseibu_manager())
WITH CHECK (public.is_koseibu_manager());

DROP POLICY IF EXISTS koseibu_shift_locations_delete_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_delete_policy
ON public.koseibu_shift_locations
FOR DELETE
USING (public.is_koseibu_manager());
