const fs = require('node:fs');
const path = require('node:path');

/**
 * 既存3テーブルの期待スキーマ定義
 */
const REQUIRED_TABLE_RULES = {
  user_profiles: {
    requiredColumns: [
      'id',
      'user_id',
      'name',
      'organization',
      'theme_mode',
      'password_changed_at',
      'created_at',
      'updated_at',
    ],
    requiredNotNullColumns: ['id', 'user_id', 'name', 'theme_mode', 'created_at', 'updated_at'],
    columnFormats: {
      theme_mode: 'text',
    },
  },
  user_roles: {
    requiredColumns: ['id', 'user_id', 'role_id', 'created_at'],
    requiredNotNullColumns: ['id', 'user_id', 'role_id', 'created_at'],
  },
  roles: {
    requiredColumns: ['id', 'name', 'display_name', 'description', 'permissions', 'created_at', 'updated_at'],
    requiredNotNullColumns: ['id', 'name', 'display_name', 'created_at', 'updated_at'],
    columnFormats: {
      permissions: 'jsonb',
    },
  },
};

/**
 * user_roles -> roles JOIN の成立確認クエリ
 */
const JOIN_SMOKE_TESTS = [
  {
    id: 'user_roles_to_roles',
    label: 'user_roles -> roles JOIN',
    queryPath: '/rest/v1/user_roles?select=id,role_id,roles(id,name)&limit=1',
  },
];

/**
 * 匿名状態での読み取り確認（RLSの厳密判定は不可）
 */
const ANON_VISIBILITY_TESTS = [
  {
    table: 'user_profiles',
    queryPath: '/rest/v1/user_profiles?select=*&limit=1',
  },
  {
    table: 'user_roles',
    queryPath: '/rest/v1/user_roles?select=*&limit=1',
  },
  {
    table: 'roles',
    queryPath: '/rest/v1/roles?select=*&limit=1',
  },
];

/**
 * 環境変数形式の文字列をパース
 * @param {string} content - .envの内容
 * @returns {Object<string, string>} 解析結果
 */
const parseEnvContent = (content) => {
  const result = {};
  const lines = content.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const isQuotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    const value = isQuotedValue ? rawValue.slice(1, -1) : rawValue;
    result[key] = value;
  });

  return result;
};

/**
 * .envを読み込み process.env に反映
 * @param {string} envPath - .envのパス
 */
const loadEnvFile = (envPath) => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const parsed = parseEnvContent(fs.readFileSync(envPath, 'utf8'));
  Object.entries(parsed).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

/**
 * URL末尾のスラッシュを除去
 * @param {string} url - 変換前URL
 * @returns {string} 変換後URL
 */
const trimTrailingSlash = (url) => url.replace(/\/+$/, '');

/**
 * OpenAPI仕様を取得
 * @param {Object} params - 取得パラメータ
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {string} params.anonKey - Supabase anon key
 * @param {Function} params.fetchFn - fetch関数
 * @returns {Promise<Object>} OpenAPI仕様JSON
 */
const fetchOpenApiSpec = async ({ supabaseUrl, anonKey, fetchFn }) => {
  const endpoint = `${trimTrailingSlash(supabaseUrl)}/rest/v1/`;
  const response = await fetchFn(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/openapi+json',
    },
  });

  const responseText = await response.text();
  let parsedBody = null;
  try {
    parsedBody = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    parsedBody = null;
  }

  if (!response.ok) {
    const detail = parsedBody ? JSON.stringify(parsedBody) : responseText;
    throw new Error(`OpenAPIの取得に失敗しました: status=${response.status} body=${detail}`);
  }

  if (!parsedBody || typeof parsedBody !== 'object') {
    throw new Error('OpenAPIレスポンスのJSON解析に失敗しました');
  }

  return parsedBody;
};

/**
 * OpenAPI定義からテーブル定義群を取得（v2/v3両対応）
 * @param {Object} openApiSpec - OpenAPI仕様
 * @returns {Object<string, Object>} テーブル定義
 */
const getSchemaDefinitions = (openApiSpec) => {
  if (openApiSpec.definitions) {
    return openApiSpec.definitions;
  }

  if (openApiSpec.components && openApiSpec.components.schemas) {
    return openApiSpec.components.schemas;
  }

  return {};
};

