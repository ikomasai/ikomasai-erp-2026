/**
 * 設定機能の定数
 */

import { MIN_PASSWORD_LENGTH } from '../auth/constants';

/**
 * 設定画面のセクションタイトル
 */
export const SETTINGS_SECTION_TITLES = {
  ACCOUNT: 'アカウント',
  DISPLAY: '表示',
  ADMIN: '管理者',
};

/**
 * 設定画面のヘッダータイトル
 */
export const SETTINGS_SCREEN_TITLE = '設定';

/**
 * パスワード変更セクションのテキスト定数
 */
export const SETTINGS_PASSWORD_TEXT = {
  CURRENT_PASSWORD_LABEL: '現在のパスワード',
  CURRENT_PASSWORD_PLACEHOLDER: '現在のパスワードを入力',
  CURRENT_PASSWORD_HINT: 'ログイン中のパスワードです（変更不可）',
  NEW_PASSWORD_LABEL: `新しいパスワード（${MIN_PASSWORD_LENGTH}文字以上）`,
  NEW_PASSWORD_PLACEHOLDER: `新しいパスワードを入力（${MIN_PASSWORD_LENGTH}文字以上）`,
  CONFIRM_PASSWORD_LABEL: '新しいパスワード（確認用）',
  CONFIRM_PASSWORD_PLACEHOLDER: 'もう一度入力してください',
  SUBMIT_BUTTON: 'パスワードを変更する',
};

/**
 * パスワード表示の継続時間（秒）
 * 目のアイコンタップ後、この時間が経過すると自動で非表示になる
 */
export const PASSWORD_REVEAL_DURATION_SEC = 5;

/**
 * パスワード変更成功時のメッセージ
 */
export const SETTINGS_PASSWORD_SUCCESS_MESSAGE =
  'パスワードが正常に変更されました。次回ログインから新しいパスワードを使用してください。';

/**
 * テーマオプション定義
 */
export const THEME_OPTIONS = [
  { 
    value: 'light', 
    label: 'ライトモード', 
    icon: '☀️',
    description: '明るく読みやすい標準テーマ'
  },
  { 
    value: 'dark', 
    label: 'ダークモード', 
    icon: '🌙',
    description: '目に優しい暗いテーマ'
  },
  { 
    value: 'joshi', 
    label: 'ゆるふわモード', 
    icon: '💗',
    description: '丸みのある優しいデザイン'
  },
  { 
    value: 'cyber', 
    label: 'サイバーモード', 
    icon: '🌐',
    description: '未来的で鋭角的なデザイン'
  },
  { 
    value: 'neon', 
    label: 'ネオンモード', 
    icon: '✨',
    description: '強調された発光的デザイン'
  },
];
