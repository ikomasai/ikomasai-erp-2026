const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const builderPath = path.resolve(__dirname, '../../src/features/item14/utils/item14PayloadBuilder.js');
const item14PayloadBuilder = require(builderPath);

const {
  buildAccountingMessagePayload,
  buildAccountingStatusPayload,
} = item14PayloadBuilder;

test('item14PayloadBuilder: buildAccountingMessagePayload builds reply payload', () => {
  const payload = buildAccountingMessagePayload({
    ticketId: 'ticket-1',
    authorId: 'user-1',
    body: 'answer text',
    isInternal: false,
  });

  assert.equal(payload.ticket_id, 'ticket-1');
  assert.equal(payload.author_id, 'user-1');
  assert.equal(payload.body, 'answer text');
  assert.equal(payload.is_internal, false);
});

test('item14PayloadBuilder: buildAccountingMessagePayload validates required fields', () => {
  assert.throws(() => {
    buildAccountingMessagePayload({
      ticketId: '',
      authorId: 'user-1',
      body: 'x',
    });
  });

  assert.throws(() => {
    buildAccountingMessagePayload({
      ticketId: 'ticket-1',
      authorId: '',
      body: 'x',
    });
  });

  assert.throws(() => {
    buildAccountingMessagePayload({
      ticketId: 'ticket-1',
      authorId: 'user-1',
      body: '  ',
    });
  });
});

test('item14PayloadBuilder: buildAccountingStatusPayload validates status and sets updated_at', () => {
  const payload = buildAccountingStatusPayload({ ticketStatus: ' resolved ' });
  assert.equal(payload.ticket_status, 'resolved');
  assert.ok(!Number.isNaN(new Date(payload.updated_at).getTime()));

  assert.throws(() => {
    buildAccountingStatusPayload({ ticketStatus: 'invalid_status' });
  });
});
