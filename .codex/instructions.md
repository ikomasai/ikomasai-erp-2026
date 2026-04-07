# Codex 開発ガイド — 生駒祭 ERP 2026

## 必読ドキュメント

1. `docs/AI用プロンプト/AGENTS.md` — AI共通入口
2. `docs/アプリ理解.md` — アプリ全体理解
3. `docs/管理部統合システム仕様書.md` — 主開発対象の仕様
4. `docs/プロジェクト仕様書.md` — 機能要件・画面設計
5. `docs/AI用プロンプト/supabaseスキーマ参照.md` — 49テーブル詳細

現在の主開発: 企画管理部統合システム（`item12`〜`item16`, `support`）

## 技術スタック

- JavaScript のみ（TS禁止、`supabase/functions/` のみ例外）
- React Native (Expo SDK 54) — Web/iOS/Android
- Supabase（認証・DB・Edge Functions）
- StyleSheet のみ（Tailwind/NativeWind 禁止）
- Google Apps Script（スプレッドシート連携）

## 開発コマンド

```bash
npx expo start -c      # Expo 開発サーバー（キャッシュクリア付き）
npm run web            # Web版 + 地震モニター同時起動
npm run web-only       # Web版のみ
npm run build          # Web版ビルド（expo export --platform web）
```

## アーキテクチャ

```
App.js → GestureHandlerRootView → AuthProvider → ThemeProvider → TerminalProvider → FontLoaderProvider → AppNavigator
  └→ 認証済み: DrawerNavigator（企画・屋台一覧, TimeSchedule, Item2〜10, Item12〜16, JimuShift, Settings, Admin, Notifications）
  └→ 未認証: LoginScreen / 初回: PasswordChangeModal
```

機能モジュール: `src/features/{名前}/`（screens/, components/, services/, hooks/, constants.js）

一覧: 01_Events&Stalls_list, TimeSchedule, item2〜10, item12〜16, auth, support, jimu-shift, settings, admin, notifications

## 共有レイヤー

- contexts: AuthContext, ThemeContext, TerminalContext
- components: ScreenErrorBoundary, EmptyState, FontLoaderProvider, ThemedButton/Card/Header/Text, ToastMessage 等
- hooks: useTheme, useDraftStorage, usePushNavigationListener, useWebPushDebugListener
- services: notificationService, webPushService, themeSettingsService, edgeFunctionAuthService
- supabase: client.js + 17サービス（auth, user, permission, event, keyLoan, patrol 等）

## Edge Functions（3個）

- `dispatch-notification` — 通知配信（Bearer/x-internal-notify-token）
- `push-subscription` — Push購読管理（Bearer+getUser）
- `push-delivery-receipt` — 配信レシート

## コーディング規約

- 全関数にJSDoc日本語コメント、変数にもコメント
- サービス関数: selectXxx/insertXxx/updateXxx/deleteXxx
- ブール: is/has/can/should、定数: UPPER_SNAKE_CASE
- var禁止、マジックナンバー禁止、エラー握りつぶし禁止

## 画面追加

1. `src/features/{名}/screens/` → 2. `DrawerNavigator.jsx` → 3. `CustomDrawerContent.jsx`

## セキュリティ

- `EXPO_PUBLIC_` プレフィックスのみクライアント参照可
- 秘密値はクライアントコードに置かない
- Edge Functions の認証要件を維持

## Git

`[add/fix/update/remove/docs] 変更内容` — 機能ブランチからPR

## DB（49テーブル）

認証(6), イベント(12), チケット(3), 警備(9), 通知(3), サポート(4), 鍵(3), ヘルプ(2), 常設内(8), シフト(2)

## 禁止

var / TS(supabase以外) / Tailwind / マジックナンバー / APIキーハードコード / エラー握りつぶし / コメントなし / 計画なし大規模変更
