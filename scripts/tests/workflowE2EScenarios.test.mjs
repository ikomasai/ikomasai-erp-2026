import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  __resetSupabaseClientForTest,
  __setSupabaseClientForTest,
} from '../../src/services/supabase/client.js';
import * as item12Service from '../../src/features/item12/services/item12Service.js';
import * as item13Service from '../../src/features/item13/services/item13Service.js';
import * as item14Service from '../../src/features/item14/services/item14Service.js';
import * as item15Service from '../../src/features/item15/services/item15Service.js';
import * as item16Service from '../../src/features/item16/services/item16Service.js';

const require = createRequire(import.meta.url);
const item16PayloadBuilder = require('../../src/features/item16/utils/item16PayloadBuilder.js');

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

test('e2e scenario: exhibitor start_report -> patrol accept/complete -> HQ confirmation', async () => {
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_create_ticket_and_auto_tasks: {
        data: { ticket_id: 'tk-1', task_ids: ['pt-1'] },
        error: null,
      },
      rpc_accept_task: {
        data: { task_id: 'pt-1', task_status: 'accepted' },
        error: null,
      },
      rpc_complete_task: {
        data: { task_id: 'pt-1', task_status: 'done' },
        error: null,
      },
    },
    fromResponses: {
      patrol_tasks: {
        data: [{ id: 'pt-1', source_ticket_id: 'tk-1', task_status: 'done' }],
        error: null,
      },
      patrol_task_results: {
        data: { task_id: 'pt-1', result_code: 'OK', memo: 'patrol completed' },
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const ticketPayload = item16PayloadBuilder.buildEventReportPayload({
    reportType: 'start_report',
    eventName: 'Event A',
    orgName: 'Exhibitor A',
    orgId: 'org-1',
    createdBy: 'exhibitor-user-1',
    eventId: 'event-1',
  });

  const created = await item16Service.createTicketWithAutoTasks(ticketPayload);
  const accepted = await item12Service.acceptPatrolTask('pt-1', 'patrol-user-1');
  const completed = await item12Service.completePatrolTask('pt-1', {
    resultCode: 'OK',
    createdBy: 'patrol-user-1',
    memo: 'checked',
  });
  const linkedTasks = await item13Service.selectPatrolTasksByTicketId('tk-1');
  const taskResult = await item13Service.selectPatrolTaskResultByTaskId('pt-1');

  assert.equal(created.error, null);
  assert.equal(accepted.error, null);
  assert.equal(completed.error, null);
  assert.equal(linkedTasks.tasks.length, 1);
  assert.equal(taskResult.result.result_code, 'OK');

  const rpcNames = mockClient.calls.filter((call) => call.kind === 'rpc').map((call) => call.name);
  assert.deepEqual(rpcNames, [
    'rpc_create_ticket_and_auto_tasks',
    'rpc_accept_task',
    'rpc_complete_task',
  ]);
});

test('e2e scenario: exhibitor distribution_change -> accounting reply/complete -> exhibitor + HQ confirmation', async () => {
  const createdAt = new Date().toISOString();
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_create_ticket_and_auto_tasks: {
        data: { ticket_id: 'tk-2', task_ids: [] },
        error: null,
      },
    },
    fromResponses: {
      ticket_messages: [
        {
          data: {
            id: 'msg-1',
            ticket_id: 'tk-2',
            author_id: 'accounting-user-1',
            body: 'accounting responded',
            is_internal: false,
            created_at: createdAt,
          },
          error: null,
        },
        {
          data: [
            {
              id: 'msg-1',
              ticket_id: 'tk-2',
              author_id: 'accounting-user-1',
              body: 'accounting responded',
              is_internal: false,
              created_at: createdAt,
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'msg-1',
              ticket_id: 'tk-2',
              author_id: 'accounting-user-1',
              body: 'accounting responded',
              is_internal: false,
              created_at: createdAt,
            },
          ],
          error: null,
        },
      ],
      support_tickets: {
        data: { id: 'tk-2', ticket_status: 'resolved' },
        error: null,
      },
      user_profiles: [
        {
          data: [{ user_id: 'accounting-user-1', name: 'Accounting User' }],
          error: null,
        },
        {
          data: [{ user_id: 'accounting-user-1', name: 'Accounting User' }],
          error: null,
        },
      ],
    },
  });
  __setSupabaseClientForTest(mockClient);

  const ticketPayload = item16PayloadBuilder.buildTicketPayload({
    ticketType: 'distribution_change',
    title: 'Distribution request',
    description: 'Need accounting support',
    createdBy: 'exhibitor-user-2',
    orgId: 'org-2',
  });

  const created = await item16Service.createTicketWithAutoTasks(ticketPayload);
  const replied = await item14Service.appendAccountingTicketMessage({
    ticketId: 'tk-2',
    authorId: 'accounting-user-1',
    body: 'accounting responded',
    isInternal: false,
  });
  const completed = await item14Service.completeAccountingTicket('tk-2');
  const exhibitorView = await item16Service.selectTicketMessages('tk-2');
  const hqView = await item13Service.selectTicketMessagesForHq('tk-2');

  assert.equal(created.error, null);
  assert.equal(replied.error, null);
  assert.equal(completed.error, null);
  assert.equal(completed.ticket.ticket_status, 'resolved');
  assert.equal(exhibitorView.messages.length, 1);
  assert.equal(hqView.messages.length, 1);
  assert.equal(exhibitorView.messages[0].author_name, 'Accounting User');
  assert.equal(hqView.messages[0].author_name, 'Accounting User');
});

