#!/usr/bin/env node
const path = require('node:path');
const { runSupabaseSchemaAudit } = require('./lib/supabaseSchemaAudit');

/**
 * コマンドライン引数から出力先を取得
 * @param {Array<string>} argv - process.argv
 * @returns {string} 出力先パス
 */
const resolveOutputPath = (argv) => {
  const outputOption = argv.find((arg) => arg.startsWith('--output='));
  if (!outputOption) {
    return 'docs/database/001_schema_audit_memo.md';
  }
  return outputOption.replace('--output=', '').trim();
};

/**
 * 実行エントリーポイント
 */
const main = async () => {
  const outputPath = resolveOutputPath(process.argv.slice(2));
  const envPath = path.resolve('.env');

  try {
    const result = await runSupabaseSchemaAudit({
      envPath,
      outputPath,
    });

    console.log(`[schema-audit] 実査メモを出力しました: ${path.resolve(outputPath)}`);
    result.tableResults.forEach((tableResult) => {
      console.log(`[schema-audit] table ${tableResult.table}: ${tableResult.status.toUpperCase()}`);
    });
    result.joinResults.forEach((joinResult) => {
      console.log(`[schema-audit] join ${joinResult.label}: ${joinResult.status.toUpperCase()}`);
    });
    console.log(`[schema-audit] rpc count: ${result.rpcNames.length}`);

    if (result.hasBlockingIssues) {
      console.error('[schema-audit] ブロッカー検知: スキーマ不整合またはJOINエラーがあります');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('[schema-audit] 実行に失敗しました');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

main();
