const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const SQL_PATH = path.resolve(__dirname, '../../docs/database/006_phase7_domain_tables_ddl.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf8');

const normalize = (value) => value.replace(/\s+/g, ' ').toLowerCase();
const normalizedSql = normalize(sql);

test('フェーズ7DDL: 必須テーブルが定義されている', () => {
  const requiredTables = [
    'organizations',
    'user_organizations',
    'locations',
    'event_organizations',
    'support_tickets',
    'ticket_messages',
    'ticket_attachments',
    'keys',
    'key_reservations',
    'key_loans',
    'patrol_tasks',
    'patrol_task_results',
    'patrol_checks',
    'evaluation_checks',
    'radio_logs',
  ];

  requiredTables.forEach((tableName) => {
    assert.match(
      normalizedSql,
      new RegExp(`create table if not exists public\\.${tableName}\\s*\\(`),
      `${tableName} が CREATE TABLE IF NOT EXISTS で定義されていません`
    );
  });
});

test('フェーズ7DDL: created_by / assigned_to の auth.users 参照が含まれる', () => {
  assert.match(
    normalizedSql,
    /support_tickets[\s\S]*created_by uuid not null references auth\.users\(id\)/,
    'support_tickets.created_by の auth.users 参照がありません'
  );

  assert.match(
    normalizedSql,
    /patrol_tasks[\s\S]*assigned_to uuid references auth\.users\(id\)/,
    'patrol_tasks.assigned_to の auth.users 参照がありません'
  );
});

test('フェーズ7DDL: 番号系の UNIQUE 制約がある', () => {
  const uniqueColumns = ['ticket_no', 'task_no', 'reservation_no', 'loan_no'];
  uniqueColumns.forEach((columnName) => {
    assert.match(
      normalizedSql,
      new RegExp(`${columnName} text not null unique`),
      `${columnName} の UNIQUE 制約がありません`
    );
  });
});

test('フェーズ7DDL: 主要検索列のインデックスが定義されている', () => {
  const expectedIndexes = [
    'idx_support_tickets_ticket_status',
    'idx_support_tickets_created_at',
    'idx_ticket_messages_ticket_id_created_at',
    'idx_key_loans_key_id_status',
    'idx_patrol_tasks_assigned_to_task_status',
    'idx_radio_logs_severity_logged_at',
  ];

  expectedIndexes.forEach((indexName) => {
    assert.match(
      normalizedSql,
      new RegExp(`create index if not exists ${indexName}`),
      `${indexName} が定義されていません`
    );
  });
});

test('フェーズ7DDL: 既存3テーブルに破壊的変更をしていない', () => {
  assert.doesNotMatch(normalizedSql, /drop table/, 'DROP TABLE が含まれています');
  assert.doesNotMatch(normalizedSql, /alter table public\.user_profiles/, 'user_profiles 変更が含まれています');
  assert.doesNotMatch(normalizedSql, /alter table public\.user_roles/, 'user_roles 変更が含まれています');
  assert.doesNotMatch(normalizedSql, /alter table public\.roles/, 'roles 変更が含まれています');
});

test('フェーズ7DDL: 通知テーブルへの変更は含まれない（今回スコープ外）', () => {
  assert.doesNotMatch(normalizedSql, /create table if not exists public\.notifications/, 'notifications 作成が含まれています');
  assert.doesNotMatch(normalizedSql, /alter table public\.notifications/, 'notifications 変更が含まれています');
});
