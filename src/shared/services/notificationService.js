/**
 * 通知サービス
 * 通知の作成・送信・取得・既読処理を提供します
 */

import { getSupabaseClient } from '../../services/supabase/client.js';

const notificationEventTarget = new EventTarget();

export const subscribeNotificationUpdates = (handler) => {
  notificationEventTarget.addEventListener('change', handler);
  return () => notificationEventTarget.removeEventListener('change', handler);
};

export const emitNotificationUpdate = () => {
  notificationEventTarget.dispatchEvent(new Event('change'));
};

/**
 * 現在有効なアクセストークンを取得する
 *
 * getSession() のみを使用し、手動 refreshSession() は一切呼ばない。
 * refreshSession() を手動で呼ぶと autoRefreshToken との競合でリフレッシュトークンが
 * 使用済みになり、Supabase JS クライアントが 400 を受けた際に内部でサインアウトを
 * 発火させる (_removeSession → SIGNED_OUT) ため使用しない。
 *
 * @returns {Promise<string|null>}
 */
const getValidAccessToken = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }
  return data?.session?.access_token ?? null;
};

/**
 * Edge Functionエラーが401かどうか
 * @param {unknown} error
 * @returns {boolean}
 */
const isUnauthorizedFunctionError = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = /** @type {{ context?: { status?: number }; status?: number; message?: string }} */ (error);
  const status = maybeError.context?.status ?? maybeError.status;
  if (status === 401) {
    return true;
  }

  const message = (maybeError.message ?? '').toLowerCase();
  return message.includes('401') || message.includes('unauthorized');
};

/**
 * Edge Functionエラーを読みやすいエラーへ整形
 * @param {unknown} error
 * @param {string} fallbackMessage
 * @returns {Promise<Error>}
 */
const normalizeFunctionError = async (error, fallbackMessage) => {
  if (error && typeof error === 'object') {
    const maybeError = /** @type {{ context?: { json?: Function }; message?: string }} */ (error);
    const responseContext = maybeError.context;

    if (responseContext && typeof responseContext.json === 'function') {
      const payload = await responseContext.json().catch(() => null);
      if (payload && typeof payload.error === 'string' && payload.error.trim() !== '') {
        return new Error(payload.error);
      }
    }

    if (typeof maybeError.message === 'string' && maybeError.message.trim() !== '') {
      return new Error(maybeError.message);
    }
  }

  return new Error(fallbackMessage);
};

/**
 * ロール一覧を取得
 * @returns {Promise<Object>} roles, error
 */
export const getRoles = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('roles')
      .select('id, name, display_name')
      .order('display_name', { ascending: true });

    if (error) {
      return { roles: [], error };
    }

    return { roles: data ?? [], error: null };
  } catch (error) {
    return { roles: [], error };
  }
};

/**
 * 指定ロールのユーザー一覧を取得
 * @param {string} roleId
 * @returns {Promise<Object>} users, error
 */
export const getUsersByRole = async (roleId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_roles')
      .select('user_id')
      .eq('role_id', roleId);

    if (error) {
      return { users: [], error };
    }

    const users = (data ?? []).map((item) => item.user_id);
    return { users, error: null };
  } catch (error) {
    return { users: [], error };
  }
};

/**
 * 複数ロールのユーザー一覧を取得（重複除外）
 * @param {string[]} roleIds
 * @returns {Promise<Object>} users, error
 */
