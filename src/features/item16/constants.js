/**
 * 項目16の定数
 */

/** 画面名 */
export const SCREEN_NAME = '企画者サポート';

/** 画面説明 */
export const SCREEN_DESCRIPTION =
  '企画者（出展団体）向けの連絡入力画面です。画面下のタブで4つの機能を切り替えて利用します。';

/** 下部タブ種別 */
export const SUPPORT_TAB_TYPES = {
  QUESTION: 'question',
  EMERGENCY: 'emergency',
  KEY_PREAPPLY: 'key_preapply',
  EVENT_STATUS: 'event_status',
};

/** 下部タブ一覧 */
export const SUPPORT_TABS = [
  {
    key: SUPPORT_TAB_TYPES.QUESTION,
    label: '質問',
    title: '質問系統',
  },
  {
    key: SUPPORT_TAB_TYPES.EMERGENCY,
    label: '緊急',
    title: '緊急呼び出し',
  },
  {
    key: SUPPORT_TAB_TYPES.KEY_PREAPPLY,
    label: '鍵申請',
    title: '鍵の事前申請',
  },
  {
    key: SUPPORT_TAB_TYPES.EVENT_STATUS,
    label: '開始終了',
    title: '企画の開始/終了報告',
  },
];

/** 質問系統の種別 */
export const QUESTION_TYPES = [
  { key: 'rule_change', label: '企画ルール変更', targetLabel: '本部', notifyTarget: 'hq' },
  { key: 'layout_change', label: '配置図変更', targetLabel: '本部', notifyTarget: 'hq' },
  {
    key: 'distribution_change',
    label: '商品配布基準変更',
    targetLabel: '会計',
    notifyTarget: 'accounting',
  },
  { key: 'damage_report', label: '物品破損報告', targetLabel: '物品', notifyTarget: 'property' },
];

/** 緊急呼び出しの優先度 */
export const EMERGENCY_PRIORITIES = [
  { key: 'high', label: '高' },
  { key: 'normal', label: '中' },
];

/** 開始/終了報告の操作 */
export const EVENT_STATUS_OPTIONS = [
  { key: 'start', label: '開始報告' },
  { key: 'end', label: '終了報告' },
];

/** ローカル保存キー */
export const STORAGE_KEYS = {
  EVENT_NAME: 'item16_event_name',
  EVENT_LOCATION: 'item16_event_location',
  /** 下書き: 質問詳細 */
  DRAFT_QUESTION_DETAIL: 'item16_draft_question_detail',
  /** 下書き: 緊急連絡詳細 */
  DRAFT_EMERGENCY_DETAIL: 'item16_draft_emergency_detail',
  /** 下書き: 鍵申請理由 */
  DRAFT_KEY_REASON: 'item16_draft_key_reason',
};
