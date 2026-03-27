/**
 * 企画評価サービス
 * evaluation_checks の登録・取得・承認を担当
 */

import { getSupabaseClient } from './client.js';

const EVALUATION_CHECKS_TABLE = 'evaluation_checks';
const EVALUATION_COLUMNS =
  'id,event_id,ticket_id,task_id,evaluator_id,evaluation_status,score,comment,reviewed_by,reviewed_at,created_at,updated_at';

const normalizeText = (value) => (value || '').trim();

/** 評価状態 */
export const EVALUATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REWORK: 'rework',
};

const VALID_STATUSES = new Set(Object.values(EVALUATION_STATUSES));

/**
 * 評価一覧を取得
 * @param {Object} params - 取得条件
 * @param {string|null} [params.evaluatorId] - 評価者ユーザーID
 * @param {string[]} [params.statuses] - 状態フィルタ
 * @param {number} [params.limit=80] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listEvaluationChecks = async ({ evaluatorId = null, statuses = [], limit = 80 } = {}) => {
  try {
    let query = getSupabaseClient()
      .from(EVALUATION_CHECKS_TABLE)
      .select(
        `
          ${EVALUATION_COLUMNS}
        `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const normalizedEvaluatorId = normalizeText(evaluatorId);
    if (normalizedEvaluatorId) {
      query = query.eq('evaluator_id', normalizedEvaluatorId);
    }

    const normalizedStatuses = Array.isArray(statuses)
      ? statuses.map((status) => normalizeText(status)).filter((status) => VALID_STATUSES.has(status))
      : [];
    if (normalizedStatuses.length > 0) {
      query = query.in('evaluation_status', normalizedStatuses);
    }

    const { data, error } = await query;
    if (error) {
      console.error('評価一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('評価一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 評価を登録（承認待ち）
 * @param {Object} input - 登録データ
 * @param {string|null} [input.eventId] - 企画ID
 * @param {string|null} [input.ticketId] - 連絡案件ID
 * @param {string|null} [input.taskId] - 巡回タスクID
 * @param {string} input.evaluatorId - 評価入力者
 * @param {number} input.score - 点数（1-5）
 * @param {string} [input.comment] - コメント
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const createEvaluationCheck = async (input) => {
  try {
    const evaluatorId = normalizeText(input.evaluatorId);
    const eventId = normalizeText(input.eventId) || null;
    const ticketId = normalizeText(input.ticketId) || null;
    const taskId = normalizeText(input.taskId) || null;
    const comment = normalizeText(input.comment) || null;
    const scoreNumber = Number(input.score);
    const score = Number.isFinite(scoreNumber) ? Math.max(1, Math.min(5, Math.round(scoreNumber))) : null;

    if (!evaluatorId) {
      throw new Error('evaluatorId が未指定です');
    }
    if (!eventId && !ticketId && !taskId) {
      throw new Error('評価対象（eventId/ticketId/taskId）のいずれかが必要です');
    }
    if (!score) {
      throw new Error('score は 1〜5 で指定してください');
    }

    const payload = {
      event_id: eventId,
      ticket_id: ticketId,
      task_id: taskId,
      evaluator_id: evaluatorId,
      evaluation_status: EVALUATION_STATUSES.PENDING,
      score,
      comment,
    };

    const { data, error } = await getSupabaseClient()
      .from(EVALUATION_CHECKS_TABLE)
      .insert(payload)
      .select(EVALUATION_COLUMNS)
      .single();

    if (error) {
      console.error('評価登録エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 評価承認状態を更新（本部向け）
 * @param {Object} input - 更新データ
 * @param {string} input.evaluationId - 評価ID
 * @param {'approved'|'rejected'|'rework'} input.status - 更新後状態
 * @param {string} input.reviewedBy - レビュー担当者
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const reviewEvaluationCheck = async (input) => {
  try {
    const evaluationId = normalizeText(input.evaluationId);
    const status = normalizeText(input.status);
    const reviewedBy = normalizeText(input.reviewedBy);

    if (!evaluationId) {
      throw new Error('evaluationId が未指定です');
    }
    if (![EVALUATION_STATUSES.APPROVED, EVALUATION_STATUSES.REJECTED, EVALUATION_STATUSES.REWORK].includes(status)) {
      throw new Error('status は approved/rejected/rework のいずれかを指定してください');
    }
    if (!reviewedBy) {
      throw new Error('reviewedBy が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(EVALUATION_CHECKS_TABLE)
      .update({
        evaluation_status: status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', evaluationId)
      .select(EVALUATION_COLUMNS)
      .single();

    if (error) {
      console.error('評価更新エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
