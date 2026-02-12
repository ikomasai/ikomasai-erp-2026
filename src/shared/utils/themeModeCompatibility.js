/**
 * テーマモード互換ユーティリティ
 * 旧値（world_trigger/eva）を新値（cyber/neon）へ正規化します
 */

const THEME_MODE_VALUES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  JOSHI: 'joshi',
  CYBER: 'cyber',
  NEON: 'neon',
});

const CANONICAL_THEME_MODES = Object.freeze([
  THEME_MODE_VALUES.LIGHT,
  THEME_MODE_VALUES.DARK,
  THEME_MODE_VALUES.JOSHI,
  THEME_MODE_VALUES.CYBER,
  THEME_MODE_VALUES.NEON,
]);

const LEGACY_THEME_MODE_MAP = Object.freeze({
  world_trigger: THEME_MODE_VALUES.CYBER,
  eva: THEME_MODE_VALUES.NEON,
});

const THEME_MODE_DISPLAY_NAME_MAP = Object.freeze({
  light: 'ライトモード',
  dark: 'ダークモード',
  joshi: 'ゆるふわモード',
  cyber: 'サイバーモード',
  neon: 'ネオンモード',
  world_trigger: 'サイバーモード',
  eva: 'ネオンモード',
});

const canonicalThemeModeSet = new Set(CANONICAL_THEME_MODES);

/**
 * 値が正規テーマモードか判定
 * @param {string} themeMode - 判定対象
 * @returns {boolean} 正規テーマモードならtrue
 */
const isCanonicalThemeMode = (themeMode) => {
  if (typeof themeMode !== 'string') {
    return false;
  }

  return canonicalThemeModeSet.has(themeMode.trim().toLowerCase());
};

/**
 * 値が旧テーマモードか判定
 * @param {string} themeMode - 判定対象
 * @returns {boolean} 旧テーマモードならtrue
 */
const isLegacyThemeMode = (themeMode) => {
  if (typeof themeMode !== 'string') {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(LEGACY_THEME_MODE_MAP, themeMode.trim().toLowerCase());
};

/**
 * テーマモードを正規化
 * @param {string | null | undefined} themeMode - 入力値
 * @param {string} [fallbackMode='light'] - 不正値時のフォールバック
 * @returns {string} 正規テーマモード
 */
const normalizeThemeMode = (themeMode, fallbackMode = THEME_MODE_VALUES.LIGHT) => {
  const normalizedFallbackMode = isCanonicalThemeMode(fallbackMode) ? fallbackMode : THEME_MODE_VALUES.LIGHT;

  if (typeof themeMode !== 'string' || !themeMode.trim()) {
    return normalizedFallbackMode;
  }

  const normalizedThemeMode = themeMode.trim().toLowerCase();

  if (isCanonicalThemeMode(normalizedThemeMode)) {
    return normalizedThemeMode;
  }

  if (isLegacyThemeMode(normalizedThemeMode)) {
    return LEGACY_THEME_MODE_MAP[normalizedThemeMode];
  }

  return normalizedFallbackMode;
};

/**
 * テーマモードに対応するUI表示名を取得
 * @param {string | null | undefined} themeMode - テーマモード値
 * @returns {string} 表示名
 */
const getThemeModeDisplayName = (themeMode) => {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  return THEME_MODE_DISPLAY_NAME_MAP[themeMode] || THEME_MODE_DISPLAY_NAME_MAP[normalizedThemeMode];
};

module.exports = {
  CANONICAL_THEME_MODES,
  LEGACY_THEME_MODE_MAP,
  THEME_MODE_DISPLAY_NAME_MAP,
  THEME_MODE_VALUES,
  getThemeModeDisplayName,
  isCanonicalThemeMode,
  isLegacyThemeMode,
  normalizeThemeMode,
};

module.exports.default = module.exports;
