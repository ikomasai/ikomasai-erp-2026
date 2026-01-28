/**
 * ユーザーロール定数
 * 通知配信や権限管理に使用
 */
export const USER_ROLES = {
  /** システム管理者（全機能アクセス可） */
  ADMIN: 'admin',
  
  /** オペレーター（ほぼ全機能アクセス可） */
  OPERATOR: 'operator',
  
  /** スタッフ（基本機能のみ） */
  STAFF: 'staff',
  
  // 部門別ロール
  /** 屋台担当マネージャー */
  VENDOR_MANAGER: 'vendor_manager',
  
  /** 在庫管理者 */
  INVENTORY_MANAGER: 'inventory_manager',
  
  /** 会計担当者 */
  ACCOUNTANT: 'accountant',
  
  /** スケジュール管理者 */
  SCHEDULE_MANAGER: 'schedule_manager',
  
  // サークル関連ロール
  /** サークル責任者 */
  CIRCLE_LEADER: 'circle_leader',
  
  /** サークルメンバー */
  CIRCLE_MEMBER: 'circle_member',
  
  /** 総合マネージャー */
  MANAGER: 'manager',
};

/**
 * ロール表示名マップ
 */
export const ROLE_DISPLAY_NAMES = {
  [USER_ROLES.ADMIN]: 'システム管理者',
  [USER_ROLES.OPERATOR]: 'オペレーター',
  [USER_ROLES.STAFF]: 'スタッフ',
  [USER_ROLES.VENDOR_MANAGER]: '屋台担当マネージャー',
  [USER_ROLES.INVENTORY_MANAGER]: '在庫管理者',
  [USER_ROLES.ACCOUNTANT]: '会計担当者',
  [USER_ROLES.SCHEDULE_MANAGER]: 'スケジュール管理者',
  [USER_ROLES.CIRCLE_LEADER]: 'サークル責任者',
  [USER_ROLES.CIRCLE_MEMBER]: 'サークルメンバー',
  [USER_ROLES.MANAGER]: '総合マネージャー',
};
