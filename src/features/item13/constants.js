/**
 * Item13 (HQ) constants.
 */

export const ITEM13_SECTION_OPTIONS = [
  { value: 'dashboard', label: 'ダッシュボード' },
  { value: 'tickets', label: 'チケット' },
  { value: 'tasks', label: '巡回タスク' },
  { value: 'keys', label: '鍵管理' },
  { value: 'evaluation', label: '評価承認' },
];

export const ITEM13_TICKET_STATUS_OPTIONS = [
  { value: 'new', label: '新規' },
  { value: 'acknowledged', label: '受付済' },
  { value: 'in_progress', label: '対応中' },
  { value: 'waiting_external', label: '他部署確認待ち' },
  { value: 'resolved', label: '解決' },
  { value: 'closed', label: 'クローズ' },
];

export const ITEM13_TASK_STATUS_OPTIONS = [
  { value: 'open', label: '未着手' },
  { value: 'accepted', label: '受付済' },
  { value: 'en_route', label: '移動中' },
  { value: 'done', label: '完了' },
  { value: 'canceled', label: 'キャンセル' },
];

export const ITEM13_EVALUATION_DECISION_OPTIONS = [
  { value: 'approved', label: '承認' },
  { value: 'rejected', label: '却下' },
  { value: 'rework', label: '差戻し' },
];

export const ITEM13_NOTIFY_TARGET_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'accounting', label: '会計' },
  { value: 'property', label: '物品' },
];

export const ITEM13_SEVERITY_LABELS = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
};