/**
 * テーブル定義を取得
 * @param {Object} openApiSpec - OpenAPI仕様
 * @param {string} tableName - テーブル名
 * @returns {Object|null} テーブル定義
 */
const getTableDefinition = (openApiSpec, tableName) => {
  const definitions = getSchemaDefinitions(openApiSpec);
  return definitions[tableName] || null;
};

/**
 * テーブル定義を検証
 * @param {Object|null} definition - テーブル定義
 * @param {Object} rule - 期待ルール
 * @returns {Object} 検証結果
 */
const validateTableDefinition = (definition, rule) => {
  if (!definition) {
    return {
      status: 'fail',
      missingColumns: rule.requiredColumns,
      missingNotNullColumns: rule.requiredNotNullColumns || [],
      formatMismatches: [],
      availableColumns: [],
    };
  }

  const properties = definition.properties || {};
  const availableColumns = Object.keys(properties);
  const requiredColumns = Array.isArray(definition.required) ? definition.required : [];

  const missingColumns = (rule.requiredColumns || []).filter((columnName) => !availableColumns.includes(columnName));
  const missingNotNullColumns = (rule.requiredNotNullColumns || []).filter(
    (columnName) => !requiredColumns.includes(columnName)
  );

  const formatMismatches = Object.entries(rule.columnFormats || {}).reduce((accumulator, [columnName, expected]) => {
    const actual = properties[columnName] ? properties[columnName].format || properties[columnName].type || null : null;

    if (actual !== expected) {
      accumulator.push({ columnName, expected, actual });
    }

    return accumulator;
  }, []);

  const status = missingColumns.length > 0 || missingNotNullColumns.length > 0 || formatMismatches.length > 0 ? 'fail' : 'pass';

  return {
    status,
    missingColumns,
    missingNotNullColumns,
    formatMismatches,
    availableColumns,
  };
};

/**
 * API経由でGETクエリを実行
 * @param {Object} params - 実行パラメータ
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {string} params.anonKey - Supabase anon key
 * @param {string} params.queryPath - クエリパス
 * @param {Function} params.fetchFn - fetch関数
 * @returns {Promise<Object>} 実行結果
 */
const executeGetQuery = async ({ supabaseUrl, anonKey, queryPath, fetchFn }) => {
  const endpoint = `${trimTrailingSlash(supabaseUrl)}${queryPath}`;
  const response = await fetchFn(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });

  const responseText = await response.text();
  let parsedBody = null;
  try {
    parsedBody = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    statusCode: response.status,
    body: parsedBody,
    rawBody: responseText,
  };
};

/**
 * JOINスモークテストを実行
 * @param {Object} params - 実行パラメータ
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {string} params.anonKey - Supabase anon key
 * @param {Function} params.fetchFn - fetch関数
 * @returns {Promise<Array<Object>>} テスト結果
 */
const runJoinSmokeTests = async ({ supabaseUrl, anonKey, fetchFn }) => {
  const results = [];

  for (const testCase of JOIN_SMOKE_TESTS) {
    const result = await executeGetQuery({
      supabaseUrl,
      anonKey,
      queryPath: testCase.queryPath,
      fetchFn,
    });

    const status = result.ok ? 'pass' : 'fail';
    results.push({
      id: testCase.id,
      label: testCase.label,
      status,
      statusCode: result.statusCode,
      error: result.ok ? null : result.body || result.rawBody,
    });
  }

  return results;
};

/**
 * 匿名アクセス可視性を確認（RLSの厳密判定ではない）
 * @param {Object} params - 実行パラメータ
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {string} params.anonKey - Supabase anon key
 * @param {Function} params.fetchFn - fetch関数
 * @returns {Promise<Array<Object>>} テスト結果
 */
