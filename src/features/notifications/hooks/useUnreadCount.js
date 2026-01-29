import { useState, useEffect, useCallback } from 'react';
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
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log('[useUnreadCount] 未読数を取得中...', { userId });
      const count = await getUnreadNotificationCount(userId);
      console.log('[useUnreadCount] 未読数:', count);
      setUnreadCount(count);
    } catch (error) {
      console.error('未読通知数の取得に失敗しました:', error);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // 初回ロードと定期更新
  useEffect(() => {
    if (!userId) {
      console.log('[useUnreadCount] ユーザーIDがないためスキップ');
      setIsLoading(false);
      return;
    }

    console.log('[useUnreadCount] 初回実行');
    // 初回実行
    fetchUnreadCount();

    // 定期更新
    if (refreshInterval > 0) {
      console.log('[useUnreadCount] 定期更新を設定:', refreshInterval, 'ms');
      const intervalId = setInterval(fetchUnreadCount, refreshInterval);

      // クリーンアップ
      return () => {
        console.log('[useUnreadCount] 定期更新をクリア');
        clearInterval(intervalId);
      };
    }
  }, [userId, refreshInterval, fetchUnreadCount]);

  return {
    unreadCount,
    isLoading,
    refetch: fetchUnreadCount,
  };
};
