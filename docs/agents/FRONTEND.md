# フロントエンド担当 AGENTS.md

## 役割

React Native (Expo) を使った画面・コンポーネントの実装を担当する。

---

## 最初に必ず読むこと

```
docs/プロジェクト仕様書.md
docs/管理部統合システム仕様書.md
.claude/CLAUDE.md（コーディング規約）
```

---

## 担当範囲

### 画面実装

- 各 feature の Screen コンポーネントの実装
- ナビゲーション設定（`src/navigation/`）
- ロールに応じた画面表示の切替

### コンポーネント実装

- 機能別コンポーネント（`src/features/*/components/`）
- 共通コンポーネント（`src/shared/components/`）
- フォーム入力・バリデーション

### カスタムフック

- 機能別フック（`src/features/*/hooks/`）
- 共通フック（`src/shared/hooks/`）
- Supabase Realtime との連携フック

### 状態管理

- Context API（`src/shared/contexts/`）
- ローカルステート（useState / useReducer）
- 認証状態（AuthContext）
- テーマ状態（ThemeContext）

---

## ファイル命名規約（必須）

| 種類           | 形式         | 拡張子 | 例                |
| -------------- | ------------ | ------ | ----------------- |
| コンポーネント | PascalCase   | .jsx   | `EventCard.jsx`   |
| サービス       | camelCase    | .js    | `eventService.js` |
| フック         | useCamelCase | .js    | `useEvents.js`    |
| ユーティリティ | camelCase    | .js    | `validation.js`   |

---

## ディレクトリ構造

```
src/features/機能名/
├── components/   # UI部品
├── screens/      # 画面
├── services/     # API通信
├── hooks/        # カスタムフック
└── constants.js  # 定数
```

---

## コーディング規約（必須）

### コメント

- 全ての関数に JSDoc 形式の日本語コメントを書く
- 変数にもコメントを書く

### 変数命名

- 通常の変数：camelCase（例：`userName`）
- 定数：UPPER_SNAKE_CASE（例：`MAX_RETRY_COUNT`）
- ブール：is, has, can, should で始める（例：`isLoading`）

### スタイリング

- 必ず StyleSheet を使用する
- インラインスタイル禁止

### 禁止事項

- `var` の使用（`const` / `let` を使う）
- TypeScript の使用（JavaScript のみ）
- コメントなしのコード
- エラーハンドリングの省略
- マジックナンバー

---

## エラーハンドリング

- API 取得失敗時：エラーメッセージ表示「データの取得に失敗しました」
- ネットワーク切断時：警告表示「オフライン状態です」
- データ保存失敗時：エラーメッセージ表示 → 再試行ボタン表示

---

## 端末区分

- **持ち歩き（Expo）：** 出展、巡回、会計、物品
- **設置型（Web）：** 本部サポート（HQ）

---

## 出力物

- Screen コンポーネント（`src/features/*/screens/`）
- UI コンポーネント（`src/features/*/components/`）
- カスタムフック（`src/features/*/hooks/`）
- ナビゲーション設定（`src/navigation/`）

---

## 注意事項

- 仕様書の画面設計に従って実装する
- バックエンド担当が定義した API に合わせてサービス層を呼び出す
- 既存の共通コンポーネントを再利用する（重複を避ける）
- パフォーマンスを意識する（不要な再レンダリングを防ぐ）
