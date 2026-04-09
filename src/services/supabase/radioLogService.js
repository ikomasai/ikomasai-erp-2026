/**
 * 無線ログサービス
 * radio_logs の登録・取得を担当
 */

import { getSupabaseClient } from './client.js';

const RADIO_LOGS_TABLE = 'radio_logs';
const RADIO_LOG_COLUMNS =
  'id,logged_by,role,channel,message,location_text,related_ticket_id,related_task_id,created_at';

const normalizeText = (value) => (value || '').trim();

/**
 * 無線ログ一覧を取得
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=80] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listRadioLogs = async ({ limit = 80 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(RADIO_LOGS_TABLE)
      .select(RADIO_LOG_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('無線ログ一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('無線ログ一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 無線ログを登録
 * @param {Object} input - 登録内容
 * @param {string} input.loggedBy - 登録者ユーザーID
 * @param {string} [input.role='hq'] - ロール
 * @param {string} [input.channel='main'] - チャンネル
 * @param {string} input.message - メッセージ本文
 * @param {string} [input.locationText] - 場所
 * @param {string} [input.relatedTicketId] - 関連案件ID
 * @param {string} [input.relatedTaskId] - 関連タスクID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const createRadioLog = async (input) => {
  try {
    const loggedBy = normalizeText(input.loggedBy);
    const role = normalizeText(input.role) || 'hq';
    const channel = normalizeText(input.channel) || 'main';
    const message = normalizeText(input.message);
    const locationText = normalizeText(input.locationText) || null;
    const relatedTicketId = normalizeText(input.relatedTicketId) || null;
    const relatedTaskId = normalizeText(input.relatedTaskId) || null;

    if (!loggedBy) {
      throw new Error('loggedBy が未指定です');
    }
    if (!message) {
      throw new Error('無線内容を入力してください');
    }

    const payload = {
      logged_by: loggedBy,
      role,
      channel,
      message,
      location_text: locationText,
      related_ticket_id: relatedTicketId,
      related_task_id: relatedTaskId,
    };

    const { data, error } = await getSupabaseClient()
      .from(RADIO_LOGS_TABLE)
      .insert(payload)
      .select(RADIO_LOG_COLUMNS)
      .single();

    if (error) {
      console.error('無線ログ登録エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
