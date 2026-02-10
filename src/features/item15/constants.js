/**
 * Item15 (Property) constants.
 */

export const ITEM15_SECTION_OPTIONS = [
  { value: 'inbox', label: '一覧' },
  { value: 'detail', label: '詳細' },
];

export const ITEM15_INBOX_STATUS_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'unread', label: '未読' },
  { value: 'working', label: '対応中' },
  { value: 'done', label: '完了' },
];

export const ITEM15_TICKET_STATUS_OPTIONS = [
  { value: 'new', label: '新規' },
  { value: 'acknowledged', label: '受付済' },
  { value: 'in_progress', label: '対応中' },
  { value: 'waiting_external', label: '他部署確認待ち' },
  { value: 'resolved', label: '解決' },
  { value: 'closed', label: 'クローズ' },
];

export const ITEM15_MESSAGE_KIND_OPTIONS = [
  { value: 'reply', label: '回答（公開）' },
  { value: 'memo', label: '対応メモ（内部）' },
];

export const ITEM15_STATUS_BUCKET_LABELS = {
  all: 'すべて',
  unread: '未読',
  working: '対応中',
  done: '完了',
};