const runAnonVisibilityChecks = async ({ supabaseUrl, anonKey, fetchFn }) => {
  const results = [];

  for (const testCase of ANON_VISIBILITY_TESTS) {
    const result = await executeGetQuery({
      supabaseUrl,
      anonKey,
      queryPath: testCase.queryPath,
      fetchFn,
    });

    if (!result.ok) {
      results.push({
        table: testCase.table,
        status: 'fail',
        statusCode: result.statusCode,
        message: '匿名アクセス確認クエリに失敗しました',
        error: result.body || result.rawBody,
      });
      continue;
    }

    const rowCount = Array.isArray(result.body) ? result.body.length : 0;
    if (rowCount > 0) {
      results.push({
        table: testCase.table,
        status: 'warning',
        statusCode: result.statusCode,
        message: '匿名アクセスでデータが取得できました。RLS設定を確認してください。',
        rowCount,
      });
      continue;
    }

    results.push({
      table: testCase.table,
      status: 'inconclusive',
      statusCode: result.statusCode,
      message: '匿名アクセスでは0件でした（RLS有効またはデータ未投入）。',
      rowCount,
    });
  }

  return results;
};

/**
 * RPC名一覧を抽出
 * @param {Object} openApiSpec - OpenAPI仕様
 * @returns {Array<string>} RPC名一覧
 */
const extractRpcNames = (openApiSpec) => {
  const pathMap = openApiSpec.paths || {};
  return Object.keys(pathMap)
    .filter((pathName) => pathName.startsWith('/rpc/'))
    .map((pathName) => pathName.replace('/rpc/', ''))
    .sort();
};

/**
 * URLを表示用にマスク
 * @param {string} supabaseUrl - Supabase URL
 * @returns {string} 表示用URL
 */
