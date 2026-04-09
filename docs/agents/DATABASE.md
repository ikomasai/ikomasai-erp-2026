# DB（データベース）担当 AGENTS.md

## 役割

テーブル設計、RLS（Row Level Security）、マイグレーション、SQL の管理を担当する。

---

## 最初に必ず読むこと

```
docs/プロジェクト仕様書.md
docs/管理部統合システム仕様書.md
docs/database/README.md
docs/database/*.sql
```

---

## 担当範囲

### テーブル設計

- 仕様書に基づくテーブルの設計・作成
- カラムの型・制約・デフォルト値の決定
- インデックスの設計
- リレーション（FK）の設定

### RLS（Row Level Security）

- テーブルごとの RLS ポリシーの設計・実装
- ロール別のアクセス制御

### マイグレーション

- SQL ファイルの作成と管理（`docs/database/`）
- マイグレーションの順序管理
- 本番適用前のレビュー

---

## テーブル一覧

### 実長システム（Item10）

| テーブル名          | 説明               |
| ------------------- | ------------------ |
| visitor_counts      | 来場者カウント情報 |
| suspicious_persons  | 不審者情報         |
| emergency_logs      | 緊急モード発動履歴 |
| security_placements | 警備員配置情報     |
| security_members    | 警備員マスタ情報   |

### 管理部統合システム

| テーブル名          | 説明                 |
| ------------------- | -------------------- |
| users               | ユーザー             |
| roles               | ロール定義           |
| user_roles          | ユーザー×ロール      |
| organizations       | 団体/部署            |
| user_organizations  | ユーザー×団体        |
| locations           | 教室/場所マスタ      |
| events              | 企画マスタ           |
| event_organizations | 企画×団体            |
| support_tickets     | 連絡案件             |
| ticket_messages     | 返信スレッド         |
| ticket_attachments  | 添付ファイル         |
| patrol_tasks        | 巡回タスク           |
| patrol_task_results | タスク完了結果       |
| patrol_checks       | 定常巡回ログ         |
| evaluation_checks   | 企画評価             |
| keys                | 鍵マスタ             |
| key_reservations    | 鍵予約               |
| key_loans           | 鍵貸出/返却履歴      |
| radio_logs          | 無線ログ             |
| notifications       | 通知送信ログ         |

---

## RLS 方針

### 出展（Exhibitor）

- 自団体（org_id）の連絡案件のみ閲覧/作成/追記可

### 本部（HQ）

- 全件閲覧/更新/割当可

### 会計（Accounting）

- notify_target=accounting の連絡案件閲覧、返信投稿、完了更新可

### 物品（Property）

- notify_target=property の連絡案件閲覧、返信投稿、完了更新可

### 巡回（Patrol）

- タスク閲覧（未割当＋自分担当）、accept/complete 可

---

## SQL ファイル管理

### ファイル命名規則

```
docs/database/
├── 001_initial_schema.sql
├── 002_add_theme_to_user_profiles.sql
├── 003_update_theme_constraint.sql
├── ...
└── README.md
```

- 連番 + 変更内容の説明
- 各ファイルにコメントで目的を記載

---

## RPC（Postgres Function）

- バックエンド担当と連携して設計する
- 整合性が重要な処理は RPC で原子的に処理する
- 関連する RPC：
  - `rpc_create_ticket_and_auto_tasks`
  - `rpc_return_key_and_create_lock_task`
  - `rpc_accept_task`
  - `rpc_complete_task`

---

## 出力物

- SQL ファイル（`docs/database/`）
- RLS ポリシー定義
- RPC 定義
- インデックス定義

---

## 注意事項

- テーブル変更時はマイグレーション SQL を作成する（直接変更しない）
- RLS は必ず設定する（セキュリティ最優先）
- 本番データの破壊的変更は慎重に行う
- バックエンド担当・フロントエンド担当と連携してカラム名を決める
- パフォーマンスを意識したインデックス設計を行う
