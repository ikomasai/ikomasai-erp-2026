# 現状スキーマ実査メモ

実行日時: 2026-02-10T10:20:27.458Z  
対象環境: https://qlldsvpkcfftbibujltf.supabase.co

## 1. 既存3テーブル実査

| テーブル | 判定 | 詳細 |
| --- | --- | --- |
| user_profiles | PASS | OK |
| user_roles | PASS | OK |
| roles | PASS | OK |

## 2. user_roles -> roles JOIN 実査

| チェック | 判定 | HTTP | 詳細 |
| --- | --- | --- | --- |
| user_roles -> roles JOIN | PASS | 200 | OK |

## 3. 匿名アクセス確認（RLS参考）

※ anon keyのみでの確認結果。RLSの最終判定には認証済みユーザーでの検証が必要。

| テーブル | 判定 | HTTP | 取得件数 | メモ |
| --- | --- | --- | --- | --- |
| user_profiles | WARNING | 200 | 1 | 匿名アクセスでデータが取得できました。RLS設定を確認してください。 |
| user_roles | WARNING | 200 | 1 | 匿名アクセスでデータが取得できました。RLS設定を確認してください。 |
| roles | INCONCLUSIVE | 200 | 0 | 匿名アクセスでは0件でした（RLS有効またはデータ未投入）。 |

## 4. RPC一覧（命名衝突確認用）

- `fn_has_screen_access`
- `fn_is_accounting`
- `fn_is_exhibitor`
- `fn_is_hq`
- `fn_is_patrol`
- `fn_is_property`
- `fn_user_belongs_to_org`
- `rpc_accept_task`
- `rpc_complete_task`
- `rpc_create_ticket_and_auto_tasks`
- `rpc_next_task_no`
- `rpc_next_ticket_no`
- `rpc_return_key_and_create_lock_task`

## 5. 手動確認が必要な項目

- user_profiles / user_roles / roles のRLSポリシー定義本文（auth.uid() 条件や authenticated 条件）
- 認証済みユーザーでの以下動作確認
  - 自分の user_profiles が SELECT/UPDATE/INSERT できる
  - 他人の user_profiles が参照できない
  - 自分の user_roles のみ参照できる
  - roles の SELECT 可否が仕様どおりである
