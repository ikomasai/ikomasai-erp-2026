/**
 * 厚生部呼び出しシステムの定数
 */

/** 画面タイトル一覧 */
export const ITEM2_TITLES = {
  HOME: '厚生部呼び出し',
  CREATE: '呼び出し作成',
  LIST: '対応一覧',
};

/** 呼び出し種別 */
export const ITEM2_CALL_TYPES = {
  NON_URGENT: 'non_urgent',
};

/** ステータス定義 */
export const ITEM2_CALL_STATUSES = {
  UNHANDLED: 'unhandled',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
};

/** 詳細入力状態 */
export const ITEM2_DETAIL_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
};

/** item2 の内部表示モード */
export const ITEM2_VIEW_MODES = {
  CREATE: 'create',
  LIST: 'list',
};

/** 呼び出し時の選択肢 */
export const ITEM2_NON_URGENT_PURPOSES = [
  '絆創膏が欲しい',
  '熱を測りたい',
  'その他',
];

/** ステータス表示色 */
export const ITEM2_STATUS_COLORS = {
  unhandled: '#ef6c00',
  in_progress: '#1565c0',
  resolved: '#2e7d32',
};

/** 詳細入力状態表示色 */
export const ITEM2_DETAIL_STATUS_COLORS = {
  pending: '#ef6c00',
  completed: '#2e7d32',
};
