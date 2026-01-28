import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { getUserNotifications } from '../../../shared/services/notificationService';

/**
 * 通知一覧を取得するカスタムフック
 * @param {Object} options - オプション
 * @param {number} [options.limit=20] - 取得件数
 * @param {number} [options.offset=0] - オフセット
 * @param {string} [options.filterByType] - 通知タイプでフィルタ
 * @returns {Object} { notifications, unreadCount, isLoading, error, refetch }
 */
export const useNotifications = (options = {}) => {
  const { user } = useAuth();
  
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
  const fetchNotifications = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const data = await getUserNotifications(user.id, options);
      setNotifications(data);
    } catch (err) {
      console.error('通知の取得に失敗しました:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 初回ロード
  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    }
  }, [user?.id, options.limit, options.offset, options.filterByType]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch: fetchNotifications,
  };
};
