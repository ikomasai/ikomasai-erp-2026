import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { getUserNotifications } from '../../../shared/services/notificationService';

/**
 * 通知一覧を取得するカスタムフック
 * @param {Object} options - オプション
 * @param {number} [options.limit=20] - 取得件数
 * @param {number} [options.offset=0] - オフセット
 * @param {string} [options.filterByType] - 通知タイプでフィルタ
 * @param {number} [options.refreshInterval=30000] - 自動更新間隔（ミリ秒、0で無効化）
 * @returns {Object} { notifications, unreadCount, isLoading, error, refetch }
 */
export const useNotifications = (options = {}) => {
  const { user } = useAuth();
  const { 
    limit = 20, 
    offset = 0, 
    filterByType = null, 
    refreshInterval = 30000 
  } = options;
  
  /** 通知一覧 */
  const [notifications, setNotifications] = useState([]);
  
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  
  /** エラー */
  const [error, setError] = useState(null);

  /**
   * 未読通知数を計算
   */
  const unreadCount = useMemo(() => {
    return notifications.filter(notification => !notification.isRead).length;
  }, [notifications]);

  /**
   * 通知を取得する
   */
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[useNotifications] 通知を取得中...', { userId: user.id, limit, offset, filterByType });
      
      const data = await getUserNotifications(user.id, { limit, offset, filterByType });
      
      console.log('[useNotifications] 取得完了:', data.length, '件');
      
      setNotifications(data);
    } catch (err) {
      console.error('通知の取得に失敗しました:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, limit, offset, filterByType]);

  // 初回ロードと自動更新
  useEffect(() => {
    if (!user?.id) {
      console.log('[useNotifications] ユーザーIDがないためスキップ');
      setIsLoading(false);
      return;
    }

    console.log('[useNotifications] 初回実行');
    // 初回実行
    fetchNotifications();

    // 自動更新が有効な場合
    if (refreshInterval > 0) {
      console.log('[useNotifications] 自動更新を設定:', refreshInterval, 'ms');
      const intervalId = setInterval(fetchNotifications, refreshInterval);
      return () => {
        console.log('[useNotifications] 自動更新をクリア');
        clearInterval(intervalId);
      };
    }
  }, [user?.id, fetchNotifications, refreshInterval]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch: fetchNotifications,
  };
};
