/**
 * 鍵貸出サービス
 * key_loans の取得・貸出・返却と施錠確認タスク生成を扱う
 */

import { getSupabaseClient } from './client.js';
import { notifyLockCheckTaskCreated } from '../../shared/services/supportWorkflowNotificationService.js';

const KEY_LOANS_TABLE = 'key_loans';
const PATROL_TASKS_TABLE = 'patrol_tasks';
const ACTIVE_LOCK_TASK_STATUSES = ['open', 'accepted', 'en_route'];

/**
 * 鍵貸出の状態
 */
export const KEY_LOAN_STATUSES = {
  LOANED: 'loaned',
  RETURNED: 'returned',
};

/**
 * 文字列を安全にトリムする
 * @param {*} value - 入力値
 * @returns {string} トリム後文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * 施錠確認タスク通知の失敗を記録する
 * @param {Error|null} error - 通知エラー
 * @returns {void} ログ出力のみ
 */
const logNotificationError = (error) => {
  if (error) {
    console.warn('施錠確認タスク通知エラー:', error);
  }
};

/**
 * 施錠確認タスクの説明文を組み立てる
 * @param {Object} loanData - 鍵貸出データ
 * @returns {string} タスク説明文
 */
const buildLockCheckTaskNotes = (loanData) => {
  const keyLocationText = normalizeText(loanData?.metadata?.key_location_text) || null;

  if (keyLocationText) {
    return `鍵返却後の施錠確認: ${loanData.key_label} / ${keyLocationText}`;
  }

  return `鍵返却後の施錠確認: ${loanData.key_label}`;
};

/**
 * 施錠確認タスク作成通知を送る
 * @param {Object} input - 通知入力
 * @param {Object} input.task - 巡回タスク
 * @param {Object} input.loan - 鍵貸出
 * @param {string} input.senderUserId - 作成者ユーザーID
 * @returns {Promise<void>} 通知結果
 */
const notifyCreatedLockCheckTask = async ({ task, loan, senderUserId }) => {
  const { error: notifyError } = await notifyLockCheckTaskCreated({
    task,
    loan,
    senderUserId,
  });
  logNotificationError(notifyError);
};

/**
 * 返却済み鍵に対する施錠確認タスクを新規作成する
 * @param {Object} input - 入力値
 * @param {Object} input.loanData - 鍵貸出データ
 * @param {string} input.creatorUserId - 作成者ユーザーID
 * @param {string|null} input.optionalAssignee - 任意の担当者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 作成結果
 */
const insertLockCheckTask = async ({ loanData, creatorUserId, optionalAssignee }) => {
  const notesText = buildLockCheckTaskNotes(loanData);

  const { data: taskData, error: taskError } = await getSupabaseClient()
    .from(PATROL_TASKS_TABLE)
    .insert({
      task_type: 'lock_check',
      task_status: 'open',
      location_text: loanData.event_location || loanData.key_label,
      event_name: loanData.event_name,
      event_location: loanData.event_location,
      notes: notesText,
      source_key_loan_id: loanData.id,
      assigned_to: optionalAssignee,
      created_by: creatorUserId,
    })
    .select('*')
    .single();

  if (taskError) {
    console.error('施錠確認タスク作成エラー:', taskError);
    return { data: null, error: taskError };
  }

  const { error: updateError } = await getSupabaseClient()
    .from(KEY_LOANS_TABLE)
    .update({
      lock_task_requested: true,
      lock_task_id: taskData.id,
      lock_check_status: null,
      lock_checked_at: null,
    })
    .eq('id', loanData.id);

  if (updateError) {
    console.error('鍵貸出の施錠確認参照更新エラー:', updateError);
    await getSupabaseClient().from(PATROL_TASKS_TABLE).delete().eq('id', taskData.id);
    return { data: null, error: updateError };
  }

  await notifyCreatedLockCheckTask({
    task: taskData,
    loan: loanData,
    senderUserId: creatorUserId,
  });

  return { data: taskData, error: null };
};

