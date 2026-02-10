const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const FILE_PATH = path.resolve(__dirname, '../../src/services/supabase/workflowRpcService.js');
const source = fs.readFileSync(FILE_PATH, 'utf8');

test('workflowRpcService: 4つのRPC呼び出しが実装されている', () => {
  const expectedRpcNames = [
    'rpc_create_ticket_and_auto_tasks',
    'rpc_return_key_and_create_lock_task',
    'rpc_accept_task',
    'rpc_complete_task',
  ];

  expectedRpcNames.forEach((rpcName) => {
    assert.match(source, new RegExp(`\\.rpc\\('${rpcName}'`), `${rpcName} の呼び出しがありません`);
  });
});

test('workflowRpcService: 通知系RPC呼び出しは含まれない', () => {
  assert.doesNotMatch(source, /\.rpc\('rpc_notify'/, '通知系RPC呼び出しが含まれています');
});
