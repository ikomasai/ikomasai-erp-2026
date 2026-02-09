# 企画管理統合システム 実装タスク（Supabaseテーブル概要準拠版）

最終更新: 2026-02-09

## 0. 参照仕様（この順で優先）

1. `docs/プロジェクト仕様書_supabaseテーブル概要.md`
2. `docs/企画管理部統合システム.md`
3. `docs/AI用プロンプト/AGENTS.md`

本タスクは「実装前の整理のみ」。コード実装は行わない。

---

## 1. 準拠チェック結果（現行task.mdとの差分）

前版 task.md は以下が不足していたため、本版で修正した。

- `user_profiles` / `user_roles` / `roles` を「既存固定テーブル」として明示していなかった
- `roles.permissions.screens` と `CustomDrawerContent.jsx` の `PERMISSION_NAME_MAP` 連携タスクが弱かった
- 既存RLS（3テーブル分）を維持する前提が明示されていなかった
- 新機能追加時に既存3テーブルへ影響を与えないための互換タスクが不足していた

---

## 2. 既存Supabase前提（必ず維持するもの）

### 2.1 既存テーブル（変更最小）

- `user_profiles`
- `user_roles`
- `roles`

### 2.2 既存RLS（維持前提）

- `user_profiles`
  - 自分のプロフィールのみ `SELECT/UPDATE/INSERT`
- `user_roles`
  - 自分のロールのみ `SELECT`
- `roles`
  - 認証済みユーザーは `SELECT`

### 2.3 既存コード依存（壊してはいけない）

- `src/services/supabase/userService.js`
  - `user_profiles` 取得
  - `user_roles -> roles` JOIN
- `src/services/supabase/permissionService.js`
  - `permissions.screens` / `permissions.features` 判定
- `src/navigation/components/CustomDrawerContent.jsx`
  - `PERMISSION_NAME_MAP` と `permissions.screens` の一致で画面可視化
- `src/shared/services/themeSettingsService.js`
  - `user_profiles.theme_mode`
- `src/features/auth/services/passwordService.js`
  - `user_profiles.password_changed_at`

---

## 3. item番号の確定（今回の実装対象）

- `item12`: 巡回（Patrol）
- `item13`: 本部（HQ）
- `item14`: 会計（Accounting）
- `item15`: 物品（Property）
- `item16`: 企画者/出展（Exhibitor）

補足:
- `item11` は既存で `JimuShift`（権限名: `当日部員`）として運用済み。

---

## 4. 非破壊実装ルール（DB再利用方針）

- 既存3テーブル (`user_profiles/user_roles/roles`) は削除・リネームしない
- 既存カラムは後方互換を壊す変更をしない
- 追加が必要なDB要素は「新規追加（Additive）」で実装
- SQLは `IF NOT EXISTS` を基本にする
- 既存RLSを壊さない（新規テーブルのRLSを追加）
- `permissions.screens` は既存値を維持しつつ `item12~item16` を追加

---

## 5. 事前調査タスク（実装前に必須）

### 5.1 Supabase実体確認（仕様書との一致チェック）

- [ ] `user_profiles` 実テーブルの存在・カラム・制約を確認
- [ ] `user_roles` 実テーブルの存在・FKを確認
- [ ] `roles` 実テーブルの存在・`permissions(jsonb)` を確認
- [ ] 既存RLSポリシーが仕様書と一致するか確認
- [ ] 現行RPC一覧を取得し、命名衝突リスクを確認

成果物:
- [ ] `docs/database/` に「現状スキーマ実査メモ」を残す

### 5.2 既存仕様間の揺れ確認（先に解決）

- [ ] `theme_mode` 許容値の差異確認
  - `docs/プロジェクト仕様書_supabaseテーブル概要.md` では `world_trigger/eva`
  - `docs/database/003_update_theme_constraint.sql` では `cyber/neon`
- [ ] 本実装で採用する正を決定し、互換方針を定義
  - 既存データの変換要否
  - UI表示名との対応

---

## 6. 権限・ナビゲーション基盤タスク（Supabase概要準拠）

### 6.1 `roles.permissions.screens` 更新設計

