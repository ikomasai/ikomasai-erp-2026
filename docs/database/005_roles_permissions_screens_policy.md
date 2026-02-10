# roles.permissions.screens 方針メモ（フェーズ6.1）

更新日: 2026-02-09

## 1. 追加する権限値

既存 `permissions.screens` の値は保持し、以下を追加対象とする。

- `item12`（巡回）
- `item13`（本部）
- `item14`（会計）
- `item15`（物品）
- `item16`（企画者）

## 2. 既存値の保持

既存値はそのまま維持する。

- `item1` ～ `item10`
- `当日部員`

方針:
- 既存配列の置換は行わない
- 必要値だけを追加する（additive）

## 3. ロール割当方針（新規5ロール）

| ロール | 追加対象 screens |
| --- | --- |
| HQ | `item13` |
| Patrol | `item12` |
| Accounting | `item14` |
| Property | `item15` |
| Exhibitor | `item16` |

補足:
- この表は「新規5画面への基本割当」のみを定義
- 既存画面（`item1` ～ `item11`）の割当は現状運用を優先し、個別に維持する
