/**
 * 画面権限管理サービス
 * ユーザーの役職に基づいたアクセス権限をチェックします
 */

/** 管理部統合システム向けの役職名エイリアス */
const ROLE_NAME_ALIASES = {
  admin: ['管理者', 'Admin', 'Administrator'],
  management: ['企画管理部', '本部', 'HQ', 'Headquarters'],
  accounting: ['会計部', '会計', 'Accounting'],
  property: ['物品部', '物品', 'Property'],
  patrol: ['警備部', '巡回', 'Patrol'],
};

/** 管理部統合システムの画面ごとの閲覧役職 */
const MANAGEMENT_SUPPORT_SCREEN_ROLES = {
  item12: [...ROLE_NAME_ALIASES.management, ...ROLE_NAME_ALIASES.patrol, ...ROLE_NAME_ALIASES.admin],
  item13: [...ROLE_NAME_ALIASES.admin],
  item14: [...ROLE_NAME_ALIASES.accounting, ...ROLE_NAME_ALIASES.admin],
  item15: [...ROLE_NAME_ALIASES.property, ...ROLE_NAME_ALIASES.admin],
};

/**
 * 役職名を trim して比較しやすくする
 * @param {string|null|undefined} value - 役職名
 * @returns {string} 正規化済み役職名
 */
const normalizeRoleName = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * 指定役職を1つでも持っているかを判定
 * @param {Array} userRoles - ユーザー役職一覧
 * @param {Array<string>} roleNames - 対象役職名一覧
 * @returns {boolean} 該当役職がある場合 true
 */
const hasAnyRoleName = (userRoles, roleNames) => {
  if (!Array.isArray(userRoles) || userRoles.length === 0) {
    return false;
  }

  const normalizedAllowedNames = new Set((roleNames || []).map(normalizeRoleName).filter(Boolean));
  if (normalizedAllowedNames.size === 0) {
    return false;
  }

  return userRoles.some((role) => {
    const candidateNames = [role?.name, role?.display_name]
      .map(normalizeRoleName)
      .filter(Boolean);
    return candidateNames.some((name) => normalizedAllowedNames.has(name));
  });
};

/**
 * ユーザーが特定の画面にアクセス可能かをチェック
 * @param {Array} userRoles - ユーザーの役職一覧（rolesオブジェクトの配列）
 * @param {String} screenName - 画面名（例: 'item1'）
 * @returns {Boolean} アクセス可能な場合 true
 */
export const canAccessScreen = (userRoles, screenName) => {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return userRoles.some((role) => {
    if (!role.permissions || !role.permissions.screens) {
      return false;
    }

    return role.permissions.screens.includes(screenName);
  });
};

/**
 * 管理部統合システム(item12-item15)の役職ベース閲覧判定
 * @param {Array} userRoles - ユーザー役職一覧
 * @param {string} screenName - 画面権限名
 * @returns {boolean} 閲覧可能な場合 true
 */
export const canAccessManagementSupportScreen = (userRoles, screenName) => {
  const normalizedScreenName = typeof screenName === 'string' ? screenName.trim() : '';
  const requiredRoles = MANAGEMENT_SUPPORT_SCREEN_ROLES[normalizedScreenName];

  if (!requiredRoles) {
    return canAccessScreen(userRoles, normalizedScreenName);
  }

  return hasAnyRoleName(userRoles, requiredRoles);
};

/**
 * ユーザーが特定の画面で特定の機能を使用可能かをチェック
 * @param {Array} userRoles - ユーザーの役職一覧
 * @param {String} screenName - 画面名（例: 'item1'）
 * @param {String} featureName - 機能名（例: 'edit', 'delete'）
 * @returns {Boolean} 使用可能な場合 true
 */
export const canUseFeature = (userRoles, screenName, featureName) => {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return userRoles.some((role) => {
    if (!role.permissions || !role.permissions.features) {
      return false;
    }

    const screenFeatures = role.permissions.features[screenName];

    if (!screenFeatures || !Array.isArray(screenFeatures)) {
      return false;
    }

    return screenFeatures.includes(featureName);
  });
};

/**
 * ユーザーがアクセス可能な画面一覧を取得
 * @param {Array} userRoles - ユーザーの役職一覧
 * @returns {Array} アクセス可能な画面名の配列
 */
export const getAccessibleScreens = (userRoles) => {
  if (!userRoles || userRoles.length === 0) {
    return [];
  }

  const screenSet = new Set();

  userRoles.forEach((role) => {
    if (role.permissions && role.permissions.screens) {
      role.permissions.screens.forEach((screen) => {
        screenSet.add(screen);
      });
    }
  });

  return Array.from(screenSet);
};

/**
 * ユーザーが管理者かどうかをチェック
 * @param {Array} userRoles - ユーザーの役職一覧
 * @returns {Boolean} 管理者の場合 true
 */
export const isAdmin = (userRoles) => {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return hasAnyRoleName(userRoles, ROLE_NAME_ALIASES.admin);
};

/**
 * ユーザーが特定の役職を持っているかをチェック
 * @param {Array} userRoles - ユーザーの役職一覧
 * @param {String} roleName - 役職名（例: '企画管理部', '会計部'）
 * @returns {Boolean} 指定の役職を持っている場合 true
 */
export const hasRole = (userRoles, roleName) => {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return hasAnyRoleName(userRoles, [roleName]);
};
