import { supabase } from '../../services/supabase/client';
import { NOTIFICATION_STATUS } from '../../features/notifications/constants/notificationType';

/**
 * 通知タイプからデフォルトタイトルを生成
 * @param {string} type - 通知タイプ
 * @returns {string} タイトル
 */
const getTitleFromType = (type) => {
  const titleMap = {
    'info': '情報',
    'success': '成功',
    'warning': '警告',
    'error': 'エラー',
    'vendor_stop': '屋台出店停止',
    'schedule_change': 'スケジュール変更',
    'inventory_alert': '在庫アラート',
    'user_action': 'ユーザーアクション',
  };
  return titleMap[type] || '通知';
};

/**
 * ERPシステム全体で共有する通知送信関数
 * 全モジュール・全画面から呼び出し可能
 * 
 * @param {Object} params - 通知パラメータ
 * @param {string} params.type - 通知タイプ（info, success, warning, error等）
 * @param {string} params.message - 通知メッセージ本文
 * @param {string|string[]} params.recipientRoles - 通知対象ロール（単一またはリスト）
 * @param {string} [params.title] - 通知タイトル（省略時はタイプから自動生成）
 * @param {string} [params.deepLink] - クリック時の遷移先画面
 * @param {Object} [params.metadata] - 追加情報（用途に応じてカスタマイズ可能）
 * @returns {Promise<{success: boolean, notificationId: string, error?: string}>}
 * 
 * @example
 * // 屋台管理から呼び出し
 * await sendNotification({
 *   type: 'warning',
 *   message: '屋台番号105麻薬卵が出店停止しました',
 *   recipientRoles: 'vendor_manager',
 * });
 * 
 * @example
 * // 複数ロールに通知
 * await sendNotification({
 *   type: 'info',
 *   message: 'システムメンテナンスのお知らせ',
 *   recipientRoles: ['admin', 'operator'],
 * });
 */
export const sendNotification = async (params) => {
  try {
    const {
      type,
      message,
      recipientRoles,
      title,
      deepLink = null,
      metadata = {},
    } = params;

    // パラメータ検証
    if (!type || !message || !recipientRoles) {
      throw new Error('type, message, recipientRoles は必須です');
    }

    // titleが省略された場合、typeから自動生成
    const notificationTitle = title || getTitleFromType(type);

    // recipientRolesを配列に正規化
    const rolesArray = Array.isArray(recipientRoles) 
      ? recipientRoles 
      : [recipientRoles];

    // 現在のユーザー情報を取得
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('ユーザー認証情報の取得に失敗しました');
    }

    // ロールに基づいて対象ユーザーIDを取得
    // rolesがJSONB配列の場合、各ロールに対して検索
    const { data: targetUsers, error: usersError } = await supabase
      .from('users')
      .select('id, roles');

    if (usersError) {
      throw new Error(`対象ユーザーの取得に失敗しました: ${usersError.message}`);
    }

    // クライアント側でフィルタリング（JSONB配列の検索はクライアント側の方が確実）
    const targetUserIds = targetUsers
      ?.filter(u => {
        const userRoles = u.roles || [];
        return rolesArray.some(role => userRoles.includes(role));
      })
      .map(u => u.id) || [];

    if (targetUserIds.length === 0) {
      console.warn('通知対象ユーザーが見つかりませんでした', { recipientRoles });
    }

    // 有効期限を設定（デフォルト: 24時間後）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 通知をデータベースに保存
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        type,
        title: notificationTitle,
        message,
        recipient_roles: rolesArray,
        target_user_ids: targetUserIds,
        sent_by: user.id,
        deep_link: deepLink,
        metadata,
        status: NOTIFICATION_STATUS.SENT,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`通知の保存に失敗しました: ${insertError.message}`);
    }

    console.log('通知が正常に送信されました', {
      notificationId: notification.id,
      targetUserCount: targetUserIds.length,
    });

    return {
      success: true,
      notificationId: notification.id,
    };
  } catch (error) {
    console.error('sendNotification error:', error);
    return {
      success: false,
      notificationId: null,
      error: error.message,
    };
  }
};
