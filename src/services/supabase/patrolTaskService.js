/**
 * 巡回タスクサービス
 * patrol_tasks / patrol_task_results の取得・更新を担当
 */

import { getSupabaseClient } from './client.js';
import { createTicketMessage, SUPPORT_TICKET_STATUSES, updateTicketStatus } from './supportTicketService.js';
import {
  notifyPatrolTaskAccepted,
  notifyPatrolTaskCompleted,
} from '../../shared/services/supportWorkflowNotificationService.js';
import { notifyPatrolTaskAssigned } from './supportNotificationService.js';

const PATROL_TASKS_TABLE = 'patrol_tasks';
const PATROL_TASK_RESULTS_TABLE = 'patrol_task_results';
const KEY_LOANS_TABLE = 'key_loans';

/** 巡回タスク種別 */
export const PATROL_TASK_TYPES = {
  CONFIRM_START: 'confirm_start',
  CONFIRM_END: 'confirm_end',
  LOCK_CHECK: 'lock_check',
  EMERGENCY_SUPPORT: 'emergency_support',
  ROUTINE_PATROL: 'routine_patrol',
  OTHER: 'other',
};

/** 巡回タスク状態 */
export const PATROL_TASK_STATUSES = {
  OPEN: 'open',
  ACCEPTED: 'accepted',
  EN_ROUTE: 'en_route',
  DONE: 'done',
  CANCELED: 'canceled',
};

/** 巡回結果コード */
export const PATROL_RESULT_CODES = {
  OK: 'OK',
  NOT_STARTED: 'NOT_STARTED',
  NOT_ENDED: 'NOT_ENDED',
  NEED_SUPPORT: 'NEED_SUPPORT',
  LOCKED: 'LOCKED',
  UNLOCKED: 'UNLOCKED',
  CANNOT_CONFIRM: 'CANNOT_CONFIRM',
};

const normalizeText = (value) => (value || '').trim();

const logNotificationError = (label, error) => {
  if (error) {
    console.warn(`${label}通知の送信に失敗:`, error);
  }
};

const toLockCheckStatus = (resultCode) => {
  const normalized = normalizeText(resultCode).toUpperCase();
  if (normalized === PATROL_RESULT_CODES.LOCKED || normalized === PATROL_RESULT_CODES.OK) {
    return 'locked';
  }
  if (normalized === PATROL_RESULT_CODES.UNLOCKED) {
    return 'unlocked';
  }
  return 'cannot_confirm';
};

