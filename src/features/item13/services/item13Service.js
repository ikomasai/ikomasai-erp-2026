/**
 * Item13 HQ service.
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { rpcReturnKeyAndCreateLockTask } from '../../../services/supabase/workflowRpcService.js';
import item13PayloadBuilder from '../utils/item13PayloadBuilder.js';

const {
  buildEvaluationDecisionPayload,
  buildTaskUpdatePayload,
  buildTicketAssignmentPayload,
  buildTicketStatusUpdatePayload,
} = item13PayloadBuilder;

const ACTIVE_TASK_STATUS = ['open', 'accepted', 'en_route'];
const OPEN_TICKET_STATUS = ['new', 'acknowledged', 'in_progress', 'waiting_external'];
const ALLOWED_NOTIFY_TARGET = new Set(['none', 'accounting', 'property']);
const DASHBOARD_LATE_MINUTES = 60;

/**
 * Build user id -> display name map.
 * @param {string[]} userIds - auth.users ids.
 * @returns {Promise<Map<string, string>>} Profile name map.
 */
const selectProfileNameMap = async (userIds) => {
  const filteredUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  const nameMap = new Map();

  if (filteredUserIds.length === 0) {
    return nameMap;
  }

  const { data, error } = await getSupabaseClient()
    .from('user_profiles')
    .select('user_id, name')
    .in('user_id', filteredUserIds);

  if (error) {
    console.error('item13: failed to load user_profiles:', error.message);
    return nameMap;
  }

  (data || []).forEach((profile) => {
    if (profile?.user_id) {
      nameMap.set(profile.user_id, profile.name || '');
    }
  });

  return nameMap;
};

/**
 * Fetch dashboard summary.
 * @returns {Promise<{ summary: Object|null, error: Error|null }>}
 */
export const selectHqDashboardSummary = async () => {
  try {
    const lateThresholdIso = new Date(Date.now() - DASHBOARD_LATE_MINUTES * 60 * 1000).toISOString();
    const recentRadioThresholdIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [
      newTicketResult,
      lateTicketResult,
      lockTaskResult,
      activeLoanResult,
      patrolTaskResult,
      recentRadioResult,
      pendingEvaluationResult,
    ] = await Promise.all([
      getSupabaseClient().from('support_tickets').select('id', { count: 'exact', head: true }).eq('ticket_status', 'new'),
      getSupabaseClient()
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('ticket_status', OPEN_TICKET_STATUS)
        .lt('created_at', lateThresholdIso),
      getSupabaseClient()
        .from('patrol_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('task_type', 'lock_check')
        .in('task_status', ACTIVE_TASK_STATUS),
      getSupabaseClient()
        .from('key_loans')
        .select('id', { count: 'exact', head: true })
        .in('loan_status', ['loaned', 'overdue']),
      getSupabaseClient()
        .from('patrol_tasks')
        .select('id', { count: 'exact', head: true })
        .in('task_status', ACTIVE_TASK_STATUS),
      getSupabaseClient()
        .from('radio_logs')
        .select('id', { count: 'exact', head: true })
        .gte('logged_at', recentRadioThresholdIso),
      getSupabaseClient()
        .from('evaluation_checks')
        .select('id', { count: 'exact', head: true })
        .eq('evaluation_status', 'pending'),
    ]);

    const allErrors = [
      newTicketResult.error,
      lateTicketResult.error,
      lockTaskResult.error,
      activeLoanResult.error,
      patrolTaskResult.error,
      recentRadioResult.error,
      pendingEvaluationResult.error,
    ].filter(Boolean);

    if (allErrors.length > 0) {
      console.error('item13: dashboard summary query failed:', allErrors[0].message);
      return { summary: null, error: allErrors[0] };
    }

    return {
      summary: {
        new_tickets: newTicketResult.count || 0,
        late_tickets: lateTicketResult.count || 0,
        lock_tasks: lockTaskResult.count || 0,
        active_key_loans: activeLoanResult.count || 0,
        active_patrol_tasks: patrolTaskResult.count || 0,
        recent_radio_logs: recentRadioResult.count || 0,
        pending_evaluations: pendingEvaluationResult.count || 0,
      },
      error: null,
    };
  } catch (error) {
    console.error('item13: selectHqDashboardSummary exception:', error);
    return { summary: null, error };
  }
};

/**
 * Fetch recent radio logs.
 * @param {number} limit - Result limit.
 * @returns {Promise<{ logs: Object[], error: Error|null }>}
 */
export const selectRecentRadioLogs = async (limit = 20) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('radio_logs')
      .select('id, severity, channel, message, logged_at, logged_by, related_ticket_id, related_task_id')
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('item13: failed to load radio_logs:', error.message);
      return { logs: [], error };
    }

    return { logs: data || [], error: null };
  } catch (error) {
    console.error('item13: selectRecentRadioLogs exception:', error);
    return { logs: [], error };
  }
};

