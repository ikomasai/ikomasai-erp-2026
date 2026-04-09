/**
 * 臨時ヘルプ機能の定数群
 */

/**
 * 募集ステータスの内部値。
 */
export const RINJI_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
};

/**
 * 募集終了理由の内部値。
 * - manual: 管理者が手動で終了
 * - auto_full: 募集人数到達で自動終了
 */
export const RINJI_CLOSE_REASON = {
  MANUAL: 'manual',
  AUTO_FULL: 'auto_full',
  AUTO_DATE_PASSED: 'auto_date_passed',
};

/**
 * 募集の任意項目に対する既定値。
 */
export const OPTIONAL_FIELD_DEFAULTS = {
  /**
   * 集合場所が未指定の場合は場所をフォールバックとして使う。
   *
   * @param {string | null | undefined} location
   * @returns {string}
   */
  meet_place: (location) => location || '',
  meet_time: null,
  belongings: 'なし',
};

/**
 * 臨時ヘルプで管理者扱いにするロール名。
 */
const PRIVILEGED_ROLE_NAMES = ['部長', '管理者', '実長', '副実', '祭実長'];

/**
 * ロール名比較用に文字列を正規化する。
 *
 * @param {string | null | undefined} name
 * @returns {string}
 */
const normalizeRoleName = (name) =>
  (name || '').toString().trim();

/**
 * ロール配列から管理者権限の有無を判定する。
 *
 * @param {Array<{name?: string}>} roles
 * @returns {boolean}
 */
export const isManager = (roles = []) =>
  roles?.some((role) => {
    const n = normalizeRoleName(role?.name);
    return PRIVILEGED_ROLE_NAMES.includes(n);
  });