/**
 * 鍵貸出一覧を取得する
 * @param {Object} params - 取得条件
 * @param {'loaned'|'returned'} [params.status] - 状態フィルタ
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
    console.error('鍵貸出一覧取得処理エラー:', error);
    return { data: [], error };
  }
};

/**
 * 鍵貸出を作成する
 * @param {Object} input - 貸出入力
 * @param {string} input.keyCode - 鍵コード
 * @param {string} input.keyLabel - 鍵ラベル
 * @param {string} [input.eventName] - 団体名
 * @param {string} [input.eventLocation] - 企画場所
 * @param {string} [input.borrowerName] - 借受人名
 * @param {string} [input.borrowerContact] - 連絡先
 * @param {Object} [input.metadata] - 補助情報
 * @returns {Promise<{data: Object|null, error: Error|null}>} 作成結果
 */
export const createKeyLoan = async (input) => {
  try {
    const keyCode = normalizeText(input.keyCode);
    const keyLabel = normalizeText(input.keyLabel);

    if (!keyCode) {
      throw new Error('keyCode が必要です');
    }
    if (!keyLabel) {
      throw new Error('keyLabel が必要です');
    }

    const payload = {
      key_code: keyCode,
      key_label: keyLabel,
      event_name: normalizeText(input.eventName) || null,
      event_location: normalizeText(input.eventLocation) || null,
      borrower_name: normalizeText(input.borrowerName) || null,
      borrower_contact: normalizeText(input.borrowerContact) || null,
      status: KEY_LOAN_STATUSES.LOANED,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };

    const { data, error } = await getSupabaseClient()
      .from(KEY_LOANS_TABLE)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('鍵貸出作成エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 鍵返却を行い、必要なら施錠確認タスクも生成する
 * @param {Object} input - 実行条件
 * @param {string} input.loanId - 貸出ID
 * @param {boolean} [input.createLockTask=true] - 施錠確認タスクを生成するか
 * @param {string|null} [input.optionalAssignee] - 任意の担当者ユーザーID
 * @param {string} input.returnUserId - 返却処理者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 実行結果
 */
export const returnKeyAndCreateLockTask = async (input) => {
  try {
    const loanId = normalizeText(input.loanId);
    const returnUserId = normalizeText(input.returnUserId);
    const shouldCreateLockTask = input.createLockTask !== false;
    const optionalAssignee = normalizeText(input.optionalAssignee) || null;

    if (!loanId) {
      throw new Error('loanId が必要です');
    }
    if (!returnUserId) {
      throw new Error('returnUserId が必要です');
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
        const rpcLoan = rpcData.loan || null;
        const rpcKeyLocationText = normalizeText(rpcLoan?.metadata?.key_location_text) || null;

        if (
          rpcKeyLocationText &&
          rpcData.task.notes &&
          !rpcData.task.notes.includes(rpcKeyLocationText)
        ) {
          const updatedNotes = `${rpcData.task.notes} / ${rpcKeyLocationText}`;
          await getSupabaseClient()
            .from(PATROL_TASKS_TABLE)
            .update({ notes: updatedNotes })
            .eq('id', rpcData.task.id);
          rpcData.task.notes = updatedNotes;
        }

        await notifyCreatedLockCheckTask({
          task: rpcData.task,
          loan: rpcLoan,
          senderUserId: returnUserId,
        });
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
      const { data: taskData, error: taskError } = await insertLockCheckTask({
        loanData,
        creatorUserId: returnUserId,
        optionalAssignee,
      });

      if (taskError) {
        return { data: null, error: taskError };
      }

      createdTask = taskData;
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

/**
 * 既に返却済みの鍵に対して施錠確認タスクだけを補完する
 * @param {Object} input - 入力値
 * @param {string} input.loanId - 鍵貸出ID
 * @param {string} input.creatorUserId - 作成者ユーザーID
 * @param {string|null} [input.optionalAssignee] - 任意の担当者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 実行結果
 */
export const createLockCheckTaskForReturnedLoan = async (input) => {
  try {
    const loanId = normalizeText(input.loanId);
    const creatorUserId = normalizeText(input.creatorUserId);
    const optionalAssignee = normalizeText(input.optionalAssignee) || null;

    if (!loanId) {
      throw new Error('loanId が必要です');
    }
    if (!creatorUserId) {
      throw new Error('creatorUserId が必要です');
    }

    const { data: loanData, error: loanError } = await getSupabaseClient()
      .from(KEY_LOANS_TABLE)
      .select('*')
      .eq('id', loanId)
      .single();

    if (loanError) {
      console.error('返却済み鍵の取得エラー:', loanError);
      return { data: null, error: loanError };
    }

    if (normalizeText(loanData.status) !== KEY_LOAN_STATUSES.RETURNED) {
      return {
        data: null,
        error: new Error('返却済みの鍵にだけ施錠確認タスクを作成できます'),
      };
    }

    if (normalizeText(loanData.lock_check_status)) {
      return {
        data: null,
        error: new Error('この鍵はすでに施錠確認済みです'),
      };
    }

    const existingTaskId = normalizeText(loanData.lock_task_id);
    if (existingTaskId) {
      const { data: existingTaskRows, error: existingTaskError } = await getSupabaseClient()
        .from(PATROL_TASKS_TABLE)
        .select('*')
        .eq('id', existingTaskId)
        .limit(1);

      if (existingTaskError) {
        console.error('既存施錠確認タスク取得エラー:', existingTaskError);
        return { data: null, error: existingTaskError };
      }

      const existingTask = existingTaskRows?.[0] || null;
      if (
        existingTask &&
        ACTIVE_LOCK_TASK_STATUSES.includes(normalizeText(existingTask.task_status))
      ) {
        const { error: loanUpdateError } = await getSupabaseClient()
          .from(KEY_LOANS_TABLE)
          .update({
            lock_task_requested: true,
            lock_task_id: existingTask.id,
          })
          .eq('id', loanData.id);

        if (loanUpdateError) {
          console.error('施錠確認参照の再同期エラー:', loanUpdateError);
          return { data: null, error: loanUpdateError };
        }

        return {
          data: {
            loan: {
              ...loanData,
              lock_task_requested: true,
              lock_task_id: existingTask.id,
            },
            task: existingTask,
            reused: true,
          },
          error: null,
        };
      }
    }

    const { data: createdTask, error: taskError } = await insertLockCheckTask({
      loanData,
      creatorUserId,
      optionalAssignee,
    });

    if (taskError) {
      return { data: null, error: taskError };
    }

    return {
      data: {
        loan: {
          ...loanData,
          lock_task_requested: true,
          lock_task_id: createdTask.id,
        },
        task: createdTask,
        reused: false,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 同一借受人の貸出鍵をまとめて返却する
 * 完全返却として扱い、返却後は鍵ごとに施錠確認タスクも生成する
 * @param {Object} input - 実行条件
 * @param {string[]} input.loanIds - 返却対象の貸出ID配列
 * @param {string} input.returnUserId - 返却処理者ユーザーID
 * @returns {Promise<{results: Array, error: Error|null}>} 実行結果
 */
export const returnKeyLoansByBorrower = async ({ loanIds, returnUserId }) => {
  try {
    const normalizedReturnUserId = normalizeText(returnUserId);
    const normalizedLoanIds = (loanIds || [])
      .map((id) => normalizeText(id))
      .filter(Boolean);

    if (normalizedLoanIds.length === 0) {
      throw new Error('返却対象の貸出IDが必要です');
    }
    if (!normalizedReturnUserId) {
      throw new Error('returnUserId が必要です');
    }

    const results = await Promise.all(
      normalizedLoanIds.map((loanId) =>
        returnKeyAndCreateLockTask({
          loanId,
          createLockTask: true,
          returnUserId: normalizedReturnUserId,
          optionalAssignee: null,
        })
      )
    );

    const firstError = results.find((result) => result.error)?.error || null;
    return { results, error: firstError };
  } catch (error) {
    return { results: [], error };
  }
};
