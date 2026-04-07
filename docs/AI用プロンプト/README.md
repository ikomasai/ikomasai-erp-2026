# AI 用プロンプト

AI ツール向け設定ファイルの配置先ガイド。

## ツール別設定ファイル

各ファイルは自己完結型。外部参照に依存しない。

| ファイル | 対象ツール | 備考 |
|---------|-----------|------|
| `.claude/CLAUDE.md` | Claude Code | 最も詳細（MCP活用ガイド・開発コマンド・Plan Mode運用含む） |
| `.github/copilot-instructions.md` | GitHub Copilot | YAML frontmatter `applyTo: "**"` 付き |
| `.cursorrules` | Cursor | レガシー形式（将来 `.cursor/rules/` へ移行予定） |
| `.codex/instructions.md` | OpenAI Codex CLI | 150行以下のコンパクト版 + 開発コマンド |
| `GEMINI.md` | Gemini Code Assist / CLI | `# Project:` ヘッダー形式 |
| `.windsurfrules` | Windsurf (Codeium) | Cursor と同等の内容 |

## MCP・セキュリティ設定ファイル

| ファイル | 内容 |
|---------|------|
| `.mcp.json` | MCP サーバー定義（7個: supabase, context7, sequential-thinking, playwright, chrome-devtools, drawio, serena） |
| `.claude/settings.local.json` | Claude Code 権限・MCP有効化設定 |
| `.codex/config.toml` | Codex MCP・サンドボックス設定 |

## 参照ドキュメント

| ファイル | 内容 |
|---------|------|
| `AGENTS.md` | AI 共通入口。必読順と現在の作業対象を定義 |
| `docs/AI用プロンプト/AGENTS.md` | AI共通入口（詳細版） |
| `docs/AI用プロンプト/skills.md` | プロジェクト固有の開発パターン・テンプレート集 |
| `docs/アプリ理解.md` | アプリ全体の理解を集約した基準ドキュメント |
| `docs/AI用プロンプト/supabaseスキーマ参照.md` | 全49テーブルの詳細スキーマ |
| `docs/プロジェクト仕様書.md` | 機能要件・画面設計・DB設計・API設計 |
| `docs/管理部統合システム仕様書.md` | 現在の主開発対象である企画管理部統合システムの仕様 |
| `docs/開発ルール.md` | コーディング規約の詳細版（コード例付き） |

## 更新時の注意

- 6つのルールファイルは同一内容を維持する（CLAUDE.md のみ MCP詳細ガイド・Plan Mode運用が追加）
- ルール変更時は6ファイル全てを同時更新する
- セキュリティ設定（`.claude/settings.local.json`, `.codex/config.toml`）は別途管理
- `skills.md` はプロジェクトの進捗に合わせて開発パターンを追加していく
