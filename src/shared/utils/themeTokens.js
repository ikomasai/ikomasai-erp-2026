/**
 * テーマトークン定義
 * 各テーマの色設定を管理
 */

export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  JOSHI: 'joshi',
  CYBER: 'cyber',
  NEON: 'neon',
};

export const themeTokens = {
  [THEME_MODES.LIGHT]: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    primary: '#1976D2',
    primaryVariant: '#1565C0',
    secondary: '#424242',
    text: '#000000',
    textSecondary: '#666666',
    border: '#E0E0E0',
    error: '#D32F2F',
    success: '#388E3C',
  },
  [THEME_MODES.DARK]: {
    background: '#121212',
    surface: '#1E1E1E',
    primary: '#90CAF9',
    primaryVariant: '#64B5F6',
    secondary: '#BDBDBD',
    text: '#FFFFFF',
    textSecondary: '#B0B0B0',
    border: '#333333',
    error: '#EF5350',
    success: '#66BB6A',
  },
  [THEME_MODES.JOSHI]: {
    background: '#FFF5F7',
    surface: '#FFE4E9',
    primary: '#FF69B4',
    primaryVariant: '#FF1493',
    secondary: '#8B4789',
    text: '#4A0E4E',
    textSecondary: '#8B4789',
    border: '#FFB6D9',
    error: '#DC143C',
    success: '#FF69B4',
  },
  [THEME_MODES.CYBER]: {
    background: '#0A1929',
    surface: '#132F4C',
    primary: '#00D9FF',
    primaryVariant: '#00B8D4',
    secondary: '#FFD700',
    text: '#FFFFFF',
    textSecondary: '#B2BAC2',
    border: '#1E4976',
    error: '#FF4842',
    success: '#00D9FF',
  },
  [THEME_MODES.NEON]: {
    background: '#000000',
    surface: '#1A1A1A',
    primary: '#FF6B00',
    primaryVariant: '#E65100',
    secondary: '#00FF00',
    text: '#FFFFFF',
    textSecondary: '#CCCCCC',
    border: '#333333',
    error: '#FF0000',
    success: '#00FF00',
  },
};

export const getThemeTokens = (mode) => {
  return themeTokens[mode] || themeTokens[THEME_MODES.LIGHT];
};