- [ ] 以下権限値を追加する設計を確定
  - `item12`
  - `item13`
  - `item14`
  - `item15`
  - `item16`
- [ ] 既存権限値（`item1~item10`, `当日部員`）を保持
- [ ] ロールごとの割当方針を決定
  - HQ
  - Patrol
  - Accounting
  - Property
  - Exhibitor

### 6.2 Drawer連携

- [x] `src/navigation/DrawerNavigator.jsx` に `Item12~Item16` を追加
- [x] `src/navigation/components/CustomDrawerContent.jsx` の項目総数を16へ拡張
- [x] `ITEM_LABELS` / `SCREEN_NAME_MAP` / `PERMISSION_NAME_MAP` の追加定義
  - `12: 巡回`
  - `13: 本部`
  - `14: 会計`
  - `15: 物品`
  - `16: 企画者`

受け入れ条件:
- [ ] `permissions.screens` に値がない画面は表示されない
- [ ] 権限追加後も既存 `item1~item11` の表示/非表示が崩れない

---

## 7. ドメインDB拡張タスク（既存3テーブルは維持）

`docs/企画管理部統合システム.md` を満たすため、必要なら以下を追加する。

### 7.1 追加候補テーブル

- [ ] `support_tickets`
- [ ] `ticket_messages`
- [ ] `ticket_attachments`
- [ ] `patrol_tasks`
- [ ] `patrol_task_results`
- [ ] `patrol_checks`
- [ ] `evaluation_checks`
- [ ] `keys`
- [ ] `key_reservations`
- [ ] `key_loans`
- [ ] `radio_logs`
- [ ] `notifications`
- [ ] （必要時）`organizations`, `user_organizations`, `locations`, `events`, `event_organizations`

### 7.2 追加時の制約

- [ ] `created_by` / `assigned_to` は `auth.users` 参照を基本とする
- [ ] 既存 `roles` 権限モデルと整合するRLSを設計する
- [ ] 番号系（ticket_no/task_no）はユニーク制約を付与
- [ ] 主要検索列にインデックスを付与

---

## 8. RPC/通知タスク

### 8.1 RPC（最小セット）

- [ ] `rpc_create_ticket_and_auto_tasks(ticket_payload)`
- [ ] `rpc_return_key_and_create_lock_task(loan_id, create_lock_task, optional_assignee)`
- [ ] `rpc_accept_task(task_id, patrol_user_id)`
- [ ] `rpc_complete_task(task_id, result_payload)`

### 8.2 通知

- [ ] `functions/v1/notify` のI/O契約を定義
- [ ] 通知ログを `notifications` へ必ず記録
- [ ] 必須トリガを実装設計
  - `distribution_change` -> 会計
  - `damage_report` -> 物品
  - `start_report/end_report` -> 巡回タスク連動

---

## 9. 画面実装タスク（item12〜item16）

## 9.1 item12 巡回（Patrol）

- [ ] `src/features/item12/` 新設
- [ ] タスク一覧（未割当 + 自分担当）
- [ ] 向かいます（`open -> accepted`）
- [ ] 完了（結果コード + メモ + 任意写真）
- [ ] 巡回チェック入力
- [ ] 未巡回アラート表示
- [ ] 企画評価入力（承認待ち登録）

受け入れ条件:
- [ ] 二重受諾を防止できる
- [ ] `done_at` と結果が必ず記録される

### 9.2 item13 本部（HQ）

- [ ] `src/features/item13/` 新設
- [ ] ダッシュボード（新着/遅延/施錠/鍵/巡回/無線）
- [ ] チケット一覧・詳細（返信/状態更新/担当割当）
- [ ] 巡回タスク一覧・詳細（割当/結果確認）
- [ ] 鍵返却 + 施錠確認依頼
- [ ] 評価承認/差戻し
- [ ] 会計/物品対応状況追跡 + 再通知

受け入れ条件:
- [ ] 開始/終了報告と巡回タスクの紐づきが見える
- [ ] 返却時に `lock_check` 作成可否を選べる

### 9.3 item14 会計（Accounting）

