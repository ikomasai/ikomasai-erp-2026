/**
 * 通知タイプ定数
 * 通知の種類と表示スタイルを定義
 */
export const NOTIFICATION_TYPES = {
  /** 一般的な情報通知 */
  INFO: 'info',
  
  /** 処理成功時の通知 */
  SUCCESS: 'success',
  
  /** 注意が必要な内容 */
  WARNING: 'warning',
  
  /** エラー発生時の通知 */
  ERROR: 'error',
  
  /** 屋台停止通知 */
  VENDOR_STOP: 'vendor_stop',
  
  /** スケジュール変更通知 */
  SCHEDULE_CHANGE: 'schedule_change',
  
  /** 在庫アラート */
  INVENTORY_ALERT: 'inventory_alert',
  
  /** ユーザーアクション通知 */
  USER_ACTION: 'user_action',
};

/**
 * 通知タイプの設定
 * 各タイプの表示スタイル、優先度、自動閉じる秒数を定義
 */
export const NOTIFICATION_TYPE_CONFIG = {
  [NOTIFICATION_TYPES.INFO]: {
    displayName: '情報',
    color: '#3B82F6', // 青色
    priority: 1,
    autoDismissSeconds: 7,
    icon: 'information-circle',
  },
  [NOTIFICATION_TYPES.SUCCESS]: {
    displayName: '成功',
    color: '#10B981', // 緑色
    priority: 1,
    autoDismissSeconds: 5,
    icon: 'checkmark-circle',
  },
  [NOTIFICATION_TYPES.WARNING]: {
    displayName: '警告',
    color: '#F59E0B', // 橙色
    priority: 2,
    autoDismissSeconds: null, // 自動で閉じない
    icon: 'warning',
  },
  [NOTIFICATION_TYPES.ERROR]: {
    displayName: 'エラー',
    color: '#EF4444', // 赤色
    priority: 3,
    autoDismissSeconds: null, // 自動で閉じない
    icon: 'alert-circle',
  },
  [NOTIFICATION_TYPES.VENDOR_STOP]: {
    displayName: '屋台停止',
    color: '#DC2626', // 濃い赤色
    priority: 3,
    autoDismissSeconds: null,
    icon: 'stop-circle',
  },
  [NOTIFICATION_TYPES.SCHEDULE_CHANGE]: {
    displayName: 'スケジュール変更',
    color: '#8B5CF6', // 紫色
    priority: 2,
    autoDismissSeconds: 10,
    icon: 'time',
  },
  [NOTIFICATION_TYPES.INVENTORY_ALERT]: {
    displayName: '在庫アラート',
    color: '#F97316', // オレンジ色
    priority: 2,
    autoDismissSeconds: null,
    icon: 'cube',
  },
  [NOTIFICATION_TYPES.USER_ACTION]: {
    displayName: 'ユーザーアクション',
    color: '#06B6D4', // シアン色
    priority: 1,
    autoDismissSeconds: 7,
    icon: 'person',
  },
};

/**
 * 通知の優先度
 */
export const NOTIFICATION_PRIORITY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/**
 * 通知の状態
 */
export const NOTIFICATION_STATUS = {
  /** 送信待ち */
  PENDING: 'pending',
  
  /** 送信済み */
  SENT: 'sent',
  
  /** 送信失敗 */
  FAILED: 'failed',
};
