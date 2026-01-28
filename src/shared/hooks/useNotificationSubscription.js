import { useEffect } from 'react';
import { subscribeToNotifications, showBrowserNotification } from '../services/notificationManager';

/**
 * 通知のリアルタイム購読を管理するカスタムフック
 * @param {string} userId - ユーザーID
 * @param {Function} onNotification - 通知受信時のコールバック関数
 * @param {Object} options - オプション
 * @param {boolean} [options.showBrowserNotification=true] - ブラウザ通知を表示するか
 * @returns {void}
 */
export const useNotificationSubscription = (userId, onNotification, options = {}) => {
  const { showBrowserNotification: shouldShowBrowser = true } = options;

  useEffect(() => {
    if (!userId) return;

    console.log('通知のリアルタイム購読を開始します:', userId);

    // 通知受信時のハンドラー
    const handleNotification = async (notification) => {
      // コールバック関数を呼び出し
      if (onNotification) {
        onNotification(notification);
      }

      // ブラウザ通知を表示
      if (shouldShowBrowser) {
        await showBrowserNotification(notification);
      }
    };

    // 購読開始
    const unsubscribe = subscribeToNotifications(userId, handleNotification);

    // クリーンアップ
    return () => {
      console.log('通知のリアルタイム購読を終了します');
      unsubscribe();
    };
  }, [userId, onNotification, shouldShowBrowser]);
};
