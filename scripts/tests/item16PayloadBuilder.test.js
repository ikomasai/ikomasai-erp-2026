const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const builderPath = path.resolve(__dirname, '../../src/features/item16/utils/item16PayloadBuilder.js');
const item16PayloadBuilder = require(builderPath);

const {
  buildEventReportPayload,
  buildKeyReservationPayload,
  buildTicketPayload,
  resolveNotifyTarget,
} = item16PayloadBuilder;

test('item16PayloadBuilder: resolveNotifyTarget maps ticket types correctly', () => {
  assert.equal(resolveNotifyTarget('distribution_change'), 'accounting');
  assert.equal(resolveNotifyTarget('damage_report'), 'property');
  assert.equal(resolveNotifyTarget('rule_question'), 'none');
});

test('item16PayloadBuilder: buildTicketPayload builds RPC payload', () => {
  const payload = buildTicketPayload({
    ticketType: 'distribution_change',
    priority: 'high',
    title: 'Title',
    description: 'Description',
    eventId: 'event-1',
    locationId: 'location-1',
    orgId: 'org-1',
    createdBy: 'user-1',
  });

  assert.equal(payload.ticket_type, 'distribution_change');
  assert.equal(payload.priority, 'high');
  assert.equal(payload.notify_target, 'accounting');
  assert.equal(payload.event_id, 'event-1');
  assert.equal(payload.location_id, 'location-1');
  assert.equal(payload.org_id, 'org-1');
  assert.equal(payload.created_by, 'user-1');
});

test('item16PayloadBuilder: buildEventReportPayload creates start/end ticket payload', () => {
  const payload = buildEventReportPayload({
    reportType: 'start_report',
    eventId: 'event-1',
    eventName: 'Expo A',
    orgId: 'org-1',
    orgName: 'Exhibitor A',
    createdBy: 'user-1',
  });

  assert.equal(payload.ticket_type, 'start_report');
  assert.equal(payload.notify_target, 'none');
  assert.equal(payload.event_id, 'event-1');
  assert.equal(payload.org_id, 'org-1');
  assert.equal(payload.created_by, 'user-1');
  assert.match(payload.title, /Expo A/);
});

test('item16PayloadBuilder: buildKeyReservationPayload validates time range', () => {
  const payload = buildKeyReservationPayload({
    keyId: 'key-1',
    orgId: 'org-1',
    requestedBy: 'user-1',
    requestedStartAt: '2026-02-09T09:00',
    requestedEndAt: '2026-02-09T10:00',
    reason: 'prep',
  });

  assert.equal(payload.key_id, 'key-1');
  assert.equal(payload.org_id, 'org-1');
  assert.equal(payload.requested_by, 'user-1');
  assert.equal(payload.reservation_status, 'pending');
  assert.ok(payload.reservation_no.startsWith('R-'));
  assert.throws(() => {
    buildKeyReservationPayload({
      keyId: 'key-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      requestedStartAt: '2026-02-09T10:00',
      requestedEndAt: '2026-02-09T09:00',
    });
  });
});
