# タスクリスト: 屋台リストのDB構造変更対応

- [x] 現状の把握
    - [x] `src/features/01_Events&Stalls_list` のファイル構成確認
    - [x] Supabaseのテーブル定義（特に `stalls` 関連）の確認
- [x] 影響範囲の特定
    - [x] 既存のデータ取得ロジック（サービス・フック）の特定
    - [x] 変更後のスキーマと現在のコードの乖離を特定
- [/] 実装計画の作成
    - [x] `implementation_plan.md` の作成
- [/] 修正の実施
    - [x] データ取得フック (`useEventsStallsList01Data.js`) の修正
    - [x] 並べ替えオプション（運営団体）の削除（スマホ表示）
    - [x] 絞り込みフィルターのスクロール対応（スマホ）
    - [x] 動作確認
- [ ] 完了報告
    - [ ] `walkthrough.md` の作成
