-- keys テーブルに building と classroom_name カラムを追加するマイグレーション
-- building: 棟名（例: A館）
-- classroom_name: 教室名（例: 101教室）

ALTER TABLE public.keys
  ADD COLUMN IF NOT EXISTS building TEXT,
  ADD COLUMN IF NOT EXISTS classroom_name TEXT;

-- 検索パフォーマンス改善のため building にインデックスを追加
CREATE INDEX IF NOT EXISTS idx_keys_building ON public.keys(building);

-- 既存の metadata->>'building' を building カラムへ移行
UPDATE public.keys
SET building = metadata->>'building'
WHERE (metadata->>'building') IS NOT NULL
  AND building IS NULL;
