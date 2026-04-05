# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 必読ドキュメント

コードを書く前に必ず確認:
- `docs/AI用プロンプト/AGENTS.md` — AI 共通入口。必読順と現在の編集対象
- `docs/アプリ理解.md` — アプリ全体の理解を集約した基準ドキュメント
- `docs/管理部統合システム仕様書.md` — 現在の主開発対象である企画管理部統合システムの仕様
- `docs/プロジェクト仕様書.md` — 機能要件・画面設計・DB設計・API設計
- `docs/AI用プロンプト/supabaseスキーマ参照.md` — 全49テーブルの詳細スキーマ
- `.mcp.json` — 利用可能なMCPサーバー設定（下記「MCP サーバー活用ガイド」参照）

現在ここで主に開発しているのは企画管理部統合システムであり、通常編集対象は `item12`〜`item16` と `src/features/support`。

## 技術スタック

- **言語:** JavaScript のみ（TypeScript 禁止。`supabase/functions/` のみ例外的にTS可）
- **フロントエンド:** React Native (Expo SDK 54) — Web/iOS/Android対応
- **バックエンド:** Supabase（認証・DB・Edge Functions）
- **スタイリング:** StyleSheet のみ（Tailwind/styled-components/NativeWind 禁止）
- **その他:** Google Apps Script（スプレッドシート連携）

## 開発コマンド

```bash
npm start              # Expo 開発サーバー起動
npm run web            # Web版起動 + 地震モニター同時起動
npm run web-only       # Web版のみ起動
npm run ios            # iOS起動
npm run android        # Android起動
npm run build          # Web版ビルド（expo export --platform web）
```

環境変数は `.env.example` をコピーして `.env` を作成。`EXPO_PUBLIC_` プレフィックスがクライアント側で参照可能。

## アーキテクチャ

### エントリーポイント → ナビゲーション

```
index.js → App.js → AuthProvider → ThemeProvider → AppNavigator
  └→ 認証済み: DrawerNavigator（企画・屋台一覧, Item2〜10, Item12〜16, JimuShift, Settings, Admin, Notifications）
  └→ 未認証: LoginScreen
  └→ 初回ログイン: PasswordChangeModal
```

### 機能モジュール構造（Feature-based）

各機能は `src/features/{機能名}/` 配下に独立して配置：
- `screens/` — 画面コンポーネント（Drawer.Screenに対応）
- `components/` — その機能専用のUIパーツ
- `services/` — Supabase API通信（select/insert/update/delete命名）
- `hooks/` — カスタムフック
- `constants.js` — 機能固有の定数

現在の機能一覧: 01_Events&Stalls_list, item2〜item10, item12〜item16, auth, support, jimu-shift, settings, admin, notifications

### 共有レイヤー

- `src/shared/contexts/` — AuthContext（認証状態管理）、ThemeContext（テーマ管理）
- `src/shared/components/` — ScreenErrorBoundary（全画面をError Boundaryでラップ）
- `src/shared/services/` — notificationService, webPushService, themeSettingsService
- `src/services/supabase/` — client.js（Supabaseクライアント）、authService, userService, permissionService

### Supabase Edge Functions（12個）

| slug | 目的 | 認証 |
|------|------|------|
| `dispatch-notification` | プッシュ通知配信 | Bearer / x-internal-notify-token |
| `push-subscription` | Web Push 購読管理 | Bearer + supabase.auth.getUser |
| `verify-admin-password` | 管理者パスワード検証 | 独自検証 |
| `update-password` | パスワード更新 | 独自検証 |
| `import-organizations` | 団体データ一括取込 | 独自検証 |
| `import-projects` | 企画データ一括取込 | 独自検証 |
| `digital_tickets` | デジタルチケット処理 | 独自検証 |
| `delete-submission` | 常設内提出物削除 | 独自検証 |
| `review` | 常設内レビュー | 独自検証 |
| `submit` | 常設内提出 | 独自検証 |
| `sandbox` | 常設内サンドボックス | 独自検証 |
| `test-drive` | テストドライブ | 独自検証 |

### レスポンシブ対応

DrawerNavigator でブレークポイント768pxを基準に、PC版は常時サイドバー表示、モバイル版はハンバーガーメニュー切り替え。

## コーディング規約

### ファイル命名

