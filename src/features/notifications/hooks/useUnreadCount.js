import { useState, useEffect } from 'react';
import { getUnreadNotificationCount } from '../../../shared/services/notificationService';

/**
 * 未読通知数を取得するカスタムフック
 * @param {string} userId - ユーザーID
 * @param {number} [refreshInterval=30000] - 更新間隔（ミリ秒）
 * @returns {Object} { unreadCount, isLoading, refetch }
 */
export const useUnreadCount = (userId, refreshInterval = 30000) => {
  /** 未読通知数 */
  const [unreadCount, setUnreadCount] = useState(0);
  
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 未読通知数を取得する
   */
  const fetchUnreadCount = async () => {
    try {
      setIsLoading(true);
      const count = await getUnreadNotificationCount(userId);
      setUnreadCount(count);
    } catch (error) {
      console.error('未読通知数の取得に失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 初回ロードと定期更新
  useEffect(() => {
    if (!userId) return;

    // 初回実行
    fetchUnreadCount();

    // 定期更新
    const intervalId = setInterval(fetchUnreadCount, refreshInterval);

    // クリーンアップ
    return () => {
      clearInterval(intervalId);
    };
  }, [userId, refreshInterval]);

  return {
    unreadCount,
    isLoading,
    refetch: fetchUnreadCount,
  };
};
