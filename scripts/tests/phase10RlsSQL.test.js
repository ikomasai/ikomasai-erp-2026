const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const SQL_PATH = path.resolve(__dirname, '../../docs/database/009_phase10_rls.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf8');
const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();

test('フェーズ10RLS SQL: ロール判定ヘルパー関数が定義されている', () => {
  const helperFunctions = [
    'fn_has_screen_access',
    'fn_user_belongs_to_org',
    'fn_is_hq',
    'fn_is_patrol',
    'fn_is_accounting',
    'fn_is_property',
    'fn_is_exhibitor',
  ];

  helperFunctions.forEach((functionName) => {
    assert.match(
      normalizedSql,
      new RegExp(`create or replace function public\\.${functionName}\\s*\\(`),
      `${functionName} の定義がありません`
    );
  });
});

test('フェーズ10RLS SQL: 新規テーブルのRLS有効化が含まれる', () => {
  const expectedTables = [
    'organizations',
    'user_organizations',
    'support_tickets',
    'ticket_messages',
    'ticket_attachments',
    'patrol_tasks',
    'key_reservations',
    'evaluation_checks',
  ];

  expectedTables.forEach((tableName) => {
    assert.match(
      normalizedSql,
      new RegExp(`alter table if exists public\\.${tableName} enable row level security`),
      `${tableName} のRLS有効化がありません`
    );
  });
});

test('フェーズ10RLS SQL: support_tickets のロール境界条件がある', () => {
  assert.match(
    normalizedSql,
    /create policy rls_select_support_tickets[\s\S]*fn_is_exhibitor\(\)[\s\S]*fn_user_belongs_to_org\(org_id\)/,
    'Exhibitor の org 境界条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_support_tickets[\s\S]*fn_is_accounting\(\)[\s\S]*notify_target = 'accounting'/,
    'Accounting の notify_target 条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_support_tickets[\s\S]*fn_is_property\(\)[\s\S]*notify_target = 'property'/,
    'Property の notify_target 条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_support_tickets[\s\S]*fn_is_patrol\(\)[\s\S]*assigned_to is null or pt\.assigned_to = auth\.uid\(\)/,
    'Patrol の未割当 + 自分担当条件がありません'
  );
});

test('フェーズ10RLS SQL: ticket_messages / ticket_attachments の参照境界がある', () => {
  assert.match(
    normalizedSql,
    /create policy rls_select_ticket_messages[\s\S]*st\.notify_target = 'accounting'/,
    'ticket_messages の accounting 境界条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_ticket_messages[\s\S]*st\.notify_target = 'property'/,
    'ticket_messages の property 境界条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_ticket_attachments[\s\S]*st\.notify_target = 'accounting'/,
    'ticket_attachments の accounting 境界条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_select_ticket_attachments[\s\S]*st\.notify_target = 'property'/,
    'ticket_attachments の property 境界条件がありません'
  );
});

test('フェーズ10RLS SQL: patrol_tasks の参照/更新境界がある', () => {
  assert.match(
    normalizedSql,
    /create policy rls_select_patrol_tasks[\s\S]*assigned_to is null or assigned_to = auth\.uid\(\)/,
    'patrol_tasks SELECT の境界条件がありません'
  );

  assert.match(
    normalizedSql,
    /create policy rls_update_patrol_tasks[\s\S]*assigned_to is null or assigned_to = auth\.uid\(\)/,
    'patrol_tasks UPDATE の境界条件がありません'
  );
});

test('フェーズ10RLS SQL: 既存3テーブルに影響せず通知テーブルも対象外', () => {
  assert.doesNotMatch(
    normalizedSql,
    /alter table public\.user_profiles/,
    'user_profiles 変更が含まれています'
  );
  assert.doesNotMatch(
    normalizedSql,
    /alter table public\.user_roles/,
    'user_roles 変更が含まれています'
  );
  assert.doesNotMatch(
    normalizedSql,
    /alter table public\.roles/,
    'roles 変更が含まれています'
  );

  assert.doesNotMatch(
    normalizedSql,
    /public\.notifications/,
    'notifications へのRLS変更が含まれています'
  );
});
