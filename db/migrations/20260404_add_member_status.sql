-- 厚生部員のステータス管理機能を追加
-- 配置中(stationed)・巡回中(patrolling)・離席中(away)の3つの状態を管理する

-- koseibu_shift_current_locations にステータスカラムを追加
ALTER TABLE public.koseibu_shift_current_locations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'stationed';

-- CHECK制約を追加（既存の制約があれば削除してから）
DO $$
BEGIN
  ALTER TABLE public.koseibu_shift_current_locations
    ADD CONSTRAINT koseibu_shift_current_locations_status_check
    CHECK (status IN ('stationed', 'patrolling', 'away'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ステータスでの検索用インデックス
CREATE INDEX IF NOT EXISTS idx_koseibu_shift_current_locations_status
  ON public.koseibu_shift_current_locations (status);

-- 巡回中・離席中ではlocation_idなどがNULLになるため、NOT NULL制約を緩和
ALTER TABLE public.koseibu_shift_current_locations
  ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE public.koseibu_shift_current_locations
  ALTER COLUMN location_name_snapshot DROP NOT NULL;
ALTER TABLE public.koseibu_shift_current_locations
  ALTER COLUMN latitude_snapshot DROP NOT NULL;
ALTER TABLE public.koseibu_shift_current_locations
  ALTER COLUMN longitude_snapshot DROP NOT NULL;