| 種類 | 形式 | 拡張子 | 例 |
|---|---|---|---|
| コンポーネント | PascalCase | .jsx | `EventCard.jsx` |
| サービス | camelCase | .js | `eventService.js` |
| フック | useCamelCase | .js | `useEvents.js` |
| ユーティリティ | camelCase | .js | `validation.js` |

### 必須ルール

- 全ての関数にJSDoc形式の**日本語コメント**を書く。変数にもコメントを付ける
- サービス関数名はSupabase操作に合わせる: `selectXxx`, `insertXxx`, `updateXxx`, `deleteXxx`
- ブール変数は `is`, `has`, `can`, `should` で始める
- 定数は UPPER_SNAKE_CASE
- `var` 禁止（`const`/`let` のみ）
- マジックナンバー禁止（定数化する）
- try-catch でエラーを握りつぶさない

### 新しい画面を追加する手順

1. `src/features/{機能名}/screens/` に画面コンポーネントを作成
2. `src/navigation/DrawerNavigator.jsx` でインポート → `createWrappedScreen()` でError Boundaryラップ → `<Drawer.Screen>` 追加
3. `src/navigation/components/CustomDrawerContent.jsx` にサイドバーメニュー項目を追加

## 連携ポイント

- **通知:** `src/shared/services/notificationService.js` → `supabase/functions/dispatch-notification/`
- **Push購読:** `src/shared/services/webPushService.js` → `supabase/functions/push-subscription/`（POST/DELETE + Bearer）
- **スプレッドシート:** `src/services/gas/` + `EXPO_PUBLIC_SHIFT_SPREADSHEET_ID`（ID直書き禁止）
- **地震監視:** `src/services/earthquakeMonitor.js` / `earthquakeDemo.js`（`npm run web` 並列起動前提）

## セキュリティ

- 環境変数は `.env.example` 基準。クライアント参照は `EXPO_PUBLIC_` プレフィックス付きのみ
- 秘密値（`WEB_PUSH_VAPID_PRIVATE_KEY`, `INTERNAL_NOTIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`）はクライアントコードに置かない
- Edge Functions の認証要件を維持: 無認証エンドポイント追加禁止
- `.env` ファイルを直接読み取らない

## MCP サーバー活用ガイド

本プロジェクトには7つのMCPサーバーが設定済み（`.mcp.json` 参照）。適切な場面で積極的に活用すること。

### 使い分け表

| MCP サーバー | 用途 | 使用タイミング |
|---|---|---|
| `supabase` | DB管理・テーブル参照・SQL実行・Edge Functions管理 | テーブル構造の確認、RLSポリシーの確認、SQLの実行、スキーマ変更時 |
| `context7` | ライブラリドキュメント検索 | React Native / Expo SDK / Supabase JS / React Navigation のAPI仕様を調べる時 |
| `sequential-thinking` | 段階的思考・複雑な問題分解 | 複数テーブルにまたがる設計、アーキテクチャ判断、バグの原因調査、大規模リファクタリング計画 |
| `playwright` | ブラウザ自動テスト | Web版のUI動作確認、E2Eテスト実行、レスポンシブ表示の検証 |
| `chrome-devtools` | ブラウザデバッグ・ネットワーク監視 | Web版の実行時デバッグ、API通信の確認、パフォーマンス計測 |
| `drawio` | 図表作成 | アーキテクチャ図、画面遷移図、ER図、シーケンス図の作成・更新 |
| `serena` | IDEコード支援 | コードベース横断的な検索・リファクタリング支援 |

### 使用ルール

- **DB操作**: `docs/AI用プロンプト/supabaseスキーマ参照.md` を読んだ上で、最新状態の確認には `supabase` MCP の `list_tables` / `execute_sql` を使う
- **API調査**: ライブラリのバージョン固有の仕様は `context7` で公式ドキュメントを参照してから実装する。推測でAPIを使わない
- **複雑な設計判断**: 3つ以上のファイルに影響する変更、または複数テーブルにまたがるクエリ設計には `sequential-thinking` で思考を整理してから着手する
- **UI検証**: Web版の動作確認には `playwright` または `chrome-devtools` を使い、目視だけに頼らない

## Git 運用

- コミットメッセージ形式: `[種類] 変更内容`（種類: `add`, `fix`, `update`, `remove`, `docs`）
- main/develop への直接コミット禁止。機能ブランチからPRを作成

## 実装ワークフロー

1. **仕様確認** → `docs/プロジェクト仕様書.md` の該当セクション
2. **探索** → 関連ファイル・既存パターン・ナビゲーション構造を把握
   - DB関連: `supabase` MCP でテーブル構造・RLSを確認
   - ライブラリAPI: `context7` MCP で公式ドキュメントを参照