/**
 * Fetch support tickets for HQ.
 * @param {Object} [input={}] - Filter input.
 * @param {'none'|'accounting'|'property'|''} [input.notifyTarget=''] - notify_target filter.
 * @returns {Promise<{ tickets: Object[], error: Error|null }>}
 */
export const selectTicketsForHq = async (input = {}) => {
  try {
    const notifyTarget = `${input.notifyTarget || ''}`.trim().toLowerCase();
    const ticketStatus = `${input.ticketStatus || ''}`.trim().toLowerCase();

    let query = getSupabaseClient()
      .from('support_tickets')
      .select(
        `
        id,
        ticket_no,
        ticket_type,
        ticket_status,
        priority,
        title,
        description,
        notify_target,
        org_id,
        event_id,
        location_id,
        created_by,
        assigned_hq_user_id,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false });

    if (notifyTarget && ALLOWED_NOTIFY_TARGET.has(notifyTarget)) {
      query = query.eq('notify_target', notifyTarget);
    }

    if (ticketStatus) {
      query = query.eq('ticket_status', ticketStatus);
    }

    const { data, error } = await query;

    if (error) {
      console.error('item13: failed to load support_tickets:', error.message);
      return { tickets: [], error };
    }

    return { tickets: data || [], error: null };
  } catch (error) {
    console.error('item13: selectTicketsForHq exception:', error);
    return { tickets: [], error };
  }
};

/**
 * Fetch ticket detail.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const selectTicketDetailForHq = async (ticketId) => {
  try {
    if (!ticketId) {
      return { ticket: null, error: new Error('ticketId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('support_tickets')
      .select(
        `
        id,
        ticket_no,
        ticket_type,
        ticket_status,
        priority,
        title,
        description,
        notify_target,
        org_id,
        event_id,
        location_id,
        created_by,
        assigned_hq_user_id,
        created_at,
        updated_at
      `
      )
      .eq('id', ticketId)
      .single();

    if (error) {
      console.error('item13: failed to load ticket detail:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item13: selectTicketDetailForHq exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Fetch messages for a ticket.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ messages: Object[], error: Error|null }>}
 */
export const selectTicketMessagesForHq = async (ticketId) => {
  try {
    if (!ticketId) {
      return { messages: [], error: new Error('ticketId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('ticket_messages')
      .select('id, ticket_id, author_id, body, is_internal, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('item13: failed to load ticket_messages:', error.message);
      return { messages: [], error };
    }

    const rawMessages = data || [];
    const authorMap = await selectProfileNameMap(rawMessages.map((message) => message.author_id));
    const messages = rawMessages.map((message) => ({
      ...message,
      author_name: authorMap.get(message.author_id) || message.author_id,
    }));

    return { messages, error: null };
  } catch (error) {
    console.error('item13: selectTicketMessagesForHq exception:', error);
    return { messages: [], error };
  }
};

/**
 * Add message to ticket.
 * @param {Object} input - Message input.
 * @returns {Promise<{ message: Object|null, error: Error|null }>}
 */
export const appendTicketMessageForHq = async (input) => {
  try {
    const payload = {
      ticket_id: input?.ticketId,
      author_id: input?.authorId,
      body: input?.body?.trim?.() || '',
      is_internal: Boolean(input?.isInternal),
    };

    if (!payload.ticket_id || !payload.author_id || !payload.body) {
      return { message: null, error: new Error('ticketId, authorId, body are required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('ticket_messages')
      .insert(payload)
      .select('id, ticket_id, author_id, body, is_internal, created_at')
      .single();

    if (error) {
      console.error('item13: failed to insert ticket message:', error.message);
      return { message: null, error };
    }

    return { message: data, error: null };
  } catch (error) {
    console.error('item13: appendTicketMessageForHq exception:', error);
    return { message: null, error };
  }
};

/**
 * Update ticket status.
 * @param {string} ticketId - support_tickets.id.
 * @param {string} ticketStatus - ticket_status.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const updateTicketStatusForHq = async (ticketId, ticketStatus) => {
  try {
    if (!ticketId) {
      return { ticket: null, error: new Error('ticketId is required.') };
    }

    const payload = buildTicketStatusUpdatePayload({ ticketStatus });
    const { data, error } = await getSupabaseClient()
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) {
      console.error('item13: failed to update ticket status:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item13: updateTicketStatusForHq exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Assign ticket to HQ user.
 * @param {string} ticketId - support_tickets.id.
 * @param {string|null} assigneeId - auth.users.id.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const assignTicketToHqUser = async (ticketId, assigneeId) => {
  try {
    if (!ticketId) {
      return { ticket: null, error: new Error('ticketId is required.') };
    }

    const payload = buildTicketAssignmentPayload({ assigneeId });
    const { data, error } = await getSupabaseClient()
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) {
      console.error('item13: failed to assign ticket:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item13: assignTicketToHqUser exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Update ticket notify target (accounting/property extraction).
 * @param {string} ticketId - support_tickets.id.
 * @param {'none'|'accounting'|'property'} notifyTarget - notify_target.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const updateTicketNotifyTarget = async (ticketId, notifyTarget) => {
  try {
    const normalizedNotifyTarget = `${notifyTarget || ''}`.trim().toLowerCase();

    if (!ticketId) {
      return { ticket: null, error: new Error('ticketId is required.') };
    }
    if (!ALLOWED_NOTIFY_TARGET.has(normalizedNotifyTarget)) {
      return { ticket: null, error: new Error('notifyTarget is invalid.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('support_tickets')
      .update({
        notify_target: normalizedNotifyTarget,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) {
      console.error('item13: failed to update notify_target:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item13: updateTicketNotifyTarget exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Fetch patrol tasks for HQ list/detail.
 * @param {Object} [input={}] - Filter input.
 * @returns {Promise<{ tasks: Object[], error: Error|null }>}
 */
export const selectPatrolTasksForHq = async (input = {}) => {
  try {
    const taskStatus = `${input.taskStatus || ''}`.trim().toLowerCase();
    const taskType = `${input.taskType || ''}`.trim().toLowerCase();

    let query = getSupabaseClient()
      .from('patrol_tasks')
      .select(
        `
        id,
        task_no,
        task_type,
        task_status,
        location_id,
        source_ticket_id,
        source_key_loan_id,
        assigned_to,
        created_by,
        notes,
        accepted_at,
        done_at,
        due_at,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false });

    if (taskStatus) {
      query = query.eq('task_status', taskStatus);
    }
    if (taskType) {
      query = query.eq('task_type', taskType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('item13: failed to load patrol_tasks:', error.message);
      return { tasks: [], error };
    }

    return { tasks: data || [], error: null };
  } catch (error) {
    console.error('item13: selectPatrolTasksForHq exception:', error);
    return { tasks: [], error };
  }
};

