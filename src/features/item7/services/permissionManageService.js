/**
 * アクセス権限管理サービス
 * ロールごとの画面アクセス権限（permissions.screens）のCRUD操作
 * およびユーザーロール管理のCRUD操作を提供
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

/**
 * 新規ロールを作成する
 * @param {string} name - ロール名（内部識別名）
 * @param {string} displayName - 表示名
 * @param {Array<string>} initialScreens - 初期アクセス権限（permission名の配列）
 * @param {string|null} description - ロール説明（任意）
 * @returns {Promise<{data: Object|null, error: Error|null}>} 作成されたロールオブジェクト
 */
export const insertRole = async (name, displayName, initialScreens = [], description = null) => {
  try {
    /** 挿入データの組み立て */
    const insertData = {
      name,
      display_name: displayName,
      permissions: { screens: initialScreens },
    };
    /** descriptionが指定されている場合のみセット */
    if (description) {
      insertData.description = description;
    }

    const { data, error } = await supabase
      .from('roles')
      .insert(insertData)
      .select('id, name, display_name, permissions')
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('ロールの作成に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * 指定ロールを所持しているユーザー数を取得する
 * @param {string} roleId - 対象ロールのID
 * @returns {Promise<{count: number, error: Error|null}>}
 */
export const selectRoleUserCount = async (roleId) => {
  try {
    const { count, error } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId);

    if (error) {
      throw error;
    }

    return { count: count || 0, error: null };
  } catch (error) {
    console.error('ロール所持ユーザー数の取得に失敗しました:', error);
    return { count: 0, error };
  }
};

/**
 * ロールを削除する
 * 先に user_roles から該当ロールの紐付けを削除し、その後 roles から削除する
 * @param {string} roleId - 削除対象ロールのID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deleteRole = async (roleId) => {
  try {
    /** user_roles から該当ロールの紐付けを削除 */
    const { error: unlinkError } = await supabase
      .from('user_roles')
      .delete()
      .eq('role_id', roleId);

    if (unlinkError) {
      throw unlinkError;
    }

    /** roles から削除 */
    const { error: deleteError } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (deleteError) {
      throw deleteError;
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('ロールの削除に失敗しました:', error);
    return { success: false, error };
  }
};

// ==================== ユーザープロフィール取得 ====================

/**
 * 全ユーザープロフィールを取得する（基本情報のみ）
 * @returns {Promise<{data: Array<{user_id: string, name: string, organization: string}>|null, error: Error|null}>}
 */
export const selectAllUserProfilesBasic = async () => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, name, organization')
      .order('name');

    if (error) {
      throw error;
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('ユーザープロフィール一覧の取得に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * 何らかのロールを所持している全ユーザーのuser_idを取得する
 * @returns {Promise<{data: Array<string>|null, error: Error|null}>} user_idの配列
 */
export const selectAllUserIdsWithAnyRole = async () => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id');

    if (error) {
      throw error;
    }

    /** 重複を除いたuser_idの配列 */
    const uniqueIds = [...new Set((data || []).map((r) => r.user_id))];

    return { data: uniqueIds, error: null };
  } catch (error) {
    console.error('ロール所持ユーザーID一覧の取得に失敗しました:', error);
    return { data: null, error };
  }
};

// ==================== ユーザーロール管理 ====================

/**
 * 指定ロールを所持している全ユーザーを取得する
 * user_roles と user_profiles を結合して返す
 * @param {string} roleId - 対象ロールのID
 * @returns {Promise<{data: Array<{user_id: string, name: string, organization: string}>|null, error: Error|null}>}
 */
export const selectUsersByRoleId = async (roleId) => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, user_profiles!inner(user_id, name, organization)')
      .eq('role_id', roleId);

    if (error) {
      throw error;
    }

    /** user_profiles のネストを展開して平坦化 */
    const users = (data || []).map((row) => ({
      user_id: row.user_profiles.user_id,
      name: row.user_profiles.name || '(名前なし)',
      organization: row.user_profiles.organization || '',
    }));

    /** 名前順でソート */
    users.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return { data: users, error: null };
  } catch (error) {
    console.error('ロール所持ユーザーの取得に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * 指定ユーザーが所持している全ロールIDを取得する
 * @param {string} userId - 対象ユーザーのuser_id（auth.users.id）
 * @returns {Promise<{data: Array<string>|null, error: Error|null}>} ロールIDの配列
 */
export const selectRoleIdsByUserId = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    /** ロールIDの配列に変換 */
    const roleIds = (data || []).map((row) => row.role_id);

    return { data: roleIds, error: null };
  } catch (error) {
    console.error('ユーザーロールの取得に失敗しました:', error);
    return { data: null, error };
  }
};

/**
 * ユーザーのロール割り当てを一括更新する（差分をINSERT/DELETE）
 * @param {string} userId - 対象ユーザーのuser_id
 * @param {Array<string>} currentRoleIds - 現在DBにあるロールID配列
 * @param {Array<string>} newRoleIds - 更新後のロールID配列
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const updateUserRoles = async (userId, currentRoleIds, newRoleIds) => {
  try {
    /** 追加するロールID（新しく含まれるもの） */
    const toInsert = newRoleIds.filter((id) => !currentRoleIds.includes(id));
    /** 削除するロールID（元にあったが新しくは含まれないもの） */
    const toDelete = currentRoleIds.filter((id) => !newRoleIds.includes(id));

    /** 追加分をINSERT */
    if (toInsert.length > 0) {
      const insertRows = toInsert.map((roleId) => ({
        user_id: userId,
        role_id: roleId,
      }));
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert(insertRows);

      if (insertError) {
        throw insertError;
      }
    }

    /** 削除分をDELETE */
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .in('role_id', toDelete);

      if (deleteError) {
        throw deleteError;
      }
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('ユーザーロールの更新に失敗しました:', error);
    return { success: false, error };
  }
};

/**
 * 全ロールのユーザー数を一括取得する
 * user_roles テーブルから role_id ごとの件数を集計
 * @returns {Promise<{data: Object<string, number>|null, error: Error|null}>} roleId → ユーザー数のマップ
 */
export const selectAllRoleUserCounts = async () => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role_id');

    if (error) {
      throw error;
    }

    /** role_id ごとにカウントを集計 */
    const counts = {};
    (data || []).forEach((row) => {
      counts[row.role_id] = (counts[row.role_id] || 0) + 1;
    });

    return { data: counts, error: null };
  } catch (error) {
    console.error('ロールユーザー数の一括取得に失敗しました:', error);
    return { data: null, error };
  }
};
