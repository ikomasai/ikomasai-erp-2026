# 企画者サポートページ 実装タスク

## shared非変更 改善タスク（2026-02-16）

### 方針
- `src/shared` は編集しない
- `item16` と `support_tickets` 取得ロジックを中心に、レビュー指摘が出やすい仕様ズレと入力揺れを先に是正する

### 実装タスク
- [x] `item16` 対象企画の選択導線を改善
  - 企画名/場所の検索入力を追加
  - 未検索時の候補上限を `12` → `30` に拡張し、表示制限中の案内を追加
- [x] `item16` 鍵事前申請の希望時刻入力を厳密化
  - 受理形式を `HH:mm` または `YYYY-MM-DD HH:mm` に統一
  - 画面送信前バリデーションとサービス層バリデーションを両方実装
  - 全角コロン入力の正規化を追加
- [x] 本部（HQ）の連絡案件取得を仕様準拠へ修正
  - HQは `notify_target` 条件で絞らず全件対象とする
- [x] ビルド確認
  - `npm run build`

## 管理部統合システム 再検証タスク（2026-02-12）

### MCP再検証結果（`docs/管理部統合システム仕様書.md`照合）
- [x] `item12`〜`item16` 画面遷移と主要UIは表示可能
- [x] `item13` 本部画面の連絡案件対応・鍵貸出/返却UIは動作
- [x] `item14` 会計対応（対象絞り込み・返信・状態更新UI）は動作
- [x] `item15` 物品対応（対象絞り込み・返信・状態更新UI）は動作
- [x] `item16` 4タブ入力、履歴、回答閲覧は動作
- [x] `start_report` / `end_report` の巡回タスク自動生成（`rpc_create_ticket_and_auto_tasks`）を修正
- [x] 通知機能（`develop`実装）の取り込みと業務フロー連携を反映

### 今回の実装タスク
- [x] `develop` から通知関連ファイルを同期
  - `src/shared/services/notificationService.js`
  - `src/shared/services/webPushService.js`
  - `src/shared/utils/serviceWorker.js`
  - `src/shared/contexts/AuthContext.js`
  - `supabase/functions/*` と `db/migrations/20260209~11_*`
- [x] `item16` の開始/終了報告RPC失敗を修正
  - `ticket_no` をRPCペイロードに含める
- [x] 通知機能を `item12`〜`item16` の業務フローへ接続
  - 連絡案件作成時通知
  - 巡回タスク受諾/完了通知
  - 鍵返却時の施錠確認タスク作成通知
- [x] 起動不良の恒久対応
  - `START_SERVER.sh` の固定パスを削除し、スクリプト配置ディレクトリ基準に修正
- [x] `item12` 未巡回アラート閾値設定UIを追加
- [x] `item12` 企画評価入力（`evaluation_checks`）と承認待ち導線を追加
- [x] `item13` 本部ダッシュボード（新着/遅延/巡回/無線）を追加
- [x] `item13` 巡回タスク割当UIを追加
- [x] `item13` 評価承認導線（承認/差戻し/却下）を追加
- [x] `item13` 部署再通知導線（会計/物品）を追加
- [x] `item16` 添付入力（実ファイルアップロード、5MB制限）を追加
- [x] `item16` `event_id` 必須化と企画マスタ選択UIを追加
- [x] `item16` 回帰修正（緊急送信時の `requestedAt is not defined` を解消）
- [x] `item16` 連絡詳細で追記投稿（`ticket_messages`）を追加
- [x] `item16` 連絡詳細で添付表示/追加（`ticket_attachments`）を追加
- [x] `item16` 質問系統にFAQ/入力ヒント（自己解決導線）を追加

### まだ未実装（次フェーズ）
- 現時点では該当なし（`item15` 破損写真閲覧導線まで実装済み）

### 未整備テーブル対応（2026-02-12）
- [x] `db/migrations/20260209_create_notifications.sql` をMCPで適用
- [x] 未整備テーブルDDL作成・適用（`keys` / `key_reservations` / `patrol_checks` / `radio_logs`）
  - `db/migrations/20260212_create_missing_management_tables.sql`
- [x] `item12` に巡回チェック登録（`patrol_checks`）を追加
- [x] `item12` に未巡回アラート一覧（固定90分閾値）を追加
- [x] `item13`（本部）に無線ログ入力/一覧（`radio_logs`）を追加
- [x] `item16` 鍵事前申請時に `key_reservations` へ保存
- [x] `item13` 本部鍵管理で鍵予約の承認/却下操作を追加

## 目的
`item16（企画者サポート）` を先に見た目から実装し、その後に Supabase の DB/サービスを接続する。

