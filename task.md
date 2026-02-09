# 企画管理統合システム 実装タスク（item12〜item16）

最終更新: 2026-02-09

## 0. 目的と前提

- 目的:
  - `docs/企画管理部統合システム.md` の要件を、既存アプリへ段階的に実装する。
  - `src/features/item1〜item10` と同じ管理単位で `item12〜item16` を追加する。
- この `task.md` は「実装前の詳細タスク整理」のみ。コード実装は含まない。
- 既存DBを壊さず再利用する方針:
  - 既存テーブル・カラム・RLS・RPCは変更最小にする。
  - 不足分は「追加（Additive）」で対応し、破壊的変更は避ける。

## 1. 画面とitem番号の対応（実装方針）

以下を暫定マッピングとして進める。

- `item12`: 巡回（Patrol）
- `item13`: 本部（HQ）
- `item14`: 会計（Accounting）
- `item15`: 物品（Property）
- `item16`: 企画者/出展（Exhibitor）

補足:
- 既存で `item11` は `JimuShift`（当日部員）として運用済み。
- 上記マッピングを変更する場合は、着手前に本ファイルを更新する。

## 2. 事前調査タスク（必須）

### 2.1 既存コード資産の再利用範囲を確定

- [ ] `src/navigation/DrawerNavigator.jsx` の追加対象を確定（`Item12〜Item16`）
- [ ] `src/navigation/components/CustomDrawerContent.jsx` の項目生成ロジック拡張方針を確定
- [ ] `src/services/supabase/permissionService.js` の権限名（`permissions.screens`）拡張方針を確定
- [ ] `src/services/supabase/userService.js` のロール/プロフィール取得仕様を流用する前提を確定
- [ ] 共通UIの流用候補を確定
  - `src/shared/components/ThemedHeader.jsx`
  - `src/shared/components/ScreenErrorBoundary.jsx`
  - `src/shared/hooks/useTheme.js`

### 2.2 既存DB形状の棚卸し（最優先）

- [ ] 現在利用中Supabaseのスキーマ一覧を取得
  - `public` テーブル
  - 既存RPC
  - RLSポリシー
- [ ] 既存テーブルと仕様書テーブルの対応表を作成
  - 例: 既存 `tickets` があれば `support_tickets` の新規作成を回避
- [ ] 既存カラムとの差分を分類
  - そのまま利用
  - 別名マッピングで利用
  - 追加が必要
- [ ] 移行方針を確定
  - 破壊的変更禁止
  - `IF NOT EXISTS` / 追加DDL中心
  - 既存データ移行が必要ならバックフィル手順を先に定義

成果物:
- [ ] `docs/database/` 配下に差分設計メモ（またはSQLコメント）を残す

## 3. 共通ドメイン設計タスク

### 3.1 定数・型相当の整理（JS）

- [ ] チケット種別定義を作成
  - `emergency`
  - `rule_question`
  - `layout_change`
  - `distribution_change`
  - `damage_report`
  - `key_preapply`
  - `start_report`
  - `end_report`
- [ ] チケット状態定義を作成
  - `new` / `acknowledged` / `in_progress` / `waiting_external` / `resolved` / `closed`
- [ ] タスク種別定義を作成
  - `confirm_start` / `confirm_end` / `lock_check` / `emergency_support` / `routine_patrol`
- [ ] タスク状態定義を作成
  - `open` / `accepted` / `en_route` / `done` / `canceled`
- [ ] 通知ターゲット定義を作成
  - `accounting` / `property` / `none`

### 3.2 Supabaseサービス層の分割設計

- [ ] `tickets` 系サービス責務を定義
  - 一覧取得
  - 詳細取得
  - 作成
  - 状態更新
  - メッセージ投稿
- [ ] `patrol_tasks` 系サービス責務を定義
  - 一覧取得
  - 受諾（向かいます）
  - 完了（結果投稿）
- [ ] `keys` 系サービス責務を定義
  - 予約
  - 貸出/返却
  - 施錠確認タスク作成
- [ ] `notifications` 系サービス責務を定義
  - 新規通知ログ
  - 対象ロール/部署別取得

### 3.3 ロール判定ヘルパー

- [ ] 既存 `permissions.screens` ベースを維持しつつ、以下の画面権限名を追加
  - `item12`（巡回）
  - `item13`（本部）
  - `item14`（会計）
  - `item15`（物品）
  - `item16`（企画者）
