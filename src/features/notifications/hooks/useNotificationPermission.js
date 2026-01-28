import { useState, useEffect } from 'react';

/**
 * ブラウザの通知権限を管理するカスタムフック
 * @returns {Object} { permission, requestPermission, isSupported }
 */
export const useNotificationPermission = () => {
  /** 通知権限の状態 */
  const [permission, setPermission] = useState('default');
  
  /** ブラウザが通知をサポートしているか */
  const [isSupported, setIsSupported] = useState(false);

  // 初期化
  useEffect(() => {
    // ブラウザが通知APIをサポートしているかチェック
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    } else {
      setIsSupported(false);
    }
  }, []);

  /**
   * 通知権限をリクエストする
   * @returns {Promise<string>} 権限の状態（granted, denied, default）
   */
  const requestPermission = async () => {
    if (!isSupported) {
      console.warn('このブラウザは通知をサポートしていません');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        console.log('通知の権限が許可されました');
      } else if (result === 'denied') {
        console.warn('通知の権限が拒否されました');
      }
      
      return result;
    } catch (error) {
      console.error('通知権限のリクエストに失敗しました:', error);
      return 'denied';
    }
  };

  return {
    permission,
    requestPermission,
    isSupported,
  };
};