## 進捗（2026-02-11）
- [x] フェーズ1: UI雛形（下部タブ切替、4フォーム、企画名/企画場所ローカル保存）
- [x] フェーズ2: DB設計SQL追加（`docs/database/004_create_support_tickets.sql`）
- [x] フェーズ3: サービス層実装（`exhibitorSupportService`）
- [x] フェーズ4-1: UI送信処理をDB接続
- [x] フェーズ4-2: 自分の最近の連絡案件一覧（最小）
- [x] フェーズ5: Supabase本番データでの総合動作確認
  - 4カテゴリ（質問/緊急/鍵申請/開始報告）のINSERT確認
  - ticket_no必須不整合を修正
    - サービス側採番追加
    - DB側デフォルト採番追加（`docs/database/005_support_tickets_ticket_no_default.sql`）
  - 未認証（anon）INSERTがRLSで拒否されることを確認
  - 検証用データは削除済み

## 前提・制約
- 先に UI を完成させる（DB接続は後）
- 対象機能は以下の4つ
  - 質問系統
    - 企画のルール変更
    - 配置図の変更
    - 会計の商品配布基準の変更
    - 物品の破損報告（写真なし）
  - 緊急呼び出し
  - 鍵の事前申請
  - 企画の開始/終了報告
- 企画名・企画場所は保存できるようにする
- `src/shared` は編集しない

---

## フェーズ1: UI雛形（DB未接続）

### 1-1. 画面レイアウト（item16）
- `src/features/item16/screens/Item16Screen.jsx` を実装
- 上部: タイトル + 共通入力
  - 企画名
  - 企画場所
- 中央: 選択中機能の入力フォーム
- 下部: iOS風の切替UI（4ボタン）
  - 質問系統
  - 緊急呼び出し
  - 鍵の事前申請
  - 開始/終了報告

### 1-2. 各フォームの入力項目（UIのみ）
- 質問系統
  - 種別（ルール変更 / 配置図変更 / 会計配布基準変更 / 物品破損）
  - 詳細
- 緊急呼び出し
  - 緊急内容
  - 優先度（高固定でも可）
- 鍵の事前申請
  - 対象鍵・教室
  - 希望時刻
  - 理由
- 開始/終了報告
  - 開始 or 終了
  - メモ（任意）

### 1-3. 保存（UI段階）
- 企画名・企画場所はローカル保存（`AsyncStorage`）で保持
- 画面再表示時に復元

### 1-4. 完了条件
- 下部4ボタンでフォーム切替できる
- 企画名・企画場所が再起動後も保持される
- 送信ボタンはダミー動作（console/log または alert）

---

## フェーズ2: DB設計（Supabase）

### 2-1. 利用テーブル方針
- `support_tickets` を中心に利用（仕様書準拠）
- `ticket_type` を使って4機能を表現
  - `rule_question`
  - `emergency`
  - `key_preapply`
  - `start_report` / `end_report`

### 2-2. 必要カラム確認
- 最低限必要:
  - `ticket_type`
  - `title`
  - `description`
  - `priority`
  - `location_id`（またはテキスト運用の暫定項目）
  - `event_id`（開始/終了報告）
  - `created_by`
  - `org_id`
- 不足があれば migration 作成

### 2-3. RLS確認
- Exhibitor は自団体の案件のみ作成/閲覧できること
- HQ/Accounting/Property の閲覧範囲も仕様書に合わせる

---

## フェーズ3: サービス層実装

### 3-1. 新規サービス作成
- 追加先: `src/features/item16/services/exhibitorSupportService.js`
- 実装関数（案）
  - `createQuestionContact(payload)`
  - `createEmergencyContact(payload)`
  - `createKeyPreapply(payload)`
  - `createEventStatusReport(payload)` // 開始/終了

### 3-2. 入力バリデーション
- 必須項目チェック
- 種別ごとの入力ルールチェック
- エラーメッセージ統一

---

## フェーズ4: UIとDB接続

### 4-1. item16送信処理接続
- フォーム送信でサービスを呼ぶ
- 成功時:
  - 完了メッセージ表示
  - 必要項目リセット
- 失敗時:
  - エラー表示

### 4-2. 最低限の履歴表示
- 自分が送った案件の簡易一覧を追加（新着順）

---

## フェーズ5: 動作確認
- 4種別すべて送信できる
- 企画名・企画場所が保存/復元できる
- DBに正しい `ticket_type` で保存される
- RLS違反が出ない

---

## 実装順（着手順）
1. `item16` の iOS風下部切替UI
2. 企画名/企画場所のローカル保存
3. Supabaseテーブル/カラム/RLS確認
4. `exhibitorSupportService` 実装
5. 送信処理接続
6. 履歴表示（最小）

---

## 連絡回答フロー実装タスク（2026-02-11）

### 目的
- 質問/緊急などの連絡案件を、担当画面（本部・会計・物品）で閲覧できるようにする
- 担当者が連絡案件に回答できるようにする
- 回答内容を企画者（item16）側で確認できるようにする

### フェーズ
- [x] フェーズA: 共通サービス実装
  - `support_tickets` 一覧取得（本部/会計/物品向けフィルタ）
  - `ticket_messages` 一覧取得
  - `ticket_messages` 返信投稿
  - `support_tickets.ticket_status` 更新（対応中/解決済み）
- [x] フェーズB: 本部サポート（item13）実装
  - 本部対象案件一覧（`notify_target = hq` を中心）
  - 案件詳細表示
  - 回答投稿 + ステータス更新