- [ ] ロール表示名と画面アクセスの対応表を作成
  - `HQ`
  - `Patrol`
  - `Accounting`
  - `Property`
  - `Exhibitor`

## 4. DB/RPC/通知 基盤タスク（差分実装前提）

### 4.1 テーブル差分適用（存在しない場合のみ追加）

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
- [ ] 必要なら `organizations` / `user_organizations` / `locations` / `events` / `event_organizations`

### 4.2 インデックス・制約

- [ ] チケット番号・タスク番号のユニーク制約
- [ ] 検索頻度の高い列のインデックス
  - `ticket_status`, `ticket_type`, `created_at`
  - `task_status`, `task_type`, `assigned_to`, `created_at`
- [ ] FK整合性の確認（削除時の挙動を運用に合わせる）

### 4.3 RPC

- [ ] `rpc_create_ticket_and_auto_tasks(ticket_payload)`
- [ ] `rpc_return_key_and_create_lock_task(loan_id, create_lock_task, optional_assignee)`
- [ ] `rpc_accept_task(task_id, patrol_user_id)`
- [ ] `rpc_complete_task(task_id, result_payload)`

### 4.4 RLS（ロール別）

- [ ] Exhibitor: 自団体チケットのみ閲覧/作成/追記
- [ ] HQ: 全件閲覧/更新/割当
- [ ] Accounting: `distribution_change` かつ通知対象範囲
- [ ] Property: `damage_report` かつ通知対象範囲
- [ ] Patrol: 未割当 + 自分担当タスクの閲覧、受諾・完了

### 4.5 Edge Function/通知連携

- [ ] `functions/v1/notify` の契約を定義
- [ ] 必須通知トリガを定義
  - `distribution_change` → 会計
  - `damage_report` → 物品
  - `start_report` / `end_report` → 巡回タスク生成通知（必要に応じて）
- [ ] 送信結果を `notifications` に記録

## 5. item12: 巡回（Patrol）タスク

### 5.1 画面構成

- [ ] `src/features/item12/` を作成
- [ ] `Item12Screen.jsx` で巡回用ホームを提供
- [ ] 必要に応じて内部タブ/セクションを実装（以下機能を1画面内で完結可）
  - タスク一覧
  - タスク詳細（向かいます/完了）
  - 巡回チェック入力
  - 未巡回アラート
  - 企画評価入力

### 5.2 機能要件

- [ ] 未割当タスクと自分担当タスクを一覧表示
- [ ] タスク受諾（`open -> accepted`）
- [ ] タスク完了（結果コード、メモ、写真任意）
- [ ] 巡回チェック送信（場所、種別、メモ）
- [ ] 未巡回閾値超過の表示
- [ ] 企画評価を承認待ち状態で登録

### 5.3 受け入れ条件

- [ ] 「向かいます」連打で二重受諾されない
- [ ] 完了時に `done_at` と結果が必ず記録される
- [ ] 通信失敗時に再試行導線がある

## 6. item13: 本部（HQ）タスク

### 6.1 画面構成（設置型UI）

- [ ] `src/features/item13/` を作成
- [ ] `Item13Screen.jsx` で本部統合画面を提供
- [ ] 主要ブロックを表示
  - 新着チケット
  - 遅延チケット/タスク
  - 施錠確認待ち
  - 鍵状況
  - 巡回状況
  - 無線ログ

### 6.2 機能要件

- [ ] チケット一覧/詳細（返信、状態更新、担当割当）
- [ ] 巡回タスク一覧/詳細（割当、結果確認）
- [ ] 鍵返却処理と施錠確認タスク作成
- [ ] 評価承認/差戻し
- [ ] 会計/物品対応状況の追跡と再通知

### 6.3 受け入れ条件

- [ ] 開始/終了報告チケットから紐づく巡回タスクの進捗が確認できる
- [ ] 返却処理時に `lock_check` 作成有無を選択できる
- [ ] 主要一覧表示が実運用データ量でも破綻しない

## 7. item14: 会計（Accounting）タスク

### 7.1 画面構成

- [ ] `src/features/item14/` を作成
- [ ] `Item14Screen.jsx` で会計Inboxを提供
- [ ] 対象は `distribution_change` のみ

### 7.2 機能要件

- [ ] 一覧（未読/対応中/完了）
- [ ] 詳細（本文、返信スレッド、添付）
- [ ] 回答投稿
- [ ] 対応メモ保存
- [ ] 完了更新

### 7.3 受け入れ条件

- [ ] 会計ロールで対象外チケットが見えない
- [ ] 回答が出展・本部双方から参照できる