/**
 * Fetch tasks linked to a support ticket.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ tasks: Object[], error: Error|null }>}
 */
export const selectPatrolTasksByTicketId = async (ticketId) => {
  try {
    if (!ticketId) {
      return { tasks: [], error: new Error('ticketId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('patrol_tasks')
      .select(
        `
        id,
        task_no,
        task_type,
        task_status,
        assigned_to,
        accepted_at,
        done_at,
        created_at
      `
      )
      .eq('source_ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('item13: failed to load linked patrol_tasks:', error.message);
      return { tasks: [], error };
    }

    return { tasks: data || [], error: null };
  } catch (error) {
    console.error('item13: selectPatrolTasksByTicketId exception:', error);
    return { tasks: [], error };
  }
};

/**
 * Fetch patrol task result by task id.
 * @param {string} taskId - patrol_tasks.id.
 * @returns {Promise<{ result: Object|null, error: Error|null }>}
 */
export const selectPatrolTaskResultByTaskId = async (taskId) => {
  try {
    if (!taskId) {
      return { result: null, error: new Error('taskId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('patrol_task_results')
      .select('id, task_id, result_code, memo, photo_bucket, photo_path, created_by, created_at')
      .eq('task_id', taskId)
      .maybeSingle();

    if (error) {
      console.error('item13: failed to load patrol_task_results:', error.message);
      return { result: null, error };
    }

    return { result: data || null, error: null };
  } catch (error) {
    console.error('item13: selectPatrolTaskResultByTaskId exception:', error);
    return { result: null, error };
  }
};

/**
 * Update patrol task (dispatch / complete confirmation).
 * @param {string} taskId - patrol_tasks.id.
 * @param {Object} input - Update input.
 * @returns {Promise<{ task: Object|null, error: Error|null }>}
 */
export const updatePatrolTaskForHq = async (taskId, input) => {
  try {
    if (!taskId) {
      return { task: null, error: new Error('taskId is required.') };
    }

    const payload = buildTaskUpdatePayload(input);
    const { data, error } = await getSupabaseClient()
      .from('patrol_tasks')
      .update(payload)
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      console.error('item13: failed to update patrol_task:', error.message);
      return { task: null, error };
    }

    return { task: data, error: null };
  } catch (error) {
    console.error('item13: updatePatrolTaskForHq exception:', error);
    return { task: null, error };
  }
};

/**
 * Fetch active key loans.
 * @returns {Promise<{ loans: Object[], error: Error|null }>}
 */
export const selectActiveKeyLoansForHq = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('key_loans')
      .select(
        `
        id,
        loan_no,
        key_id,
        org_id,
        borrower_user_id,
        loaned_by,
        returned_by,
        loaned_at,
        due_at,
        returned_at,
        loan_status,
        note,
        created_at,
        updated_at,
        keys (
          id,
          key_code,
          display_name
        )
      `
      )
      .in('loan_status', ['loaned', 'overdue'])
      .order('loaned_at', { ascending: false });

    if (error) {
      console.error('item13: failed to load key_loans:', error.message);
      return { loans: [], error };
    }

    return { loans: data || [], error: null };
  } catch (error) {
    console.error('item13: selectActiveKeyLoansForHq exception:', error);
    return { loans: [], error };
  }
};

/**
 * Return key and create lock_check task.
 * @param {string} loanId - key_loans.id.
 * @param {boolean} createLockTask - Create lock_check task or not.
 * @param {string|null} optionalAssignee - auth.users.id.
 * @returns {Promise<{ result: Object|null, error: Error|null }>}
 */
export const returnKeyAndCreateLockTaskForHq = async (
  loanId,
  createLockTask = true,
  optionalAssignee = null
) => {
  return rpcReturnKeyAndCreateLockTask(loanId, createLockTask, optionalAssignee);
};

/**
 * Fetch pending evaluation checks.
 * @returns {Promise<{ evaluations: Object[], error: Error|null }>}
 */
export const selectPendingEvaluationsForHq = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('evaluation_checks')
      .select(
        `
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
        updated_at
      `
      )
      .eq('evaluation_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('item13: failed to load pending evaluation_checks:', error.message);
      return { evaluations: [], error };
    }

    return { evaluations: data || [], error: null };
  } catch (error) {
    console.error('item13: selectPendingEvaluationsForHq exception:', error);
    return { evaluations: [], error };
  }
};

/**
 * Decide evaluation status.
 * @param {string} evaluationId - evaluation_checks.id.
 * @param {Object} input - Decision input.
 * @returns {Promise<{ evaluation: Object|null, error: Error|null }>}
 */
export const decideEvaluationForHq = async (evaluationId, input) => {
  try {
    if (!evaluationId) {
      return { evaluation: null, error: new Error('evaluationId is required.') };
    }

    const payload = buildEvaluationDecisionPayload(input);
    const { data, error } = await getSupabaseClient()
      .from('evaluation_checks')
      .update(payload)
      .eq('id', evaluationId)
      .select('*')
      .single();

    if (error) {
      console.error('item13: failed to decide evaluation:', error.message);
      return { evaluation: null, error };
    }

    return { evaluation: data, error: null };
  } catch (error) {
    console.error('item13: decideEvaluationForHq exception:', error);
    return { evaluation: null, error };
  }
};