3. **計画** → 変更ファイル一覧・新規ファイル命名・DB変更計画
   - 複雑な変更: `sequential-thinking` MCP で段階的に整理
   - 3ファイル以上の変更: 計画を提示し承認を得てから実装
4. **実装** → 規約遵守・エラーハンドリング・1機能内完結
   - 全関数に JSDoc 日本語コメントを記載（処理内容・引数・戻り値）
   - 変数宣言にもコメントを付与し、人間がコードリーディングで処理を理解できる状態にする
   - 複雑なロジックにはインラインコメントで「なぜ」を説明
5. **検証** → `playwright` / `chrome-devtools` MCP でWeb版の動作確認
   - DB操作の検証: `supabase` MCP で `execute_sql` を使いデータ状態を確認
   - Edge Function のテスト: デプロイ状態を確認後、エンドポイント疎通テスト
6. **コミット** → `[add/fix/update/remove/docs]` 形式・論理単位で原子的

### Plan Mode（計画モード）の運用

以下のケースでは、コードを書く前に必ず計画を立てて提示し、承認を得てから実装に進むこと：

- **新規画面の追加**（3ファイル以上の変更が必要）
- **DBスキーマ変更**（マイグレーション + サービス + ドキュメント更新が必要）
- **複数の機能モジュールにまたがる変更**
- **Edge Function の新規作成・大幅変更**
- **既存APIの破壊的変更**

計画には以下を含めること：
1. 変更対象ファイルの一覧（新規作成/既存変更を明示）
2. 変更の依存関係と実行順序
3. DBスキーマ変更がある場合はマイグレーションSQLの概要
4. 影響を受ける既存機能の特定
5. テスト・検証方法

計画なしに大規模変更を開始することを禁止する。

### Edge Function 変更時

1. `supabase/functions/{name}/index.ts` を編集
2. `_shared/cors.ts` の共通設定を確認
3. 認証要件（Bearer / x-internal-notify-token）を維持
4. デプロイ: `supabase functions deploy {name}`

### DB スキーマ変更時

1. `docs/AI用プロンプト/supabaseスキーマ参照.md` で現状確認
2. マイグレーション SQL 作成
3. RLS ポリシー設定を確認
4. 関連サービスファイルのクエリ更新
5. スキーマ参照ドキュメントを更新

## DB スキーマ概要（49 テーブル）

詳細カラム情報は `docs/AI用プロンプト/supabaseスキーマ参照.md` を参照。

- **認証・ユーザー (6):** roles, user_profiles, user_roles, organizations, user_organizations, departments
- **イベント・屋台・会場 (12):** events, event_dates, event_organizations, event_categorys, event_locations, stalls, stall_organizations, stall_categorys, stall_locations, locations, area_locations, time_slots
- **チケット・受付 (3):** tickets, ticket_logs, call_status
- **警備・安全 (9):** visitor_counts, suspicious_persons, emergency_logs, disaster_status, security_members, security_placements, patrol_tasks, patrol_task_results, patrol_checks
- **通知 (3):** notifications, notification_recipients, push_subscriptions
- **サポート (4):** support_tickets, ticket_messages, ticket_attachments, evaluation_checks
- **鍵管理 (3):** keys, key_loans, key_reservations
- **臨時ヘルプ (2):** rinji_help_recruits, rinji_help_applications
- **常設内 (8):** josenai_profiles, josenai_organizations, josenai_projects, josenai_submissions, josenai_media_specs, josenai_check_items, josenai_rule_documents, josenai_app_settings
- **シフト・その他 (2):** shift_change_requests, radio_logs
- **RLS OFF:** user_profiles, user_roles, notifications, notification_recipients, push_subscriptions, departments

## 禁止事項

1. コメントなしのコード
2. 命名規則の無視
3. 仕様書を読まずに実装
4. エラーハンドリング省略
5. `var` の使用
6. マジックナンバー
7. TypeScript（`supabase/functions/` 以外）
8. API キー・パスワードのハードコード
9. try-catch でのエラー握りつぶし
10. StyleSheet 以外のスタイリング（Tailwind / styled-components / NativeWind）
11. ライブラリAPIの推測使用（`context7` MCP で公式ドキュメントを確認すること）
12. 計画なしの大規模変更（3ファイル以上の変更は計画を提示すること）
