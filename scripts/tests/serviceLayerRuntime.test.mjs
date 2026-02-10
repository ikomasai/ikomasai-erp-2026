import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetSupabaseClientForTest,
  __setSupabaseClientForTest,
} from '../../src/services/supabase/client.js';
import * as workflowRpcService from '../../src/services/supabase/workflowRpcService.js';
import * as item12Service from '../../src/features/item12/services/item12Service.js';
import * as item13Service from '../../src/features/item13/services/item13Service.js';
import * as item14Service from '../../src/features/item14/services/item14Service.js';
import * as item15Service from '../../src/features/item15/services/item15Service.js';
import * as item16Service from '../../src/features/item16/services/item16Service.js';

const DEFAULT_FROM_RESPONSE = Object.freeze({ data: [], error: null });
const DEFAULT_RPC_RESPONSE = Object.freeze({ data: null, error: null });

const takeResponse = (map, key, fallback) => {
  const value = map[key];

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return fallback;
    }

    return value.shift();
  }

  return value ?? fallback;
};

const createQueryBuilder = ({ table, response, calls }) => {
  const builder = {
    select(...args) {
      calls.push({ kind: 'select', table, args });
      return builder;
    },
    eq(column, value) {
      calls.push({ kind: 'eq', table, column, value });
      return builder;
    },
    in(column, values) {
      calls.push({ kind: 'in', table, column, values });
      return builder;
    },
    or(expression) {
      calls.push({ kind: 'or', table, expression });
      return builder;
    },
    order(column, options) {
      calls.push({ kind: 'order', table, column, options });
      return builder;
    },
    limit(limit) {
      calls.push({ kind: 'limit', table, limit });
      return builder;
    },
    lt(column, value) {
      calls.push({ kind: 'lt', table, column, value });
      return builder;
    },
    gte(column, value) {
      calls.push({ kind: 'gte', table, column, value });
      return builder;
    },
    update(payload) {
      calls.push({ kind: 'update', table, payload });
      return builder;
    },
    insert(payload) {
      calls.push({ kind: 'insert', table, payload });
      return builder;
    },
    single() {
      calls.push({ kind: 'single', table });
      return Promise.resolve(response);
    },
    maybeSingle() {
      calls.push({ kind: 'maybeSingle', table });
      return Promise.resolve(response);
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(response).then(onFulfilled, onRejected);
    },
  };

  return builder;
};

const createMockSupabase = ({ fromResponses = {}, rpcResponses = {} } = {}) => {
  const calls = [];

  return {
    calls,
    from(table) {
      calls.push({ kind: 'from', table });
      const response = takeResponse(fromResponses, table, DEFAULT_FROM_RESPONSE);
      return createQueryBuilder({ table, response, calls });
    },
    rpc(name, args) {
      calls.push({ kind: 'rpc', name, args });
      const response = takeResponse(rpcResponses, name, DEFAULT_RPC_RESPONSE);
      return Promise.resolve(response);
    },
  };
};

afterEach(() => {
  __resetSupabaseClientForTest();
});

test('workflowRpcService success path: rpcAcceptTask returns result and calls RPC', async () => {
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_accept_task: {
        data: { accepted: true, task_id: 'task-1' },
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { result, error } = await workflowRpcService.rpcAcceptTask('task-1', 'patrol-1');

  assert.equal(error, null);
  assert.deepEqual(result, { accepted: true, task_id: 'task-1' });
  assert.deepEqual(mockClient.calls[0], {
    kind: 'rpc',
    name: 'rpc_accept_task',
    args: { task_id: 'task-1', patrol_user_id: 'patrol-1' },
  });
});

test('workflowRpcService error path: rpcCompleteTask returns RPC error as-is', async () => {
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_complete_task: {
        data: null,
        error: { message: 'RLS blocked' },
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { result, error } = await workflowRpcService.rpcCompleteTask('task-2', {
    result_code: 'OK',
    created_by: 'patrol-2',
  });

  assert.equal(result, null);
  assert.equal(error.message, 'RLS blocked');
});

test('workflowRpcService exception path: rpcCreateTicketAndAutoTasks catches thrown exception', async () => {
  const mockClient = {
    rpc() {
      throw new Error('network down');
    },
  };
  __setSupabaseClientForTest(mockClient);

  const { result, error } = await workflowRpcService.rpcCreateTicketAndAutoTasks({
    ticket_type: 'start_report',
  });

  assert.equal(result, null);
  assert.ok(error instanceof Error);
  assert.match(error.message, /network down/);
});

test('item12Service success path: selectPatrolTasksForUser returns tasks with user scope query', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      patrol_tasks: {
        data: [{ id: 'task-1', task_status: 'open', assigned_to: null }],
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { tasks, error } = await item12Service.selectPatrolTasksForUser('user-1');

  assert.equal(error, null);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'task-1');
  assert.ok(
    mockClient.calls.some(
      (call) =>
        call.kind === 'or' &&
        call.table === 'patrol_tasks' &&
        call.expression === 'assigned_to.is.null,assigned_to.eq.user-1'
    )
  );
});

test('item12Service error path: selectPatrolTasksForUser returns query error', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      patrol_tasks: {
        data: null,
        error: { message: 'permission denied by RLS' },
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { tasks, error } = await item12Service.selectPatrolTasksForUser('user-1');

  assert.deepEqual(tasks, []);
  assert.equal(error.message, 'permission denied by RLS');
});

test('item13Service success path: selectHqDashboardSummary aggregates all counts', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      support_tickets: [{ count: 3, error: null }, { count: 2, error: null }],
      patrol_tasks: [{ count: 4, error: null }, { count: 5, error: null }],
      key_loans: { count: 6, error: null },
      radio_logs: { count: 7, error: null },
      evaluation_checks: { count: 8, error: null },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { summary, error } = await item13Service.selectHqDashboardSummary();

  assert.equal(error, null);
  assert.deepEqual(summary, {
    new_tickets: 3,
    late_tickets: 2,
    lock_tasks: 4,
    active_key_loans: 6,
    active_patrol_tasks: 5,
    recent_radio_logs: 7,
    pending_evaluations: 8,
  });
});

