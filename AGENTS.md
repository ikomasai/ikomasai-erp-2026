# AGENTS ガイド（リポジトリ共通）

このファイルは、どのスレッド・どのAIエージェントでも共通で読む前提の入口です。
詳細ルールは `docs/AI用プロンプト/AGENTS.md` を優先してください。

---

## 必読順

1. `docs/AI用プロンプト/AGENTS.md` — AI共通入口（詳細版）
2. `docs/アプリ理解.md` — アプリ全体の理解を集約した基準ドキュメント
3. `docs/管理部統合システム仕様書.md` — 現在の主開発対象の仕様
4. `docs/プロジェクト仕様書.md` — 機能要件・画面設計・DB設計
5. `docs/AI用プロンプト/supabaseスキーマ参照.md` — 全49テーブルの詳細スキーマ
6. `docs/管理部統合システム理解.md` — 管理部統合システムの理解ドキュメント
7. `docs/プロジェクト全体理解.md` — プロジェクト全体の理解
8. `docs/Codex編集履歴.md` — AI編集の履歴追跡

---

## 共通運用ルール

- 実装前に「仕様書」と「理解ドキュメント」を必ず確認する
- 現在ここで主に開発するのは企画管理部統合システムであり、通常編集対象は `item12`〜`item16` と `support` 周辺である
- 仕様差分や気づきが出たら、まず `docs/アプリ理解.md` を更新する
- 管理部統合システムの変更では `docs/管理部統合システム理解.md` も必要に応じて更新する
- 変更を行ったら `docs/Codex編集履歴.md` に1エントリ追加する

---

## AIツール別設定ファイル

| ファイル | 対象ツール |
|---------|-----------|
| `.claude/CLAUDE.md` | Claude Code（最も詳細、MCP活用ガイド付き） |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.cursorrules` | Cursor |
| `.codex/instructions.md` | OpenAI Codex CLI |
| `GEMINI.md` | Gemini Code Assist / CLI |
| `.windsurfrules` | Windsurf (Codeium) |

詳細は `docs/AI用プロンプト/README.md` を参照。
