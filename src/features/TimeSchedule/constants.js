/**
 * TimeSchedule 機能の定数
 */

/** 画面名 */
export const SCREEN_NAME = 'タイムスケジュール';

/** 画面説明 */
export const SCREEN_DESCRIPTION = '日ごとの開催スケジュールを 5 分単位で確認できます。';

/** 運用開始時刻（HH:mm） */
export const OPERATION_START_TIME = '09:00';

/** 運用終了時刻（HH:mm） */
export const OPERATION_END_TIME = '20:00';

/** フィルタ未指定を示す値 */
export const AREA_FILTER_ALL = 'ALL';

/** 表示モードの種別 */
export const VIEW_MODE = {
  /** タイムライン形式（複数ブックマーク選択可） */
  TIMELINE: 'timeline',
  /** カードリスト形式（単一ブックマーク選択） */
  CARD_LIST: 'cardList',
};

/** AsyncStorage キー */
export const STORAGE_KEYS = {
  SELECTED_DATE: 'time_schedule_selected_date',
  SELECTED_AREAS: 'time_schedule_selected_areas',
  /** 保存される表示モード（VIEW_MODE 値） */
  VIEW_MODE: 'time_schedule_view_mode',
  /** カードリストモード用のアクティブブックマークID */
  CARD_LIST_ACTIVE_BOOKMARK: 'time_schedule_cardlist_active_bookmark',
};
