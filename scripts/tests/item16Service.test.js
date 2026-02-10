const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const filePath = path.resolve(__dirname, '../../src/features/item16/services/item16Service.js');
const source = fs.readFileSync(filePath, 'utf8');

test('item16Service: exhibitor organization query exists', () => {
  assert.match(source, /\.from\('user_organizations'\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
});

test('item16Service: ticket list is scoped by org_id', () => {
  assert.match(source, /\.from\('support_tickets'\)/);
  assert.match(source, /\.eq\('org_id', organizationId\)/);
});

test('item16Service: message thread query and insert exist', () => {
  assert.match(source, /\.from\('ticket_messages'\)\s*\.select\('id, ticket_id, author_id, body, is_internal, created_at'\)/);
  assert.match(source, /\.from\('ticket_messages'\)\s*\.insert\(payload\)/);
});

test('item16Service: start/end report and ticket creation use phase8 RPC service', () => {
  assert.match(source, /rpcCreateTicketAndAutoTasks/);
});

test('item16Service: key reservation insert exists', () => {
  assert.match(source, /\.from\('key_reservations'\)\s*\.insert\(payload\)/);
});