/**
 * 巡回タスク一覧を取得
 * @param {Object} params - 取得条件
 * @param {string} [params.assignedTo] - 担当者ユーザーID
 * @param {boolean} [params.includeUnassigned=true] - 未割当を含めるか
 * @param {string[]} [params.statuses] - 状態フィルタ
 * @param {string[]} [params.taskTypes] - 種別フィルタ
 * @param {number} [params.limit=80] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listPatrolTasks = async ({
  assignedTo,
  includeUnassigned = true,
  statuses = [],
  taskTypes = [],
  limit = 80,
} = {}) => {
  try {
    let query = getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .select(
        `
          *,
          source_ticket:support_tickets!patrol_tasks_source_ticket_id_fkey(
            id,
            ticket_no,
            title,
            event_id,
            event_name,
            event_location
          )
        `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const normalizedAssignedTo = normalizeText(assignedTo);
    if (normalizedAssignedTo) {
      if (includeUnassigned) {
        query = query.or(`assigned_to.is.null,assigned_to.eq.${normalizedAssignedTo}`);
      } else {
        query = query.eq('assigned_to', normalizedAssignedTo);
      }
    }

    if (Array.isArray(statuses) && statuses.length > 0) {
      query = query.in('task_status', statuses);
    }
    if (Array.isArray(taskTypes) && taskTypes.length > 0) {
      query = query.in('task_type', taskTypes);
    }

    const { data, error } = await query;
    if (error) {
      console.error('巡回タスク一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('巡回タスク一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 巡回タスクの担当者を更新（本部向け）
 * @param {Object} input - 入力
 * @param {string} input.taskId - タスクID
 * @param {string|null} [input.assignedTo] - 担当者ユーザーID（未割当に戻す場合はnull）
 * @param {string|null} [input.actorUserId] - 割当実行者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const assignPatrolTask = async ({ taskId, assignedTo = null, actorUserId = null }) => {
  try {
    const normalizedTaskId = normalizeText(taskId);
    const normalizedAssignedTo = normalizeText(assignedTo) || null;
    const normalizedActorUserId = normalizeText(actorUserId) || null;

    if (!normalizedTaskId) {
      throw new Error('taskId が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        assigned_to: normalizedAssignedTo,
      })
      .eq('id', normalizedTaskId)
      .select('*')
      .single();

    if (error) {
      console.error('巡回タスク担当更新エラー:', error);
      return { data: null, error };
    }

    if (normalizedAssignedTo && normalizedActorUserId) {
      /** 巡回割当通知結果 */
      const { error: notifyError } = await notifyPatrolTaskAssigned({
        task: data,
        senderUserId: normalizedActorUserId,
      });
      logNotificationError('巡回割当', notifyError);
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 巡回タスク結果一覧を取得
 * @param {Object} params - 取得条件
 * @param {string} params.taskId - タスクID
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listPatrolTaskResults = async ({ taskId }) => {
  try {
    const normalizedTaskId = normalizeText(taskId);
    if (!normalizedTaskId) {
      return { data: [], error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASK_RESULTS_TABLE)
      .select('*')
      .eq('task_id', normalizedTaskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('巡回タスク結果取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('巡回タスク結果取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 巡回タスクを受諾（向かいます）
 * @param {Object} input - 入力
 * @param {string} input.taskId - タスクID
 * @param {string} input.patrolUserId - 巡回ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 実行結果
 */
export const acceptPatrolTask = async ({ taskId, patrolUserId }) => {
  try {
    const normalizedTaskId = normalizeText(taskId);
    const normalizedUserId = normalizeText(patrolUserId);
    if (!normalizedTaskId) {
      throw new Error('taskId が未指定です');
    }
    if (!normalizedUserId) {
      throw new Error('patrolUserId が未指定です');
    }

    const { data: rpcData, error: rpcError } = await getSupabaseClient().rpc('rpc_accept_task', {
      task_id: normalizedTaskId,
      patrol_user_id: normalizedUserId,
    });

    if (!rpcError) {
      const { error: notifyError } = await notifyPatrolTaskAccepted({
        task: rpcData,
        senderUserId: normalizedUserId,
      });
      logNotificationError('巡回受諾', notifyError);
      return { data: rpcData, error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        task_status: PATROL_TASK_STATUSES.ACCEPTED,
        assigned_to: normalizedUserId,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', normalizedTaskId)
      .in('task_status', [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ])
      .or(`assigned_to.is.null,assigned_to.eq.${normalizedUserId}`)
      .select('*')
      .single();

    if (error) {
      console.error('巡回タスク受諾エラー:', error);
      return { data: null, error };
    }

    const { error: notifyError } = await notifyPatrolTaskAccepted({
      task: data,
      senderUserId: normalizedUserId,
    });
    logNotificationError('巡回受諾', notifyError);

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 巡回タスクを完了
 * @param {Object} input - 入力
 * @param {string} input.taskId - タスクID
 * @param {string} input.patrolUserId - 巡回ユーザーID
 * @param {string} input.resultCode - 結果コード
 * @param {string} [input.memo] - メモ
 * @param {string} [input.taskType] - タスク種別（RPC未使用時のフォールバック用）
 * @param {string} [input.sourceTicketId] - 元連絡案件ID（フォールバック用）
 * @param {string} [input.sourceKeyLoanId] - 元鍵貸出ID（フォールバック用）
 * @returns {Promise<{data: Object|null, error: Error|null}>} 実行結果
 */
export const completePatrolTask = async (input) => {
  try {
    const normalizedTaskId = normalizeText(input.taskId);
    const normalizedUserId = normalizeText(input.patrolUserId);
    const normalizedResultCode = normalizeText(input.resultCode).toUpperCase() || PATROL_RESULT_CODES.OK;
    const normalizedMemo = normalizeText(input.memo);

    if (!normalizedTaskId) {
      throw new Error('taskId が未指定です');
    }
    if (!normalizedUserId) {
      throw new Error('patrolUserId が未指定です');
    }

    const rpcPayload = {
      patrol_user_id: normalizedUserId,
      result_code: normalizedResultCode,
      memo: normalizedMemo,
    };

    const { data: rpcData, error: rpcError } = await getSupabaseClient().rpc('rpc_complete_task', {
      task_id: normalizedTaskId,
      result_payload: rpcPayload,
    });

    if (!rpcError) {
      const { error: notifyError } = await notifyPatrolTaskCompleted({
        task: rpcData?.task || null,
        resultCode: normalizedResultCode,
        senderUserId: normalizedUserId,
      });
      logNotificationError('巡回完了', notifyError);
      return { data: rpcData, error: null };
    }

    const { data: taskData, error: taskError } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        task_status: PATROL_TASK_STATUSES.DONE,
        assigned_to: normalizedUserId,
        done_at: new Date().toISOString(),
      })
      .eq('id', normalizedTaskId)
      .in('task_status', [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ])
      .or(`assigned_to.is.null,assigned_to.eq.${normalizedUserId}`)
      .select('*')
      .single();

    if (taskError) {
      console.error('巡回タスク完了エラー:', taskError);
      return { data: null, error: taskError };
    }

    const { data: resultData, error: resultError } = await getSupabaseClient()
      .from(PATROL_TASK_RESULTS_TABLE)
      .insert({
        task_id: normalizedTaskId,
        result_code: normalizedResultCode,
        memo: normalizedMemo || null,
        created_by: normalizedUserId,
      })
      .select('*')
      .single();

    if (resultError) {
      console.error('巡回タスク結果登録エラー:', resultError);
      return { data: null, error: resultError };
    }

    if (normalizeText(input.sourceTicketId)) {
      const body = normalizedMemo
        ? `巡回確認完了: ${normalizedResultCode}\n${normalizedMemo}`
        : `巡回確認完了: ${normalizedResultCode}`;

      await createTicketMessage({
        ticketId: input.sourceTicketId,
        authorId: normalizedUserId,
        body,
      });
      await updateTicketStatus({
        ticketId: input.sourceTicketId,
        status: SUPPORT_TICKET_STATUSES.RESOLVED,
      });
    }

    if (
      normalizeText(input.taskType) === PATROL_TASK_TYPES.LOCK_CHECK &&
      normalizeText(input.sourceKeyLoanId)
    ) {
      await getSupabaseClient()
        .from(KEY_LOANS_TABLE)
        .update({
          lock_check_status: toLockCheckStatus(normalizedResultCode),
          lock_checked_at: new Date().toISOString(),
        })
        .eq('id', input.sourceKeyLoanId);
    }

    const { error: notifyError } = await notifyPatrolTaskCompleted({
      task: taskData,
      resultCode: normalizedResultCode,
      senderUserId: normalizedUserId,
    });
    logNotificationError('巡回完了', notifyError);

    return {
      data: {
        task: taskData,
        result: resultData,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};
