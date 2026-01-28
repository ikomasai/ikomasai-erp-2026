import { supabase } from '../../services/supabase/client';

/**
 * 通知管理マネージャー
 * アプリ起動時の初期化処理や期限切れ通知のクリーンアップなどを管理
 */

/**
 * 通知システムの初期化
 * アプリ起動時に一度だけ呼び出す
 * @param {string} userId - ユーザーID
 * @returns {Promise<void>}
 */
export const initializeNotificationSystem = async (userId) => {
  try {
    console.log('通知システムを初期化しています...');

    // Service Workerの登録チェック
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      console.log('Service Worker is ready:', registration);

      // プッシュ通知の権限をリクエスト
      const permission = await Notification.requestPermission();
      console.log('通知の権限:', permission);

      if (permission === 'granted') {
        console.log('プッシュ通知が有効になりました');
      } else {
        console.warn('プッシュ通知の権限が拒否されました');
      }
    } else {
      console.warn('このブラウザはプッシュ通知をサポートしていません');
    }

    console.log('通知システムの初期化が完了しました');
  } catch (error) {
    console.error('通知システムの初期化に失敗しました:', error);
  }
};

/**
 * 期限切れ通知の自動クリーンアップを開始
 * 定期的に期限切れの通知を削除する
 * @param {number} intervalMinutes - クリーンアップの間隔（分）
 * @returns {() => void} クリーンアップを停止する関数
 */
export const startAutoCleanup = (intervalMinutes = 60) => {
  const intervalMs = intervalMinutes * 60 * 1000;

  const cleanup = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('自動クリーンアップ中にエラーが発生しました:', error);
      } else {
        console.log('期限切れ通知のクリーンアップが完了しました');
      }
    } catch (error) {
      console.error('自動クリーンアップに失敗しました:', error);
    }
  };

  // 初回実行
  cleanup();

  // 定期実行
  const intervalId = setInterval(cleanup, intervalMs);

  // クリーンアップ停止関数を返す
  return () => {
    clearInterval(intervalId);
    console.log('通知の自動クリーンアップを停止しました');
  };
};

/**
 * 通知のリアルタイム購読を開始
 * @param {string} userId - ユーザーID
 * @param {Function} onNotification - 通知受信時のコールバック関数
 * @returns {() => void} 購読を解除する関数
 */
export const subscribeToNotifications = (userId, onNotification) => {
  console.log('通知のリアルタイム購読を開始:', userId);
  
  // notifications テーブルの変更を監視
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      },
      (payload) => {
        // クライアント側でフィルタリング
        const notification = payload.new;
        const targetIds = notification.target_user_ids || [];
        
        if (targetIds.includes(userId)) {
          console.log('新しい通知を受信しました:', notification);
          if (onNotification) {
            onNotification(notification);
          }
        }
      }
    )
    .subscribe();

  // 購読解除関数を返す
  return () => {
    supabase.removeChannel(channel);
    console.log('通知の購読を解除しました');
  };
};

/**
 * ブラウザ通知を表示する
 * @param {Object} notification - 通知オブジェクト
 * @param {string} notification.title - タイトル
 * @param {string} notification.message - メッセージ
 * @param {string} [notification.icon] - アイコンURL
 * @param {string} [notification.deepLink] - クリック時の遷移先
 * @returns {Promise<void>}
 */
export const showBrowserNotification = async (notification) => {
  try {
    // 通知権限のチェック
    if (Notification.permission !== 'granted') {
      console.warn('通知の権限がありません');
      return;
    }

    const { title, message, icon, deepLink } = notification;

    // Service Workerを使用してブラウザ通知を表示
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title || 'お知らせ', {
        body: message,
        icon: icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: notification.id,
        requireInteraction: false,
        data: {
          deepLink,
        },
      });
    } else {
      // フォールバック: 通常の通知API
      new Notification(title || 'お知らせ', {
        body: message,
        icon: icon || '/icons/icon-192x192.png',
      });
    }
  } catch (error) {
    console.error('ブラウザ通知の表示に失敗しました:', error);
  }
};
