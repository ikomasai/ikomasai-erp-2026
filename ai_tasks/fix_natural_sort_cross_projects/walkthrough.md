# 自然順ソート（数値順）のクロスプロジェクト修正

Admin画面およびHP画面において、名称などに含まれる数値が「9 → 10」のように自然な順序で並ぶよう修正を行いました。

## 修正内容

### 1. ikomasai-hp-admin (管理画面)

#### [EventsStallsManagement.tsx](file:///home/sho16/ikomasai-hp-admin/ikomasai-admin/src/pages/EventsStallsManagement.tsx)
- 表のソートロジック（名称、カテゴリ名、場所名）において、`localeCompare` に `{ numeric: true }` を追加しました。
- これにより、「第9企画」が「第10企画」より前に正しく並ぶようになります。

#### [EventStallRegistration.tsx](file:///home/sho16/ikomasai-hp-admin/ikomasai-admin/src/pages/EventStallRegistration.tsx)
- 登録画面のエリア選択肢（A1, A2, A10...）が生成される際のソートを自然順に変更しました。

### 2. ikomasai_hp (公式サイト)

#### [useEventsData.ts](file:///home/sho16/ikomasai_hp/hp/src/hooks/useEventsData.ts)
- 企画・屋台一覧の取得フックにおいて、表示順（`_order`）が同じ場合に名称（`title`）で自然順ソートを行うロジックを追加しました。

## 検証方法

ユーザー様にて以下の項目をご確認ください。

### 管理画面 (http://localhost:5173/events-stalls)
1. 「名称 / 団体名」などのヘッダーをクリックして昇順・降順を切り替えた際、数値を含む項目が期待通り（1, 2, ..., 9, 10...）に並ぶこと。

### 公式サイト (http://localhost:5174/stalls または /events)
1. 同一カテゴリ（表示順が同じ項目群）の中で、名称に数字が含まれるものが正しく並んでいること。

---

以上の修正により、プロジェクト横断的にソートの利便性が向上しました。
