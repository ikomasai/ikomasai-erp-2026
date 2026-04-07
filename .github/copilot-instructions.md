---
applyTo: "**"
---

# 生駒祭 ERP 2026 — GitHub Copilot ガイド

## 必読ドキュメント

コードを書く前に次をこの順で確認する。

- `docs/AI用プロンプト/AGENTS.md` — AI 共通入口
- `docs/アプリ理解.md` — アプリ全体の理解を集約した基準ドキュメント
- `docs/管理部統合システム仕様書.md`（`item12`〜`item16` / `support` を触る場合は最優先）
- `docs/プロジェクト仕様書.md` — 機能要件・画面設計・DB設計
- `docs/AI用プロンプト/supabaseスキーマ参照.md` — 全49テーブルの詳細スキーマ
- `.mcp.json` — MCP サーバー設定

現在ここで主に開発しているのは企画管理部統合システムであり、通常編集対象は `item12`〜`item16` と `src/features/support`。

## 技術スタック

- **言語:** JavaScript のみ（TypeScript 禁止。`supabase/functions/` のみ例外的にTS可）
- **フロントエンド:** React Native (Expo SDK 54) — Web/iOS/Android対応
- **バックエンド:** Supabase（認証・DB・Edge Functions）
- **スタイリング:** StyleSheet のみ（Tailwind/styled-components/NativeWind 禁止）
- **その他:** Google Apps Script（スプレッドシート連携）

## アーキテクチャ

### エントリーポイント

```
index.js → App.js → GestureHandlerRootView → AuthProvider → ThemeProvider → TerminalProvider → FontLoaderProvider → AppNavigator
  └→ 認証済み: DrawerNavigator（企画・屋台一覧, TimeSchedule, Item2〜10, Item12〜16, JimuShift, Settings, Admin, Notifications）
  └→ 未認証: LoginScreen
  └→ 初回ログイン: PasswordChangeModal
```

### 機能モジュール構造

各機能は `src/features/{機能名}/` 配下に独立配置:
- `screens/` — 画面コンポーネント
- `components/` — 機能専用UIパーツ
- `services/` — Supabase API通信（select/insert/update/delete命名）
- `hooks/` — カスタムフック
- `constants.js` — 機能固有定数

機能一覧: 01_Events&Stalls_list, TimeSchedule, item2〜item10, item12〜item16, auth, support, jimu-shift, settings, admin, notifications

### 共有レイヤー

- `src/shared/contexts/` — AuthContext, ThemeContext, TerminalContext
- `src/shared/components/` — ScreenErrorBoundary, EmptyState, FontLoaderProvider, OfflineBanner, PlaceholderContent, SkeletonLoader, ThemedButton/Card/Header/Text, ToastMessage, icons/
- `src/shared/hooks/` — useTheme, useDraftStorage, usePushNavigationListener, useWebPushDebugListener
- `src/shared/services/` — notificationService, webPushService, themeSettingsService, edgeFunctionAuthService, supportWorkflowNotificationService
- `src/shared/utils/` — validation, notificationNavigation, organizationEventList, serviceWorker, themeTokens
- `src/services/supabase/` — client.js, authService, userService, permissionService, eventService, organizationService, organizationEventService, evaluationService, keyLoanService, keyMasterService, keyReservationService, patrolCheckService, patrolTaskService, prizeDistributionService, radioLogService, supportNotificationService, supportTicketService, ticketAttachmentService

### Edge Functions（3個）

| slug | 目的 | 認証 |
|------|------|------|
| `dispatch-notification` | プッシュ通知配信 | Bearer / x-internal-notify-token |
| `push-subscription` | Web Push 購読管理 | Bearer + supabase.auth.getUser |
| `push-delivery-receipt` | Push 配信レシート処理 | 独自検証 |

共通モジュール: `_shared/`（CORS設定等）

### レスポンシブ

