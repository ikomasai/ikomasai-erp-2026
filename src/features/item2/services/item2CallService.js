/**
 * item2 呼び出しサービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import { ITEM2_CALL_STATUSES, ITEM2_CALL_TYPES } from '../constants';

/**
 * 配列値を uuid 配列へ正規化する
 * @param {Array<string>|null|undefined} value - 入力値
 * @returns {Array<string>} 正規化後の配列
 */
const normalizeUserIdArray = (value) => {
  const normalizedValue = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.length > 0)
    : [];

  return Array.from(new Set(normalizedValue));
};

/**
 * schema cache エラーから不足カラム名を抽出する
 * @param {unknown} error - エラー
 * @returns {string|null} 不足カラム名
 */
const extractMissingColumnName = (error) => {
  const errorMessage = error?.message ?? error?.details ?? '';
  if (typeof errorMessage !== 'string') {
    return null;
  }

  const matched = errorMessage.match(/Could not find the '([^']+)' column of 'item2_calls'/);
  return matched?.[1] ?? null;
};

/**
 * 呼び出し登録を実行する
 * @param {Object} payload - 登録内容
 * @returns {Promise<Object>} 登録結果
 */
const performInsertItem2Call = async (payload) => {
  const supabase = getSupabaseClient();
  return supabase
    .from('item2_calls')
    .insert(payload)
    .select('*')
    .single();
};

/**
 * 呼び出しデータを UI 向けに整形する
 * @param {Object} row - DB レコード
 * @returns {Object} 整形済みデータ
 */
const mapCallRow = (row) => {
  return {
    ...row,
    assigned_to: normalizeUserIdArray(row?.assigned_to),
    requester_roles: Array.isArray(row?.requester_roles) ? row.requester_roles : [],
  };
};

/**
 * 呼び出し一覧を取得する
 * @param {Object} options - 取得オプション
 * @param {boolean} options.emergencyOnly - 緊急のみ取得するか
 * @returns {Promise<Object>} 呼び出し一覧
 */
export const selectItem2Calls = async ({ emergencyOnly = false } = {}) => {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('item2_calls')
      .select('*')
      .order('created_at', { ascending: false });

    if (emergencyOnly) {
      query = query.eq('call_type', ITEM2_CALL_TYPES.EMERGENCY);
    }

    const { data, error } = await query;

    if (error) {
      return { calls: [], error };
    }

    const rawCalls = data ?? [];
    const requesterUserIds = Array.from(new Set(rawCalls.map((callItem) => callItem.requester_user_id).filter(Boolean)));
    let requesterRolesMap = new Map();

    if (requesterUserIds.length > 0) {
      const requesterRolesResult = await supabase
        .from('user_roles')
        .select(`
          user_id,
          roles (
            id,
            name,
            display_name
          )
        `)
        .in('user_id', requesterUserIds);

      if (requesterRolesResult.error) {
        return { calls: [], error: requesterRolesResult.error };
      }

      requesterRolesMap = (requesterRolesResult.data ?? []).reduce((roleMap, item) => {
        const userId = item?.user_id;
        const role = Array.isArray(item?.roles) ? item.roles[0] : item?.roles;

        if (!userId || !role?.id) {
          return roleMap;
        }

        const existingRoles = roleMap.get(userId) ?? [];
        if (existingRoles.some((existingRole) => existingRole.id === role.id)) {
          return roleMap;
        }

        roleMap.set(userId, [...existingRoles, role]);
        return roleMap;
      }, new Map());
    }

    const calls = rawCalls.map((callItem) => {
      return mapCallRow({
        ...callItem,
        requester_roles: requesterRolesMap.get(callItem.requester_user_id) ?? [],
      });
    });

    return { calls, error: null };
  } catch (error) {
    return { calls: [], error };
  }
};

/**
 * 呼び出しを作成する
 * @param {Object} payload - 登録内容
 * @returns {Promise<Object>} 作成結果
 */
export const insertItem2Call = async (payload) => {
  try {
    let insertPayload = { ...payload };
    let insertResult = await performInsertItem2Call(insertPayload);

    // マイグレーション未反映の環境でも最低限の呼び出し作成を継続する
    while (insertResult.error) {
      const missingColumnName = extractMissingColumnName(insertResult.error);
      if (!missingColumnName || !(missingColumnName in insertPayload)) {
        break;
      }

      const { [missingColumnName]: _, ...nextPayload } = insertPayload;
      insertPayload = nextPayload;
      insertResult = await performInsertItem2Call(insertPayload);
    }

    if (insertResult.error) {
      return { call: null, error: insertResult.error };
    }

    return { call: mapCallRow(insertResult.data), error: null };
  } catch (error) {
    return { call: null, error };
  }
};

/**
 * 現地対応者を更新する
 * @param {Object} params - 更新内容
 * @param {string} params.callId - 呼び出しID
 * @param {Array<string>} params.assignedTo - 対応者一覧
 * @param {string|null} params.actorId - 実行者ID
 * @returns {Promise<Object>} 更新結果
 */
