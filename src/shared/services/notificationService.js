import { supabase } from '../../services/supabase/client';

/**
 * 通知サービス
 * 通知の取得、既読管理などの機能を提供
 */

/**
 * ユーザーの通知一覧を取得する
 * @param {string} userId - ユーザーID
 * @param {Object} options - オプション
 * @param {number} [options.limit=20] - 取得件数
 * @param {number} [options.offset=0] - オフセット
 * @param {string} [options.filterByType] - 通知タイプでフィルタ
 * @returns {Promise<Array>} 通知の配列
 */
export const getUserNotifications = async (userId, options = {}) => {
  try {
    const {
      limit = 20,
      offset = 0,
      filterByType = null,
    } = options;

    // まず通知を取得（フィルタリングはクライアント側で行う）
    let query = supabase
      .from('notifications')
      .select(`
        *,
        notification_reads!left(read_at, user_id)
      `)
      .order('created_at', { ascending: false })
      .limit(limit * 3); // 余裕を持って多めに取得

    // タイプでフィルタ
    if (filterByType) {
      query = query.eq('type', filterByType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`通知の取得に失敗しました: ${error.message}`);
    }

    // クライアント側でユーザーIDに基づいてフィルタリング
    const filtered = (data || []).filter(notification => {
      if (!notification.target_user_ids) return false;
      return notification.target_user_ids.includes(userId);
    });

    // ページング処理
    return filtered.slice(offset, offset + limit);
  } catch (error) {
    console.error('getUserNotifications error:', error);
    throw error;
  }
};

/**
 * ユーザーの未読通知数を取得する
 * @param {string} userId - ユーザーID
 * @returns {Promise<number>} 未読通知数
 */
export const getUnreadNotificationCount = async (userId) => {
  try {
    // すべての有効な通知を取得
    const { data: allNotifications, error } = await supabase
      .from('notifications')
      .select('id, target_user_ids')
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('通知取得エラー:', error);
      return 0;
    }

    // ユーザー向けの通知をフィルタリング
    const userNotifications = (allNotifications || []).filter(notification => {
      if (!notification.target_user_ids) return false;
      return notification.target_user_ids.includes(userId);
    });

    // 既読を除外してカウント
    const { data: reads, error: readsError } = await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId);

    if (readsError) {
      console.error('既読データ取得エラー:', readsError);
    }

    const readIds = reads?.map(r => r.notification_id) || [];
    
    // 未読数を計算
    const unreadCount = userNotifications.filter(
      notification => !readIds.includes(notification.id)
    ).length;

    return unreadCount;
  } catch (error) {
    console.error('getUnreadNotificationCount error:', error);
    return 0;
  }
};

/**
 * 通知を既読にする
 * @param {string} notificationId - 通知ID
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 成功したかどうか
 */
export const markNotificationAsRead = async (notificationId, userId) => {
  try {
    const { error } = await supabase
      .from('notification_reads')
      .insert({
        notification_id: notificationId,
        user_id: userId,
        read_at: new Date().toISOString(),
      });

    if (error) {
      // すでに既読の場合はエラーを無視
      if (error.code === '23505') {
        return true;
      }
      throw new Error(`通知の既読化に失敗しました: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('markNotificationAsRead error:', error);
    return false;
  }
};

/**
 * すべての通知を既読にする
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 成功したかどうか
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    // ユーザーの未読通知を取得
    const { data: notifications, error: selectError } = await supabase
      .from('notifications')
      .select('id')
      .filter('target_user_ids', 'cs', `{\"${userId}\"}`);

    if (selectError) {
      throw new Error(`未読通知の取得に失敗しました: ${selectError.message}`);
    }

    if (!notifications || notifications.length === 0) {
      return true;
    }

    // 既に既読のものを取得
    const { data: existingReads } = await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId);

    const readIds = new Set(existingReads?.map(r => r.notification_id) || []);
    const unreadNotifications = notifications.filter(n => !readIds.has(n.id));

    if (unreadNotifications.length === 0) {
      return true;
    }

    // バルクインサート
    const reads = unreadNotifications.map(n => ({
      notification_id: n.id,
      user_id: userId,
      read_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('notification_reads')
      .insert(reads);

    if (insertError) {
      throw new Error(`一括既読化に失敗しました: ${insertError.message}`);
    }

    return true;
  } catch (error) {
    console.error('markAllNotificationsAsRead error:', error);
    return false;
  }
};

/**
 * 期限切れの通知を削除する
 * @returns {Promise<number>} 削除した通知数
 */
export const deleteExpiredNotifications = async () => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      throw new Error(`期限切れ通知の削除に失敗しました: ${error.message}`);
    }

    const deletedCount = data?.length || 0;
    console.log(`期限切れ通知を${deletedCount}件削除しました`);
    
    return deletedCount;
  } catch (error) {
    console.error('deleteExpiredNotifications error:', error);
    return 0;
  }
};
