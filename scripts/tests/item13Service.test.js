const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const filePath = path.resolve(__dirname, '../../src/features/item13/services/item13Service.js');
const source = fs.readFileSync(filePath, 'utf8');

test('item13Service: dashboard summary and radio log queries exist', () => {
  assert.match(source, /selectHqDashboardSummary/);
  assert.match(source, /\.from\('support_tickets'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('ticket_status', 'new'\)/);
  assert.match(source, /\.from\('radio_logs'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)/);
});

test('item13Service: ticket list, thread, and update queries exist', () => {
  assert.match(source, /\.from\('support_tickets'\)\s*\.select\(/);
  assert.match(source, /\.from\('ticket_messages'\)\s*\.select\('id, ticket_id, author_id, body, is_internal, created_at'\)/);
  assert.match(source, /\.from\('ticket_messages'\)\s*\.insert\(payload\)/);
  assert.match(source, /\.from\('support_tickets'\)\s*\.update\(\{\s*notify_target:/);
});

test('item13Service: patrol task queries and result lookup exist', () => {
  assert.match(source, /\.from\('patrol_tasks'\)\s*\.select\(/);
  assert.match(source, /\.from\('patrol_task_results'\)\s*\.select\('id, task_id, result_code, memo, photo_bucket, photo_path, created_by, created_at'\)/);
  assert.match(source, /buildTaskUpdatePayload/);
});

test('item13Service: key return rpc supports lock task creation toggle', () => {
  assert.match(source, /returnKeyAndCreateLockTaskForHq = async \(\s*loanId,\s*createLockTask = true,\s*optionalAssignee = null\s*\)/);
  assert.match(source, /rpcReturnKeyAndCreateLockTask\(loanId, createLockTask, optionalAssignee\)/);
});

test('item13Service: pending evaluation query and decision update exist', () => {
  assert.match(source, /\.from\('evaluation_checks'\)\s*\.select\(/);
  assert.match(source, /\.eq\('evaluation_status', 'pending'\)/);
  assert.match(source, /buildEvaluationDecisionPayload/);
});