DrawerNavigator でブレークポイント768px。PC版は常時サイドバー、モバイル版はハンバーガーメニュー。

## コーディング規約

### ファイル命名

| 種類 | 形式 | 拡張子 | 例 |
|---|---|---|---|
| コンポーネント | PascalCase | .jsx | `EventCard.jsx` |
| サービス | camelCase | .js | `eventService.js` |
| フック | useCamelCase | .js | `useEvents.js` |
| ユーティリティ | camelCase | .js | `validation.js` |

### 必須ルール

- 全関数にJSDoc形式の**日本語コメント**。変数にもコメント
- サービス関数: `selectXxx`, `insertXxx`, `updateXxx`, `deleteXxx`
- ブール変数: `is`, `has`, `can`, `should` で始める
- 定数: UPPER_SNAKE_CASE
- `var` 禁止（`const`/`let` のみ）
- マジックナンバー禁止（定数化する）
- try-catch でエラーを握りつぶさない

### 画面追加手順

1. `src/features/{機能名}/screens/` に画面コンポーネント作成
2. `src/navigation/DrawerNavigator.jsx` → `createWrappedScreen()` → `<Drawer.Screen>` 追加
3. `src/navigation/components/CustomDrawerContent.jsx` にメニュー項目追加

## 連携ポイント

- **通知:** `src/shared/services/notificationService.js` → `supabase/functions/dispatch-notification/`
- **Push購読:** `src/shared/services/webPushService.js` → `supabase/functions/push-subscription/`（POST/DELETE + Bearer）
- **スプレッドシート:** `src/services/gas/` + `EXPO_PUBLIC_SHIFT_SPREADSHEET_ID`（ID直書き禁止）
- **地震監視:** `src/services/earthquakeMonitor.js` / `earthquakeDemo.js`（`npm run web` 並列起動前提）

## セキュリティ

- 環境変数は `.env.example` 基準。クライアント参照は `EXPO_PUBLIC_` プレフィックス付きのみ
- 秘密値（`WEB_PUSH_VAPID_PRIVATE_KEY`, `INTERNAL_NOTIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`）はクライアントコードに置かない
- Edge Functions の認証要件を維持: 無認証エンドポイント追加禁止

## MCP サーバー

本プロジェクトには7つのMCPサーバーが設定済み（`.mcp.json`）。MCP対応ツールで利用可能。

| サーバー | 用途 |
|---|---|
| `supabase` | DB管理・テーブル参照・マイグレーション実行 |
| `context7` | ライブラリ公式ドキュメント検索 |
| `sequential-thinking` | 複雑な問題の段階的思考 |
| `playwright` | ブラウザ自動テスト |
| `chrome-devtools` | ブラウザデバッグ |
| `drawio` | 図表作成 |
| `serena` | IDEコード支援 |

## Git 運用

- コミットメッセージ: `[種類] 変更内容`（種類: `add`, `fix`, `update`, `remove`, `docs`）
- main/develop への直接コミット禁止。機能ブランチからPR作成

## 実装ワークフロー

1. **仕様確認** → `docs/プロジェクト仕様書.md`
2. **探索** → 関連ファイル・既存パターン・ナビゲーション構造を把握
3. **計画** → 3ファイル以上の変更は計画を提示し承認を得てから実装
4. **実装** → 規約遵守・全関数にJSDoc日本語コメント
5. **コミット** → `[add/fix/update/remove/docs]` 形式

## DB スキーマ概要（49 テーブル）

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

## 禁止事項

1. コメントなしのコード
2. 命名規則の無視
3. 仕様書を読まずに実装
4. エラーハンドリング省略
5. `var` の使用
6. マジックナンバー
7. TypeScript（`supabase/functions/` 以外）
8. APIキー・パスワードのハードコード
9. try-catch でのエラー握りつぶし
10. StyleSheet 以外のスタイリング
11. ライブラリAPIの推測使用
12. 計画なしの大規模変更
