/**
 * アクセス権限制御（Item7）の定数定義
 * ロールごとの画面アクセス権限を管理するために使用
 */

/**
 * 管理対象の全項目定義
 * permissions.screens に格納されるpermission名とUIラベルの対応
 * @type {Array<{itemNumber: number, permissionName: string, label: string}>}
 */
export const MANAGED_SCREENS = [
  { itemNumber: 1, permissionName: '企画・屋台一覧', label: '企画・屋台一覧' },
  { itemNumber: 2, permissionName: 'item2', label: '屋台詳細' },
  { itemNumber: 3, permissionName: 'item3', label: 'チケット配布率' },
  { itemNumber: 4, permissionName: '落とし物検索', label: '落とし物検索' },
  { itemNumber: 5, permissionName: '迷子検索', label: '迷子検索' },
  { itemNumber: 6, permissionName: 'item6', label: '落とし物管理' },
  { itemNumber: 7, permissionName: 'item7', label: 'アクセス権限制御' },
  { itemNumber: 8, permissionName: 'item8', label: '臨時ヘルプ' },
  { itemNumber: 9, permissionName: '実長機能', label: '実長機能' },
  { itemNumber: 10, permissionName: '本部', label: '本部' },
  { itemNumber: 11, permissionName: '当日部員', label: '当日部員' },
  { itemNumber: 12, permissionName: 'item12', label: '巡回サポート' },
  { itemNumber: 13, permissionName: 'item13', label: '本部サポート' },
  { itemNumber: 14, permissionName: 'item14', label: '会計対応' },
  { itemNumber: 15, permissionName: 'item15', label: '物品対応' },
  { itemNumber: 16, permissionName: 'item16', label: '企画者サポート' },
];

/**
 * ロックアウト防止: 編集不可の組み合わせ
 * これらの組み合わせはUI上でdisabledとなり、チェックを外せない
 * @type {Array<{roleName: string, permissionName: string}>}
 */
export const PROTECTED_PERMISSIONS = [
  { roleName: '管理者', permissionName: 'item7' },
  { roleName: 'システム部', permissionName: 'item7' },
];

/**
 * タブの種類
 * @type {Object}
 */
export const TAB_TYPES = {
  /** ロール別タブ */
  ROLE: 'role',
  /** 項目別タブ */
  SCREEN: 'screen',
};
