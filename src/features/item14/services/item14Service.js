/**
 * Item14 accounting service.
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import item14PayloadBuilder from '../utils/item14PayloadBuilder.js';

const { buildAccountingMessagePayload, buildAccountingStatusPayload } = item14PayloadBuilder;

const ACCOUNTING_TICKET_TYPE = 'distribution_change';
const ACCOUNTING_NOTIFY_TARGET = 'accounting';
const WORKING_STATUS = ['acknowledged', 'in_progress', 'waiting_external'];
const DONE_STATUS = ['resolved', 'closed'];

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
    console.error('item14: failed to load user_profiles:', error.message);
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
 * Convert inbox bucket to ticket_status filter.
 * @param {string} statusBucket - all/unread/working/done.
 * @returns {string[]|null} Filter status values.
 */
const mapBucketToStatus = (statusBucket) => {
  const normalizedBucket = `${statusBucket || 'all'}`.trim().toLowerCase();

  if (normalizedBucket === 'unread') {
    return ['new'];
  }
  if (normalizedBucket === 'working') {
    return WORKING_STATUS;
  }
  if (normalizedBucket === 'done') {
    return DONE_STATUS;
  }

  return null;
};

/**
 * Fetch accounting inbox tickets.
 * @param {Object} [input={}] - Filter input.
 * @param {string} [input.statusBucket='all'] - all/unread/working/done.
 * @returns {Promise<{ tickets: Object[], error: Error|null }>}
 */
export const selectAccountingTickets = async (input = {}) => {
  try {
    const statusFilter = mapBucketToStatus(input?.statusBucket);

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
        event_id,
        location_id,
        org_id,
        created_by,
        assigned_hq_user_id,
        created_at,
        updated_at
      `
      )
      .eq('ticket_type', ACCOUNTING_TICKET_TYPE)
      .eq('notify_target', ACCOUNTING_NOTIFY_TARGET)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.in('ticket_status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('item14: failed to load accounting inbox:', error.message);
      return { tickets: [], error };
    }

    return { tickets: data || [], error: null };
  } catch (error) {
    console.error('item14: selectAccountingTickets exception:', error);
    return { tickets: [], error };
  }
};

/**
 * Fetch single accounting ticket detail.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const selectAccountingTicketDetail = async (ticketId) => {
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
        event_id,
        location_id,
        org_id,
        created_by,
        assigned_hq_user_id,
        created_at,
        updated_at
      `
      )
      .eq('id', ticketId)
      .eq('ticket_type', ACCOUNTING_TICKET_TYPE)
      .eq('notify_target', ACCOUNTING_NOTIFY_TARGET)
      .single();

    if (error) {
      console.error('item14: failed to load accounting ticket detail:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item14: selectAccountingTicketDetail exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Fetch ticket message thread for accounting.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ messages: Object[], error: Error|null }>}
 */
export const selectAccountingTicketMessages = async (ticketId) => {
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
      console.error('item14: failed to load ticket_messages:', error.message);
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
    console.error('item14: selectAccountingTicketMessages exception:', error);
    return { messages: [], error };
  }
};

/**
 * Fetch ticket attachments for accounting.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ attachments: Object[], error: Error|null }>}
 */
export const selectAccountingTicketAttachments = async (ticketId) => {
  try {
    if (!ticketId) {
      return { attachments: [], error: new Error('ticketId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('ticket_attachments')
      .select(
        `
        id,
        ticket_id,
        uploaded_by,
        storage_bucket,
        storage_path,
        mime_type,
        file_size_bytes,
        caption,
        created_at
      `
      )
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('item14: failed to load ticket_attachments:', error.message);
      return { attachments: [], error };
    }

    return { attachments: data || [], error: null };
  } catch (error) {
    console.error('item14: selectAccountingTicketAttachments exception:', error);
    return { attachments: [], error };
  }
};

/**
 * Post accounting reply/memo to ticket.
 * @param {Object} input - Message input.
 * @returns {Promise<{ message: Object|null, error: Error|null }>}
 */
export const appendAccountingTicketMessage = async (input) => {
  try {
    const payload = buildAccountingMessagePayload(input);

    const { data, error } = await getSupabaseClient()
      .from('ticket_messages')
      .insert(payload)
      .select('id, ticket_id, author_id, body, is_internal, created_at')
      .single();

    if (error) {
      console.error('item14: failed to insert accounting message:', error.message);
      return { message: null, error };
    }

    return { message: data, error: null };
  } catch (error) {
    console.error('item14: appendAccountingTicketMessage exception:', error);
    return { message: null, error };
  }
};

/**
 * Update accounting ticket status.
 * @param {string} ticketId - support_tickets.id.
 * @param {string} ticketStatus - ticket_status.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const updateAccountingTicketStatus = async (ticketId, ticketStatus) => {
  try {
    if (!ticketId) {
      return { ticket: null, error: new Error('ticketId is required.') };
    }

    const payload = buildAccountingStatusPayload({ ticketStatus });

    const { data, error } = await getSupabaseClient()
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId)
      .eq('ticket_type', ACCOUNTING_TICKET_TYPE)
      .eq('notify_target', ACCOUNTING_NOTIFY_TARGET)
      .select('*')
      .single();

    if (error) {
      console.error('item14: failed to update accounting ticket status:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item14: updateAccountingTicketStatus exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Mark ticket as resolved from accounting inbox.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const completeAccountingTicket = async (ticketId) => {
  return updateAccountingTicketStatus(ticketId, 'resolved');
};
