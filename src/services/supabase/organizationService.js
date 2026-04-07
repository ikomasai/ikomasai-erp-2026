/**
 * 団体情報サービス
 * organizations テーブルは現在未使用のため、
 * 実際の団体データが格納されている roles テーブルから取得する
 */

import { getSupabaseClient } from './client.js';

/**
 * 全団体（ロール）一覧を取得（団体プルダウン用）
 * roles テーブルの display_name を団体名として使用する
 * @returns {Promise<{data: Array, error: Error|null}>}
 *   data: [{ id, name }]  ※ name は display_name の値
 */
export const selectAllOrganizations = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('roles')
      .select('id,display_name')
      .order('display_name');

    if (error) {
      console.error('全団体（ロール）一覧取得エラー:', error.message);
      return { data: [], error };
    }

    /** display_name を name に正規化してプルダウン共通形式に合わせる */
    const normalized = (data || []).map((row) => ({
      id: row.id,
      name: row.display_name || '',
    }));

    return { data: normalized, error: null };
  } catch (error) {
    console.error('全団体（ロール）一覧取得処理でエラーが発生:', error);
    return { data: [], error };
  }
};
