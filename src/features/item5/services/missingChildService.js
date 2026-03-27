/**
 * 迷子情報サービス
 * Supabase との通信を担当するサービス層
 */

import { getSupabaseClient } from '../../../services/supabase/client';

/**
 * 迷子情報を新規登録する
 * @param {Object} childData - 迷子情報
 * @param {string} childData.name - 名前
 * @param {string} childData.age - 年齢
 * @param {string} childData.gender - 性別（male/female/other）
 * @param {string} childData.characteristics - 特徴
 * @param {string} childData.discovery_location - 発見場所
 * @param {string} childData.shelter_tent - 保護テント（west_gate/b_building/artificial_turf/unable_to_move）
 * @param {string|null} childData.pickup_location - 迎えに来て欲しい場所（移動不可時のみ）
 * @param {string} childData.discovered_at - 発見時刻（ISO文字列）
 * @param {string} childData.reported_by - 登録者のユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const insertMissingChild = async (childData) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('missing_children')
      .insert({
        name: childData.name,
        age: childData.age,
        gender: childData.gender,
        characteristics: childData.characteristics,
        discovery_location: childData.discovery_location,
        shelter_tent: childData.shelter_tent,
        pickup_location: childData.pickup_location || null,
        discovered_at: childData.discovered_at,
        reported_by: childData.reported_by,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 自分が登録した迷子情報を取得する
 * @param {string} userId - ユーザーID
 * @returns {Promise<{data: Array, error: Error|null}>} 迷子情報一覧
 */
export const selectMissingChildrenByUser = async (userId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('missing_children')
      .select('*')
      .eq('reported_by', userId)
      .order('discovered_at', { ascending: false });

    if (error) {
      return { data: [], error };
    }

    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
};

/**
 * 全迷子情報を取得する（管理ロール用）
 * missing_children を取得後、reported_by の UUID 一覧で user_profiles を別途取得し
 * クライアント側でマージする（直接 FK がないため PostgREST の embedded join が使えない）
 * @param {string|null} statusFilter - ステータスフィルタ（nullの場合は全件）
 * @returns {Promise<{data: Array, error: Error|null}>} 迷子情報一覧（reporter: { name } を付与済み）
 */
export const selectAllMissingChildren = async (statusFilter = null) => {
  try {
    /** Supabase クエリビルダー */
    let query = getSupabaseClient()
      .from('missing_children')
      .select('*')
      .order('discovered_at', { ascending: false });

    /* ステータスフィルタが指定されている場合は絞り込む */
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: children, error: childrenError } = await query;

    if (childrenError) {
      return { data: [], error: childrenError };
    }

    /** 取得した迷子情報（空の場合はそのまま返す） */
    const childrenData = children ?? [];
    if (childrenData.length === 0) {
      return { data: [], error: null };
    }

    /** 登録者 UUID の重複排除リスト */
    const reporterIds = [...new Set(childrenData.map((c) => c.reported_by))];

    /** 登録者プロフィールとロール情報を並行取得 */
    const [profilesResult, userRolesResult] = await Promise.all([
      getSupabaseClient()
        .from('user_profiles')
        .select('user_id, name')
        .in('user_id', reporterIds),
      getSupabaseClient()
        .from('user_roles')
        .select('user_id, roles(name)')
        .in('user_id', reporterIds),
    ]);

    if (profilesResult.error) {
      /* プロフィール取得失敗時は reporter なしで返す（致命的エラーにしない） */
      return { data: childrenData, error: null };
    }

    /** user_id をキーにした名前マップ */
    const profileMap = (profilesResult.data ?? []).reduce((acc, profile) => {
      acc[profile.user_id] = profile.name;
      return acc;
    }, {});

    /** user_id をキーにしたロール名リストマップ（RLS OFFのため取得失敗しても続行） */
    const roleMap = (userRolesResult.data ?? []).reduce((acc, ur) => {
      const roleName = ur.roles?.name;
      if (!roleName) return acc;
      if (!acc[ur.user_id]) {
        acc[ur.user_id] = [];
      }
      acc[ur.user_id].push(roleName);
      return acc;
    }, {});

    /** 迷子情報に reporter オブジェクト（名前・ロール）をマージして返す */
    const merged = childrenData.map((child) => ({
      ...child,
      reporter: {
        name: profileMap[child.reported_by] ?? null,
        roles: roleMap[child.reported_by] ?? [],
      },
    }));

    return { data: merged, error: null };
  } catch (error) {
    return { data: [], error };
  }
};

/**
 * 迷子情報のステータス・コメント・保護場所・名前を更新する（管理ロール用）
 * @param {string} id - 迷子情報ID
 * @param {string} status - 新しいステータス（変更なしの場合は現在値を渡す）
 * @param {string|null} adminComment - コメント（任意）
 * @param {string|null} shelterTent - 保護テント（変更する場合のみ）
 * @param {string|null} pickupLocation - 迎え場所（変更する場合のみ）
 * @param {string|null} name - 迷子の名前（管理ロールが登録する）
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const updateMissingChildStatus = async (id, status, adminComment = null, shelterTent = null, pickupLocation = null, name = null) => {
  try {
    /** 更新対象のフィールド */
    const updates = {
      status,
      admin_comment: adminComment,
      updated_at: new Date().toISOString(),
    };

    /* 名前の変更がある場合のみフィールドを追加 */
    if (name !== null) {
      updates.name = name.trim() || null;
    }

    /* 保護テントの変更がある場合のみフィールドを追加 */
    if (shelterTent !== null) {
      updates.shelter_tent = shelterTent;
      updates.pickup_location = pickupLocation;
    }

    const { data, error } = await getSupabaseClient()
      .from('missing_children')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 全迷子情報を削除する（実長のみ）
 * @returns {Promise<{data: null, error: Error|null}>} 削除結果
 */
export const deleteAllMissingChildren = async () => {
  try {
    /* 全件削除（RLSにより実長のみ実行可能） */
    const { error } = await getSupabaseClient()
      .from('missing_children')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      return { data: null, error };
    }

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 迷子情報の件数をステータス別に取得する（削除可否判定用）
 * @returns {Promise<{counts: Object, total: number, error: Error|null}>} ステータス別件数
 */
export const selectMissingChildrenStatusCounts = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('missing_children')
      .select('status');

    if (error) {
      return { counts: {}, total: 0, error };
    }

    /** ステータス別の件数を集計する */
    const counts = (data ?? []).reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    /** 全件数 */
    const total = data?.length ?? 0;

    return { counts, total, error: null };
  } catch (error) {
    return { counts: {}, total: 0, error };
  }
};
