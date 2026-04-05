/**
 * 厚生部場所管理の Supabase アクセス層
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { getUserProfilesByIds } from '../../../shared/services/notificationService.js';
import { LOCATION_ACTION_TYPES, MEMBER_STATUS } from '../constants.js';

const uniqueStrings = (values = []) => {
  return Array.from(
    new Set(
      (values || [])
        .filter((value) => typeof value === 'string' && value.trim() !== '')
        .map((value) => value.trim())
    )
  );
};

const buildProfileMap = (profiles = []) => {
  return new Map((profiles || []).map((profile) => [profile.user_id, profile.name || '（名前なし）']));
};

const enrichLocations = (locations = [], profileMap) => {
  return (locations || []).map((location) => ({
    ...location,
    created_by_name: location.created_by ? profileMap.get(location.created_by) || null : null,
  }));
};

const enrichCurrentLocations = (currentLocations = [], profileMap) => {
  return (currentLocations || []).map((record) => ({
    ...record,
    user_name: profileMap.get(record.user_id) || '（名前なし）',
    updated_by_name: record.updated_by ? profileMap.get(record.updated_by) || null : null,
  }));
};

const enrichLogs = (logs = [], profileMap) => {
  return (logs || []).map((record) => ({
    ...record,
    user_name: record.user_id ? profileMap.get(record.user_id) || null : null,
    operated_by_name: profileMap.get(record.operated_by) || '（名前なし）',
  }));
};

const insertShiftLocationLog = async ({
  userId = null,
  locationId = null,
  locationNameSnapshot,
  latitudeSnapshot = null,
  longitudeSnapshot = null,
  actionType,
  operatedBy,
  memo = null,
}) => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('koseibu_shift_location_logs')
    .insert({
      user_id: userId,
      location_id: locationId,
      location_name_snapshot: locationNameSnapshot,
      latitude_snapshot: latitudeSnapshot,
      longitude_snapshot: longitudeSnapshot,
      action_type: actionType,
      operated_by: operatedBy,
      memo,
    })
    .select()
    .single();

  return { log: data ?? null, error: error ?? null };
};

export const selectKoseibuShiftLocations = async ({ includeInactive = false } = {}) => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('koseibu_shift_locations')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      return { locations: [], error };
    }

    return { locations: data ?? [], error: null };
  } catch (error) {
    return { locations: [], error };
  }
};

export const selectKoseibuShiftCurrentLocations = async () => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_current_locations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      return { currentLocations: [], error };
    }

    return { currentLocations: data ?? [], error: null };
  } catch (error) {
    return { currentLocations: [], error };
  }
};

export const selectKoseibuShiftLocationLogs = async ({ limit = 200 } = {}) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_location_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { logs: [], error };
    }

    return { logs: data ?? [], error: null };
  } catch (error) {
    return { logs: [], error };
  }
};

export const selectKoseibuShiftOverview = async ({ includeLogs = true } = {}) => {
  try {
    const requests = [
      selectKoseibuShiftLocations({ includeInactive: true }),
      selectKoseibuShiftCurrentLocations(),
    ];

    if (includeLogs) {
      requests.push(selectKoseibuShiftLocationLogs({ limit: 200 }));
    }

    const [locationsResult, currentLocationsResult, logsResult] = await Promise.all(requests);

    if (locationsResult.error) {
      return {
        locations: [],
        currentLocations: [],
        logs: [],
        error: locationsResult.error,
      };
    }

    if (currentLocationsResult.error) {
      return {
        locations: [],
        currentLocations: [],
        logs: [],
        error: currentLocationsResult.error,
      };
    }

    if (includeLogs && logsResult.error) {
      return {
        locations: [],
        currentLocations: [],
        logs: [],
        error: logsResult.error,
      };
    }

    const profileIds = uniqueStrings([
      ...locationsResult.locations.map((location) => location.created_by),
      ...currentLocationsResult.currentLocations.flatMap((record) => [record.user_id, record.updated_by]),
      ...(includeLogs ? logsResult.logs.flatMap((record) => [record.user_id, record.operated_by]) : []),
    ]);

    let profileMap = new Map();
    if (profileIds.length > 0) {
      const { profiles, error: profileError } = await getUserProfilesByIds(profileIds);
      if (profileError) {
        /* プロフィール取得失敗は名前未表示になるが、操作には影響しない */
      } else {
        profileMap = buildProfileMap(profiles);
      }
    }

    return {
      locations: enrichLocations(locationsResult.locations, profileMap),
      currentLocations: enrichCurrentLocations(currentLocationsResult.currentLocations, profileMap),
      logs: includeLogs ? enrichLogs(logsResult.logs, profileMap) : [],
      error: null,
    };
  } catch (error) {
    return {
      locations: [],
      currentLocations: [],
      logs: [],
      error,
    };
  }
};