- [x] フェーズC: 会計対応（item14）実装
  - 会計対象案件一覧（`notify_target = accounting`）
  - 案件詳細表示
  - 回答投稿 + ステータス更新
- [x] フェーズD: 物品対応（item15）実装
  - 物品対象案件一覧（`notify_target = property`）
  - 案件詳細表示
  - 回答投稿 + ステータス更新
- [x] フェーズE: 企画者サポート（item16）回答閲覧実装
  - 自分が送信した案件を選択
  - 対応メッセージ（回答）スレッド表示
  - ステータス表示（新規/対応中/解決済み）
- [x] フェーズF: 動作確認
  - ビルド確認
  - 質問→担当回答→企画者表示の往復確認

### 制約
- `src/shared` は編集しない

---

## 緊急呼び出し（巡回対応）実装メモ（2026-02-11）
- [x] `item12` を緊急呼び出し対応画面へ変更
- [x] 巡回向け緊急案件一覧取得（`ticket_type = emergency`）
- [x] 進捗操作「向かいます」実装（メッセージ投稿 + `in_progress` 更新）
- [x] 進捗操作「完了」実装（メッセージ投稿 + `resolved` 更新）
- [x] 巡回メモの追記送信実装
- [x] 実DB往復テスト（企画者送信 → 巡回対応 → 企画者確認）実施

---

## 企画開始/終了報告（巡回・本部連携）実装タスク（2026-02-12）

### 目的
- 企画者（`item16`）が送信した `start_report` / `end_report` を、巡回（`item12`）と本部（`item13`）で扱えるようにする
- 巡回が「向かいます」「確認完了」を実行すると、本部と企画者の履歴で追えるようにする

### フェーズ
- [x] フェーズ1: 巡回向け取得サービスを拡張
  - `supportTicketService` に巡回対象（緊急＋開始報告＋終了報告）一覧取得を追加
- [x] フェーズ2: 巡回画面（item12）を拡張
  - 一覧対象を「緊急のみ」から「巡回対応案件」に変更
  - 種別表示（緊急/開始報告/終了報告）を追加
  - 種別ごとの「向かいます」「完了」文言を切り替え
- [x] フェーズ3: 本部画面（item13共通UI）を改善
  - 案件種別の日本語表示を追加
  - 開始/終了報告に対して「巡回確認待ち」ステータス操作を追加
- [x] フェーズ4: ビルド確認
  - `npm run build` でエラーなしを確認
- [ ] フェーズ5: 実機往復確認
  - 企画者で開始/終了報告送信 → 巡回で向かいます/完了 → 本部/企画者で履歴確認

---

## 巡回タスク独立モデル + 鍵返却施錠確認 + 会計/物品完成（2026-02-12）

### 目的
- 巡回対応を `support_tickets` 直参照ではなく `patrol_tasks` モデルで運用できるようにする
- 企画開始/終了報告から巡回タスクを自動生成するRPCを導入する
- 鍵返却時に `lock_check` タスクを生成し、巡回結果を反映できるようにする
- 会計/物品画面を運用可能な完成度まで引き上げる（物品は写真対応なし）

### フェーズ
- [x] フェーズ1: DBマイグレーション追加
  - `patrol_tasks`, `patrol_task_results`, `key_loans` を追加
  - 関連インデックス、RLS、Realtime対象を追加
- [x] フェーズ2: RPC実装
  - `rpc_create_ticket_and_auto_tasks(ticket_payload)`
  - `rpc_accept_task(task_id, patrol_user_id)`
  - `rpc_complete_task(task_id, result_payload)`
  - `rpc_return_key_and_create_lock_task(loan_id, create_lock_task, optional_assignee, return_user_id)`
- [x] フェーズ3: サービス層実装
  - `patrolTaskService`（一覧/受諾/完了/結果）
  - `keyLoanService`（貸出一覧/貸出登録/返却+施錠確認依頼）
- [x] フェーズ4: 企画者画面連携
  - 開始/終了報告をRPC経由に変更（タスク自動生成）
- [x] フェーズ5: 巡回画面改修（item12）
  - `patrol_tasks` 一覧ベースへ切替
  - 「向かいます/完了」をタスク状態で管理
  - タスク種別ごとの結果コード入力を追加（開始/終了/施錠）
- [x] フェーズ6: 本部画面改修（item13経由）
  - 鍵の貸出登録と返却処理を追加
  - 返却時に施錠確認タスク作成を選択可能にする
  - 巡回結果（施錠済/未施錠/確認不可）を確認できる
- [x] フェーズ7: 会計/物品画面完成
  - 一覧フィルタ（未対応/対応中/完了）
  - 返信 + 対応メモ + 完了更新の運用導線を明確化
  - 物品画面は写真アップロード機能を実装しない
- [x] フェーズ8: ビルド確認
  - `npm run build` 通過

### 未完了
- [x] SupabaseへのSQL適用（MCP）
  - `20260209_create_notifications.sql` / `20260212_create_missing_management_tables.sql` 適用済み