export const getUsersByRoles = async (roleIds) => {
  try {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return { users: [], error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from('user_roles')
      .select('user_id')
      .in('role_id', roleIds);

    if (error) {
      return { users: [], error };
    }

    const userSet = new Set((data ?? []).map((item) => item.user_id));
    return { users: Array.from(userSet), error: null };
  } catch (error) {
    return { users: [], error };
  }
};

/**
 * ユーザーID一覧からプロフィールを取得
 * @param {string[]} userIds
 * @returns {Promise<Object>} profiles, error
 */
export const getUserProfilesByIds = async (userIds) => {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { profiles: [], error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .select('user_id, name, organization')
      .in('user_id', userIds);

    if (error) {
      return { profiles: [], error };
    }

    return { profiles: data ?? [], error: null };
  } catch (error) {
    return { profiles: [], error };
  }
};

/**
 * Edge Functionで通知を送信する
 * @param {Object} payload - 送信リクエスト
 * @returns {Promise<Object>} data, error
 */
const dispatchNotification = async (payload) => {
  try {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return { data: null, error: new Error('ログインセッションが見つかりません。再ログインしてください。') };
    }

    const invokeDispatch = async (token) =>
      getSupabaseClient().functions.invoke('dispatch-notification', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

    let { data, error } = await invokeDispatch(accessToken);

    if (error && isUnauthorizedFunctionError(error)) {
      // アクセストークンが期限切れの場合、autoRefreshToken の完了を待ってから再試行する。
      // refreshSession() を手動で呼ぶとリフレッシュトークンのローテーション競合が発生して
      // ユーザーがサインアウトされるため、待機後に getSession() で最新トークンを取得する。
      await new Promise((resolve) => setTimeout(resolve, 600));
      const newToken = await getValidAccessToken();
      if (newToken) {
        ({ data, error } = await invokeDispatch(newToken));
      }
    }

    if (error) {
      return {
        data: null,
        error: await normalizeFunctionError(error, '通知送信に失敗しました'),
      };
    }

    if (data?.error) {
      return { data: null, error: new Error(data.error) };
    }

    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 単一ユーザーへ通知を送信
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {Object} metadata
 * @param {string|null} senderUserId
 * @returns {Promise<Object>} notification, recipientsCount, error
 */
export const sendNotificationToUser = async (userId, title, body, metadata = {}, senderUserId = null) => {
  try {
    if (!userId) {
      return { notification: null, recipientsCount: 0, error: new Error('送信先ユーザーIDが必要です') };
    }

    const { data, error } = await dispatchNotification({
      targetType: 'user',
      userId,
      title,
      body,
      metadata,
      senderUserId,
    });

    if (error) {
      return { notification: null, recipientsCount: 0, error };
    }

    emitNotificationUpdate();
    return {
      notification: { id: data?.notificationId ?? '' },
      recipientsCount: data?.recipientsCount ?? 0,
      push: data?.push ?? null,
      error: null,
    };
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};

/**
 * ロールの全ユーザーへ通知を送信
 * @param {string} roleId
 * @param {string} title
 * @param {string} body
 * @param {Object} metadata
 * @param {string|null} senderUserId
 * @returns {Promise<Object>} notification, recipientsCount, error
 */
export const sendNotificationToRole = async (roleId, title, body, metadata = {}, senderUserId = null) => {
  return sendNotificationToRoles([roleId], title, body, metadata, senderUserId);
};

/**
 * 複数ロールの全ユーザーへ通知を送信
 * @param {string[]} roleIds
 * @param {string} title
 * @param {string} body
 * @param {Object} metadata
 * @param {string|null} senderUserId
 * @returns {Promise<Object>} notification, recipientsCount, error
 */
export const sendNotificationToRoles = async (roleIds, title, body, metadata = {}, senderUserId = null) => {
  try {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return { notification: null, recipientsCount: 0, error: new Error('送信先ロールが必要です') };
    }

    const { data, error } = await dispatchNotification({
      targetType: 'roles',
      roleIds,
      title,
      body,
      metadata,
      senderUserId,
    });

    if (error) {
      return { notification: null, recipientsCount: 0, error };
    }

    emitNotificationUpdate();
    return {
      notification: { id: data?.notificationId ?? '' },
      recipientsCount: data?.recipientsCount ?? 0,
      push: data?.push ?? null,
      error: null,
    };
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};

/**
 * ロール名一覧のユーザーへ通知を送信
 * @param {string[]} roleNames
 * @param {string} title
 * @param {string} body
 * @param {Object} metadata
 * @param {string|null} senderUserId
 * @returns {Promise<Object>} notification, recipientsCount, error
 */
export const sendNotificationToRoleNames = async (roleNames, title, body, metadata = {}, senderUserId = null) => {
  try {
    if (!Array.isArray(roleNames) || roleNames.length === 0) {
      return { notification: null, recipientsCount: 0, error: new Error('通知先ロール名が未指定です') };
    }

    const { data, error } = await dispatchNotification({
      targetType: 'roles',
      roleNames,
      title,
      body,
      metadata,
      senderUserId,
    });

    if (error) {
      return { notification: null, recipientsCount: 0, error };
    }

    emitNotificationUpdate();
    return {
      notification: { id: data?.notificationId ?? '' },
      recipientsCount: data?.recipientsCount ?? 0,
      push: data?.push ?? null,
      error: null,
    };
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};

/**
 * 自分宛ての通知一覧を取得
 * @param {string} userId
 * @returns {Promise<Object>} items, error
 */
export const getNotificationsForUser = async (userId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('notification_recipients')
      .select('id, read_at, created_at, notifications ( id, title, body, metadata, sender_user_id, created_at )')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { items: [], error };
    }

    const items = (data ?? []).map((row) => ({
      recipientId: row.id,
      readAt: row.read_at,
      createdAt: row.created_at,
      notification: row.notifications,
    }));

    return { items, error: null };
  } catch (error) {
    return { items: [], error };
  }
};

/**
 * 未読件数を取得
 * @param {string} userId
 * @returns {Promise<Object>} count, error
 */
export const getUnreadCount = async (userId) => {
  try {
    const { error, count } = await getSupabaseClient()
      .from('notification_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      return { count: 0, error };
    }

    return { count: count ?? 0, error: null };
  } catch (error) {
    return { count: 0, error };
  }
};

/**
 * 既読にする
 * @param {string} recipientId
 * @returns {Promise<Object>} success, error
 */
export const markNotificationRead = async (recipientId) => {
  try {
    const { error } = await getSupabaseClient()
      .from('notification_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('id', recipientId);

    if (error) {
      return { success: false, error };
    }

    emitNotificationUpdate();
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error };
  }
};

/**
 * 指定ユーザーの未読通知を全て既読にする
 * @param {string} userId - ユーザーID
 * @returns {Promise<Object>} success, error
 */
export const markAllNotificationsRead = async (userId) => {
  try {
    const { error } = await getSupabaseClient()
      .from('notification_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      return { success: false, error };
    }

    emitNotificationUpdate();
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error };
  }
};
