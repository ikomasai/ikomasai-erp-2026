/**
 * Supabaseクライアント設定
 * Supabaseへの接続を管理します
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase URL
 * 環境変数から取得します
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * Supabase Anon Key
 * 環境変数から取得します
 */
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase設定が揃っているか
 */
const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Test-only client override.
 * Runtime application code must not depend on this.
 */
let supabaseClientTestOverride = null;

/**
 * 設定不足エラーを生成する
 * @returns {Error} 設定不足エラー
 */
const createMissingConfigError = () => {
  return new Error(
    'Supabaseの環境変数が未設定です。.env で EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。'
  );
};

/**
 * Supabaseクライアントインスタンス
 * アプリケーション全体で共有されます
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // 認証設定
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Supabaseクライアントを取得する
 * @returns {Object} Supabaseクライアント
 */
export const getSupabaseClient = () => {
  if (supabaseClientTestOverride) {
    return supabaseClientTestOverride;
  }

  if (!isSupabaseConfigured || !supabase) {
    throw createMissingConfigError();
  }

  return supabase;
};

/**
 * Set Supabase client override for automated tests.
 * @param {Object|null} clientOverride - Mock supabase client.
 * @returns {void}
 */
export const __setSupabaseClientForTest = (clientOverride) => {
  supabaseClientTestOverride = clientOverride || null;
};

/**
 * Reset test-only Supabase client override.
 * @returns {void}
 */
export const __resetSupabaseClientForTest = () => {
  supabaseClientTestOverride = null;
};

/**
 * 接続テスト関数
 * Supabaseへの接続が正常かどうかをテストします
 * @returns {Promise<boolean>} 接続成功の場合true
 */
export const testConnection = async () => {
  try {
    const { error } = await getSupabaseClient()
      .from('_test')
      .select('*')
      .limit(1);
    // テーブルが存在しない場合もエラーが返るが、接続自体は成功している
    if (error && !error.message.includes('does not exist')) {
      console.error('Supabase接続エラー:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Supabase接続テスト失敗:', error);
    return false;
  }
};
