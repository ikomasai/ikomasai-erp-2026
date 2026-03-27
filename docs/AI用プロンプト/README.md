# AI 用プロンプト

AI ツール向け設定ファイルの配置先ガイド。

## ツール別設定ファイル

各ファイルは自己完結型。外部参照に依存しない。

| ファイル | 対象ツール |
|---------|-----------|
| `.claude/CLAUDE.md` | Claude Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.cursorrules` | Cursor |
| `.codex/instructions.md` | OpenAI Codex |
| `GEMINI.md` | Gemini Code Assist / CLI |
| `.windsurfrules` | Windsurf (Codeium) |

## MCP・セキュリティ設定ファイル

| ファイル | 内容 |
|---------|------|
| `.mcp.json` | MCP サーバー定義（全ツール共通） |
| `.claude/settings.local.json` | Claude Code 権限・MCP有効化設定 |
| `.codex/config.toml` | Codex MCP・サンドボックス設定 |

## 参照ドキュメント

| ファイル | 内容 |
|---------|------|
| `AGENTS.md` | AI 共通入口。必読順と現在の作業対象を定義 |
| `docs/アプリ理解.md` | アプリ全体の理解を集約した基準ドキュメント |
| `supabaseスキーマ参照.md` | 全49テーブルの詳細スキーマ（Claude Code + 人間用） |
| `docs/プロジェクト仕様書.md` | 機能要件・画面設計・DB設計・API設計 |
| `docs/管理部統合システム仕様書.md` | 現在の主開発対象である企画管理部統合システムの仕様 |
| `docs/開発ルール.md` | コーディング規約の詳細版（コード例付き） |

## 更新時の注意

- 6つのルールファイルは同一内容を維持する（CLAUDE.md のみ開発コマンド・スキーマ参照・MCP詳細ガイド追加あり）
- ルール変更時は6ファイル全てを同時更新する
- セキュリティ設定（`.claude/settings.local.json`, `.codex/config.toml`）は別途管理
