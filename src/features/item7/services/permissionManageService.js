/**
 * アクセス権限管理サービス
 * ロールごとの画面アクセス権限（permissions.screens）のCRUD操作を提供
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';

/** Supabaseクライアント */
const supabase = getSupabaseClient();

/**
 * 全ロールを取得する
 * @returns {Promise<{data: Array|null, error: Error|null}>} ロール一覧（id, name, display_name, permissions）
 */
export const selectAllRoles = async () => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, display_name, permissions')
      .order('name');

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('ロール一覧の取得に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * 単一ロールの permissions.screens を更新する
 * features 等の既存キーは維持し、screens のみ差し替える
 * @param {string} roleId - 対象ロールのID
 * @param {Array<string>} newScreens - 新しい screens 配列
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新後のロールオブジェクト
 */
export const updateRoleScreens = async (roleId, newScreens) => {
  try {
    /** 現在のロール情報を取得（既存permissionsの保全のため） */
    const { data: currentRole, error: fetchError } = await supabase
      .from('roles')
      .select('permissions')
      .eq('id', roleId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    /** 既存のpermissionsにscreensのみ差し替え */
    const updatedPermissions = {
      ...(currentRole.permissions || {}),
      screens: newScreens,
    };

    const { data, error } = await supabase
      .from('roles')
      .update({ permissions: updatedPermissions })
      .eq('id', roleId)
      .select('id, name, display_name, permissions')
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('ロール権限の更新に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * 複数ロールの permissions.screens を一括更新する
 * 項目別タブで複数ロールの権限を同時変更する際に使用
 * @param {Array<{roleId: string, newScreens: Array<string>}>} updates - 更新対象の配列
 * @returns {Promise<{results: Array<{roleId: string, success: boolean, error: Error|null}>, hasError: boolean}>}
 */
export const updateMultipleRoleScreens = async (updates) => {
  /** 各ロールの更新結果を格納 */
  const results = [];

  for (const { roleId, newScreens } of updates) {
    const { data, error } = await updateRoleScreens(roleId, newScreens);
    results.push({
      roleId,
      success: !error,
      data,
      error,
    });
  }

  /** エラーが1件でもあったかどうか */
  const hasError = results.some((r) => !r.success);

  return { results, hasError };
};
