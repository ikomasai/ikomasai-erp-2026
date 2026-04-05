# React Native Expo Template 2026

React Native + Expo + Supabase のテンプレートプロジェクトです。
このテンプレートをフォークして、新しいプロジェクトを始めることができます。

## 特徴

- React Native (Expo) ベース
- **Tailwind CSS (NativeWind)** でスタイリング
- Supabase 統合
- Google Apps Script API 統合（オプション）
- JavaScript（TypeScript ではない）
- AI 開発フレンドリーな構成
- カウンターデモアプリ付き

## プロジェクト構造

```
project-root/
├── docs/                                # ドキュメント
│   ├── プロジェクト仕様書.md
│   ├── 開発ルール.md
│   ├── GitHubルール.md
│   └── AI用プロンプト/
│
├── src/
│   ├── features/                        # 機能ごとにまとめる
│   │   └── counter/                     # カウンター機能（デモ）
│   │
│   ├── shared/                         # 共通で使うもの
│   │   ├── components/                # 汎用コンポーネント
│   │   ├── hooks/                     # 汎用フック
│   │   ├── utils/                     # ユーティリティ関数
│   │   ├── constants/                 # 全体の定数
│   │   └── contexts/                  # Context API
│   │
│   ├── navigation/                     # ナビゲーション
│   └── services/                       # 共通サービス
│       ├── supabase/
│       └── gas/
│
├── .claude/                            # Claude Code設定
│   └── CLAUDE.md
├── .env.example
├── .gitignore
├── app.json
├── package.json
└── README.md
```

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/your-username/react-native-expo-template-2026.git
cd react-native-expo-template-2026
```

### 2. 依存関係をインストール

```bash
npm install
```

`fuse.js`（企画・屋台一覧の検索で使用）は `package.json` の依存関係に含まれているため、この手順で一緒にインストールされます。

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` ファイルを編集して、Supabase の認証情報を設定してください：

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. アプリを起動

#### Webアプリ + 地震監視サービス（推奨）

```bash
./START_SERVER.sh
# または
npm run web
```

このコマンドで以下が自動起動します：
- **Webサーバー** (http://localhost:8081)
- **地震監視サービス** (P2PQuake API v2を10秒ごとにチェック)

#### Webアプリのみ起動

```bash
npm run web-only
```

#### その他のプラットフォーム

```bash
npm start
```

- **iOS シミュレータ:** `i` キーを押す
- **Android エミュレータ:** `a` キーを押す
- **Web ブラウザ:** `w` キーを押す

### 5. 地震監視システムのセットアップ（重要）

Supabaseで以下のSQLを実行してテーブルを作成：

```bash
docs/database/create_disaster_status_table.sql
```

これで震度5弱以上の地震が発生すると自動的にWebアプリに通知されます。

詳細は [地震監視サービスドキュメント](docs/earthquake-monitor-service.md) を参照してください。

## 開発の始め方

### デモアプリを削除して新しいプロジェクトを始める

1. `src/features/counter/` ディレクトリを削除
2. `src/navigation/AppNavigator.jsx` を編集して、独自の画面を追加
3. `docs/プロジェクト仕様書.md` を編集して、新しいプロジェクトの仕様を記述

### 新しい機能を追加する

1. `src/features/` に新しい機能ディレクトリを作成
2. 以下のサブディレクトリを作成：
   - `components/` - UI コンポーネント
   - `screens/` - 画面
   - `hooks/` - カスタムフック
   - `constants.js` - 定数

例：

```
src/features/auth/
├── components/
│   └── LoginForm.jsx
├── screens/
│   └── LoginScreen.jsx
├── hooks/
│   └── useAuth.js
└── constants.js
```

## スクリプト

- `npm start` - Expo 開発サーバーを起動
- `npm run android` - Android エミュレータで起動
- `npm run ios` - iOS シミュレータで起動
- `npm run web` - Web ブラウザで起動

## 技術スタック

- **React Native:** 0.81.5
- **Expo:** ~54.0.30
- **React:** 19.1.0
- **NativeWind (Tailwind CSS):** スタイリング
- **React Navigation:** ナビゲーション管理
- **Supabase:** バックエンド・データベース
- **Google Apps Script:** 外部API（オプション）
- **React Native Maps:** 地図表示（Item10用）
- **OpenWeatherMap API:** 天気情報（Item10用）

## 実装済み機能

### Item10 - 実長システム

大学祭の実長（現場責任者）向けの統合管理システムです。

**主な機能:**
- 来場者数のリアルタイム表示
- 不審者情報管理（Google Drive連携予定）
- 天気情報・降水量表示
- デジタル時計
- 緊急モード（自然災害対応）
- 警備配置情報管理（詳細仕様未定）

詳細は [src/features/item10/README.md](src/features/item10/README.md) を参照してください。

## ドキュメント

詳細なドキュメントは `docs/` ディレクトリにあります：

- [プロジェクト仕様書](docs/プロジェクト仕様書.md)
- [開発ルール](docs/開発ルール.md)
- [GitHub ルール](docs/GitHubルール.md)

## AI 開発

このプロジェクトは AI 開発ツールとの連携を想定しています：

- **Claude Code:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **その他の AI ツール:** [docs/AI用プロンプト/](docs/AI用プロンプト/)

## コーディング規約

- **言語:** JavaScript（TypeScript ではない）
- **スタイリング:** Tailwind CSS (NativeWind) を使用
- **命名規則:**
  - コンポーネント: PascalCase（例：`CounterButton.jsx`）
  - 関数・変数: camelCase（例：`useCounter.js`）
  - 定数: UPPER_SNAKE_CASE（例：`MAX_COUNT`）
- **コメント:** JSDoc 形式の日本語コメント必須
- **禁止事項:**
  - `var` の使用（`const`/`let` を使用）
  - TypeScript での記述
  - API キーのハードコード
  - StyleSheet の使用（Tailwind CSS を使用）

詳細は [docs/開発ルール.md](docs/開発ルール.md) を参照してください。

## Tailwind CSS の使い方

このテンプレートでは NativeWind を使用して Tailwind CSS でスタイリングできます。

### 基本的な使い方

```jsx
import { View, Text } from 'react-native';

const MyComponent = () => {
  return (
    <View className="flex-1 bg-background p-4">
      <Text className="text-2xl font-bold text-primary">
        Hello, Tailwind!
      </Text>
    </View>
  );
};
```

### カスタムカラーの使い方

`tailwind.config.js` でカスタムカラーを定義しています：

```js
colors: {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  background: '#FFFFFF',
  text: '#000000',
  textSecondary: '#666666',
  border: '#E0E0E0',
}
```

使用例：

```jsx
<View className="bg-primary">
  <Text className="text-error">エラーメッセージ</Text>
</View>
```

### よく使うクラス

- **レイアウト:** `flex-1`, `flex-row`, `items-center`, `justify-center`
- **スペーシング:** `p-4`, `px-6`, `py-2`, `m-4`, `mt-8`, `mb-2`
- **テキスト:** `text-base`, `text-lg`, `text-2xl`, `font-bold`, `text-center`
- **背景:** `bg-primary`, `bg-background`
- **ボーダー:** `border`, `border-2`, `border-primary`, `rounded-lg`

## ライセンス

MIT License

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まず Issue を開いて変更内容を議論してください。

## サポート

問題が発生した場合は、GitHub Issues で報告してください。