export const updateItem2CallAssignees = async ({ callId, assignedTo, actorId = null }) => {
  try {
    const supabase = getSupabaseClient();
    const normalizedAssignedTo = normalizeUserIdArray(assignedTo);
    const { data: currentCall, error: currentCallError } = await supabase
      .from('item2_calls')
      .select('status')
      .eq('id', callId)
      .single();

    if (currentCallError) {
      return { call: null, error: currentCallError };
    }

    const updates = {
      assigned_to: normalizedAssignedTo,
      updated_at: new Date().toISOString(),
    };

    if (
      normalizedAssignedTo.length > 0
      && currentCall?.status === ITEM2_CALL_STATUSES.UNHANDLED
    ) {
      updates.status = ITEM2_CALL_STATUSES.IN_PROGRESS;
    }

    const { data, error } = await supabase
      .from('item2_calls')
      .update(updates)
      .eq('id', callId)
      .select('*')
      .single();

    if (error) {
      return { call: null, error };
    }

    if (actorId) {
      await supabase.from('item2_audit_logs').insert({
        event_type: 'call_assignees_updated',
        call_id: callId,
        actor_id: actorId,
        actor_name: '',
        old_value: {},
        new_value: { assigned_to: normalizedAssignedTo },
      });
    }

    return { call: mapCallRow(data), error: null };
  } catch (error) {
    return { call: null, error };
  }
};

/**
 * 呼び出しステータスを更新する
 * @param {Object} params - 更新内容
 * @param {string} params.callId - 呼び出しID
 * @param {string} params.status - ステータス
 * @param {string|null} params.resolvedBy - 解決者
 * @returns {Promise<Object>} 更新結果
 */
export const updateItem2CallStatus = async ({ callId, status, resolvedBy = null }) => {
  try {
    const supabase = getSupabaseClient();
    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === ITEM2_CALL_STATUSES.RESOLVED) {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = resolvedBy;
    }

    const { data, error } = await supabase
      .from('item2_calls')
      .update(updates)
      .eq('id', callId)
      .select('*')
      .single();

    if (error) {
      return { call: null, error };
    }

    return { call: mapCallRow(data), error: null };
  } catch (error) {
    return { call: null, error };
  }
};

/**
 * 厚生部ユーザー一覧を取得する
 * @returns {Promise<Object>} ユーザー一覧
 */
export const selectItem2StaffUsers = async () => {
  try {
    const supabase = getSupabaseClient();
    const targetRoleNames = ['厚生部', '管理者'];
    const targetRolesResult = await supabase
      .from('roles')
      .select('id, name, display_name')
      .or(
        targetRoleNames.flatMap((roleName) => {
          return [`name.eq.${roleName}`, `display_name.eq.${roleName}`];
        }).join(',')
      );

    if (targetRolesResult.error) {
      return { users: [], error: targetRolesResult.error };
    }

    const targetRoles = targetRolesResult.data ?? [];
    const targetRoleIds = targetRoles.map((role) => role.id);

    if (targetRoleIds.length === 0) {
      return { users: [], error: null };
    }

    const userRoleResult = await supabase
      .from('user_roles')
      .select('user_id, role_id')
      .in('role_id', targetRoleIds);

    if (userRoleResult.error) {
      return { users: [], error: userRoleResult.error };
    }

    const userIds = Array.from(new Set((userRoleResult.data ?? []).map((item) => item.user_id)));

    if (userIds.length === 0) {
      return { users: [], error: null };
    }

    const profileResult = await supabase
      .from('user_profiles')
      .select('user_id, name, organization')
      .in('user_id', userIds);

    if (profileResult.error) {
      return { users: [], error: profileResult.error };
    }

    const allRolesResult = await supabase
      .from('user_roles')
      .select(`
        user_id,
        roles (
          id,
          name,
          display_name
        )
      `)
      .in('user_id', userIds);

    if (allRolesResult.error) {
      return { users: [], error: allRolesResult.error };
    }

    const profileMap = new Map((profileResult.data ?? []).map((item) => [item.user_id, item]));
    const roleMap = new Map();

    (allRolesResult.data ?? []).forEach((item) => {
      const role = Array.isArray(item?.roles) ? item.roles[0] : item?.roles;
      if (!item?.user_id || !role?.id) {
        return;
      }

      const existingRoles = roleMap.get(item.user_id) ?? [];
      if (existingRoles.some((existingRole) => existingRole.id === role.id)) {
        return;
      }

      roleMap.set(item.user_id, [...existingRoles, role]);
    });

    const users = userIds.map((userId) => {
      return {
        id: userId,
        name: profileMap.get(userId)?.name ?? '名称未設定',
        organization: profileMap.get(userId)?.organization ?? '',
        roles: roleMap.get(userId) ?? [],
      };
    }).sort((left, right) => {
      return left.name.localeCompare(right.name, 'ja');
    });

    return { users, error: null };
  } catch (error) {
    return { users: [], error };
  }
};
