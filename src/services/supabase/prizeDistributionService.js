/**
 * 景品配布基準サービス
 * prize_distribution テーブルの取得を担当
 */

import { getSupabaseClient } from './client.js';

/** テーブル名 */
const PRIZE_DISTRIBUTION_TABLE = 'prize_distribution';

/** 取得カラム */
const PRIZE_COLUMNS =
  'id,organization_name,event_name,prize_number,prize_name,prize_count,distribution_criteria,created_at';

/**
 * 景品配布基準一覧を取得
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=300] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const selectPrizeDistributions = async ({ limit = 300 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(PRIZE_DISTRIBUTION_TABLE)
      .select(PRIZE_COLUMNS)
      .order('organization_name', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('景品配布基準取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('景品配布基準取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 景品配布基準を更新
 * @param {Object} input - 更新条件
 * @param {string} input.prizeDistributionId - 景品配布基準ID
 * @param {string} input.distributionCriteria - 更新後の配布基準
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const updatePrizeDistributionCriteria = async (input) => {
  try {
    /** 更新対象ID */
    const prizeDistributionId =
      input?.prizeDistributionId === null || input?.prizeDistributionId === undefined
        ? ''
        : String(input.prizeDistributionId).trim();
    /** 更新後の配布基準 */
    const distributionCriteria = (input?.distributionCriteria || '').trim();

    if (!prizeDistributionId) {
      throw new Error('景品配布基準IDが未指定です');
    }
    if (!distributionCriteria) {
      throw new Error('景品配布基準の内容を入力してください');
    }

    const { data, error } = await getSupabaseClient()
      .from(PRIZE_DISTRIBUTION_TABLE)
      .update({
        distribution_criteria: distributionCriteria,
      })
      .eq('id', prizeDistributionId)
      .select(PRIZE_COLUMNS)
      .single();

    if (error) {
      console.error('景品配布基準更新エラー:', error);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  } catch (error) {
    console.error('景品配布基準更新処理でエラー:', error);
    return { data: null, error };
  }
};
