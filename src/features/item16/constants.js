/**
 * 項目16（企画者）の定数
 */

export const ITEM16_SECTION_OPTIONS = [
  { value: 'tickets', label: 'チケット一覧' },
  { value: 'create', label: '新規チケット' },
  { value: 'report', label: '開始/終了報告' },
  { value: 'reservation', label: '鍵事前申請' },
];

export const ITEM16_TICKET_TYPE_OPTIONS = [
  { value: 'emergency', label: '緊急連絡' },
  { value: 'rule_question', label: 'ルール問い合わせ' },
  { value: 'layout_change', label: '配置図変更相談' },
  { value: 'distribution_change', label: '配布ルール変更' },
  { value: 'damage_report', label: '物品破損' },
  { value: 'key_preapply', label: '鍵事前申請' },
  { value: 'start_report', label: '企画開始報告' },
  { value: 'end_report', label: '企画終了報告' },
];

export const ITEM16_PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'normal', label: '通常' },
  { value: 'low', label: '低' },
];

export const ITEM16_REPORT_TYPE_OPTIONS = [
  { value: 'start_report', label: '開始報告' },
  { value: 'end_report', label: '終了報告' },
];

export const ITEM16_TICKET_STATUS_LABELS = {
  new: '新規',
  acknowledged: '受付済',
  in_progress: '対応中',
  waiting_external: '他部署確認待ち',
  resolved: '解決',
  closed: 'クローズ',
};
