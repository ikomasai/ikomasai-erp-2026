/**
 * Item12 patrol service.
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { rpcAcceptTask, rpcCompleteTask } from '../../../services/supabase/workflowRpcService.js';
import item12PayloadBuilder from '../utils/item12PayloadBuilder.js';

const {
  buildEvaluationPayload,
  buildPatrolCheckPayload,
  buildPatrolResultPayload,
} = item12PayloadBuilder;

const ACTIVE_TASK_STATUS = ['open', 'accepted', 'en_route'];
const UNVISITED_FALLBACK_MINUTES = 30;

/**
 * Fetch active patrol tasks (open + my tasks).
 * @param {string} userId - auth.users.id.
 * @returns {Promise<{ tasks: Object[], error: Error|null }>}
 */
export const selectPatrolTasksForUser = async (userId) => {
  try {
    if (!userId) {
      return { tasks: [], error: new Error('userId is required.') };
    }

    const { data, error } = await getSupabaseClient()
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
      .in('task_status', ACTIVE_TASK_STATUS)
      .or(`assigned_to.is.null,assigned_to.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('item12: failed to load patrol_tasks:', error.message);
      return { tasks: [], error };
    }

    return { tasks: data || [], error: null };
  } catch (error) {
    console.error('item12: selectPatrolTasksForUser exception:', error);
    return { tasks: [], error };
  }
};

/**
 * Fetch unvisited alert targets from open tasks.
 * @param {string} userId - auth.users.id.
 * @returns {Promise<{ alerts: Object[], error: Error|null }>}
 */
export const selectUnvisitedAlerts = async (userId) => {
  try {
    if (!userId) {
      return { alerts: [], error: new Error('userId is required.') };
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
        due_at,
        created_at,
        notes
      `
      )
      .eq('task_status', 'open')
      .or(`assigned_to.is.null,assigned_to.eq.${userId}`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('item12: failed to load unvisited alerts:', error.message);
      return { alerts: [], error };
    }

    const nowMs = Date.now();
    const alerts = (data || [])
      .map((task) => {
        const createdAtMs = new Date(task.created_at).getTime();
        const dueAtMs = task.due_at ? new Date(task.due_at).getTime() : null;
        const referenceMs = dueAtMs || createdAtMs;
        const overdueMinutes = Math.floor((nowMs - referenceMs) / 60000);
        const threshold = dueAtMs ? 0 : UNVISITED_FALLBACK_MINUTES;

        return {
          ...task,
          overdue_minutes: overdueMinutes,
          is_alert: overdueMinutes > threshold,
        };
      })
      .filter((task) => task.is_alert);

    return { alerts, error: null };
  } catch (error) {
    console.error('item12: selectUnvisitedAlerts exception:', error);
    return { alerts: [], error };
  }
};

/**
 * Accept task (open -> accepted).
 * @param {string} taskId - patrol_tasks.id.
 * @param {string} patrolUserId - auth.users.id.
 * @returns {Promise<{ result: Object|null, error: Error|null }>}
 */
export const acceptPatrolTask = async (taskId, patrolUserId) => {
  return rpcAcceptTask(taskId, patrolUserId);
};

/**
 * Complete task with result payload.
 * @param {string} taskId - patrol_tasks.id.
 * @param {Object} input - Result input.
 * @returns {Promise<{ result: Object|null, error: Error|null }>}
 */
export const completePatrolTask = async (taskId, input) => {
  try {
    const resultPayload = buildPatrolResultPayload(input);
    return rpcCompleteTask(taskId, resultPayload);
  } catch (error) {
    return { result: null, error };
  }
};

/**
 * Insert patrol check record.
 * @param {Object} input - Patrol check input.
 * @returns {Promise<{ check: Object|null, error: Error|null }>}
 */
export const createPatrolCheck = async (input) => {
  try {
    const payload = buildPatrolCheckPayload(input);

    const { data, error } = await getSupabaseClient()
      .from('patrol_checks')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('item12: failed to insert patrol_check:', error.message);
      return { check: null, error };
    }

    return { check: data, error: null };
  } catch (error) {
    console.error('item12: createPatrolCheck exception:', error);
    return { check: null, error };
  }
};

/**
 * Insert evaluation input.
 * @param {Object} input - Evaluation input.
 * @returns {Promise<{ evaluation: Object|null, error: Error|null }>}
 */
export const createEvaluationCheck = async (input) => {
  try {
    const payload = buildEvaluationPayload(input);

    const { data, error } = await getSupabaseClient()
      .from('evaluation_checks')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('item12: failed to insert evaluation_check:', error.message);
      return { evaluation: null, error };
    }

    return { evaluation: data, error: null };
  } catch (error) {
    console.error('item12: createEvaluationCheck exception:', error);
    return { evaluation: null, error };
  }
};