/**
 * 厚生部シフト場所を新規登録する
 * @param {Object} payload - 登録データ
 * @returns {Promise<{location: Object|null, log: Object|null, error: Object|null}>}
 */
export const insertKoseibuShiftLocation = async (payload) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_locations')
      .insert({
        name: payload.name,
        latitude: payload.latitude,
        longitude: payload.longitude,
        description: payload.description ?? null,
        display_member_count: payload.displayMemberCount ?? 3,
        display_order: payload.displayOrder ?? 0,
        is_active: true,
        created_by: payload.createdBy,
      })
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    const { log } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.create,
      operatedBy: payload.createdBy,
      memo: `場所「${data.name}」を新規登録`,
    });

    /* ログ書き込み失敗は警告に留め、操作自体は成功として返す */
    return { location: data, log: log ?? null, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

/**
 * 厚生部シフト場所を更新する
 * @param {string} locationId - 更新対象の場所ID
 * @param {Object} payload - 更新データ
 * @param {string} operatedBy - 操作者のユーザーID
 * @returns {Promise<{location: Object|null, log: Object|null, error: Object|null}>}
 */
export const updateKoseibuShiftLocation = async (locationId, payload, operatedBy) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_locations')
      .update({
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.latitude !== undefined ? { latitude: payload.latitude } : {}),
        ...(payload.longitude !== undefined ? { longitude: payload.longitude } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.displayMemberCount !== undefined ? { display_member_count: payload.displayMemberCount } : {}),
        ...(payload.displayOrder !== undefined ? { display_order: payload.displayOrder } : {}),
        ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
      })
      .eq('id', locationId)
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    /** 更新された項目を記録用メモに含める */
    const changedFields = Object.keys(payload).filter((key) => payload[key] !== undefined);
    const updateMemo = `更新項目: ${changedFields.join(', ')}`;

    const { log, error: logError } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.update,
      operatedBy,
      memo: updateMemo,
    });

    /* ログ書き込み失敗は警告に留め、操作自体は成功として返す */
    return { location: data, log: log ?? null, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

/**
 * 厚生部シフト場所を論理削除する（is_active = false）
 * 該当場所を現在地として登録しているレコードもクリアする
 * @param {string} locationId - 削除対象の場所ID
 * @param {string} operatedBy - 操作者のユーザーID
 * @returns {Promise<{location: Object|null, log: Object|null, error: Object|null}>}
 */
export const deleteKoseibuShiftLocation = async (locationId, operatedBy) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_locations')
      .update({ is_active: false })
      .eq('id', locationId)
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    /* 削除された場所を現在地として登録しているレコードをクリアする */
    await supabase
      .from('koseibu_shift_current_locations')
      .delete()
      .eq('location_id', locationId);

    const { log } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.delete,
      operatedBy,
      memo: '場所情報を論理削除',
    });

    /* ログ書き込み失敗は警告に留め、操作自体は成功として返す */
    return { location: data, log: log ?? null, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

/**
 * 厚生部員の現在地を登録する（upsert方式）
 * @param {string} userId - 対象ユーザーID
 * @param {string} locationId - 登録する場所ID
 * @param {string} operatedBy - 操作者のユーザーID
 * @returns {Promise<{currentLocation: Object|null, log: Object|null, error: Object|null}>}
 */
export const registerKoseibuShiftCurrentLocation = async (userId, locationId, operatedBy) => {
  try {
    const supabase = getSupabaseClient();
    const { data: location, error: locationError } = await supabase
      .from('koseibu_shift_locations')
      .select('*')
      .eq('id', locationId)
      .eq('is_active', true)
      .single();

    if (locationError) {
      return { currentLocation: null, log: null, error: locationError };
    }

    const { data, error } = await supabase
      .from('koseibu_shift_current_locations')
      .upsert(
        {
          user_id: userId,
          status: 'stationed',
          location_id: location.id,
          location_name_snapshot: location.name,
          latitude_snapshot: location.latitude,
          longitude_snapshot: location.longitude,
          updated_by: operatedBy,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      return { currentLocation: null, log: null, error };
    }

    const { log } = await insertShiftLocationLog({
      userId,
      locationId: location.id,
      locationNameSnapshot: location.name,
      latitudeSnapshot: location.latitude,
      longitudeSnapshot: location.longitude,
      actionType: LOCATION_ACTION_TYPES.selfRegister,
      operatedBy,
      memo: `現在地を「${location.name}」に登録`,
    });

    /* ログ書き込み失敗は警告に留め、操作自体は成功として返す */
    return { currentLocation: data, log: log ?? null, error: null };
  } catch (error) {
    return { currentLocation: null, log: null, error };
  }
};

/**
 * 厚生部員のステータスを変更する
 * - stationed（配置中）: 場所IDが必須。現在地として登録する
 * - patrolling（巡回中）: 場所IDは不要。巡回中として記録する
 * - away（離席中）: 場所IDは不要。離席中として記録する
 *
 * @param {string} userId - 対象ユーザーID
 * @param {string} status - ステータス ('stationed' | 'patrolling' | 'away')
 * @param {string|null} locationId - 場所ID（stationedの場合のみ必須）
 * @param {string} operatedBy - 操作者のユーザーID
 * @returns {Promise<{currentLocation: Object|null, log: Object|null, error: Object|null}>}
 */
export const updateKoseibuShiftMemberStatus = async (userId, status, locationId, operatedBy) => {
  try {
    const supabase = getSupabaseClient();

    /** 配置中の場合は場所情報を取得して検証する */
    let location = null;
    if (status === MEMBER_STATUS.stationed) {
      if (!locationId) {
        return { currentLocation: null, log: null, error: { message: '配置中は場所を選択してください' } };
      }
      const { data: locationData, error: locationError } = await supabase
        .from('koseibu_shift_locations')
        .select('*')
        .eq('id', locationId)
        .eq('is_active', true)
        .single();

      if (locationError) {
        return { currentLocation: null, log: null, error: locationError };
      }
      location = locationData;
    }

    /** upsert用のデータを構築（巡回中・離席中は場所情報をNULLにする） */
    const upsertData = {
      user_id: userId,
      status,
      location_id: location?.id ?? null,
      location_name_snapshot: location?.name ?? null,
      latitude_snapshot: location?.latitude ?? null,
      longitude_snapshot: location?.longitude ?? null,
      updated_by: operatedBy,
    };

    const { data, error } = await supabase
      .from('koseibu_shift_current_locations')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      return { currentLocation: null, log: null, error };
    }

    /** ステータスに応じたログメモを生成する */
    const statusLabels = { stationed: '配置中', patrolling: '巡回中', away: '離席中' };
    const statusLabel = statusLabels[status] || status;
    const memo = location
      ? `ステータスを「${statusLabel}」に変更（場所: ${location.name}）`
      : `ステータスを「${statusLabel}」に変更`;

    const { log } = await insertShiftLocationLog({
      userId,
      locationId: location?.id ?? null,
      locationNameSnapshot: location?.name ?? statusLabel,
      latitudeSnapshot: location?.latitude ?? null,
      longitudeSnapshot: location?.longitude ?? null,
      actionType: LOCATION_ACTION_TYPES.statusChange,
      operatedBy,
      memo,
    });

    /* ログ書き込み失敗は警告に留め、操作自体は成功として返す */
    return { currentLocation: data, log: log ?? null, error: null };
  } catch (error) {
    return { currentLocation: null, log: null, error };
  }
};
