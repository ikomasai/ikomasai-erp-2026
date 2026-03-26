/**
 * 巡回タスクサービス
 * patrol_tasks / patrol_task_results の取得・更新を担当
 */

import { getSupabaseClient } from './client.js';
import { createTicketMessage, SUPPORT_TICKET_STATUSES, updateTicketStatus } from './supportTicketService.js';
import {
  notifyPatrolTaskAccepted,
  notifyPatrolTaskCompleted,
  notifyStartEndReportConfirmed,
} from '../../shared/services/supportWorkflowNotificationService.js';
import { notifyPatrolTaskAssigned, notifyDispatchTaskCreated } from './supportNotificationService.js';

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

/** 巡回タスクの表示専用種別 */
export const PATROL_TASK_DISPLAY_TYPES = {
  EVALUATION: 'evaluation',
};

/** 評価タスクの notes 接頭辞 */
const EVALUATION_PATROL_TASK_NOTES_PREFIX = '評価項目:';
/** 旧形式 notes を読むための区切り候補 */
const EVALUATION_PATROL_TASK_LEGACY_DELIMITERS = [' / ', '／', '\n', ' | ', '｜', ', ', '，', '、'];

const normalizeText = (value) => (value || '').trim();

const buildEvaluationPatrolTaskPayload = (input) => {
  if (Array.isArray(input)) {
    return {
      items: normalizeEvaluationPatrolTaskItems(input),
      eventId: '',
      organizationName: '',
    };
  }

  if (!input || typeof input !== 'object') {
    return {
      items: [],
      eventId: '',
      organizationName: '',
    };
  }

  return {
    items: normalizeEvaluationPatrolTaskItems(input.items || input.evaluationItemNames || input.evaluationItems),
    eventId: normalizeText(input.eventId),
    organizationName: normalizeText(input.organizationName),
  };
};

const normalizeEvaluationPatrolTaskItems = (items) => {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const extractEvaluationPatrolTaskBody = (taskOrNotes) => {
  const notes = normalizeText(typeof taskOrNotes === 'string' ? taskOrNotes : taskOrNotes?.notes);
  if (!notes.startsWith(EVALUATION_PATROL_TASK_NOTES_PREFIX)) {
    return '';
  }
  return normalizeText(notes.slice(EVALUATION_PATROL_TASK_NOTES_PREFIX.length));
};

const parseEvaluationPatrolTaskPayload = (taskOrNotes) => {
  const body = extractEvaluationPatrolTaskBody(taskOrNotes);
  const emptyPayload = {
    items: [],
    eventId: '',
    organizationName: '',
  };

  if (!body) {
    return emptyPayload;
  }

  if (
    (body.startsWith('[') && body.endsWith(']')) ||
    (body.startsWith('{') && body.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        return {
          ...emptyPayload,
          items: normalizeEvaluationPatrolTaskItems(parsed),
        };
      }
      if (parsed && typeof parsed === 'object') {
        return {
          ...emptyPayload,
          ...buildEvaluationPatrolTaskPayload(parsed),
        };
      }
    } catch (error) {
      console.warn('評価タスク notes の JSON 解析に失敗:', error);
    }
  }

  const matchedDelimiter = EVALUATION_PATROL_TASK_LEGACY_DELIMITERS.find((delimiter) =>
    body.includes(delimiter)
  );

  if (matchedDelimiter) {
    return {
      ...emptyPayload,
      items: normalizeEvaluationPatrolTaskItems(body.split(matchedDelimiter)),
    };
  }

  return {
    ...emptyPayload,
    items: [body],
  };
};

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
 * 評価タスク用 notes を組み立てる
 * @param {string} evaluationItemName - 評価項目名
 * @returns {string} notes 文字列
 */
export const buildEvaluationPatrolTaskNotes = (evaluationItemNameOrItems) => {
  if (evaluationItemNameOrItems && typeof evaluationItemNameOrItems === 'object' && !Array.isArray(evaluationItemNameOrItems)) {
    const payload = buildEvaluationPatrolTaskPayload(evaluationItemNameOrItems);
    if (payload.items.length === 0) {
      throw new Error('evaluationItemNames が未指定です');
    }

    const serializedPayload = {
      items: payload.items,
      ...(payload.eventId ? { eventId: payload.eventId } : {}),
      ...(payload.organizationName ? { organizationName: payload.organizationName } : {}),
    };
    return `${EVALUATION_PATROL_TASK_NOTES_PREFIX} ${JSON.stringify(serializedPayload)}`;
  }

  if (Array.isArray(evaluationItemNameOrItems)) {
    const normalizedEvaluationItems = normalizeEvaluationPatrolTaskItems(evaluationItemNameOrItems);
    if (normalizedEvaluationItems.length === 0) {
      throw new Error('evaluationItemNames が未指定です');
    }
    return `${EVALUATION_PATROL_TASK_NOTES_PREFIX} ${JSON.stringify(normalizedEvaluationItems)}`;
  }

  /** 前後空白を除去した評価項目名 */
  const normalizedEvaluationItemName = normalizeText(evaluationItemNameOrItems);
  if (!normalizedEvaluationItemName) {
    throw new Error('evaluationItemName が未指定です');
  }
  return `${EVALUATION_PATROL_TASK_NOTES_PREFIX} ${normalizedEvaluationItemName}`;
};

