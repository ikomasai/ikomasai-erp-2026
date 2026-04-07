-- ============================================================
-- 007: 企画管理部ロールに巡回サポート（item12）権限を追加
-- 目的: 企画管理部アカウントで本部サポート（item13）と
--       巡回サポート（item12）の両方を閲覧可能にする
-- 実行日: 2026-02-17
-- ============================================================

-- 1. 企画管理部ロールの現在の permissions を確認
-- SELECT id, name, permissions FROM roles WHERE name = '企画管理部';

-- 2. 企画管理部ロールの screens に item12 を追加
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{screens}',
  (
    SELECT jsonb_agg(DISTINCT value)
    FROM (
      SELECT value FROM jsonb_array_elements_text(permissions->'screens') AS value
      UNION
      SELECT 'item12'
    ) sub
  )
)
WHERE name = '企画管理部';

-- 3. 企画管理部ロールの features に item12 の権限を追加
-- （巡回タスクの閲覧・受諾・完了・巡回チェック・評価入力を許可）
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{features,item12}',
  '["read", "accept", "complete", "patrol_check", "evaluation"]'::jsonb
)
WHERE name = '企画管理部';

-- 4. 更新結果を確認
SELECT id, name, permissions FROM roles WHERE name = '企画管理部';