## 8. item15: 物品（Property）タスク

### 8.1 画面構成

- [ ] `src/features/item15/` を作成
- [ ] `Item15Screen.jsx` で物品Inboxを提供
- [ ] 対象は `damage_report` のみ

### 8.2 機能要件

- [ ] 一覧（未読/対応中/完了）
- [ ] 詳細（写真中心、返信スレッド）
- [ ] 回答投稿
- [ ] 対応メモ保存
- [ ] 完了更新

### 8.3 受け入れ条件

- [ ] 物品ロールで対象外チケットが見えない
- [ ] 画像添付ありチケットを安定表示できる

## 9. item16: 企画者/出展（Exhibitor）タスク

### 9.1 画面構成

- [ ] `src/features/item16/` を作成
- [ ] `Item16Screen.jsx` で出展向けホームを提供
- [ ] 以下操作を1画面内セクションまたは内部画面で提供
  - チケット一覧
  - チケット新規作成
  - チケット詳細/追記
  - 企画開始/終了報告
  - 鍵事前申請

### 9.2 機能要件

- [ ] 新規チケット作成（全種別）
- [ ] `distribution_change` 作成時に会計通知対象になる
- [ ] `damage_report` 作成時に物品通知対象になる
- [ ] `start_report` / `end_report` 送信
- [ ] 自団体チケットのみ表示

### 9.3 受け入れ条件

- [ ] 開始/終了報告から巡回タスク自動生成が確認できる（RPC経由）
- [ ] 出展側で他団体データへアクセス不可

## 10. ナビゲーション/権限タスク

- [ ] `DrawerNavigator` に `Item12〜Item16` を追加
- [ ] `CustomDrawerContent` の項目数を `16` へ拡張
- [ ] ラベル定義を追加
  - `項目12: 巡回`
  - `項目13: 本部`
  - `項目14: 会計`
  - `項目15: 物品`
  - `項目16: 企画者`
- [ ] 画面名マッピング/権限名マッピングを追加
- [ ] 既存ロールの `permissions.screens` 更新手順を定義

## 11. テスト・検証タスク

### 11.1 単体/結合観点

- [ ] サービス層の正常系/異常系
- [ ] RPC呼び出し失敗時のUI挙動
- [ ] 権限境界（ロール別データ可視範囲）

### 11.2 E2Eシナリオ（最重要）

- [ ] 出展が `start_report` 作成 → 巡回で確認タスク受諾/完了 → 本部で結果確認
- [ ] 出展が `distribution_change` 作成 → 会計が返信/完了 → 出展と本部で確認
- [ ] 出展が `damage_report` 作成 → 物品が返信/完了 → 出展と本部で確認
- [ ] 本部が鍵返却処理 + 施錠確認依頼 → 巡回完了 → 本部反映

### 11.3 画面確認

- [ ] スマホ表示（巡回/会計/物品/企画者）
- [ ] PC表示（本部）
- [ ] テーマ切替時の可読性崩れがない

## 12. ドキュメント更新タスク

- [ ] `docs/プロジェクト仕様書.md` との差分整理（テーマ機能中心の旧仕様との整合）
- [ ] `docs/企画管理部統合システム.md` に実装進捗チェック欄を追加
- [ ] DB変更を `docs/database/*.sql` に分割して記録
- [ ] 初期データ投入手順（roles/permissions/organizations/locations/events/keys）を文書化

## 13. 実装順序（1つずつ進めるための推奨）

1. 事前調査（2.1, 2.2）
2. 共通ドメイン設計（3.x）
3. DB/RPC/RLS/通知（4.x）
4. ナビゲーション/権限の枠組み（10）
5. `item16` 企画者（入力起点を先に作る）
6. `item12` 巡回（起点から派生するタスク処理）
7. `item13` 本部（監視・統合）
8. `item14` 会計
9. `item15` 物品
10. テスト・E2E（11）
11. ドキュメント整備（12）

## 14. 保留事項（着手前に確認）

- [ ] `@Agent.md` 指示の対象は `docs/AI用プロンプト/AGENTS.md` として扱うか最終確認
- [ ] item番号とロール対応（12〜16）の最終確定
- [ ] Supabase既存環境（本番/検証）のどちらを基準にDB差分を作るか確定
- [ ] 本部画面の実装範囲（1画面集約 or 内部サブ画面分割）を確定
- [ ] 添付アップロード仕様（Storage運用、容量制限、ファイル形式）を確定
