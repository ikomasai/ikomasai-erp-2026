/**
 * Item13 payload builder utilities.
 */

const ALLOWED_TICKET_STATUS = new Set([
  'new',
  'acknowledged',
  'in_progress',
  'waiting_external',
  'resolved',
  'closed',
]);

const ALLOWED_TASK_STATUS = new Set(['open', 'accepted', 'en_route', 'done', 'canceled']);
const ALLOWED_EVALUATION_STATUS = new Set(['approved', 'rejected', 'rework']);

/**
 * Normalize text input.
 * @param {unknown} value - Input text.
 * @returns {string} Trimmed text.
 */
const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

/**
 * Normalize nullable id value.
 * @param {unknown} value - Input id.
 * @returns {string|null} id text or null.
 */
const normalizeNullableId = (value) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

/**
 * Build payload for support_tickets status update.
 * @param {Object} input - Status input.
 * @returns {Object} update payload.
 */
const buildTicketStatusUpdatePayload = (input) => {
  const ticketStatus = normalizeText(input?.ticketStatus).toLowerCase();

  if (!ALLOWED_TICKET_STATUS.has(ticketStatus)) {
    throw new Error('ticketStatus is invalid.');
  }

  return {
    ticket_status: ticketStatus,
    updated_at: new Date().toISOString(),
  };
};

/**
 * Build payload for ticket assignee update.
 * @param {Object} input - Assignment input.
 * @returns {Object} update payload.
 */
const buildTicketAssignmentPayload = (input) => {
  const assigneeId = normalizeNullableId(input?.assigneeId);

  return {
    assigned_hq_user_id: assigneeId,
    updated_at: new Date().toISOString(),
  };
};

/**
 * Build payload for patrol_tasks update.
 * @param {Object} input - Task update input.
 * @returns {Object} update payload.
 */
const buildTaskUpdatePayload = (input) => {
  const taskStatus = normalizeText(input?.taskStatus).toLowerCase();
  const assignedTo = normalizeNullableId(input?.assignedTo);
  const notes = normalizeText(input?.notes);
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (taskStatus) {
    if (!ALLOWED_TASK_STATUS.has(taskStatus)) {
      throw new Error('taskStatus is invalid.');
    }
    payload.task_status = taskStatus;
  }

  if (assignedTo !== null) {
    payload.assigned_to = assignedTo;
  }

  if (notes) {
    payload.notes = notes;
  }

  if (taskStatus === 'done') {
    payload.done_at = new Date().toISOString();
  }

  return payload;
};

/**
 * Build payload for evaluation decision.
 * @param {Object} input - Decision input.
 * @returns {Object} update payload.
 */
const buildEvaluationDecisionPayload = (input) => {
  const decision = normalizeText(input?.decision).toLowerCase();
  const reviewedBy = normalizeNullableId(input?.reviewedBy);
  const comment = normalizeText(input?.comment);

  if (!ALLOWED_EVALUATION_STATUS.has(decision)) {
    throw new Error('decision is invalid.');
  }
  if (!reviewedBy) {
    throw new Error('reviewedBy is required.');
  }

  const payload = {
    evaluation_status: decision,
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (comment) {
    payload.comment = comment;
  }

  return payload;
};

module.exports = {
  buildEvaluationDecisionPayload,
  buildTaskUpdatePayload,
  buildTicketAssignmentPayload,
  buildTicketStatusUpdatePayload,
  normalizeNullableId,
  normalizeText,
};

module.exports.default = module.exports;
