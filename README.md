# 生駒祭 ERP 2026

近畿大学 生駒祭 2026 のイベント運営管理システム（ERP）です。
React Native (Expo) + Supabase で構築し、Web / iOS / Android に対応しています。

## 特徴

- React Native (Expo SDK 54) ベースのクロスプラットフォーム対応
- **StyleSheet** でスタイリング（Tailwind / NativeWind 不使用）
- Supabase（認証・DB・Edge Functions・RLS）
- Google Apps Script 連携（スプレッドシート）
- Web Push 通知
- 地震監視サービス（P2PQuake API 連携）
- JavaScript のみ（TypeScript は `supabase/functions/` 内のみ）

## プロジェクト構造

```
project-root/
├── docs/                                  # ドキュメント
│   ├── プロジェクト仕様書.md
│   ├── 開発ルール.md
│   ├── GitHubルール.md
│   ├── セットアップガイド.md
│   └── AI用プロンプト/
│       ├── AGENTS.md
│       └── supabaseスキーマ参照.md
│
├── src/
│   ├── features/                          # 機能モジュール（Feature-based）
│   │   ├── 01_Events&Stalls_list/         # 企画・屋台一覧
│   │   ├── TimeSchedule/                  # タイムスケジュール
│   │   ├── item2/                         # （未割当）
│   │   ├── item3/                         # チケット配布率
│   │   ├── item4/                         # 落とし物検索
│   │   ├── item5/                         # 迷子検索
│   │   ├── item6/                         # （未割当）
│   │   ├── item7/                         # アクセス権限制御
│   │   ├── item8/                         # 臨時ヘルプ
│   │   ├── item9/                         # 実長機能
│   │   ├── item10/                        # 本部
│   │   ├── item12/                        # 巡回サポート
│   │   ├── item13/                        # 本部サポート
│   │   ├── item14/                        # 会計対応
│   │   ├── item15/                        # 物品対応
│   │   ├── item16/                        # 企画者サポート
│   │   ├── auth/                          # 認証（ログイン・パスワード変更）
│   │   ├── support/                       # 管理部統合システム
│   │   ├── jimu-shift/                    # 当日部員シフト
│   │   ├── settings/                      # 設定・テーマ
│   │   ├── admin/                         # 管理者機能
│   │   └── notifications/                 # 通知一覧
│   │
│   ├── shared/                            # 共通モジュール
│   │   ├── components/                    # 汎用コンポーネント
│   │   ├── contexts/                      # AuthContext, ThemeContext, TerminalContext
│   │   ├── hooks/                         # カスタムフック
│   │   ├── services/                      # 通知・Push・テーマ等
│   │   ├── utils/                         # ユーティリティ
│   │   └── constants/                     # 全体定数
│   │
│   ├── navigation/                        # DrawerNavigator + AppNavigator
│   └── services/
│       ├── supabase/                      # Supabase サービス（18ファイル）
│       └── gas/                           # Google Apps Script API
│
├── supabase/
│   └── functions/                         # Edge Functions（3個 + _shared）
│       ├── dispatch-notification/
│       ├── push-subscription/
│       ├── push-delivery-receipt/
│       └── _shared/
│
├── .claude/                               # Claude Code 設定
│   └── CLAUDE.md
├── .mcp.json                              # MCP サーバー設定（7個）
├── .env.example
├── app.json
├── package.json
└── README.md
```

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/ikomasai/ikomasai-erp-2026.git
cd ikomasai-erp-2026
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` ファイルを編集して必要な値を設定してください。
主要な環境変数：

| 変数 | 必須 | 説明 |
|------|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase プロジェクト URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Anon Key |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | Yes | Web Push VAPID 公開鍵 |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Yes | Web Push VAPID 秘密鍵（サーバー側のみ） |
| `INTERNAL_NOTIFY_TOKEN` | Yes | 内部通知トークン（サーバー側のみ） |
| `EXPO_PUBLIC_SHIFT_SPREADSHEET_ID` | Yes | 当日部員シフト用スプレッドシート ID |
| `EXPO_PUBLIC_FESTIVAL_START_DATE` | Yes | 祭り開始日（MM-DD形式） |
| `EXPO_PUBLIC_FESTIVAL_END_DATE` | Yes | 祭り終了日（MM-DD形式） |
| `EXPO_PUBLIC_OPENWEATHERMAP_API_KEY` | Yes | OpenWeatherMap API キー |

### 4. アプリを起動

```bash
npx expo start -c  # Expo 開発サーバー起動（キャッシュクリア付き）
npm run web        # Web版 + 地震監視サービス同時起動（推奨）
npm run web-only   # Web版のみ起動
```

## スクリプト

| コマンド | 説明 |
|----------|------|
| `npx expo start -c` | Expo 開発サーバー起動（キャッシュクリア付き） |
| `npm run web` | Web版 + 地震監視サービス同時起動 |
| `npm run web-only` | Web版のみ起動 |
| `npm run ios` | iOS シミュレータで起動 |
| `npm run android` | Android エミュレータで起動 |
| `npm run build` | Web版ビルド（`expo export --platform web`） |
| `npm run earthquake-monitor` | 地震監視サービス単体起動 |
| `npm run earthquake-demo` | 地震デモモード |

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | React Native 0.81.5 (Expo SDK 54) |
| UI | React 19.1.0 |
| スタイリング | StyleSheet |
| ナビゲーション | React Navigation 7（Drawer + Stack） |
| バックエンド | Supabase（Auth, Database, Edge Functions） |
| スプレッドシート連携 | Google Apps Script |
| 地図 | React Native Maps 1.20.1 |
| 検索 | Fuse.js 7.1.0 |
| アニメーション | React Native Reanimated 4.1.1 |

## コーディング規約

- **言語:** JavaScript のみ（TypeScript は `supabase/functions/` 内のみ）
- **スタイリング:** `StyleSheet.create()` のみ使用
- **命名規則:**
  - コンポーネント: PascalCase（例：`EventCard.jsx`）
  - サービス: camelCase（例：`eventService.js`）
  - フック: useCamelCase（例：`useEvents.js`）
  - 定数: UPPER_SNAKE_CASE（例：`MAX_COUNT`）
- **コメント:** JSDoc 形式の日本語コメント必須
- **禁止事項:** `var` 使用、APIキーハードコード、Tailwind/NativeWind

詳細は [docs/開発ルール.md](docs/開発ルール.md) を参照してください。

## Git 運用

- コミットメッセージ形式: `[種類] 変更内容`（種類: `add`, `fix`, `update`, `remove`, `docs`）
- main / develop への直接コミット禁止。機能ブランチから PR を作成
- 詳細は [docs/GitHubルール.md](docs/GitHubルール.md) を参照

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [プロジェクト仕様書](docs/プロジェクト仕様書.md) | 機能要件・画面設計・DB設計 |
| [開発ルール](docs/開発ルール.md) | コーディング規約・品質基準 |
| [GitHub ルール](docs/GitHubルール.md) | ブランチ戦略・PR ルール |
| [セットアップガイド](docs/セットアップガイド.md) | 環境構築手順 |
| [地震監視サービス](docs/earthquake-monitor-service.md) | P2PQuake API 連携 |
| [テーマシステム](docs/THEME_SYSTEM.md) | ダーク/ライトテーマ |

## AI 開発

このプロジェクトは AI 開発ツールとの連携を想定しています：

- **Claude Code:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **MCP サーバー:** `.mcp.json`（supabase, context7, chrome-devtools, playwright, sequential-thinking, drawio, serena）
- **AI 用プロンプト:** [docs/AI用プロンプト/](docs/AI用プロンプト/)

## ライセンス

MIT License
