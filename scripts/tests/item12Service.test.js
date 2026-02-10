const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const filePath = path.resolve(__dirname, '../../src/features/item12/services/item12Service.js');
const source = fs.readFileSync(filePath, 'utf8');

test('item12Service: patrol task list query exists', () => {
  assert.match(source, /\.from\('patrol_tasks'\)/);
  assert.match(source, /\.in\('task_status', ACTIVE_TASK_STATUS\)/);
  assert.match(source, /\.or\(`assigned_to\.is\.null,assigned_to\.eq\.\$\{userId\}`\)/);
});

test('item12Service: unvisited alerts query filters open tasks', () => {
  assert.match(source, /\.eq\('task_status', 'open'\)/);
  assert.match(source, /UNVISITED_FALLBACK_MINUTES/);
});

test('item12Service: accept/complete use workflow RPC service', () => {
  assert.match(source, /rpcAcceptTask/);
  assert.match(source, /rpcCompleteTask/);
});

test('item12Service: inserts patrol_checks and evaluation_checks', () => {
  assert.match(source, /\.from\('patrol_checks'\)\s*\.insert\(payload\)/);
  assert.match(source, /\.from\('evaluation_checks'\)\s*\.insert\(payload\)/);
});
