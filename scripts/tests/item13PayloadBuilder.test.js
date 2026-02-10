const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const builderPath = path.resolve(__dirname, '../../src/features/item13/utils/item13PayloadBuilder.js');
const item13PayloadBuilder = require(builderPath);

const {
  buildEvaluationDecisionPayload,
  buildTaskUpdatePayload,
  buildTicketAssignmentPayload,
  buildTicketStatusUpdatePayload,
} = item13PayloadBuilder;

test('item13PayloadBuilder: buildTicketStatusUpdatePayload normalizes and validates status', () => {
  const payload = buildTicketStatusUpdatePayload({ ticketStatus: ' In_Progress ' });
  assert.equal(payload.ticket_status, 'in_progress');
  assert.ok(!Number.isNaN(new Date(payload.updated_at).getTime()));

  assert.throws(() => {
    buildTicketStatusUpdatePayload({ ticketStatus: 'invalid' });
  });
});

test('item13PayloadBuilder: buildTicketAssignmentPayload supports clear and set', () => {
  const assignedPayload = buildTicketAssignmentPayload({ assigneeId: 'user-1' });
  assert.equal(assignedPayload.assigned_hq_user_id, 'user-1');
  assert.ok(!Number.isNaN(new Date(assignedPayload.updated_at).getTime()));

  const clearPayload = buildTicketAssignmentPayload({ assigneeId: '   ' });
  assert.equal(clearPayload.assigned_hq_user_id, null);
});

test('item13PayloadBuilder: buildTaskUpdatePayload handles done and notes', () => {
  const payload = buildTaskUpdatePayload({
    taskStatus: 'done',
    assignedTo: 'patrol-1',
    notes: 'checked',
  });

  assert.equal(payload.task_status, 'done');
  assert.equal(payload.assigned_to, 'patrol-1');
  assert.equal(payload.notes, 'checked');
  assert.ok(!Number.isNaN(new Date(payload.done_at).getTime()));
  assert.ok(!Number.isNaN(new Date(payload.updated_at).getTime()));

  assert.throws(() => {
    buildTaskUpdatePayload({ taskStatus: 'unknown' });
  });
});

test('item13PayloadBuilder: buildEvaluationDecisionPayload validates decision and reviewer', () => {
  const payload = buildEvaluationDecisionPayload({
    decision: 'approved',
    reviewedBy: 'hq-user-1',
    comment: 'looks good',
  });

  assert.equal(payload.evaluation_status, 'approved');
  assert.equal(payload.reviewed_by, 'hq-user-1');
  assert.equal(payload.comment, 'looks good');
  assert.ok(!Number.isNaN(new Date(payload.reviewed_at).getTime()));
  assert.ok(!Number.isNaN(new Date(payload.updated_at).getTime()));

  assert.throws(() => {
    buildEvaluationDecisionPayload({ decision: 'approved' });
  });
});
