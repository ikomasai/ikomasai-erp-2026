/**
 * Edge Function認証補助サービス
 * Edge Function呼び出し時のアクセストークン取得と401復旧を扱う
 */

import { getSupabaseClient } from '../../services/supabase/client.js';

/** 再ログイン案内文言 */
const RELOGIN_REQUIRED_MESSAGE = '認証セッションが無効です。再ログインしてください。';

/**
 * 現在のアクセストークンを取得する
 * @returns {Promise<string|null>} アクセストークン
 */
export const getEdgeFunctionAccessToken = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();
  /** セッション取得結果 */
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data?.session?.access_token ?? null;
};

/**
 * Edge Functionエラーが401かどうか
 * @param {unknown} error - Edge Functionエラー
 * @returns {boolean} 401ならtrue
 */
export const isUnauthorizedFunctionError = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  /** 参照用エラー */
  const maybeError = /** @type {{ context?: { status?: number }; status?: number; message?: string }} */ (error);
  /** HTTPステータス */
  const status = maybeError.context?.status ?? maybeError.status;
  if (status === 401) {
    return true;
  }

  /** エラーメッセージ */
  const message = (maybeError.message ?? '').toLowerCase();
  return message.includes('401') || message.includes('unauthorized');
};

/**
 * 401発生後にセッションを再発行し、最新アクセストークンを返す
 * stale JWT は PostgREST では通っても Edge Function 側の auth.getUser() で拒否されることがあるため、
 * refresh token を使って最新セッションへ同期し直す。
 *
 * @returns {Promise<{accessToken: string|null, error: Error|null}>} 復旧結果
 */
export const recoverEdgeFunctionAccessToken = async () => {
  try {
    /** Supabaseクライアント */
    const supabase = getSupabaseClient();
    /** セッション再発行結果 */
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      console.error('Edge Function用セッション再発行エラー:', error);
      return {
        accessToken: null,
        error: new Error(RELOGIN_REQUIRED_MESSAGE),
      };
    }

    /** 再発行後アクセストークン */
    const accessToken = data?.session?.access_token ?? null;
    if (!accessToken) {
      return {
        accessToken: null,
        error: new Error(RELOGIN_REQUIRED_MESSAGE),
      };
    }

    return {
      accessToken,
      error: null,
    };
  } catch (error) {
    console.error('Edge Function用セッション再同期処理エラー:', error);
    return {
      accessToken: null,
      error: new Error(RELOGIN_REQUIRED_MESSAGE),
    };
  }
};
