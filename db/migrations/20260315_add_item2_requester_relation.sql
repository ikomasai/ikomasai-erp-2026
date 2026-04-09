-- item2: 呼び出しフォームの初期質問回答を保持する
-- 目的:
-- 1. 傷病者本人かどうかの回答を calls に保存する
-- 2. 既存データを壊さず nullable で追加する

ALTER TABLE IF EXISTS public.item2_calls
  ADD COLUMN IF NOT EXISTS requester_relation text NULL
  CHECK (requester_relation IN ('self', 'other'));
