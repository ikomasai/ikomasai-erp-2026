/**
 * item2 呼び出しサービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import {
  ITEM2_CALL_STATUSES,
  ITEM2_CALL_TYPES,
  ITEM2_SYSTEM_MESSAGES,
} from '../constants';

/**
 * 配列値を uuid 配列へ正規化する
 * @param {Array<string>|null|undefined} value - 入力値
 * @returns {Array<string>} 正規化後の配列
 */
const normalizeUserIdArray = (value) => {
  /** 正規化済み配列 */
  const normalizedValue = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.length > 0)
    : [];

  return Array.from(new Set(normalizedValue));
};

/**
 * 呼び出しデータを UI 向けに整形する
 * @param {Object} row - DB レコード
 * @returns {Object} 整形済みデータ
 */
const mapCallRow = (row) => {
  /** チャットルーム情報 */
  const room = Array.isArray(row?.item2_chat_rooms) ? row.item2_chat_rooms[0] : row?.item2_chat_rooms;

  return {
    ...row,
    assigned_to: normalizeUserIdArray(row?.assigned_to),
    room: room
      ? {
          ...room,
          assigned_to: normalizeUserIdArray(room?.assigned_to),
        }
      : null,
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
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** クエリビルダー */
    let query = supabase
      .from('item2_calls')
      .select(`
        *,
        item2_chat_rooms (
          id,
          call_id,
          assigned_to,
          last_message_preview,
          last_message_at,
          created_at,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (emergencyOnly) {
      query = query.eq('call_type', ITEM2_CALL_TYPES.EMERGENCY);
    }

    /** クエリ結果 */
    const { data, error } = await query;

    if (error) {
      return { calls: [], error };
    }

    return { calls: (data ?? []).map(mapCallRow), error: null };
  } catch (error) {
    return { calls: [], error };
  }
};

/**
 * チャットルームを保証する
 * @param {string} callId - 呼び出しID
 * @returns {Promise<Object>} ルーム情報
 */
export const ensureItem2ChatRoom = async (callId) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 既存ルーム取得結果 */
    const existingResult = await supabase
      .from('item2_chat_rooms')
      .select('*')
      .eq('call_id', callId)
      .maybeSingle();

    if (existingResult.error) {
      return { room: null, error: existingResult.error };
    }

    if (existingResult.data) {
      return {
        room: {
          ...existingResult.data,
          assigned_to: normalizeUserIdArray(existingResult.data.assigned_to),
        },
        error: null,
      };
    }

    /** 新規作成結果 */
    const insertResult = await supabase
      .from('item2_chat_rooms')
      .insert({ call_id: callId, assigned_to: [] })
      .select('*')
      .single();

    if (insertResult.error) {
      return { room: null, error: insertResult.error };
    }

    return {
      room: {
        ...insertResult.data,
        assigned_to: normalizeUserIdArray(insertResult.data.assigned_to),
      },
      error: null,
    };
  } catch (error) {
    return { room: null, error };
  }
};

/**
 * 呼び出しを作成する
 * @param {Object} payload - 登録内容
 * @returns {Promise<Object>} 作成結果
 */
export const insertItem2Call = async (payload) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 呼び出し登録結果 */
    const insertResult = await supabase
      .from('item2_calls')
      .insert(payload)
      .select('*')
      .single();

    if (insertResult.error) {
      return { call: null, room: null, error: insertResult.error };
    }

    /** 作成された呼び出し */
    const createdCall = insertResult.data;
    /** ルーム作成結果 */
    const roomResult = await ensureItem2ChatRoom(createdCall.id);

    if (roomResult.error) {
      return { call: createdCall, room: null, error: roomResult.error };
    }

    if (payload.call_type === ITEM2_CALL_TYPES.NON_URGENT && payload.purpose === 'その他') {
      await supabase.from('item2_chat_rooms').update({
        last_message_preview: ITEM2_SYSTEM_MESSAGES.OTHER_PURPOSE,
        last_message_at: new Date().toISOString(),
      }).eq('id', roomResult.room.id);
    }

    return { call: mapCallRow({ ...createdCall, item2_chat_rooms: roomResult.room }), room: roomResult.room, error: null };
  } catch (error) {
    return { call: null, room: null, error };
  }
};

/**
 * チャット対応者を更新する
 * @param {string} roomId - ルームID
 * @param {Array<string>} assignedTo - 担当者一覧
 * @returns {Promise<Object>} 更新結果
 */
export const updateItem2ChatAssignees = async (roomId, assignedTo) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 正規化済み担当者一覧 */
    const normalizedAssignedTo = normalizeUserIdArray(assignedTo);
    /** 更新結果 */
    const { data, error } = await supabase
      .from('item2_chat_rooms')
      .update({ assigned_to: normalizedAssignedTo, updated_at: new Date().toISOString() })
      .eq('id', roomId)
      .select('*')
      .single();

    if (error) {
      return { room: null, error };
    }

    return { room: { ...data, assigned_to: normalizeUserIdArray(data.assigned_to) }, error: null };
  } catch (error) {
    return { room: null, error };
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
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 正規化済み対応者一覧 */
    const normalizedAssignedTo = normalizeUserIdArray(assignedTo);
    /** 更新オブジェクト */
    const updates = {
      assigned_to: normalizedAssignedTo,
      updated_at: new Date().toISOString(),
    };

    /** 更新結果 */
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

    return { call: { ...data, assigned_to: normalizeUserIdArray(data.assigned_to) }, error: null };
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
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 更新内容 */
    const updates = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === ITEM2_CALL_STATUSES.RESOLVED) {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = resolvedBy;
    }

    /** 更新結果 */
    const { data, error } = await supabase
      .from('item2_calls')
      .update(updates)
      .eq('id', callId)
      .select('*')
      .single();

    if (error) {
      return { call: null, error };
    }

    return { call: { ...data, assigned_to: normalizeUserIdArray(data.assigned_to) }, error: null };
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
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 対象ロール名 */
    const targetRoleNames = ['厚生部', '管理者'];
    /** 対象ロール取得結果 */
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

    /** 対象ロール一覧 */
    const targetRoles = targetRolesResult.data ?? [];
    /** 対象ロールID一覧 */
    const targetRoleIds = targetRoles.map((role) => role.id);

    if (targetRoleIds.length === 0) {
      return { users: [], error: null };
    }

    /** 厚生部所属ユーザー取得結果 */
    const userRoleResult = await supabase
      .from('user_roles')
      .select('user_id, role_id')
      .in('role_id', targetRoleIds);

    if (userRoleResult.error) {
      return { users: [], error: userRoleResult.error };
    }

    /** ユーザーID一覧 */
    const userIds = Array.from(new Set((userRoleResult.data ?? []).map((item) => item.user_id)));

    if (userIds.length === 0) {
      return { users: [], error: null };
    }

    /** プロフィール取得結果 */
    const profileResult = await supabase
      .from('user_profiles')
      .select('user_id, name, organization')
      .in('user_id', userIds);

    if (profileResult.error) {
      return { users: [], error: profileResult.error };
    }

    /** 全ロール取得結果 */
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

    /** プロフィールマップ */
    const profileMap = new Map((profileResult.data ?? []).map((item) => [item.user_id, item]));
    /** ユーザーロールマップ */
    const roleMap = new Map();

    (allRolesResult.data ?? []).forEach((item) => {
      /** ロール情報 */
      const role = Array.isArray(item?.roles) ? item.roles[0] : item?.roles;
      if (!item?.user_id || !role?.id) {
        return;
      }

      /** 既存ロール一覧 */
      const existingRoles = roleMap.get(item.user_id) ?? [];
      if (existingRoles.some((existingRole) => existingRole.id === role.id)) {
        return;
      }

      roleMap.set(item.user_id, [...existingRoles, role]);
    });

    /** ユーザー一覧 */
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
