/**
 * Item16 payload builder utilities.
 */

const TICKET_TYPE_TO_NOTIFY_TARGET = Object.freeze({
  distribution_change: 'accounting',
  damage_report: 'property',
});

const ALLOWED_PRIORITY_VALUES = new Set(['high', 'normal', 'low']);
const ALLOWED_REPORT_TYPE_VALUES = new Set(['start_report', 'end_report']);

/**
 * Normalize text input to a trimmed string.
 * @param {unknown} value - Raw input value.
 * @returns {string} Trimmed string or empty string.
 */
const normalizeNonEmptyText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

/**
 * Normalize a UUID-like value.
 * @param {unknown} value - Raw UUID value.
 * @returns {string|null} UUID text when available.
 */
const normalizeNullableId = (value) => {
  const normalized = normalizeNonEmptyText(value);
  return normalized || null;
};

/**
 * Convert an input into an ISO date-time string.
 * @param {unknown} value - Date or string input.
 * @returns {string|null} ISO string when parsable.
 */
const toIsoStringOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

/**
 * Resolve notify target from ticket type.
 * @param {string} ticketType - support_tickets.ticket_type value.
 * @returns {'accounting'|'property'|'none'} notify_target.
 */
const resolveNotifyTarget = (ticketType) => {
  const normalizedTicketType = normalizeNonEmptyText(ticketType).toLowerCase();
  return TICKET_TYPE_TO_NOTIFY_TARGET[normalizedTicketType] || 'none';
};

/**
 * Build support ticket payload for rpc_create_ticket_and_auto_tasks.
 * @param {Object} input - Ticket input.
 * @returns {Object} RPC payload.
 */
const buildTicketPayload = (input) => {
  const ticketType = normalizeNonEmptyText(input?.ticketType).toLowerCase();
  const title = normalizeNonEmptyText(input?.title);
  const description = normalizeNonEmptyText(input?.description);
  const createdBy = normalizeNullableId(input?.createdBy);
  const orgId = normalizeNullableId(input?.orgId);
  const explicitNotifyTarget = normalizeNonEmptyText(input?.notifyTarget).toLowerCase();
  const normalizedPriority = normalizeNonEmptyText(input?.priority).toLowerCase();
  const priority = ALLOWED_PRIORITY_VALUES.has(normalizedPriority) ? normalizedPriority : 'normal';

  if (!ticketType) {
    throw new Error('ticketType is required.');
  }
  if (!title) {
    throw new Error('title is required.');
  }
  if (!description) {
    throw new Error('description is required.');
  }
  if (!createdBy) {
    throw new Error('createdBy is required.');
  }
  if (!orgId) {
    throw new Error('orgId is required.');
  }

  const payload = {
    ticket_type: ticketType,
    priority,
    title,
    description,
    created_by: createdBy,
    org_id: orgId,
    notify_target: explicitNotifyTarget || resolveNotifyTarget(ticketType),
  };

  const locationId = normalizeNullableId(input?.locationId);
  const eventId = normalizeNullableId(input?.eventId);
  const taskAssignee = normalizeNullableId(input?.taskAssignee);
  const taskDueAt = toIsoStringOrNull(input?.taskDueAt);
  const taskNote = normalizeNonEmptyText(input?.taskNote);

  if (locationId) {
    payload.location_id = locationId;
  }
  if (eventId) {
    payload.event_id = eventId;
  }
  if (taskAssignee) {
    payload.task_assignee = taskAssignee;
  }
  if (taskDueAt) {
    payload.task_due_at = taskDueAt;
  }
  if (taskNote) {
    payload.task_note = taskNote;
  }

  return payload;
};

/**
 * Build start/end report payload.
 * @param {Object} input - Report input.
 * @returns {Object} Ticket payload.
 */
const buildEventReportPayload = (input) => {
  const reportType = normalizeNonEmptyText(input?.reportType).toLowerCase();
  const eventName = normalizeNonEmptyText(input?.eventName) || 'Event';
  const customMemo = normalizeNonEmptyText(input?.memo);
  const orgName = normalizeNonEmptyText(input?.orgName) || 'Exhibitor';

  if (!ALLOWED_REPORT_TYPE_VALUES.has(reportType)) {
    throw new Error('reportType must be start_report or end_report.');
  }

  const reportLabelJa = reportType === 'start_report' ? '開始' : '終了';
  const title = `${eventName} ${reportLabelJa}報告`;
  const description =
    customMemo || `${orgName} が ${eventName} の${reportLabelJa}報告を送信しました。`;

  return buildTicketPayload({
    ticketType: reportType,
    title,
    description,
    locationId: input?.locationId,
    eventId: input?.eventId,
    orgId: input?.orgId,
    createdBy: input?.createdBy,
    priority: 'normal',
    notifyTarget: 'none',
    taskAssignee: input?.taskAssignee,
    taskDueAt: input?.taskDueAt,
    taskNote: input?.taskNote || `出展団体による${reportLabelJa}報告`,
  });
};

/**
 * Generate reservation number.
 * @param {Date} [now=new Date()] - Timestamp source.
 * @returns {string} Reservation number.
 */
const generateReservationNo = (now = new Date()) => {
  const safeNow = now instanceof Date ? now : new Date(now);
  const year = safeNow.getUTCFullYear();
  const month = String(safeNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeNow.getUTCDate()).padStart(2, '0');
  const hours = String(safeNow.getUTCHours()).padStart(2, '0');
  const minutes = String(safeNow.getUTCMinutes()).padStart(2, '0');
  const seconds = String(safeNow.getUTCSeconds()).padStart(2, '0');
  const randomSuffix = Math.floor(Math.random() * 9000 + 1000);

  return `R-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
};

/**
 * Build key reservation insert payload.
 * @param {Object} input - Reservation input.
 * @returns {Object} key_reservations payload.
 */
const buildKeyReservationPayload = (input) => {
  const keyId = normalizeNullableId(input?.keyId);
  const requestedBy = normalizeNullableId(input?.requestedBy);
  const orgId = normalizeNullableId(input?.orgId);
  const startAt = toIsoStringOrNull(input?.requestedStartAt);
  const endAt = toIsoStringOrNull(input?.requestedEndAt);
  const reason = normalizeNonEmptyText(input?.reason);
  const reservationNo = normalizeNonEmptyText(input?.reservationNo) || generateReservationNo(input?.now);

  if (!keyId) {
    throw new Error('keyId is required.');
  }
  if (!requestedBy) {
    throw new Error('requestedBy is required.');
  }
  if (!orgId) {
    throw new Error('orgId is required.');
  }
  if (!startAt || !endAt) {
    throw new Error('requestedStartAt and requestedEndAt are required.');
  }
  if (new Date(startAt) >= new Date(endAt)) {
    throw new Error('requestedStartAt must be before requestedEndAt.');
  }

  const payload = {
    reservation_no: reservationNo,
    key_id: keyId,
    org_id: orgId,
    requested_by: requestedBy,
    reservation_status: 'pending',
    requested_start_at: startAt,
    requested_end_at: endAt,
  };

  if (reason) {
    payload.reason = reason;
  }

  return payload;
};

module.exports = {
  buildEventReportPayload,
  buildKeyReservationPayload,
  buildTicketPayload,
  generateReservationNo,
  normalizeNonEmptyText,
  resolveNotifyTarget,
  toIsoStringOrNull,
};

module.exports.default = module.exports;