/**
 * 評価タスクの評価項目名を取り出す
 * @param {Object|string|null|undefined} taskOrNotes - タスクまたは notes 文字列
 * @returns {string} 評価項目名
 */
export const getEvaluationPatrolTaskItemName = (taskOrNotes) => {
  return parseEvaluationPatrolTaskPayload(taskOrNotes).items.join(' / ');
};

/**
 * 評価タスクの評価項目一覧を取り出す
 * @param {Object|string|null|undefined} taskOrNotes - タスクまたは notes 文字列
 * @returns {string[]} 評価項目一覧
 */
export const getEvaluationPatrolTaskItemNames = (taskOrNotes) => {
  return parseEvaluationPatrolTaskPayload(taskOrNotes).items;
};

/**
 * 評価タスクの付帯メタ情報を取り出す
 * @param {Object|string|null|undefined} taskOrNotes - タスクまたは notes 文字列
 * @returns {{items: string[], eventId: string, organizationName: string}} 評価タスクのメタ情報
 */
export const getEvaluationPatrolTaskMeta = (taskOrNotes) => {
  return parseEvaluationPatrolTaskPayload(taskOrNotes);
};

/**
 * 評価タスク結果メモを解析する
 * @param {string|null|undefined} memo - patrol_task_results.memo
 * @returns {{itemResults: Array<{itemName: string, score: number, comment: string}>, summaryMemo: string}} 解析結果
 */
export const parseEvaluationPatrolTaskResultMemo = (memo) => {
  const normalizedMemo = normalizeText(memo);
  if (!normalizedMemo) {
    return { itemResults: [], summaryMemo: '' };
  }

  const itemResults = [];
  const summaryLines = [];
  let currentItemResult = null;
  let inSummary = false;

  normalizedMemo.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      if (inSummary && summaryLines.length > 0 && summaryLines[summaryLines.length - 1] !== '') {
        summaryLines.push('');
      }
      return;
    }

    if (trimmedLine === '評価項目') {
      currentItemResult = null;
      inSummary = false;
      return;
    }

    if (trimmedLine === '総評') {
      currentItemResult = null;
      inSummary = true;
      return;
    }

    const itemMatch = trimmedLine.match(/^-\s*(.+?):\s*(\d+)点$/);
    if (itemMatch) {
      currentItemResult = {
        itemName: itemMatch[1].trim(),
        score: Number(itemMatch[2] || 0),
        comment: '',
      };
      if (currentItemResult.itemName) {
        itemResults.push(currentItemResult);
      }
      inSummary = false;
      return;
    }

    if (trimmedLine.startsWith('コメント:')) {
      const commentText = trimmedLine.replace(/^コメント:\s*/, '');
      if (currentItemResult) {
        currentItemResult.comment = commentText;
        return;
      }
    }

    if (currentItemResult) {
      currentItemResult.comment = currentItemResult.comment
        ? `${currentItemResult.comment}\n${trimmedLine}`
        : trimmedLine;
      return;
    }

    if (inSummary) {
      summaryLines.push(trimmedLine);
      return;
    }

    summaryLines.push(trimmedLine);
  });

  return {
    itemResults,
    summaryMemo: summaryLines.join('\n').trim(),
  };
};

/**
 * 巡回タスクが評価タスクかどうかを返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {boolean} 評価タスクなら true
 */
export const isEvaluationPatrolTask = (task) => {
  return Boolean(getEvaluationPatrolTaskItemName(task));
};

/**
 * 巡回タスクの表示用種別を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 表示用種別
 */
