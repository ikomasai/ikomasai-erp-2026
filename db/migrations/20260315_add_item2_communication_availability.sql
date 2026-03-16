-- item2: 傷病者本人の文字入力可否を保持する
-- 目的:
-- 1. 傷病者本人が文字入力や選択を行えるかを calls に保存する
-- 2. 既存データを壊さず nullable で追加する

ALTER TABLE IF EXISTS public.item2_calls
  ADD COLUMN IF NOT EXISTS can_communicate_by_text boolean NULL;
