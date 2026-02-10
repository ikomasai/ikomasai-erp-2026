# フェーズ7 RLS設計メモ（実装はフェーズ10）

更新日: 2026-02-09

## 1. 目的

`docs/database/006_phase7_domain_tables_ddl.sql` で追加した新規テーブル群に対して、
既存 `roles` モデルと整合するRLS設計方針を定義する。

注意:
- このメモは「設計」段階
- 実際の `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` はフェーズ10で実施

## 2. ロール別アクセス方針

### HQ

- 対象: `support_tickets`, `ticket_messages`, `ticket_attachments`, `patrol_tasks`, `patrol_task_results`, `patrol_checks`, `evaluation_checks`, `keys`, `key_reservations`, `key_loans`, `radio_logs`
- 方針: 全件参照、必要テーブルは更新可

### Patrol

- 対象: `patrol_tasks`, `patrol_task_results`, `patrol_checks`, （必要最小限の）`support_tickets`
- 方針:
  - `patrol_tasks` は「未割当 or 自分担当」のみ参照
  - 受諾/完了で更新可能
  - `patrol_task_results` は自分投稿のみ作成可

### Exhibitor

- 対象: `support_tickets`, `ticket_messages`, `ticket_attachments`, `key_reservations`
- 方針:
  - `organizations` / `user_organizations` を使って自団体境界で制限
  - 自団体チケットのみ参照/作成/追記

### Accounting

- 対象: `support_tickets`, `ticket_messages`, `ticket_attachments`
- 方針:
  - `notify_target='accounting'` のチケットのみ参照
  - 回答投稿、対応メモ更新、完了更新を許可

### Property

- 対象: `support_tickets`, `ticket_messages`, `ticket_attachments`
- 方針:
  - `notify_target='property'` のチケットのみ参照
  - 回答投稿、対応メモ更新、完了更新を許可

## 3. 参照キーと境界ルール

- ユーザー境界: `auth.uid()`
- 団体境界: `user_organizations.user_id = auth.uid()` かつ `user_organizations.organization_id = support_tickets.org_id`
- タスク境界: `patrol_tasks.assigned_to = auth.uid()` or `patrol_tasks.assigned_to IS NULL`

## 4. フェーズ10で実施すること

- 全新規テーブルの RLS 有効化
- 上記方針に基づく `SELECT/INSERT/UPDATE` ポリシー作成
- 既存 `user_profiles/user_roles/roles` への影響がないことを検証
- 通知テーブル（`notifications`）のRLSは通知機能再開時に別途設計/実装する
