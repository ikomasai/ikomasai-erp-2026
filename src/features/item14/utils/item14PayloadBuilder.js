/**
 * Item14 payload builder utilities.
 */

const ALLOWED_TICKET_STATUS = new Set([
  'new',
  'acknowledged',
  'in_progress',
  'waiting_external',
  'resolved',
  'closed',
]);

/**
 * Normalize text input.
 * @param {unknown} value - Input value.
 * @returns {string} Trimmed text.
 */
const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

/**
 * Build ticket message payload (reply/memo).
 * @param {Object} input - Message input.
 * @returns {Object} Insert payload.
 */
const buildAccountingMessagePayload = (input) => {
  const ticketId = normalizeText(input?.ticketId);
  const authorId = normalizeText(input?.authorId);
  const body = normalizeText(input?.body);
  const isInternal = Boolean(input?.isInternal);

  if (!ticketId) {
    throw new Error('ticketId is required.');
  }
  if (!authorId) {
    throw new Error('authorId is required.');
  }
  if (!body) {
    throw new Error('body is required.');
  }

  return {
    ticket_id: ticketId,
    author_id: authorId,
    body,
    is_internal: isInternal,
  };
};

/**
 * Build ticket status update payload.
 * @param {Object} input - Status input.
 * @returns {Object} Update payload.
 */
const buildAccountingStatusPayload = (input) => {
  const ticketStatus = normalizeText(input?.ticketStatus).toLowerCase();

  if (!ALLOWED_TICKET_STATUS.has(ticketStatus)) {
    throw new Error('ticketStatus is invalid.');
  }

  return {
    ticket_status: ticketStatus,
    updated_at: new Date().toISOString(),
  };
};

module.exports = {
  buildAccountingMessagePayload,
  buildAccountingStatusPayload,
  normalizeText,
};

module.exports.default = module.exports;
