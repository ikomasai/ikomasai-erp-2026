/**
 * 団体別企画一覧サービス
 * organizations_events テーブルの取得を担当
 */

import { getSupabaseClient } from './client.js';

/** テーブル名 */
const ORGANIZATIONS_EVENTS_TABLE = 'organizations_events';

/** 取得カラム */
const ORGANIZATION_EVENT_COLUMNS = 'id,organization_name,event_name,sheet_name,created_at,updated_at';

/**
 * 文字列を前後空白除去して正規化する
 * @param {string|null|undefined} value - 対象文字列
 * @returns {string} 正規化後文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * 団体別企画一覧の並び順を比較する
 * @param {Object} left - 左側レコード
 * @param {Object} right - 右側レコード
 * @returns {number} 比較結果
 */
const compareOrganizationEvents = (left, right) => {
  /** 左側団体名 */
  const leftOrganizationName = normalizeText(left?.organization_name);
  /** 右側団体名 */
  const rightOrganizationName = normalizeText(right?.organization_name);
  /** 団体名比較結果 */
  const organizationCompare = leftOrganizationName.localeCompare(rightOrganizationName, 'ja');

  if (organizationCompare !== 0) {
    return organizationCompare;
  }

  /** 左側企画名 */
  const leftEventName = normalizeText(left?.event_name);
  /** 右側企画名 */
  const rightEventName = normalizeText(right?.event_name);
  /** 企画名比較結果 */
  const eventCompare = leftEventName.localeCompare(rightEventName, 'ja');

  if (eventCompare !== 0) {
    return eventCompare;
  }

  return Number(left?.id || 0) - Number(right?.id || 0);
};

/**
 * 団体別企画一覧を取得する
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=200] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const selectOrganizationEvents = async ({ limit = 200 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(ORGANIZATIONS_EVENTS_TABLE)
      .select(ORGANIZATION_EVENT_COLUMNS)
      .order('organization_name', { ascending: true })
      .order('event_name', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('団体別企画一覧取得エラー:', error);
      return { data: [], error };
    }

    /** 画面表示向けに正規化したレコード一覧 */
    const normalizedData = (data || [])
      .map((item) => ({
        ...item,
        organization_name: normalizeText(item?.organization_name),
        event_name: normalizeText(item?.event_name),
        sheet_name: normalizeText(item?.sheet_name),
      }))
      .filter((item) => item.organization_name || item.event_name)
      .sort(compareOrganizationEvents);

    return { data: normalizedData, error: null };
  } catch (error) {
    console.error('団体別企画一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};
