/**
 * 落とし物検索機能の定数
 */

/** 落とし物スプレッドシートID（環境変数から取得） */
export const LOSTITEM_SPREADSHEET_ID = process.env.EXPO_PUBLIC_LOSTITEM_SPREADSHEET_ID;

/** スプレッドシートのシート名 */
export const SHEET_NAMES = {
  /** 通常の落とし物 */
  NORMAL: '一般',
  /** 緊急の落とし物 */
  URGENT: '緊急',
  /** 落とし主（紛失物の問い合わせ） */
  OWNER: '落とし主',
};

/** タブ定義（表示順） */
export const TABS = [
  { key: 'normal', label: '一般' },
  { key: 'urgent', label: '緊急' },
  { key: 'owner', label: '落とし主' },
];

/** デフォルトのアクティブタブキー */
export const DEFAULT_TAB = 'normal';

/** ステータスフィルタのキー */
export const STATUS_FILTERS = {
  /** すべて表示 */
  ALL: 'all',
  /** 保管中 / 未対応（返却日が空） */
  HOLDING: 'holding',
  /** 返却済み / 対応済み（返却日あり） */
  RETURNED: 'returned',
  /** 学生部預かり（J列チェックボックスがON） */
  STUDENT_DEPT: 'student_dept',
};

/** ステータスフィルタのラベル */
export const STATUS_FILTER_LABELS = {
  [STATUS_FILTERS.ALL]: 'すべて',
  [STATUS_FILTERS.HOLDING]: '保管中',
  [STATUS_FILTERS.RETURNED]: '返却済み',
  [STATUS_FILTERS.STUDENT_DEPT]: '学生部預かり',
};

/** Google Drive画像サムネイル取得用ベースURL */
export const DRIVE_THUMBNAIL_BASE_URL = 'https://drive.google.com/thumbnail';

/** サムネイル画像の幅パラメータ */
export const THUMBNAIL_WIDTH = 400;

/** CSV行のヘッダー行インデックス（0始まり、先頭行はヘッダーとしてスキップ） */
export const HEADER_ROW_INDEX = 0;

/** 検索バーのプレースホルダーテキスト */
export const SEARCH_PLACEHOLDER = '名前や場所で検索';

/** 場所フィルタの「すべて」を示す値 */
export const LOCATION_FILTER_ALL = 'all';

/** 日付フィルタの「すべて」を示す値 */
export const DATE_FILTER_ALL = 'all';