- [ ] `src/features/item14/` 新設
- [ ] `distribution_change` 専用Inbox
- [ ] 一覧（未読/対応中/完了）
- [ ] 詳細（本文/返信/添付）
- [ ] 回答投稿
- [ ] 対応メモ
- [ ] 完了更新

受け入れ条件:
- [ ] 対象外チケットは見えない
- [ ] 回答が出展・本部で参照可能

### 9.4 item15 物品（Property）

- [ ] `src/features/item15/` 新設
- [ ] `damage_report` 専用Inbox
- [ ] 一覧（未読/対応中/完了）
- [ ] 詳細（写真中心 + 返信）
- [ ] 回答投稿
- [ ] 対応メモ
- [ ] 完了更新

受け入れ条件:
- [ ] 対象外チケットは見えない
- [ ] 画像添付の表示が安定する

### 9.5 item16 企画者/出展（Exhibitor）

- [ ] `src/features/item16/` 新設
- [ ] 自団体チケット一覧
- [ ] 新規チケット作成（全種別）
- [ ] 詳細/追記（返信スレッド）
- [ ] 企画開始/終了報告
- [ ] 鍵事前申請

受け入れ条件:
- [ ] `start_report/end_report` で巡回タスクが連動生成される
- [ ] 他団体データへアクセス不可

---

## 10. RLS拡張タスク（新規テーブル分）

- [ ] Exhibitor: 自団体データのみ
- [ ] HQ: 全件参照/更新
- [ ] Accounting: 会計対象チケットのみ
- [ ] Property: 物品対象チケットのみ
- [ ] Patrol: 未割当 + 自分担当タスク

受け入れ条件:
- [ ] `user_profiles/user_roles/roles` の既存RLSに影響を与えない
- [ ] 新旧RLSの組み合わせで権限逸脱が起きない

---

## 11. テストタスク

### 11.1 サービス層

- [ ] 正常系
- [ ] 異常系（ネットワーク/RLS拒否/RPC失敗）

### 11.2 権限境界

- [ ] `permissions.screens` 未付与画面の非表示
- [ ] ロール別データ可視範囲

### 11.3 E2E重要シナリオ

- [ ] 出展 `start_report` -> 巡回受諾/完了 -> 本部確認
- [ ] 出展 `distribution_change` -> 会計返信/完了 -> 出展/本部確認
- [ ] 出展 `damage_report` -> 物品返信/完了 -> 出展/本部確認
- [ ] 本部返却 + 施錠確認依頼 -> 巡回完了 -> 本部反映

---

## 12. ドキュメント更新タスク

- [ ] `docs/プロジェクト仕様書_supabaseテーブル概要.md` に新規テーブル章を追記（追加した場合）
- [ ] `docs/企画管理部統合システム.md` に実装進捗チェック欄を追記
- [ ] `docs/database/*.sql` にDDL/RLS/RPCを分割保存
- [ ] 初期データ投入手順（roles.permissions 含む）を文書化

---

## 13. 実装順序（1つずつ依頼用）

1. フェーズ5.1（既存3テーブル/RLS実体確認）
2. フェーズ5.2（theme_mode差異の方針確定）
3. フェーズ6（権限/Drawer基盤）
4. フェーズ7（DB拡張DDL）
5. フェーズ8（RPC/通知）
6. フェーズ9.5（item16 出展）
7. フェーズ9.1（item12 巡回）
8. フェーズ9.2（item13 本部）
9. フェーズ9.3（item14 会計）
10. フェーズ9.4（item15 物品）
11. フェーズ10（RLS拡張）
12. フェーズ11（テスト）
13. フェーズ12（ドキュメント）

実装ルール:
- [ ] 1機能を実装するごとに、関連テストを実行して動作確認が取れてから次の機能へ進む

---

## 14. 着手前確認事項

- [ ] `@Agent.md` 指示は `docs/AI用プロンプト/AGENTS.md` を採用するか最終確認
- [ ] item番号とロール対応（12〜16）を最終承認
- [ ] Supabase対象環境（本番/検証）を確定
- [ ] 本部UIを単一画面に集約するか内部サブ画面に分割するか確定
- [ ] 添付ファイル要件（容量/形式/保存期間）を確定