export const getPatrolTaskDisplayType = (task) => {
  if (isEvaluationPatrolTask(task)) {
    return PATROL_TASK_DISPLAY_TYPES.EVALUATION;
  }
  return normalizeText(task?.task_type) || PATROL_TASK_TYPES.OTHER;
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
      // 緊急対応タスクは担当者フィルタに関わらず常に表示する。
      // それ以外のタスクは「未割当または自分が担当」に限定する。
      if (includeUnassigned) {
        query = query.or(
          `task_type.eq.${PATROL_TASK_TYPES.EMERGENCY_SUPPORT},assigned_to.is.null,assigned_to.eq.${normalizedAssignedTo}`
        );
      } else {
        // includeUnassigned=false の場合も緊急対応は除外しない
        query = query.or(
          `task_type.eq.${PATROL_TASK_TYPES.EMERGENCY_SUPPORT},assigned_to.eq.${normalizedAssignedTo}`
        );
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
export const listPatrolTaskResults = async ({ taskId, taskIds = [] }) => {
  try {
    const normalizedTaskIds = [
      ...new Set(
        [taskId, ...(Array.isArray(taskIds) ? taskIds : [])]
          .map((value) => normalizeText(value))
          .filter(Boolean)
      ),
    ];

    if (normalizedTaskIds.length === 0) {
      return { data: [], error: null };
    }

    let query = getSupabaseClient()
      .from(PATROL_TASK_RESULTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (normalizedTaskIds.length === 1) {
      query = query.eq('task_id', normalizedTaskIds[0]);
    } else {
      query = query.in('task_id', normalizedTaskIds);
    }

    const { data, error } = await query;

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

    // 開始・終了報告確認タスクが OK 系で完了した場合、企画者へ個人通知を送る
    const isStartEndConfirmType =
      normalizeText(input.taskType) === PATROL_TASK_TYPES.CONFIRM_START ||
      normalizeText(input.taskType) === PATROL_TASK_TYPES.CONFIRM_END;
    const isOkResult =
      normalizedResultCode === PATROL_RESULT_CODES.OK ||
      normalizedResultCode === PATROL_RESULT_CODES.LOCKED;
    if (isStartEndConfirmType && isOkResult && normalizeText(input.sourceTicketId)) {
      /** 元連絡案件を取得して企画者へ通知 */
      const { data: sourceTicket } = await getSupabaseClient()
        .from('support_tickets')
        .select('id, ticket_type, title, event_name, event_location, created_by')
        .eq('id', input.sourceTicketId)
        .single();
      if (sourceTicket) {
        const { error: startEndNotifyError } = await notifyStartEndReportConfirmed({
          ticket: sourceTicket,
          patrolUserId: normalizedUserId,
        });
        logNotificationError('開始終了報告確認', startEndNotifyError);
      }
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

/**
 * 連絡案件（rule_question / layout_change）から「部員が向かいます」振り分けタスクを生成する
 * 本部スタッフが案件詳細から手動で生成するタスク
 * @param {Object} input - 入力
 * @param {Object} input.ticket - 元となる連絡案件オブジェクト
 * @param {string} input.ticketTypeLabel - 連絡案件種別の表示名
 * @param {string|null} [input.assignedTo=null] - 担当者ユーザーID
 * @param {string|null} [input.creatorUserId=null] - タスク生成者（本部スタッフ）ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 生成結果
 */
export const createDispatchPatrolTask = async ({
  ticket,
  ticketTypeLabel,
  assignedTo = null,
  creatorUserId = null,
}) => {
  try {
    const normalizedAssignedTo = normalizeText(assignedTo) || null;
    const normalizedCreatorUserId = normalizeText(creatorUserId) || null;

    if (!ticket?.id) {
      throw new Error('ticket.id が未指定です');
    }

    /** notes に「[種別]: [件名]」形式で格納することで振り分けタスクと識別可能にする */
    const taskNotes = `${ticketTypeLabel || '連絡案件'}: ${ticket.title || ''}`.trim();

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .insert({
        task_type: PATROL_TASK_TYPES.OTHER,
        task_status: PATROL_TASK_STATUSES.OPEN,
        event_name: ticket.event_name || null,
        event_location: ticket.event_location || null,
        location_text: ticket.event_location || null,
        notes: taskNotes,
        source_ticket_id: ticket.id,
        assigned_to: normalizedAssignedTo,
        created_by: normalizedCreatorUserId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('振り分けタスク生成エラー:', error);
      return { data: null, error };
    }

    // 担当者への割当通知
    if (normalizedAssignedTo && normalizedCreatorUserId) {
      const { error: assignNotifyError } = await notifyPatrolTaskAssigned({
        task: data,
        senderUserId: normalizedCreatorUserId,
      });
      if (assignNotifyError) {
        console.warn('振り分けタスク割当通知エラー:', assignNotifyError);
      }
    }

    // 案件作成者への「部員が向かいます」通知
    const { error: dispatchNotifyError } = await notifyDispatchTaskCreated({
      ticket,
      task: data,
      senderUserId: normalizedCreatorUserId,
    });
    if (dispatchNotifyError) {
      console.warn('振り分けタスク依頼者通知エラー:', dispatchNotifyError);
    }

    return { data, error: null };
  } catch (error) {
    console.error('振り分けタスク生成処理でエラー:', error);
    return { data: null, error };
  }
};

/**
 * emergency 連絡案件から emergency_support 巡回タスクを自動生成する
 * @param {Object} input - 入力
 * @param {Object} input.ticket - 元となる emergency 連絡案件オブジェクト
 * @param {string} [input.creatorUserId] - タスク生成者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 生成結果
 */
export const createEmergencyPatrolTask = async ({ ticket, creatorUserId = null }) => {
  try {
    const normalizedCreatorUserId = normalizeText(creatorUserId) || null;

    if (!ticket?.id) {
      throw new Error('ticket.id が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .insert({
        task_type: PATROL_TASK_TYPES.EMERGENCY_SUPPORT,
        task_status: PATROL_TASK_STATUSES.OPEN,
        event_name: ticket.event_name || null,
        event_location: ticket.event_location || null,
        location_text: ticket.event_location || null,
        notes: ticket.title || null,
        source_ticket_id: ticket.id,
        created_by: normalizedCreatorUserId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('emergency_support タスク生成エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('emergency_support タスク生成処理でエラー:', error);
    return { data: null, error };
  }
};

/**
 * HQ の評価生成から巡回サポート向け評価タスクを作成する
 * @param {Object} input - 入力値
 * @param {string} input.eventName - 企画名
 * @param {string|null} [input.eventLocation=null] - 企画場所
 * @param {string} [input.evaluationItemName] - 評価項目名（旧形式互換）
 * @param {string[]} [input.evaluationItemNames] - 評価項目一覧
 * @param {string|null} [input.creatorUserId=null] - 作成者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 作成結果
 */
export const createEvaluationPatrolTask = async ({
  eventName,
  eventLocation = null,
  evaluationItemName = '',
  evaluationItemNames = [],
  eventId = null,
  organizationName = '',
  creatorUserId = null,
}) => {
  try {
    /** 前後空白を除去した企画名 */
    const normalizedEventName = normalizeText(eventName);
    /** 前後空白を除去した企画場所 */
    const normalizedEventLocation = normalizeText(eventLocation) || null;
    /** 前後空白を除去した作成者ユーザーID */
    const normalizedCreatorUserId = normalizeText(creatorUserId) || null;
    /** 評価タスクの notes */
    const taskNotes = buildEvaluationPatrolTaskNotes(
      Array.isArray(evaluationItemNames) && evaluationItemNames.length > 0
        ? {
            items: evaluationItemNames,
            eventId,
            organizationName,
          }
        : evaluationItemName
    );

    if (!normalizedEventName) {
      throw new Error('eventName が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .insert({
        task_type: PATROL_TASK_TYPES.OTHER,
        task_status: PATROL_TASK_STATUSES.OPEN,
        event_name: normalizedEventName,
        event_location: normalizedEventLocation,
        location_text: normalizedEventLocation,
        notes: taskNotes,
        created_by: normalizedCreatorUserId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('評価巡回タスク作成エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('評価巡回タスク作成時にエラー:', error);
    return { data: null, error };
  }
};

/**
 * 複数の巡回タスクをまとめて受諾する（旧評価タスクの統合入力向け）
 * @param {Object} input - 入力
 * @param {string[]} input.taskIds - 対象タスクID一覧
 * @param {string} input.patrolUserId - 巡回ユーザーID
 * @returns {Promise<{data: Array, error: Error|null}>} 実行結果
 */
export const acceptPatrolTaskGroup = async ({ taskIds, patrolUserId }) => {
  try {
    const normalizedTaskIds = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((id) => normalizeText(id)).filter(Boolean))];
    const normalizedUserId = normalizeText(patrolUserId);

    if (normalizedTaskIds.length === 0) {
      throw new Error('taskIds が未指定です');
    }
    if (!normalizedUserId) {
      throw new Error('patrolUserId が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        task_status: PATROL_TASK_STATUSES.ACCEPTED,
        assigned_to: normalizedUserId,
        accepted_at: new Date().toISOString(),
      })
      .in('id', normalizedTaskIds)
      .in('task_status', [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ])
      .or(`assigned_to.is.null,assigned_to.eq.${normalizedUserId}`)
      .select('*');

    if (error) {
      console.error('巡回タスク一括受諾エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
};

/**
 * 複数の巡回タスクをまとめて完了する（旧評価タスクの統合入力向け）
 * @param {Object} input - 入力
 * @param {string[]} input.taskIds - 対象タスクID一覧
 * @param {string} input.patrolUserId - 巡回ユーザーID
 * @param {string} input.resultCode - 結果コード
 * @param {Object<string,string>} [input.memosByTaskId={}] - タスクID別メモ
 * @returns {Promise<{data: {tasks: Array, results: Array}|null, error: Error|null}>} 実行結果
 */
export const completePatrolTaskGroup = async ({
  taskIds,
  patrolUserId,
  resultCode,
  memosByTaskId = {},
}) => {
  try {
    const normalizedTaskIds = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((id) => normalizeText(id)).filter(Boolean))];
    const normalizedUserId = normalizeText(patrolUserId);
    const normalizedResultCode = normalizeText(resultCode).toUpperCase() || PATROL_RESULT_CODES.OK;

    if (normalizedTaskIds.length === 0) {
      throw new Error('taskIds が未指定です');
    }
    if (!normalizedUserId) {
      throw new Error('patrolUserId が未指定です');
    }

    const { data: taskData, error: taskError } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        task_status: PATROL_TASK_STATUSES.DONE,
        assigned_to: normalizedUserId,
        done_at: new Date().toISOString(),
      })
      .in('id', normalizedTaskIds)
      .in('task_status', [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ])
      .or(`assigned_to.is.null,assigned_to.eq.${normalizedUserId}`)
      .select('*');

    if (taskError) {
      console.error('巡回タスク一括完了エラー:', taskError);
      return { data: null, error: taskError };
    }

    const resultRows = normalizedTaskIds.map((taskId) => ({
      task_id: taskId,
      result_code: normalizedResultCode,
      memo: normalizeText(memosByTaskId[taskId]) || null,
      created_by: normalizedUserId,
    }));

    const { data: resultData, error: resultError } = await getSupabaseClient()
      .from(PATROL_TASK_RESULTS_TABLE)
      .insert(resultRows)
      .select('*');

    if (resultError) {
      console.error('巡回タスク一括結果登録エラー:', resultError);
      return { data: null, error: resultError };
    }

    return {
      data: {
        tasks: taskData || [],
        results: resultData || [],
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 複数の巡回タスクの担当者をまとめて更新する（旧評価タスクの統合入力向け）
 * @param {Object} input - 入力
 * @param {string[]} input.taskIds - 対象タスクID一覧
 * @param {string|null} [input.assignedTo=null] - 担当者ユーザーID
 * @returns {Promise<{data: Array, error: Error|null}>} 更新結果
 */
export const assignPatrolTaskGroup = async ({ taskIds, assignedTo = null }) => {
  try {
    const normalizedTaskIds = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((id) => normalizeText(id)).filter(Boolean))];
    const normalizedAssignedTo = normalizeText(assignedTo) || null;

    if (normalizedTaskIds.length === 0) {
      throw new Error('taskIds が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({
        assigned_to: normalizedAssignedTo,
      })
      .in('id', normalizedTaskIds)
      .select('*');

    if (error) {
      console.error('巡回タスク一括担当更新エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
};

/**
 * 担当者別タスク実績を取得する（本部スタッフのタスク集計向け）
 * 完了・取消含む全タスクを assigned_to で集計するために raw データを返す
 * @param {Object} [params={}] - 取得条件
 * @param {number} [params.limit=500] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
/**
 * 巡回タスクのメモ（notes）を更新する
 * 本部が担当者への指示や補足情報をタスクに書き込むために使用する
 * @param {Object} params - 更新条件
 * @param {string} params.taskId - 更新対象タスクID
 * @param {string} params.notes - 新しいメモ内容（空文字で消去可能）
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const updatePatrolTaskNotes = async ({ taskId, notes }) => {
  try {
    const normalizedTaskId = normalizeText(taskId);
    if (!normalizedTaskId) {
      throw new Error('taskId が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .update({ notes: notes ?? null })
      .eq('id', normalizedTaskId)
      .select('*')
      .single();

    if (error) {
      console.error('巡回タスクメモ更新エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('巡回タスクメモ更新処理でエラー:', error);
    return { data: null, error };
  }
};

export const listPatrolTasksForStats = async ({ limit = 500 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(PATROL_TASKS_TABLE)
      .select('id, task_type, task_status, assigned_to, source_ticket_id, created_at')
      .not('assigned_to', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('タスク実績取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('タスク実績取得処理でエラー:', error);
    return { data: [], error };
  }
};
