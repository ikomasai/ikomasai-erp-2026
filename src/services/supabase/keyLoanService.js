/**
 * 鍵貸出サービス
 * key_loans の取得・登録・返却処理を担当
 */

import { getSupabaseClient } from './client.js';
import { notifyLockCheckTaskCreated } from '../../shared/services/supportWorkflowNotificationService.js';

const KEY_LOANS_TABLE = 'key_loans';
const PATROL_TASKS_TABLE = 'patrol_tasks';

/** 鍵貸出状態 */
export const KEY_LOAN_STATUSES = {
  LOANED: 'loaned',
  RETURNED: 'returned',
};

const normalizeText = (value) => (value || '').trim();

const logNotificationError = (error) => {
  if (error) {
    console.warn('施錠確認タスク通知の送信に失敗:', error);
  }
};

/**
 * 鍵貸出一覧を取得
 * @param {Object} params - 取得条件
 * @param {'loaned'|'returned'} [params.status] - 状態
 * @param {number} [params.limit=80] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listKeyLoans = async ({ status, limit = 80 } = {}) => {
  try {
    let query = getSupabaseClient()
      .from(KEY_LOANS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const normalizedStatus = normalizeText(status);
    if (normalizedStatus) {
      query = query.eq('status', normalizedStatus);
    }

    const { data, error } = await query;
    if (error) {
      console.error('鍵貸出一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('鍵貸出一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 鍵貸出を登録
 * @param {Object} input - 登録データ
 * @param {string} input.keyCode - 鍵コード
 * @param {string} input.keyLabel - 鍵名
 * @param {string} [input.eventName] - 企画名（団体名を格納）
 * @param {string} [input.eventLocation] - 企画場所
 * @param {string} [input.borrowerName] - 借受人
 * @param {string} [input.borrowerContact] - 連絡先
 * @param {Object} [input.metadata] - 追加情報（org_id, org_name など）
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const createKeyLoan = async (input) => {
  try {
    const keyCode = normalizeText(input.keyCode);
    const keyLabel = normalizeText(input.keyLabel);
    if (!keyCode) {
      throw new Error('keyCode が未指定です');
    }
    if (!keyLabel) {
      throw new Error('keyLabel が未指定です');
    }

    const payload = {
      key_code: keyCode,
      key_label: keyLabel,
      event_name: normalizeText(input.eventName) || null,
      event_location: normalizeText(input.eventLocation) || null,
      borrower_name: normalizeText(input.borrowerName) || null,
      borrower_contact: normalizeText(input.borrowerContact) || null,
      status: KEY_LOAN_STATUSES.LOANED,
      /** 追加メタデータ（org_id, org_name など）。未指定時は空オブジェクト */
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };

    const { data, error } = await getSupabaseClient()
      .from(KEY_LOANS_TABLE)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('鍵貸出登録エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 鍵返却を処理し、必要なら施錠確認タスクを作成
 * @param {Object} input - 実行条件
 * @param {string} input.loanId - 貸出ID
 * @param {boolean} [input.createLockTask=true] - 施錠確認タスクを作るか
 * @param {string|null} [input.optionalAssignee] - 担当巡回ユーザーID
 * @param {string} input.returnUserId - 返却処理実行者
 * @returns {Promise<{data: Object|null, error: Error|null}>} 実行結果
 */
export const returnKeyAndCreateLockTask = async (input) => {
  try {
    const loanId = normalizeText(input.loanId);
    const returnUserId = normalizeText(input.returnUserId);
    const shouldCreateLockTask = input.createLockTask !== false;
    const optionalAssignee = normalizeText(input.optionalAssignee) || null;

    if (!loanId) {
      throw new Error('loanId が未指定です');
    }
    if (!returnUserId) {
      throw new Error('returnUserId が未指定です');
    }

    const { data: rpcData, error: rpcError } = await getSupabaseClient().rpc(
      'rpc_return_key_and_create_lock_task',
      {
        loan_id: loanId,
        create_lock_task: shouldCreateLockTask,
        optional_assignee: optionalAssignee,
        return_user_id: returnUserId,
      }
    );

    if (!rpcError) {
      if (shouldCreateLockTask && rpcData?.task) {
        const { error: notifyError } = await notifyLockCheckTaskCreated({
          task: rpcData.task,
          loan: rpcData.loan || null,
          senderUserId: returnUserId,
        });
        logNotificationError(notifyError);
      }
      return { data: rpcData, error: null };
    }

    const { data: loanData, error: loanError } = await getSupabaseClient()
      .from(KEY_LOANS_TABLE)
      .update({
        status: KEY_LOAN_STATUSES.RETURNED,
        returned_at: new Date().toISOString(),
        return_processed_by: returnUserId,
      })
      .eq('id', loanId)
      .select('*')
      .single();

    if (loanError) {
      console.error('鍵返却処理エラー:', loanError);
      return { data: null, error: loanError };
    }

    let createdTask = null;
    if (shouldCreateLockTask) {
      const { data: taskData, error: taskError } = await getSupabaseClient()
        .from(PATROL_TASKS_TABLE)
        .insert({
          task_type: 'lock_check',
          task_status: 'open',
          location_text: loanData.event_location || loanData.key_label,
          event_name: loanData.event_name,
          event_location: loanData.event_location,
          notes: `鍵返却後の施錠確認: ${loanData.key_label}`,
          source_key_loan_id: loanData.id,
          assigned_to: optionalAssignee,
          created_by: returnUserId,
        })
        .select('*')
        .single();

      if (taskError) {
        console.error('施錠確認タスク作成エラー:', taskError);
        return { data: null, error: taskError };
      }

      createdTask = taskData;

      await getSupabaseClient()
        .from(KEY_LOANS_TABLE)
        .update({
          lock_task_requested: true,
          lock_task_id: createdTask.id,
        })
        .eq('id', loanData.id);
    }

    if (shouldCreateLockTask && createdTask) {
      const { error: notifyError } = await notifyLockCheckTaskCreated({
        task: createdTask,
        loan: loanData,
        senderUserId: returnUserId,
      });
      logNotificationError(notifyError);
    }

    return {
      data: {
        loan: loanData,
        task: createdTask,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};
