-- Item6 厚生部場所管理 権限拡張
-- 厚生部員を厚生部長同等に扱い、登録・編集・削除を可能にする

DROP POLICY IF EXISTS koseibu_shift_locations_update_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_update_policy
ON public.koseibu_shift_locations
FOR UPDATE
USING (public.has_role('厚生部') OR public.has_role('管理者'))
WITH CHECK (public.has_role('厚生部') OR public.has_role('管理者'));

DROP POLICY IF EXISTS koseibu_shift_locations_delete_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_delete_policy
ON public.koseibu_shift_locations
FOR DELETE
USING (public.has_role('厚生部') OR public.has_role('管理者'));