test('e2e scenario: exhibitor damage_report -> property reply/complete -> exhibitor + HQ confirmation', async () => {
  const createdAt = new Date().toISOString();
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_create_ticket_and_auto_tasks: {
        data: { ticket_id: 'tk-3', task_ids: [] },
        error: null,
      },
    },
    fromResponses: {
      ticket_messages: [
        {
          data: {
            id: 'msg-2',
            ticket_id: 'tk-3',
            author_id: 'property-user-1',
            body: 'property responded',
            is_internal: false,
            created_at: createdAt,
          },
          error: null,
        },
        {
          data: [
            {
              id: 'msg-2',
              ticket_id: 'tk-3',
              author_id: 'property-user-1',
              body: 'property responded',
              is_internal: false,
              created_at: createdAt,
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'msg-2',
              ticket_id: 'tk-3',
              author_id: 'property-user-1',
              body: 'property responded',
              is_internal: false,
              created_at: createdAt,
            },
          ],
          error: null,
        },
      ],
      support_tickets: {
        data: { id: 'tk-3', ticket_status: 'resolved' },
        error: null,
      },
      user_profiles: [
        {
          data: [{ user_id: 'property-user-1', name: 'Property User' }],
          error: null,
        },
        {
          data: [{ user_id: 'property-user-1', name: 'Property User' }],
          error: null,
        },
      ],
    },
  });
  __setSupabaseClientForTest(mockClient);

  const ticketPayload = item16PayloadBuilder.buildTicketPayload({
    ticketType: 'damage_report',
    title: 'Damage report',
    description: 'Need property support',
    createdBy: 'exhibitor-user-3',
    orgId: 'org-3',
  });

  const created = await item16Service.createTicketWithAutoTasks(ticketPayload);
  const replied = await item15Service.appendPropertyTicketMessage({
    ticketId: 'tk-3',
    authorId: 'property-user-1',
    body: 'property responded',
    isInternal: false,
  });
  const completed = await item15Service.completePropertyTicket('tk-3');
  const exhibitorView = await item16Service.selectTicketMessages('tk-3');
  const hqView = await item13Service.selectTicketMessagesForHq('tk-3');

  assert.equal(created.error, null);
  assert.equal(replied.error, null);
  assert.equal(completed.error, null);
  assert.equal(completed.ticket.ticket_status, 'resolved');
  assert.equal(exhibitorView.messages.length, 1);
  assert.equal(hqView.messages.length, 1);
  assert.equal(exhibitorView.messages[0].author_name, 'Property User');
  assert.equal(hqView.messages[0].author_name, 'Property User');
});

test('e2e scenario: HQ key return + lock request -> patrol completion -> HQ reflection', async () => {
  const mockClient = createMockSupabase({
    rpcResponses: {
      rpc_return_key_and_create_lock_task: {
        data: { loan_id: 'loan-1', lock_task_id: 'pt-9', lock_task_created: true },
        error: null,
      },
      rpc_complete_task: {
        data: { task_id: 'pt-9', task_status: 'done' },
        error: null,
      },
    },
    fromResponses: {
      patrol_task_results: {
        data: { task_id: 'pt-9', result_code: 'LOCKED', memo: 'lock confirmed' },
        error: null,
      },
    },
  });
  __setSupabaseClientForTest(mockClient);

  const returned = await item13Service.returnKeyAndCreateLockTaskForHq('loan-1', true, 'patrol-user-2');
  const completed = await item12Service.completePatrolTask('pt-9', {
    resultCode: 'LOCKED',
    createdBy: 'patrol-user-2',
    memo: 'lock confirmed',
  });
  const reflected = await item13Service.selectPatrolTaskResultByTaskId('pt-9');

  assert.equal(returned.error, null);
  assert.equal(completed.error, null);
  assert.equal(reflected.error, null);
  assert.equal(reflected.result.result_code, 'LOCKED');

  const returnRpcCall = mockClient.calls.find(
    (call) => call.kind === 'rpc' && call.name === 'rpc_return_key_and_create_lock_task'
  );
  assert.deepEqual(returnRpcCall.args, {
    loan_id: 'loan-1',
    create_lock_task: true,
    optional_assignee: 'patrol-user-2',
  });
});
