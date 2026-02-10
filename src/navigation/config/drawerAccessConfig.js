/**
 * Drawerアクセス設定
 * 権限名・画面名・表示名の対応を一元管理します
 */

const TOTAL_DRAWER_ITEMS = 16;

const ITEM_LABELS = Object.freeze({
  11: '当日部員',
  12: '巡回',
  13: '本部',
  14: '会計',
  15: '物品',
  16: '企画者',
});

const SCREEN_NAME_MAP = Object.freeze({
  11: 'JimuShift',
  12: 'Item12',
  13: 'Item13',
  14: 'Item14',
  15: 'Item15',
  16: 'Item16',
});

const PERMISSION_NAME_MAP = Object.freeze({
  11: '当日部員',
  12: 'item12',
  13: 'item13',
  14: 'item14',
  15: 'item15',
  16: 'item16',
});

/**
 * 項目番号に対応する権限名を取得
 * @param {number} itemNumber - 項目番号
 * @returns {string} 権限名
 */
const getPermissionNameByItemNumber = (itemNumber) => {
  return PERMISSION_NAME_MAP[itemNumber] || `item${itemNumber}`;
};

/**
 * 項目番号に対応する画面名を取得
 * @param {number} itemNumber - 項目番号
 * @returns {string} 画面名
 */
const getScreenNameByItemNumber = (itemNumber) => {
  return SCREEN_NAME_MAP[itemNumber] || `Item${itemNumber}`;
};

/**
 * 項目番号に対応する表示名を取得
 * @param {number} itemNumber - 項目番号
 * @returns {string} 表示名
 */
const getLabelByItemNumber = (itemNumber) => {
  return ITEM_LABELS[itemNumber] || `項目${itemNumber}`;
};

/**
 * Drawer表示可能な項目一覧を生成
 * @param {Object} params - 生成パラメータ
 * @param {Array<Object>} params.userRoles - ユーザーロール一覧
 * @param {Function} params.canAccessScreenFn - 権限判定関数
 * @param {number} [params.totalItems=16] - 総項目数
 * @returns {Array<Object>} 表示可能項目一覧
 */
const buildAccessibleDrawerItems = ({ userRoles, canAccessScreenFn, totalItems = TOTAL_DRAWER_ITEMS }) => {
  const safeRoles = Array.isArray(userRoles) ? userRoles : [];

  return Array.from({ length: totalItems }, (_, index) => {
    const itemNumber = index + 1;
    const permissionName = getPermissionNameByItemNumber(itemNumber);
    const isAccessible = Boolean(canAccessScreenFn(safeRoles, permissionName));

    return {
      number: itemNumber,
      label: getLabelByItemNumber(itemNumber),
      screenName: getScreenNameByItemNumber(itemNumber),
      permissionName,
      isAccessible,
    };
  }).filter((item) => item.isAccessible);
};

module.exports = {
  ITEM_LABELS,
  PERMISSION_NAME_MAP,
  SCREEN_NAME_MAP,
  TOTAL_DRAWER_ITEMS,
  buildAccessibleDrawerItems,
  getLabelByItemNumber,
  getPermissionNameByItemNumber,
  getScreenNameByItemNumber,
};

module.exports.default = module.exports;
