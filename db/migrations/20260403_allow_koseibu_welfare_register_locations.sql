-- Item6 厚生部場所管理 権限更新
-- 厚生部員は新規登録可能、編集は登録者本人または厚生部長、削除は厚生部長のみ

DROP POLICY IF EXISTS koseibu_shift_locations_insert_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_insert_policy
ON public.koseibu_shift_locations
FOR INSERT
WITH CHECK (public.has_role('厚生部') OR public.has_role('管理者'));

DROP POLICY IF EXISTS koseibu_shift_locations_update_policy ON public.koseibu_shift_locations;
CREATE POLICY koseibu_shift_locations_update_policy
ON public.koseibu_shift_locations
FOR UPDATE
USING (
  public.is_koseibu_manager()
  OR public.has_role('管理者')
  OR (
    public.has_role('厚生部')
    AND created_by = auth.uid()
    AND is_active = true
  )
)
WITH CHECK (
  public.is_koseibu_manager()
  OR public.has_role('管理者')
  OR (
    public.has_role('厚生部')
    AND created_by = auth.uid()
    AND is_active = true
  )
);

