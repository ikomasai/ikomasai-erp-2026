const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const SQL_PATH = path.resolve(__dirname, '../../docs/database/008_phase8_rpc.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf8');
const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();

test('フェーズ8RPC SQL: 必須RPC関数が定義されている', () => {
  const requiredFunctions = [
    'rpc_create_ticket_and_auto_tasks',
    'rpc_return_key_and_create_lock_task',
    'rpc_accept_task',
    'rpc_complete_task',
  ];

  requiredFunctions.forEach((functionName) => {
    assert.match(
      normalizedSql,
      new RegExp(`create or replace function public\\.${functionName}\\s*\\(`),
      `${functionName} の定義がありません`
    );
  });
});

test('フェーズ8RPC SQL: 採番シーケンスが定義されている', () => {
  assert.match(
    normalizedSql,
    /create sequence if not exists public\.support_ticket_no_seq/,
    'support_ticket_no_seq がありません'
  );
  assert.match(
    normalizedSql,
    /create sequence if not exists public\.patrol_task_no_seq/,
    'patrol_task_no_seq がありません'
  );
});

test('フェーズ8RPC SQL: 取り合い防止ロジックがある', () => {
  assert.match(
    normalizedSql,
    /update public\.patrol_tasks[\s\S]*where id = task_id[\s\S]*task_status = 'open'/,
    'open 状態のみ受諾する更新条件がありません'
  );
});

test('フェーズ8RPC SQL: 完了時に done_at と結果記録を行う', () => {
  assert.match(
    normalizedSql,
    /update public\.patrol_tasks[\s\S]*task_status = 'done'[\s\S]*done_at = coalesce\(done_at, now\(\)\)/,
    'done_at 更新処理がありません'
  );
  assert.match(
    normalizedSql,
    /insert into public\.patrol_task_results/,
    'patrol_task_results への記録処理がありません'
  );
});

test('フェーズ8RPC SQL: 通知系RPCは含まれない（今回スコープ外）', () => {
  assert.doesNotMatch(normalizedSql, /rpc_notify/, '通知系RPCが含まれています');
  assert.doesNotMatch(normalizedSql, /insert into public\.notifications/, 'notifications 連携が含まれています');
});