test('item13Service validation path: updateTicketNotifyTarget rejects invalid notify target', async () => {
  const { ticket, error } = await item13Service.updateTicketNotifyTarget('ticket-1', 'invalid-target');

  assert.equal(ticket, null);
  assert.equal(error.message, 'notifyTarget is invalid.');
});

test('item14Service success path: selectAccountingTickets applies bucket and role scope filters', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      support_tickets: {
        data: [{ id: 'ticket-1', ticket_status: 'in_progress' }],
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { tickets, error } = await item14Service.selectAccountingTickets({ statusBucket: 'working' });

  assert.equal(error, null);
  assert.equal(tickets.length, 1);
  assert.ok(
    mockClient.calls.some(
      (call) =>
        call.kind === 'eq' &&
        call.table === 'support_tickets' &&
        call.column === 'ticket_type' &&
        call.value === 'distribution_change'
    )
  );
  assert.ok(
    mockClient.calls.some(
      (call) =>
        call.kind === 'eq' &&
        call.table === 'support_tickets' &&
        call.column === 'notify_target' &&
        call.value === 'accounting'
    )
  );
  const statusFilterCall = mockClient.calls.find(
    (call) => call.kind === 'in' && call.table === 'support_tickets' && call.column === 'ticket_status'
  );
  assert.deepEqual(statusFilterCall?.values, ['acknowledged', 'in_progress', 'waiting_external']);
});

test('item14Service error path: selectAccountingTicketDetail returns RLS error', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      support_tickets: {
        data: null,
        error: { message: 'RLS denied' },
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { ticket, error } = await item14Service.selectAccountingTicketDetail('ticket-1');

  assert.equal(ticket, null);
  assert.equal(error.message, 'RLS denied');
});

test('item15Service success path: completePropertyTicket updates status to resolved', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      support_tickets: {
        data: { id: 'ticket-2', ticket_status: 'resolved' },
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { ticket, error } = await item15Service.completePropertyTicket('ticket-2');

  assert.equal(error, null);
  assert.equal(ticket.ticket_status, 'resolved');

  const updateCall = mockClient.calls.find(
    (call) => call.kind === 'update' && call.table === 'support_tickets'
  );
  assert.equal(updateCall.payload.ticket_status, 'resolved');
  assert.ok(typeof updateCall.payload.updated_at === 'string');
});

test('item16Service success path: selectExhibitorOrganization picks primary exhibitor row', async () => {
  const mockClient = createMockSupabase({
    fromResponses: {
      user_organizations: {
        data: [
          {
            organization_id: 'org-secondary',
            is_primary: false,
            organizations: { id: 'org-secondary', org_type: 'exhibitor', name: 'Org Secondary', code: 'S' },
          },
          {
            organization_id: 'org-primary',
            is_primary: true,
            organizations: { id: 'org-primary', org_type: 'exhibitor', name: 'Org Primary', code: 'P' },
          },
          {
            organization_id: 'org-department',
            is_primary: true,
            organizations: { id: 'org-department', org_type: 'department', name: 'Dept', code: 'D' },
          },
        ],
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { organization, error } = await item16Service.selectExhibitorOrganization('user-1');

  assert.equal(error, null);
  assert.equal(organization.id, 'org-primary');
});

test('item16Service error path: createTicketWithAutoTasks returns RPC failure', async () => {
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_create_ticket_and_auto_tasks: {
        data: null,
        error: { message: 'RPC execution failed' },
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const { result, error } = await item16Service.createTicketWithAutoTasks({
    ticket_type: 'start_report',
  });

  assert.equal(result, null);
  assert.equal(error.message, 'RPC execution failed');
});

test('item16Service validation path: selectExhibitorTickets requires organizationId', async () => {
  const { tickets, error } = await item16Service.selectExhibitorTickets('');

  assert.deepEqual(tickets, []);
  assert.equal(error.message, 'organizationId is required.');
});
