const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const builderPath = path.resolve(__dirname, '../../src/features/item15/utils/item15PayloadBuilder.js');
const item15PayloadBuilder = require(builderPath);

const {
  buildPropertyMessagePayload,
  buildPropertyStatusPayload,
} = item15PayloadBuilder;

test('item15PayloadBuilder: buildPropertyMessagePayload builds reply payload', () => {
  const payload = buildPropertyMessagePayload({
    ticketId: 'ticket-1',
    authorId: 'user-1',
    body: 'property answer',
    isInternal: false,
  });

  assert.equal(payload.ticket_id, 'ticket-1');
  assert.equal(payload.author_id, 'user-1');
  assert.equal(payload.body, 'property answer');
  assert.equal(payload.is_internal, false);
});

test('item15PayloadBuilder: buildPropertyMessagePayload validates required fields', () => {
  assert.throws(() => {
    buildPropertyMessagePayload({
      ticketId: '',
      authorId: 'user-1',
      body: 'x',
    });
  });

  assert.throws(() => {
    buildPropertyMessagePayload({
      ticketId: 'ticket-1',
      authorId: '',
      body: 'x',
    });
  });

  assert.throws(() => {
    buildPropertyMessagePayload({
      ticketId: 'ticket-1',
      authorId: 'user-1',
      body: '  ',
    });
  });
});

test('item15PayloadBuilder: buildPropertyStatusPayload validates status and sets updated_at', () => {
  const payload = buildPropertyStatusPayload({ ticketStatus: ' resolved ' });
  assert.equal(payload.ticket_status, 'resolved');
  assert.ok(!Number.isNaN(new Date(payload.updated_at).getTime()));

  assert.throws(() => {
    buildPropertyStatusPayload({ ticketStatus: 'invalid_status' });
  });
});
