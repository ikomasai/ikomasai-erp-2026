/**
 * Item16 supabase service.
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { rpcCreateTicketAndAutoTasks } from '../../../services/supabase/workflowRpcService.js';
import item16PayloadBuilder from '../utils/item16PayloadBuilder.js';

const { buildKeyReservationPayload } = item16PayloadBuilder;

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
    console.error('item16: failed to load author profiles:', error.message);
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
 * Fetch exhibitor organization for the current user.
 * @param {string} userId - auth.users.id.
 * @returns {Promise<{ organization: Object|null, error: Error|null }>}
 */
export const selectExhibitorOrganization = async (userId) => {
  try {
    if (!userId) {
      return { organization: null, error: new Error('userId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('user_organizations')
      .select(
        `
        organization_id,
        is_primary,
        organizations (
          id,
          org_type,
          name,
          code
        )
      `
      )
      .eq('user_id', userId);

    if (error) {
      console.error('item16: failed to load user organizations:', error.message);
      return { organization: null, error };
    }

    const exhibitorRows = (data || []).filter(
      (row) => row?.organizations && row.organizations.org_type === 'exhibitor'
    );

    if (exhibitorRows.length === 0) {
      return { organization: null, error: null };
    }

    exhibitorRows.sort((left, right) => {
      if (left.is_primary && !right.is_primary) {
        return -1;
      }
      if (!left.is_primary && right.is_primary) {
        return 1;
      }
      return 0;
    });

    return {
      organization: exhibitorRows[0].organizations,
      error: null,
    };
  } catch (error) {
    console.error('item16: selectExhibitorOrganization exception:', error);
    return { organization: null, error };
  }
};

/**
 * Fetch exhibitor tickets scoped by org id.
 * @param {string} organizationId - organizations.id.
 * @returns {Promise<{ tickets: Object[], error: Error|null }>}
 */
export const selectExhibitorTickets = async (organizationId) => {
  try {
    if (!organizationId) {
      return { tickets: [], error: new Error('organizationId is required.') };
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
        created_by,
        created_at,
        updated_at
      `
      )
      .eq('org_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('item16: failed to load support_tickets:', error.message);
      return { tickets: [], error };
    }

    return { tickets: data || [], error: null };
  } catch (error) {
    console.error('item16: selectExhibitorTickets exception:', error);
    return { tickets: [], error };
  }
};

/**
 * Fetch a single ticket detail.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ ticket: Object|null, error: Error|null }>}
 */
export const selectTicketDetail = async (ticketId) => {
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
        created_by,
        created_at,
        updated_at
      `
      )
      .eq('id', ticketId)
      .single();

    if (error) {
      console.error('item16: failed to load ticket detail:', error.message);
      return { ticket: null, error };
    }

    return { ticket: data, error: null };
  } catch (error) {
    console.error('item16: selectTicketDetail exception:', error);
    return { ticket: null, error };
  }
};

/**
 * Fetch messages for a ticket.
 * @param {string} ticketId - support_tickets.id.
 * @returns {Promise<{ messages: Object[], error: Error|null }>}
 */
export const selectTicketMessages = async (ticketId) => {
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
      console.error('item16: failed to load ticket_messages:', error.message);
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
    console.error('item16: selectTicketMessages exception:', error);
    return { messages: [], error };
  }
};

/**
 * Add a message to a ticket.
 * @param {Object} input - Message input.
 * @returns {Promise<{ message: Object|null, error: Error|null }>}
 */
export const appendTicketMessage = async (input) => {
  try {
    const payload = {
      ticket_id: input?.ticketId,
      author_id: input?.authorId,
      body: input?.body?.trim?.() || '',
      is_internal: false,
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
      console.error('item16: failed to insert ticket message:', error.message);
      return { message: null, error };
    }

    return { message: data, error: null };
  } catch (error) {
    console.error('item16: appendTicketMessage exception:', error);
    return { message: null, error };
  }
};

/**
 * Create a ticket through phase8 RPC.
 * @param {Object} ticketPayload - RPC payload.
 * @returns {Promise<{ result: Object|null, error: Error|null }>}
 */
export const createTicketWithAutoTasks = async (ticketPayload) => {
  return rpcCreateTicketAndAutoTasks(ticketPayload);
};

/**
 * Fetch events that belong to the exhibitor organization.
 * @param {string} organizationId - organizations.id.
 * @returns {Promise<{ events: Object[], error: Error|null }>}
 */
export const selectExhibitorEvents = async (organizationId) => {
  try {
    if (!organizationId) {
      return { events: [], error: new Error('organizationId is required.') };
    }

    const { data, error } = await getSupabaseClient()
      .from('event_organizations')
      .select(
        `
        relation_type,
        events (
          id,
          name,
          location,
          type
        )
      `
      )
      .eq('organization_id', organizationId);

    if (error) {
      console.error('item16: failed to load exhibitor events:', error.message);
      return { events: [], error };
    }

    const events = (data || [])
      .map((row) => row.events)
      .filter(Boolean)
      .sort((left, right) => {
        return `${left.name || ''}`.localeCompare(`${right.name || ''}`);
      });

    return { events, error: null };
  } catch (error) {
    console.error('item16: selectExhibitorEvents exception:', error);
    return { events: [], error };
  }
};

/**
 * Fetch keys that can be reserved.
 * @returns {Promise<{ keys: Object[], error: Error|null }>}
 */
export const selectReservableKeys = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('keys')
      .select('id, key_code, display_name, status, notes, location_id')
      .eq('status', 'available')
      .order('key_code', { ascending: true });

    if (error) {
      console.error('item16: failed to load keys:', error.message);
      return { keys: [], error };
    }

    return { keys: data || [], error: null };
  } catch (error) {
    console.error('item16: selectReservableKeys exception:', error);
    return { keys: [], error };
  }
};

/**
 * Create key reservation for exhibitor.
 * @param {Object} input - Reservation input.
 * @returns {Promise<{ reservation: Object|null, error: Error|null }>}
 */
export const createKeyReservation = async (input) => {
  try {
    const payload = buildKeyReservationPayload(input);

    const { data, error } = await getSupabaseClient()
      .from('key_reservations')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('item16: failed to insert key reservation:', error.message);
      return { reservation: null, error };
    }

    return { reservation: data, error: null };
  } catch (error) {
    console.error('item16: createKeyReservation exception:', error);
    return { reservation: null, error };
  }
};
