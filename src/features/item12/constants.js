/**
 * Item12 (Patrol) constants.
 */

export const ITEM12_SECTION_OPTIONS = [
  { value: 'tasks', label: 'タスク一覧' },
  { value: 'check', label: '巡回チェック' },
  { value: 'evaluation', label: '評価入力' },
];

export const ITEM12_TASK_STATUS_LABELS = {
  open: '未着手',
  accepted: '受付済',
  en_route: '移動中',
  done: '完了',
  canceled: 'キャンセル',
};

export const ITEM12_TASK_TYPE_LABELS = {
  confirm_start: '開始確認',
  confirm_end: '終了確認',
  lock_check: '施錠確認',
  emergency_support: '緊急対応',
  routine_patrol: '定常巡回',
  other: 'その他',
};

export const ITEM12_RESULT_CODE_OPTIONS = [
  { value: 'OK', label: '問題なし' },
  { value: 'NOT_STARTED', label: '開始していない' },
  { value: 'NOT_ENDED', label: '終了していない' },
  { value: 'LOCKED', label: '施錠済み' },
  { value: 'UNLOCKED', label: '未施錠' },
  { value: 'CANNOT_CONFIRM', label: '確認不可' },
  { value: 'NEED_SUPPORT', label: '要支援' },
  { value: 'OTHER', label: 'その他' },
];

export const ITEM12_CHECK_CATEGORY_OPTIONS = [
  { value: 'health_issue', label: '体調不良' },
  { value: 'trouble', label: 'トラブル' },
  { value: 'visitor_incident', label: '来場者インシデント' },
  { value: 'unlocked', label: '未施錠' },
  { value: 'other', label: 'その他' },
];

export const ITEM12_EVALUATION_STATUS_OPTIONS = [
  { value: 'pending', label: '承認待ち' },
  { value: 'approved', label: '承認' },
  { value: 'rejected', label: '却下' },
  { value: 'rework', label: '差戻し' },
];

export const ITEM12_SCORE_OPTIONS = [1, 2, 3, 4, 5].map((score) => ({
  value: score,
  label: `${score}`,
}));
