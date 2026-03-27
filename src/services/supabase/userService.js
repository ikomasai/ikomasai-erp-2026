/**
 * ユーザー情報サービス
 * ユーザープロフィールと役職情報を取得します
 */

import { getSupabaseClient } from './client.js';

/**
 * ユーザーのプロフィール情報を取得
 * @param {String} userId - ユーザーID（auth.users.id）
 * @returns {Promise<Object>} プロフィール情報（profile, error）
 */
export const selectUserProfile = async (userId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('プロフィール取得エラー:', error.message);
      return { profile: null, error };
    }

    return { profile: data, error: null };
  } catch (error) {
    console.error('プロフィール取得処理でエラーが発生:', error);
    return { profile: null, error };
  }
};

/**
 * ユーザーの役職一覧を取得
 * @param {String} userId - ユーザーID（auth.users.id）
 * @returns {Promise<Object>} 役職一覧（roles, error）
 */
export const selectUserRoles = async (userId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_roles')
      .select(`
        *,
        roles (
          id,
          name,
          display_name,
          description,
          permissions
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('役職取得エラー:', error.message);
      return { roles: [], error };
    }

    // roles配列を整形（user_rolesのネストを解除）
    const roles = data.map((item) => item.roles);

    return { roles, error: null };
  } catch (error) {
    console.error('役職取得処理でエラーが発生:', error);
    return { roles: [], error };
  }
};

/**
 * ユーザーの完全な情報を取得（プロフィール + 役職）
 * @param {String} userId - ユーザーID（auth.users.id）
 * @returns {Promise<Object>} ユーザー情報（userInfo, error）
 */
export const selectUserInfo = async (userId) => {
  try {
    // プロフィールと役職を並行取得
    const [profileResult, rolesResult] = await Promise.all([
      selectUserProfile(userId),
      selectUserRoles(userId),
    ]);

    // エラーチェック
    if (profileResult.error) {
      return { userInfo: null, error: profileResult.error };
    }

    if (rolesResult.error) {
      return { userInfo: null, error: rolesResult.error };
    }

    // 統合した情報を返す
    const userInfo = {
      ...profileResult.profile,
      roles: rolesResult.roles,
    };

    return { userInfo, error: null };
  } catch (error) {
    console.error('ユーザー情報取得処理でエラーが発生:', error);
    return { userInfo: null, error };
  }
};

/**
 * プロフィール情報を更新
 * @param {String} userId - ユーザーID
 * @param {Object} updates - 更新内容
 * @returns {Promise<Object>} 更新結果（profile, error）
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('プロフィール更新エラー:', error.message);
      return { profile: null, error };
    }

    return { profile: data, error: null };
  } catch (error) {
    console.error('プロフィール更新処理でエラーが発生:', error);
    return { profile: null, error };
  }
};

/**
 * 全ユーザープロフィール一覧を取得（借受人プルダウン用）
 * user_profiles は RLS OFF のため認証済みユーザーなら全件取得可能
 * @returns {Promise<{data: Array, error: Error|null}>}
 *   data: [{ id, user_id, name, organization }]
 */
export const selectAllUserProfiles = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .select('id,user_id,name,organization')
      .order('name');

    if (error) {
      console.error('全ユーザープロフィール取得エラー:', error.message);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('全ユーザープロフィール取得処理でエラーが発生:', error);
    return { data: [], error };
  }
};

/**
 * 企画者サポートの企画情報をプロフィールへ保存
 * @param {String} userId - ユーザーID
 * @param {Object} input - 企画情報
 * @param {String|null|undefined} input.eventName - 企画名
 * @param {String|null|undefined} input.eventLocation - 企画場所
 * @returns {Promise<Object>} 更新結果（profile, error）
 */
export const updateExhibitorEventProfile = async (userId, { eventName, eventLocation }) => {
  const normalizedEventName = (eventName || '').trim() || null;
  const normalizedEventLocation = (eventLocation || '').trim() || null;

  return updateUserProfile(userId, {
    exhibitor_event_name: normalizedEventName,
    exhibitor_event_location: normalizedEventLocation,
  });
};
