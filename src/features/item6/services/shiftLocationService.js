/**
 * 厚生部場所管理の Supabase アクセス層
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { getUserProfilesByIds } from '../../../shared/services/notificationService.js';
import { LOCATION_ACTION_TYPES } from '../constants.js';

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
      created_at: new Date().toISOString(),
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
        console.warn('厚生部場所管理: プロフィール取得に失敗しました', profileError);
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

export const insertKoseibuShiftLocation = async (payload) => {
  try {
    const supabase = getSupabaseClient();
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('koseibu_shift_locations')
      .insert({
        name: payload.name,
        latitude: payload.latitude,
        longitude: payload.longitude,
        description: payload.description ?? null,
        display_order: payload.displayOrder ?? 0,
        is_active: true,
        created_by: payload.createdBy,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    const { log, error: logError } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.create,
      operatedBy: payload.createdBy,
      memo: payload.description ?? null,
    });

    if (logError) {
      return { location: data, log: null, error: logError };
    }

    return { location: data, log, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

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
        ...(payload.displayOrder !== undefined ? { display_order: payload.displayOrder } : {}),
        ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId)
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    const { log, error: logError } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.update,
      operatedBy,
      memo: payload.description ?? null,
    });

    if (logError) {
      return { location: data, log: null, error: logError };
    }

    return { location: data, log, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

export const deleteKoseibuShiftLocation = async (locationId, operatedBy) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('koseibu_shift_locations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId)
      .select()
      .single();

    if (error) {
      return { location: null, log: null, error };
    }

    const { log, error: logError } = await insertShiftLocationLog({
      locationId: data.id,
      locationNameSnapshot: data.name,
      latitudeSnapshot: data.latitude,
      longitudeSnapshot: data.longitude,
      actionType: LOCATION_ACTION_TYPES.delete,
      operatedBy,
      memo: '場所マスタを論理削除',
    });

    if (logError) {
      return { location: data, log: null, error: logError };
    }

    return { location: data, log, error: null };
  } catch (error) {
    return { location: null, log: null, error };
  }
};

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

    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('koseibu_shift_current_locations')
      .upsert(
        {
          user_id: userId,
          location_id: location.id,
          location_name_snapshot: location.name,
          latitude_snapshot: location.latitude,
          longitude_snapshot: location.longitude,
          updated_by: operatedBy,
          updated_at: timestamp,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      return { currentLocation: null, log: null, error };
    }

    const { log, error: logError } = await insertShiftLocationLog({
      userId,
      locationId: location.id,
      locationNameSnapshot: location.name,
      latitudeSnapshot: location.latitude,
      longitudeSnapshot: location.longitude,
      actionType: LOCATION_ACTION_TYPES.selfRegister,
      operatedBy,
      memo: '現在地を登録',
    });

    if (logError) {
      return { currentLocation: data, log: null, error: logError };
    }

    return { currentLocation: data, log, error: null };
  } catch (error) {
    return { currentLocation: null, log: null, error };
  }
};
