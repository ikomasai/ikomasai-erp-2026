/**
 * 企画一覧互換サービス
 * 旧 organizations_events 参照箇所を events ベースの統一企画一覧へ寄せる
 */

import { selectSupportEvents } from './eventService.js';

/**
 * 企画一覧を取得する
 * 既存の organizationEvents 系 UI が期待する
 * `organization_name` / `event_name` / `sheet_name` を含む形で返す
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=200] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const selectOrganizationEvents = async ({ limit = 200 } = {}) => {
  const { data, error } = await selectSupportEvents({ limit });

  if (error) {
    console.error('企画一覧取得エラー:', error);
    return { data: [], error };
  }

  return {
    data: (data || []).map((event) => ({
      ...event,
      sheet_name: event.sheet_name || '',
    })),
    error: null,
  };
};
