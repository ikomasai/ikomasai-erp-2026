# theme_mode 互換方針メモ（フェーズ5.2）

更新日: 2026-02-09

## 1. 採用する正（正規値）

`user_profiles.theme_mode` の正規値は以下とする。

- `light`
- `dark`
- `joshi`
- `cyber`
- `neon`

理由:
- `docs/database/002_add_theme_to_user_profiles.sql`
- `docs/database/003_update_theme_constraint.sql`

上記2ファイルですでに `cyber/neon` がDB制約値として定義されているため。

## 2. 旧値との互換

旧値は入力互換として受け付け、アプリ側で正規値へ変換して扱う。

| 旧値 | 正規値 |
| --- | --- |
| `world_trigger` | `cyber` |
| `eva` | `neon` |

実装:
- `src/shared/utils/themeModeCompatibility.js` で正規化
- `src/shared/services/themeSettingsService.js` で取得時/保存時に正規化
- `src/shared/contexts/ThemeContext.jsx` でローカル保存値も正規化

## 3. 既存データ変換要否

- SQLレベルの既存データ変換は `docs/database/003_update_theme_constraint.sql` に記載済み
- 残存リスク（古いローカル保存値、旧クライアント送信値）はアプリ側の正規化で吸収する

## 4. UI表示名対応

| 正規値 | UI表示名 |
| --- | --- |
| `light` | ライトモード |
| `dark` | ダークモード |
| `joshi` | ゆるふわモード |
| `cyber` | サイバーモード |
| `neon` | ネオンモード |

互換表示:
- `world_trigger` は UI上 `サイバーモード` として扱う
- `eva` は UI上 `ネオンモード` として扱う
