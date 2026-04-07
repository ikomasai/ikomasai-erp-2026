# TimeSchedule / 企画屋台一覧 改善提案（開発会議用）

作成日: 2026-03-29
作成者: Codex
対象範囲: TimeSchedule と 企画屋台一覧（`src/features/TimeSchedule` / `src/features/01_Events&Stalls_list`）

## 1. 背景

- TimeSchedule 遷移時に `stalls` / `stall_locations` 系クエリで 400 が継続していた。
- ブックマーク並び替えの DnD は動作するが、Web コンソールに touch / pointer の警告が残っていた。
- 他チーム実装の共通機能は極力触らず、対象機能内で完結する改善を優先した。

## 2. 直近で実施済み（対象範囲内のみ）

### 2.1 TimeSchedule の stalls 系 400 対策

- `timeScheduleService` の stalls 詳細取得をネスト依存から分離取得へ変更。
- `stall_locations` / `stall_organizations` 名称取得を `id,name` 固定にして、`name_kana` 非存在環境でも 400 を回避。

期待効果:
- 環境差分（列有無・関係定義差分）での 400 多発を抑制。

### 2.2 企画屋台一覧の stalls ネスト結合依存の緩和

- `useEventsStallsList01Data` で `stall_area_letters -> building_locations` のネスト結合を削減。
- 建物名・かな・表示順は `building_locations` マスタ別取得から補完。

期待効果:
- 画面マウント維持時の不要 400 を回避しやすくする。

### 2.3 TimeSchedule の警告軽減（今回）

- `pointerEvents` を props 指定から style 指定へ変更（Web 警告軽減）。
- ブックマークドラッグハンドルの Responder 取得を Web では無効化（touch 警告軽減）。

期待効果:
- 機能挙動を維持しつつ、開発時ログのノイズを減らす。

## 3. 会議で合意したい改善テーマ（対象範囲内）

### 3.1 TimeSchedule の取得戦略統一

提案:
- 「候補 select を順に試す」方針を `events / stalls / nameMap` で統一し、テーブルごとの候補を定数化する。

論点:
- どこまでを互換候補として維持するか（保守コストとのトレードオフ）。

### 3.2 DnD の Web/モバイル入力分離の明文化

提案:
- Web は mouse、モバイルは responder/touch を明示分離し、実装コメントに方針を固定する。

論点:
- 将来的に `react-native-gesture-handler` 系への移行を行うか。

### 3.3 企画屋台一覧の位置情報依存整理

提案:
- 画面側で必要な位置情報を「最低限の必須項目」に定義し、表示用補完をサービス層に寄せる。

論点:
- 一覧の並び替え品質（建物順・場所順）とクエリの堅牢性の優先順位。

## 4. 今回あえて触っていない項目（他機能）

- `ThemedHeader` の `shadow*` 警告。
- 対象外画面の `pointerEvents` 警告。
- 天気デバッグログ出力（APIキー表示）。

理由:
- 他チーム実装の共通機能に影響するため、会議で担当・優先度を明確化してから着手する。

## 5. 次スプリントの最小タスク案

1. TimeSchedule: 互換 select 候補定義の共通化（サービス内）
2. TimeSchedule: DnD イベント処理の入力経路をコードコメント込みで整理
3. 企画屋台一覧: 位置情報補完ロジックのサービス化（UI から分離）
4. 回帰確認: TimeSchedule 遷移、詳細モーダル表示、企画屋台一覧の絞り込み/並び替え
