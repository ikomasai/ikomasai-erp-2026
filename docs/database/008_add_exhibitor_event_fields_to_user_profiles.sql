-- 企画者サポート(item16): ユーザーごとの企画情報保存カラムを追加

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS exhibitor_event_name TEXT,
  ADD COLUMN IF NOT EXISTS exhibitor_event_location TEXT;

COMMENT ON COLUMN public.user_profiles.exhibitor_event_name IS
  '企画者サポートでユーザーごとに保存する既定の企画名';
COMMENT ON COLUMN public.user_profiles.exhibitor_event_location IS
  '企画者サポートでユーザーごとに保存する既定の企画場所';
