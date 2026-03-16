-- item2: 問診形式の回答内容を保持する
-- 目的:
-- 1. 呼び出し時の詳細な回答を jsonb で保存する
-- 2. 将来の質問追加でもスキーマ変更を最小限にする

ALTER TABLE IF EXISTS public.item2_calls
  ADD COLUMN IF NOT EXISTS assessment_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
