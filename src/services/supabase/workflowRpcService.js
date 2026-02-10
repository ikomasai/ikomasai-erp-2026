/**
 * ワークフローRPCサービス
 * フェーズ8で定義したRPCの呼び出しを管理します
 */

import { getSupabaseClient } from './client.js';

/**
 * チケット作成と自動タスク作成RPCを実行
 * @param {Object} ticketPayload - チケット作成入力
 * @returns {Promise<Object>} 実行結果（result, error）
 */
export const rpcCreateTicketAndAutoTasks = async (ticketPayload) => {
  try {
    const { data, error } = await getSupabaseClient().rpc('rpc_create_ticket_and_auto_tasks', {
      ticket_payload: ticketPayload,
    });

    if (error) {
      console.error('rpc_create_ticket_and_auto_tasks error:', error.message);
      return { result: null, error };
    }

    return { result: data, error: null };
  } catch (error) {
    console.error('rpc_create_ticket_and_auto_tasks exception:', error);
    return { result: null, error };
  }
};

/**
 * 鍵返却と施錠確認タスク生成RPCを実行
 * @param {string} loanId - key_loans.id
 * @param {boolean} createLockTask - 施錠確認タスク生成フラグ
 * @param {string | null} optionalAssignee - 任意担当者user_id
 * @returns {Promise<Object>} 実行結果（result, error）
 */
export const rpcReturnKeyAndCreateLockTask = async (
  loanId,
  createLockTask = true,
  optionalAssignee = null
) => {
  try {
    const { data, error } = await getSupabaseClient().rpc('rpc_return_key_and_create_lock_task', {
      loan_id: loanId,
      create_lock_task: createLockTask,
      optional_assignee: optionalAssignee,
    });

    if (error) {
      console.error('rpc_return_key_and_create_lock_task error:', error.message);
      return { result: null, error };
    }

    return { result: data, error: null };
  } catch (error) {
    console.error('rpc_return_key_and_create_lock_task exception:', error);
    return { result: null, error };
  }
};

/**
 * 巡回タスク受諾RPCを実行
 * @param {string} taskId - patrol_tasks.id
 * @param {string} patrolUserId - 受諾する巡回担当user_id
 * @returns {Promise<Object>} 実行結果（result, error）
 */
export const rpcAcceptTask = async (taskId, patrolUserId) => {
  try {
    const { data, error } = await getSupabaseClient().rpc('rpc_accept_task', {
      task_id: taskId,
      patrol_user_id: patrolUserId,
    });

    if (error) {
      console.error('rpc_accept_task error:', error.message);
      return { result: null, error };
    }

    return { result: data, error: null };
  } catch (error) {
    console.error('rpc_accept_task exception:', error);
    return { result: null, error };
  }
};

/**
 * 巡回タスク完了RPCを実行
 * @param {string} taskId - patrol_tasks.id
 * @param {Object} resultPayload - 完了時入力
 * @returns {Promise<Object>} 実行結果（result, error）
 */
export const rpcCompleteTask = async (taskId, resultPayload) => {
  try {
    const { data, error } = await getSupabaseClient().rpc('rpc_complete_task', {
      task_id: taskId,
      result_payload: resultPayload,
    });

    if (error) {
      console.error('rpc_complete_task error:', error.message);
      return { result: null, error };
    }

    return { result: data, error: null };
  } catch (error) {
    console.error('rpc_complete_task exception:', error);
    return { result: null, error };
  }
};
