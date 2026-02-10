const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const filePath = path.resolve(__dirname, '../../src/features/item15/services/item15Service.js');
const source = fs.readFileSync(filePath, 'utf8');

test('item15Service: property inbox query is scoped to damage_report + property', () => {
  assert.match(source, /\.from\('support_tickets'\)\s*\.select\(/);
  assert.match(source, /\.eq\('ticket_type', PROPERTY_TICKET_TYPE\)/);
  assert.match(source, /\.eq\('notify_target', PROPERTY_NOTIFY_TARGET\)/);
});

test('item15Service: inbox status buckets map unread/working/done', () => {
  assert.match(source, /mapBucketToStatus/);
  assert.match(source, /if \(normalizedBucket === 'unread'\)/);
  assert.match(source, /if \(normalizedBucket === 'working'\)/);
  assert.match(source, /if \(normalizedBucket === 'done'\)/);
});

test('item15Service: detail view loads messages and attachments', () => {
  assert.match(source, /\.from\('ticket_messages'\)\s*\.select\('id, ticket_id, author_id, body, is_internal, created_at'\)/);
  assert.match(source, /\.from\('ticket_attachments'\)\s*\.select\(/);
});

test('item15Service: reply/memo insert and status update exist', () => {
  assert.match(source, /\.from\('ticket_messages'\)\s*\.insert\(payload\)/);
  assert.match(source, /buildPropertyMessagePayload/);
  assert.match(source, /buildPropertyStatusPayload/);
  assert.match(source, /\.from\('support_tickets'\)\s*\.update\(payload\)/);
});

test('item15Service: completePropertyTicket sets resolved', () => {
  assert.match(source, /completePropertyTicket = async \(ticketId\)/);
  assert.match(source, /return updatePropertyTicketStatus\(ticketId, 'resolved'\)/);
});
