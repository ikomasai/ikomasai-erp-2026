# 屋台リストDB構造変更に伴う修正計画

屋台（stalls）関連のテーブル構造が変更された（または変更に合わせてコードを最適化する必要がある）ため、データ取得フックおよび関連コンポーネントを修正します。

## 現状の課題
- `stalls` テーブルのデータ取得クエリにおいて、`stall_locations` から `stall_area_letters`、さらに `building_locations` を経由するリレーションシップが複雑になっており、データが正しく取得できていない可能性がある。
- DB定義によると `stall_locations` は `area_letter_id` を介して `stall_area_letters` と紐付いているが、プロパティアクセスの際に配列として返されている可能性や、リレーション名が期待と異なる可能性がある。

## 提案する変更

### 1. データ取得フックの修正
#### [MODIFY] [useEventsStallsList01Data.js](file:///home/sho16/ikomasai-erp-2026/src/features/01_Events&Stalls_list/hooks/useEventsStallsList01Data.js)
- `stalls` のフェッチクエリを整理し、リレーションシップが正しく取得できるようにする。
- `stall_locations` が `null` の場合のガードを強化する。
- 取得したデータの正規化処理（`mappedData`）において、`stall_area_letters` が配列で返された場合でも対応できるように修正する。
- `is_published` フラグを考慮したフィルタリングを追加する（必要に応じて）。

### 2. コンポーネントの調整
#### [MODIFY] [EventsStallsList01Screen.jsx](file:///home/sho16/ikomasai-erp-2026/src/features/01_Events&Stalls_list/screens/EventsStallsList01Screen.jsx)
- スマホ表示（isMobile）時のソートチップ表示フィルタから「運営団体」を除去しました。

## 検証計画

### 自動テスト
- なし

### 手動確認
- エミュレータまたはブラウザ（レスポンシブモード）で「屋台・企画一覧」画面を開き、スマホ表示時に「運営団体」のソートボタンが表示されないことを確認しました。
- デスクトップ表示時には引き続き表示されていることを確認しました。
