# 他プロジェクト（Admin/HP）における自然順ソート（数値対応）の修正計画

## 概要
ERPプロジェクトでの修正と同様に、管理画面（Admin）およびホームページ（HP）においても、数値を含む文字列（例：「第10企画」と「第2企画」）が正しく数値順に並ばない問題を修正します。

## Proposed Changes

### 1. 管理画面プロジェクト (ikomasai-hp-admin)

#### [MODIFY] [EventsStallsManagement.tsx](file:///home/sho16/ikomasai-hp-admin/ikomasai-admin/src/pages/EventsStallsManagement.tsx)
- 名称（`name`）、カテゴリ名（`categoryName`）、場所名（`locationName`）の各ソート比較において、`localeCompare` に `{ numeric: true }` オプションを追加します。

#### [MODIFY] [EventStallRegistration.tsx](file:///home/sho16/ikomasai-hp-admin/ikomasai-admin/src/pages/EventStallRegistration.tsx)
- `existingAreaLettersList` の生成時の `.sort()` を、`localeCompare(..., { numeric: true })` を使用した定義に変更します。

---

### 2. ホームページプロジェクト (ikomasai_hp)

#### [MODIFY] [useEventsData.ts](file:///home/sho16/ikomasai_hp/hp/src/hooks/useEventsData.ts)
- `formattedStalls` および `formattedEvents` のソートロジックを改善します。
- `_order`（カテゴリ表示順）が同一の場合、`title`（名称）による二次ソートを行い、かつ自然順ソート（`numeric: true`）を適用します。

## 検証計画

### 1. 動作確認項目
- **Admin**: 一覧表示で「10」が「9」の後に来るか。
- **Admin**: インポート/登録時のエリア文字リストが正しく並んでいるか。
- **HP**: 屋台/企画一覧において、同一カテゴリ内での並び順が数値通りか。
