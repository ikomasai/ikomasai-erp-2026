const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const filePath = path.resolve(__dirname, '../../src/features/item14/services/item14Service.js');
const source = fs.readFileSync(filePath, 'utf8');

test('item14Service: accounting inbox query is scoped to distribution_change + accounting', () => {
  assert.match(source, /\.from\('support_tickets'\)\s*\.select\(/);
  assert.match(source, /\.eq\('ticket_type', ACCOUNTING_TICKET_TYPE\)/);
  assert.match(source, /\.eq\('notify_target', ACCOUNTING_NOTIFY_TARGET\)/);
});

test('item14Service: inbox status buckets map unread/working/done', () => {
  assert.match(source, /mapBucketToStatus/);
  assert.match(source, /if \(normalizedBucket === 'unread'\)/);
  assert.match(source, /if \(normalizedBucket === 'working'\)/);
  assert.match(source, /if \(normalizedBucket === 'done'\)/);
});

test('item14Service: detail view loads messages and attachments', () => {
  assert.match(source, /\.from\('ticket_messages'\)\s*\.select\('id, ticket_id, author_id, body, is_internal, created_at'\)/);
  assert.match(source, /\.from\('ticket_attachments'\)\s*\.select\(/);
});

test('item14Service: reply/memo insert and status update exist', () => {
  assert.match(source, /\.from\('ticket_messages'\)\s*\.insert\(payload\)/);
  assert.match(source, /buildAccountingMessagePayload/);
  assert.match(source, /buildAccountingStatusPayload/);
  assert.match(source, /\.from\('support_tickets'\)\s*\.update\(payload\)/);
});

test('item14Service: completeAccountingTicket sets resolved', () => {
  assert.match(source, /completeAccountingTicket = async \(ticketId\)/);
  assert.match(source, /return updateAccountingTicketStatus\(ticketId, 'resolved'\)/);
});