const maskSupabaseUrl = (supabaseUrl) => {
  try {
    const parsed = new URL(supabaseUrl);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch (error) {
    return '(invalid-url)';
  }
};

/**
 * ステータス文字列を整形
 * @param {string} status - ステータス
 * @returns {string} 整形済み表示名
 */
const formatStatus = (status) => {
  const statusMap = {
    pass: 'PASS',
    fail: 'FAIL',
    warning: 'WARNING',
    inconclusive: 'INCONCLUSIVE',
    info: 'INFO',
  };
  return statusMap[status] || status.toUpperCase();
};

/**
 * 実査メモのMarkdownを生成
 * @param {Object} params - 生成データ
 * @param {Date} params.generatedAt - 生成時刻
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {Array<Object>} params.tableResults - テーブル検証結果
 * @param {Array<Object>} params.joinResults - JOIN検証結果
 * @param {Array<Object>} params.anonVisibilityResults - 匿名可視性検証結果
 * @param {Array<string>} params.rpcNames - RPC名一覧
 * @returns {string} Markdown本文
 */
const buildAuditMarkdown = ({
  generatedAt,
  supabaseUrl,
  tableResults,
  joinResults,
  anonVisibilityResults,
  rpcNames,
}) => {
  const generatedAtIso = generatedAt.toISOString();
  const tableRows = tableResults
    .map((tableResult) => {
      const issueTexts = [];

      if (tableResult.missingColumns.length > 0) {
        issueTexts.push(`missing columns: ${tableResult.missingColumns.join(', ')}`);
      }
      if (tableResult.missingNotNullColumns.length > 0) {
        issueTexts.push(`missing not-null: ${tableResult.missingNotNullColumns.join(', ')}`);
      }
      if (tableResult.formatMismatches.length > 0) {
        const mismatchText = tableResult.formatMismatches
          .map((mismatch) => `${mismatch.columnName} expected=${mismatch.expected} actual=${mismatch.actual}`)
          .join(' / ');
        issueTexts.push(`format mismatch: ${mismatchText}`);
      }

      const summary = issueTexts.length > 0 ? issueTexts.join(' | ') : 'OK';
      return `| ${tableResult.table} | ${formatStatus(tableResult.status)} | ${summary} |`;
    })
    .join('\n');

  const joinRows = joinResults
    .map((joinResult) => {
      const summary = joinResult.status === 'pass' ? 'OK' : JSON.stringify(joinResult.error);
      return `| ${joinResult.label} | ${formatStatus(joinResult.status)} | ${joinResult.statusCode} | ${summary} |`;
    })
    .join('\n');

  const anonRows = anonVisibilityResults
    .map((visibilityResult) => {
      const countText = typeof visibilityResult.rowCount === 'number' ? visibilityResult.rowCount : '-';
      return `| ${visibilityResult.table} | ${formatStatus(visibilityResult.status)} | ${visibilityResult.statusCode} | ${countText} | ${visibilityResult.message} |`;
    })
    .join('\n');

  const rpcSection =
    rpcNames.length > 0
      ? rpcNames.map((rpcName) => `- \`${rpcName}\``).join('\n')
      : '- 取得結果: 0件（公開RPCなし）';

  return `# 現状スキーマ実査メモ

実行日時: ${generatedAtIso}  
対象環境: ${maskSupabaseUrl(supabaseUrl)}

## 1. 既存3テーブル実査

| テーブル | 判定 | 詳細 |
| --- | --- | --- |
${tableRows}

## 2. user_roles -> roles JOIN 実査

| チェック | 判定 | HTTP | 詳細 |
| --- | --- | --- | --- |
${joinRows}

## 3. 匿名アクセス確認（RLS参考）

※ anon keyのみでの確認結果。RLSの最終判定には認証済みユーザーでの検証が必要。

| テーブル | 判定 | HTTP | 取得件数 | メモ |
| --- | --- | --- | --- | --- |
${anonRows}

## 4. RPC一覧（命名衝突確認用）

${rpcSection}

## 5. 手動確認が必要な項目

- user_profiles / user_roles / roles のRLSポリシー定義本文（auth.uid() 条件や authenticated 条件）
- 認証済みユーザーでの以下動作確認
  - 自分の user_profiles が SELECT/UPDATE/INSERT できる
  - 他人の user_profiles が参照できない
  - 自分の user_roles のみ参照できる
  - roles の SELECT 可否が仕様どおりである
`;
};

/**
 * 実査を実行して結果を返す
 * @param {Object} params - 実行パラメータ
 * @param {string} params.supabaseUrl - Supabase URL
 * @param {string} params.anonKey - Supabase anon key
 * @param {Function} params.fetchFn - fetch関数
 * @param {Date} params.generatedAt - 生成時刻
 * @returns {Promise<Object>} 実査結果
 */
const runSchemaAudit = async ({ supabaseUrl, anonKey, fetchFn, generatedAt }) => {
  const openApiSpec = await fetchOpenApiSpec({ supabaseUrl, anonKey, fetchFn });

  const tableResults = Object.entries(REQUIRED_TABLE_RULES).map(([table, rule]) => {
    const definition = getTableDefinition(openApiSpec, table);
    const validation = validateTableDefinition(definition, rule);
    return {
      table,
      ...validation,
    };
  });

  const joinResults = await runJoinSmokeTests({ supabaseUrl, anonKey, fetchFn });
  const anonVisibilityResults = await runAnonVisibilityChecks({ supabaseUrl, anonKey, fetchFn });
  const rpcNames = extractRpcNames(openApiSpec);

  const hasBlockingIssues =
    tableResults.some((result) => result.status === 'fail') || joinResults.some((result) => result.status === 'fail');

  return {
    openApiSpec,
    tableResults,
    joinResults,
    anonVisibilityResults,
    rpcNames,
    hasBlockingIssues,
    markdown: buildAuditMarkdown({
      generatedAt,
      supabaseUrl,
      tableResults,
      joinResults,
      anonVisibilityResults,
      rpcNames,
    }),
  };
};

/**
 * フェーズ5.1用の実査を実行してファイル出力
 * @param {Object} params - 実行パラメータ
 * @param {string} params.envPath - .envファイルパス
 * @param {string} params.outputPath - 出力先パス
 * @param {Function} params.fetchFn - fetch関数
 * @returns {Promise<Object>} 実査結果
 */
const runSupabaseSchemaAudit = async ({ envPath, outputPath, fetchFn = fetch }) => {
  if (envPath) {
    loadEnvFile(envPath);
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が見つかりません');
  }

  const generatedAt = new Date();
  const result = await runSchemaAudit({
    supabaseUrl,
    anonKey,
    fetchFn,
    generatedAt,
  });

  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, result.markdown, 'utf8');
  }

  return result;
};

module.exports = {
  ANON_VISIBILITY_TESTS,
  JOIN_SMOKE_TESTS,
  REQUIRED_TABLE_RULES,
  buildAuditMarkdown,
  extractRpcNames,
  getSchemaDefinitions,
  getTableDefinition,
  loadEnvFile,
  parseEnvContent,
  runSchemaAudit,
  runSupabaseSchemaAudit,
  trimTrailingSlash,
  validateTableDefinition,
};
