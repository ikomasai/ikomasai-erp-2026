# Project: 生駒祭 ERP 2026

近畿大学 生駒祭のイベント運営管理システム。React Native (Expo SDK 54) + Supabase。

## General Instructions

### 必読ドキュメント

コードを書く前に次をこの順で確認する。

- `docs/AI用プロンプト/AGENTS.md` — AI 共通入口
- `docs/アプリ理解.md` — アプリ全体の理解を集約した基準ドキュメント
- `docs/管理部統合システム仕様書.md`（`item12`〜`item16` / `support` を触る場合は最優先）
- `docs/プロジェクト仕様書.md` — 機能要件・画面設計・DB設計
- `docs/AI用プロンプト/supabaseスキーマ参照.md` — 全49テーブルの詳細スキーマ

現在ここで主に開発しているのは企画管理部統合システムであり、通常編集対象は `item12`〜`item16` と `src/features/support`。

### 技術スタック

- **言語:** JavaScript のみ（TypeScript 禁止。`supabase/functions/` のみ例外的にTS可）
- **フロントエンド:** React Native (Expo SDK 54) — Web/iOS/Android対応
- **バックエンド:** Supabase（認証・DB・Edge Functions）
- **スタイリング:** StyleSheet のみ（Tailwind/styled-components/NativeWind 禁止）
- **その他:** Google Apps Script（スプレッドシート連携）

## Architecture

### エントリーポイント

```
index.js → App.js → GestureHandlerRootView → AuthProvider → ThemeProvider → TerminalProvider → FontLoaderProvider → AppNavigator
  └→ 認証済み: DrawerNavigator（企画・屋台一覧, TimeSchedule, Item2〜10, Item12〜16, JimuShift, Settings, Admin, Notifications）
  └→ 未認証: LoginScreen
  └→ 初回ログイン: PasswordChangeModal
```

### 機能モジュール

各機能は `src/features/{機能名}/` 配下に独立配置（screens/, components/, services/, hooks/, constants.js）。

機能一覧: 01_Events&Stalls_list, TimeSchedule, item2〜item10, item12〜item16, auth, support, jimu-shift, settings, admin, notifications

### 共有レイヤー

- `src/shared/contexts/` — AuthContext, ThemeContext, TerminalContext
- `src/shared/components/` — ScreenErrorBoundary, EmptyState, FontLoaderProvider, OfflineBanner, SkeletonLoader, ThemedButton/Card/Header/Text, ToastMessage
- `src/shared/hooks/` — useTheme, useDraftStorage, usePushNavigationListener, useWebPushDebugListener
- `src/shared/services/` — notificationService, webPushService, themeSettingsService, edgeFunctionAuthService, supportWorkflowNotificationService
- `src/services/supabase/` — client.js + 17サービスファイル（authService, userService, permissionService, eventService, keyLoanService, patrolTaskService 等）

### Edge Functions（3個、`supabase/functions/`）

dispatch-notification（通知配信）、push-subscription（Push購読管理）、push-delivery-receipt（配信レシート）+ `_shared/`

## Coding Style

### ファイル命名

- コンポーネント: PascalCase `.jsx`（例: `EventCard.jsx`）
- サービス: camelCase `.js`（例: `eventService.js`）
- フック: useCamelCase `.js`（例: `useEvents.js`）
- 定数: UPPER_SNAKE_CASE

### 必須ルール

- 全関数にJSDoc形式の**日本語コメント**。変数にもコメント
- サービス関数: `selectXxx`, `insertXxx`, `updateXxx`, `deleteXxx`
- ブール変数: `is`, `has`, `can`, `should` で始める
- `var` 禁止（`const`/`let` のみ）
- マジックナンバー禁止（定数化する）
- try-catch でエラーを握りつぶさない

## Component-Specific

### 画面追加手順

1. `src/features/{機能名}/screens/` に画面コンポーネント作成
2. `DrawerNavigator.jsx` → `createWrappedScreen()` → `<Drawer.Screen>` 追加
3. `CustomDrawerContent.jsx` にメニュー項目追加

### Edge Function 変更時

1. `supabase/functions/{name}/index.ts` 編集 → 2. `_shared/cors.ts` 確認 → 3. 認証要件維持

### DB スキーマ変更時

1. `supabaseスキーマ参照.md` で現状確認 → 2. マイグレーションSQL → 3. RLS確認 → 4. サービス更新 → 5. ドキュメント更新

## Security

- 環境変数は `.env.example` 基準。クライアント参照は `EXPO_PUBLIC_` プレフィックス付きのみ
- 秘密値はクライアントコードに置かない
- Edge Functions の認証要件維持: 無認証エンドポイント追加禁止

## Git

- コミットメッセージ: `[種類] 変更内容`（種類: `add`, `fix`, `update`, `remove`, `docs`）
- main/develop への直接コミット禁止。機能ブランチからPR作成

## DB スキーマ概要（49 テーブル）

認証・ユーザー(6), イベント・屋台・会場(12), チケット・受付(3), 警備・安全(9), 通知(3), サポート(4), 鍵管理(3), 臨時ヘルプ(2), 常設内(8), シフト・その他(2)

## 禁止事項

1. コメントなしのコード
2. 命名規則の無視
3. `var` / TypeScript（supabase/functions以外）/ マジックナンバー
4. APIキーハードコード / エラー握りつぶし
5. StyleSheet 以外のスタイリング
6. ライブラリAPIの推測使用
7. 計画なしの大規模変更（3ファイル以上）
