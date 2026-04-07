-- Item6 厚生部場所管理
-- 各場所に対して、マップや一覧で表示する登録者名の人数上限を持たせる

ALTER TABLE public.koseibu_shift_locations
  ADD COLUMN IF NOT EXISTS display_member_count integer;

UPDATE public.koseibu_shift_locations
SET display_member_count = COALESCE(display_member_count, 3)
WHERE true;

ALTER TABLE public.koseibu_shift_locations
  ALTER COLUMN display_member_count SET DEFAULT 3,
  ALTER COLUMN display_member_count SET NOT NULL;

ALTER TABLE public.koseibu_shift_locations
  DROP CONSTRAINT IF EXISTS koseibu_shift_locations_display_member_count_check;

ALTER TABLE public.koseibu_shift_locations
  ADD CONSTRAINT koseibu_shift_locations_display_member_count_check
  CHECK (display_member_count BETWEEN 0 AND 10);
