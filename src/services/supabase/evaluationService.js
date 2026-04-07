/**
 * 企画評価サービス
 * evaluation_checks の登録・取得・承認を担当
 */

import { getSupabaseClient } from './client.js';

/** 評価テーブル名 */
const EVALUATION_CHECKS_TABLE = 'evaluation_checks';
/** 評価取得カラム */
const EVALUATION_COLUMNS = `
  id,
  event_id,
  ticket_id,
  task_id,
  evaluator_id,
  evaluation_status,
  score,
  comment,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at,
  event:events(id,name,event_organizations(name)),
  ticket:support_tickets(id,ticket_no,title),
  task:patrol_tasks(id,task_no,event_name,location_text)
`;
/** UUID文字列の判定パターン */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 文字列を前後空白除去して正規化する
 * @param {string|null|undefined} value - 対象文字列
 * @returns {string} 正規化後文字列
 */
const normalizeText = (value) => (typeof value === 'string' ? value : '').trim();

/**
 * ID入力値を文字列化して前後空白除去する
 * @param {string|number|null|undefined} value - 対象値
 * @returns {string} 正規化後文字列
 */
const normalizeIdText = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

/**
 * 任意UUIDを正規化する
 * @param {string|number|null|undefined} value - 対象値
 * @param {string} fieldName - フィールド名
 * @returns {string|null} 正規化後UUID
 */
const normalizeOptionalUuid = (value, fieldName) => {
  /** 正規化後文字列 */
  const normalizedValue = normalizeIdText(value);

  if (!normalizedValue) {
    return null;
  }

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(`${fieldName} は UUID を指定してください`);
  }

  return normalizedValue;
};

/**
 * 必須UUIDを正規化する
 * @param {string|number|null|undefined} value - 対象値
 * @param {string} fieldName - フィールド名
 * @returns {string} 正規化後UUID
 */
const normalizeRequiredUuid = (value, fieldName) => {
  /** 正規化後UUID */
  const normalizedValue = normalizeOptionalUuid(value, fieldName);

  if (!normalizedValue) {
    throw new Error(`${fieldName} が未指定です`);
  }

  return normalizedValue;
};

/**
 * スコアを保存向けに正規化する
 * @param {number|string|null|undefined} value - 入力値
 * @returns {number|null} 正規化後スコア
 */
const normalizeScore = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  /** 数値化した入力値 */
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error('score は 1〜5 の数値で指定してください');
  }

  return Math.max(1, Math.min(5, Math.round(numericValue)));
};

/** 評価状態 */
export const EVALUATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REWORK: 'rework',
};

/** 有効な評価状態一覧 */
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
      .select(EVALUATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    /** 正規化後評価者ID */
    const normalizedEvaluatorId = normalizeOptionalUuid(evaluatorId, 'evaluatorId');
    if (normalizedEvaluatorId) {
      query = query.eq('evaluator_id', normalizedEvaluatorId);
    }

    /** 正規化後ステータス一覧 */
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
 * @param {number|null} [input.score] - 点数（1-5、タスク生成時はnull可）
 * @param {string} [input.comment] - コメント
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const createEvaluationCheck = async (input) => {
  try {
    /** 評価者ユーザーID */
    const evaluatorId = normalizeRequiredUuid(input.evaluatorId, 'evaluatorId');
    /** 企画ID */
    const eventId = normalizeOptionalUuid(input.eventId, 'eventId');
    /** 連絡案件ID */
    const ticketId = normalizeOptionalUuid(input.ticketId, 'ticketId');
    /** 巡回タスクID */
    const taskId = normalizeOptionalUuid(input.taskId, 'taskId');
    /** 評価コメント */
    const comment = normalizeText(input.comment) || null;
    /** 評価点数 */
    const score = normalizeScore(input.score);

    if (!eventId && !ticketId && !taskId) {
      throw new Error('評価対象（eventId/ticketId/taskId）のいずれかが必要です');
    }

    /** 登録payload */
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
    /** 評価ID */
    const evaluationId = normalizeRequiredUuid(input.evaluationId, 'evaluationId');
    /** 更新後ステータス */
    const status = normalizeText(input.status);
    /** レビュー担当ユーザーID */
    const reviewedBy = normalizeRequiredUuid(input.reviewedBy, 'reviewedBy');

    if (![EVALUATION_STATUSES.APPROVED, EVALUATION_STATUSES.REJECTED, EVALUATION_STATUSES.REWORK].includes(status)) {
      throw new Error('status は approved/rejected/rework のいずれかを指定してください');
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

/**
 * 本部向け: 全評価一覧を取得（Excel出力用）
 * evaluation_checks の全レコードを作成日降順で返す
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=500] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listAllEvaluationChecks = async ({ limit = 500 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(EVALUATION_CHECKS_TABLE)
      .select(EVALUATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('全評価一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('全評価一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};
