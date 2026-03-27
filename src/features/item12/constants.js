/**
 * 項目12の定数
 */

/** 画面名 */
export const SCREEN_NAME = '巡回サポート';

/** 画面説明 */
export const SCREEN_DESCRIPTION =
  '巡回担当が緊急呼び出し・企画開始報告・企画終了報告を確認し、現地対応の進捗（向かいます/完了）と結果メモを登録する画面です。';

/** 実装予定の機能一覧 */
export const FEATURE_PLACEHOLDERS = [
  'タスク一覧（開始/終了確認・施錠確認・緊急対応）',
  '「向かいます / 完了」の進捗操作',
  '巡回チェック記録（メモ・写真）',
  '未巡回アラート確認',
];

/** 下部タブ種別 */
export const PATROL_TAB_TYPES = {
  /** ダッシュボード */
  DASHBOARD: 'dashboard',
  /** 巡回タスク一覧・詳細 */
  TASKS: 'tasks',
  /** 巡回チェック記録・未巡回アラート */
  CHECK: 'check',
  /** 企画一覧（organizations_events） */
  EVENT_ORGS: 'event_orgs',
};

/** 下部タブ一覧 */
export const PATROL_TABS = [
  {
    key: PATROL_TAB_TYPES.TASKS,
    label: 'タスク',
    icon: '🚨',
  },
  {
    key: PATROL_TAB_TYPES.CHECK,
    label: 'チェック',
    icon: '📍',
  },
  {
    key: PATROL_TAB_TYPES.EVENT_ORGS,
    label: '企画一覧',
    icon: '🏢',
  },
  {
    key: PATROL_TAB_TYPES.DASHBOARD,
    label: 'ダッシュ',
    icon: '📊',
  },
];

