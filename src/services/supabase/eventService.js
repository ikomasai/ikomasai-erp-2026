/**
 * 企画マスタサービス
 * events の取得を担当
 */

import { getSupabaseClient } from './client.js';

const EVENTS_TABLE = 'events';
const EVENT_COLUMNS = 'id,name,location,created_at,updated_at';

/**
 * 企画一覧を取得
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=120] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listEvents = async ({ limit = 120 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(EVENTS_TABLE)
      .select(EVENT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('企画一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('企画一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};
