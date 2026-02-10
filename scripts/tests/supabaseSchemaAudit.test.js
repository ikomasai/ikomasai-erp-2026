const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAuditMarkdown,
  extractRpcNames,
  getTableDefinition,
  parseEnvContent,
  validateTableDefinition,
} = require('../lib/supabaseSchemaAudit');

test('parseEnvContent: コメントと空行を除外して解析できる', () => {
  const parsed = parseEnvContent(`
# comment
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY="abc123"
EMPTY=
INVALID_LINE
`);

  assert.equal(parsed.EXPO_PUBLIC_SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'abc123');
  assert.equal(parsed.EMPTY, '');
  assert.equal(parsed.INVALID_LINE, undefined);
});

test('getTableDefinition: OpenAPI v2(v3)どちらの形式でも取得できる', () => {
  const openApiV2 = {
    definitions: {
      roles: { properties: { id: { format: 'uuid' } } },
    },
  };
  const openApiV3 = {
    components: {
      schemas: {
        roles: { properties: { id: { format: 'uuid' } } },
      },
    },
  };

  assert.deepEqual(getTableDefinition(openApiV2, 'roles'), { properties: { id: { format: 'uuid' } } });
  assert.deepEqual(getTableDefinition(openApiV3, 'roles'), { properties: { id: { format: 'uuid' } } });
  assert.equal(getTableDefinition(openApiV2, 'missing'), null);
});

test('validateTableDefinition: 必須項目が揃っていればPASS', () => {
  const definition = {
    required: ['id', 'name'],
    properties: {
      id: { format: 'uuid' },
      name: { format: 'text' },
      permissions: { format: 'jsonb' },
    },
  };
  const rule = {
    requiredColumns: ['id', 'name', 'permissions'],
    requiredNotNullColumns: ['id', 'name'],
    columnFormats: {
      permissions: 'jsonb',
    },
  };

  const result = validateTableDefinition(definition, rule);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.missingColumns, []);
  assert.deepEqual(result.missingNotNullColumns, []);
  assert.deepEqual(result.formatMismatches, []);
});

test('validateTableDefinition: 欠落項目がある場合FAIL', () => {
  const definition = {
    required: ['id'],
    properties: {
      id: { format: 'uuid' },
      permissions: { format: 'text' },
    },
  };
  const rule = {
    requiredColumns: ['id', 'name', 'permissions'],
    requiredNotNullColumns: ['id', 'name'],
    columnFormats: {
      permissions: 'jsonb',
    },
  };

  const result = validateTableDefinition(definition, rule);
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.missingColumns, ['name']);
  assert.deepEqual(result.missingNotNullColumns, ['name']);
  assert.deepEqual(result.formatMismatches, [
    { columnName: 'permissions', expected: 'jsonb', actual: 'text' },
  ]);
});

test('extractRpcNames: paths から RPC を抽出できる', () => {
  const names = extractRpcNames({
    paths: {
      '/rpc/rpc_accept_task': {},
      '/rpc/rpc_complete_task': {},
      '/roles': {},
    },
  });

  assert.deepEqual(names, ['rpc_accept_task', 'rpc_complete_task']);
});

test('buildAuditMarkdown: 必要なセクションを含む', () => {
  const markdown = buildAuditMarkdown({
    generatedAt: new Date('2026-02-09T00:00:00.000Z'),
    supabaseUrl: 'https://example.supabase.co',
    tableResults: [
      {
        table: 'roles',
        status: 'pass',
        missingColumns: [],
        missingNotNullColumns: [],
        formatMismatches: [],
      },
    ],
    joinResults: [
      {
        label: 'user_roles -> roles JOIN',
        status: 'pass',
        statusCode: 200,
        error: null,
      },
    ],
    anonVisibilityResults: [
      {
        table: 'roles',
        status: 'inconclusive',
        statusCode: 200,
        rowCount: 0,
        message: '匿名アクセスでは0件でした（RLS有効またはデータ未投入）。',
      },
    ],
    rpcNames: ['rpc_accept_task'],
  });

  assert.match(markdown, /# 現状スキーマ実査メモ/);
  assert.match(markdown, /\| roles \| PASS \| OK \|/);
  assert.match(markdown, /`rpc_accept_task`/);
  assert.match(markdown, /手動確認が必要な項目/);
});
