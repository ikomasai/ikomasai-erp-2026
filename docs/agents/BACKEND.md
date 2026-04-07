# バックエンド担当 AGENTS.md

## 役割

Supabase 設定、API設計、GAS連携、サービス層の実装を担当する。

---

## 最初に必ず読むこと

```
docs/プロジェクト仕様書.md
docs/管理部統合システム仕様書.md
.claude/CLAUDE.md（コーディング規約）
```

---

## 担当範囲

### Supabase 設定

- プロジェクトの初期設定
- 認証（Auth）の設定
- Storage バケットの設定
- Realtime チャンネルの設定
- Edge Functions の作成

### API 設計・実装

- サービス層の実装（`src/features/*/services/`）
- 共通サービスの実装（`src/services/`）
- RPC（Postgres Function）の設計・実装

### サービス層の命名規約

- データ取得：`selectEvents`, `selectEventById`
- データ挿入：`insertEvent`
- データ更新：`updateUser`
- データ削除：`deleteEvent`

---

## 主要サービスファイル

### 共通サービス（`src/services/`）

```
src/services/
├── supabase/
│   ├── client.js          # Supabase クライアント
│   ├── authService.js     # 認証サービス
│   ├── permissionService.js # 権限サービス
│   └── userService.js     # ユーザーサービス
└── gas/
    └── gasApi.js          # Google Apps Script 連携
```

### 機能別サービス（`src/features/*/services/`）

- 各機能に対応するサービスファイルを作成する
- Supabase REST API を使用してデータを操作する

---

## 推奨 RPC（管理部統合システム）

1. `rpc_create_ticket_and_auto_tasks(ticket_payload)`
   - start_report/end_report の場合：確認タスクを自動生成

2. `rpc_return_key_and_create_lock_task(loan_id, create_lock_task, optional_assignee)`
   - 返却処理の確定と施錠確認タスクの生成

3. `rpc_accept_task(task_id, patrol_user_id)`
   - タスクの受諾（取り合い防止）

4. `rpc_complete_task(task_id, result_payload)`
   - タスクの完了と結果の記録

---

## 通知設計

- Edge Function `functions/v1/notify` で一元送信
- 必ず notifications テーブルにログを残す
- 通知トリガ：
  - distribution_change → 会計部
  - damage_report → 物品部
  - 緊急連絡 → 本部

---

## Realtime 設計

- Supabase Realtime でデータ同期
- 対象テーブル：
  - support_tickets（連絡案件）
  - patrol_tasks（巡回タスク）
  - key_loans（鍵貸出）

---

## セキュリティ

- API キーは環境変数で管理（`.env`）
- RLS（Row Level Security）を DB 担当と連携して設定
- 認証トークンの管理

---

## 出力物

- サービスファイル（`src/features/*/services/`）
- Supabase Edge Functions
- RPC 定義（SQL）
- API 仕様（必要に応じてドキュメント担当へ共有）

---

## 注意事項

- DB 担当が定義したテーブル構造に合わせてクエリを書く
- エラーハンドリングを必ず実装する（try-catch で握りつぶさない）
- 環境変数のハードコード禁止
- N+1 問題やオーバーフェッチを避ける
