/**
 * Item12 payload builder utilities.
 */

const ALLOWED_RESULT_CODES = new Set([
  'OK',
  'NOT_STARTED',
  'NOT_ENDED',
  'LOCKED',
  'UNLOCKED',
  'CANNOT_CONFIRM',
  'NEED_SUPPORT',
  'OTHER',
]);

const ALLOWED_CHECK_CATEGORIES = new Set([
  'health_issue',
  'trouble',
  'visitor_incident',
  'unlocked',
  'other',
]);

const ALLOWED_EVALUATION_STATUS = new Set(['pending', 'approved', 'rejected', 'rework']);

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
 * @returns {string|null} id or null.
 */
const normalizeNullableId = (value) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

/**
 * Normalize nullable score value (1..5).
 * @param {unknown} value - Score value.
 * @returns {number|null} normalized score.
 */
const normalizeScore = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericScore = Number(value);
  if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
    throw new Error('score must be an integer between 1 and 5.');
  }

  return numericScore;
};

/**
 * Build payload for rpc_complete_task result payload.
 * @param {Object} input - Result payload input.
 * @returns {Object} rpc_complete_task.result_payload
 */
const buildPatrolResultPayload = (input) => {
  const resultCode = normalizeText(input?.resultCode).toUpperCase();
  const memo = normalizeText(input?.memo);
  const photoBucket = normalizeText(input?.photoBucket);
  const photoPath = normalizeText(input?.photoPath);
  const createdBy = normalizeNullableId(input?.createdBy);

  if (!ALLOWED_RESULT_CODES.has(resultCode)) {
    throw new Error('resultCode is invalid.');
  }
  if (!createdBy) {
    throw new Error('createdBy is required.');
  }

  const payload = {
    result_code: resultCode,
    created_by: createdBy,
  };

  if (memo) {
    payload.memo = memo;
  }
  if (photoBucket) {
    payload.photo_bucket = photoBucket;
  }
  if (photoPath) {
    payload.photo_path = photoPath;
  }

  return payload;
};

/**
 * Build payload for patrol_checks insert.
 * @param {Object} input - Patrol check input.
 * @returns {Object} patrol_checks payload.
 */
const buildPatrolCheckPayload = (input) => {
  const checkedBy = normalizeNullableId(input?.checkedBy);
  const locationId = normalizeNullableId(input?.locationId);
  const checkCategory = normalizeText(input?.checkCategory).toLowerCase();
  const memo = normalizeText(input?.memo);
  const photoBucket = normalizeText(input?.photoBucket);
  const photoPath = normalizeText(input?.photoPath);

  if (!checkedBy) {
    throw new Error('checkedBy is required.');
  }
  if (!ALLOWED_CHECK_CATEGORIES.has(checkCategory)) {
    throw new Error('checkCategory is invalid.');
  }

  const payload = {
    checked_by: checkedBy,
    check_category: checkCategory,
  };

  if (locationId) {
    payload.location_id = locationId;
  }
  if (memo) {
    payload.memo = memo;
  }
  if (photoBucket) {
    payload.photo_bucket = photoBucket;
  }
  if (photoPath) {
    payload.photo_path = photoPath;
  }

  return payload;
};

/**
 * Build payload for evaluation_checks insert.
 * @param {Object} input - Evaluation input.
 * @returns {Object} evaluation_checks payload.
 */
const buildEvaluationPayload = (input) => {
  const evaluatorId = normalizeNullableId(input?.evaluatorId);
  const taskId = normalizeNullableId(input?.taskId);
  const ticketId = normalizeNullableId(input?.ticketId);
  const eventId = normalizeNullableId(input?.eventId);
  const evaluationStatus = normalizeText(input?.evaluationStatus || 'pending').toLowerCase();
  const score = normalizeScore(input?.score);
  const comment = normalizeText(input?.comment);

  if (!evaluatorId) {
    throw new Error('evaluatorId is required.');
  }
  if (!ALLOWED_EVALUATION_STATUS.has(evaluationStatus)) {
    throw new Error('evaluationStatus is invalid.');
  }
  if (!taskId && !ticketId && !eventId) {
    throw new Error('One of taskId/ticketId/eventId is required.');
  }

  const payload = {
    evaluator_id: evaluatorId,
    evaluation_status: evaluationStatus,
  };

  if (taskId) {
    payload.task_id = taskId;
  }
  if (ticketId) {
    payload.ticket_id = ticketId;
  }
  if (eventId) {
    payload.event_id = eventId;
  }
  if (score !== null) {
    payload.score = score;
  }
  if (comment) {
    payload.comment = comment;
  }

  return payload;
};

module.exports = {
  buildEvaluationPayload,
  buildPatrolCheckPayload,
  buildPatrolResultPayload,
  normalizeNullableId,
  normalizeScore,
  normalizeText,
};

module.exports.default = module.exports;
