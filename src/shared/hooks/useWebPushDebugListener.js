import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Pushデバッグ用のメッセージ種別 */
const SW_PUSH_DEBUG_MESSAGE_TYPE = 'SW_PUSH_DEBUG';

/**
 * Service Worker から届く Push デバッグログをブラウザコンソールへ出す
 * @returns {void}
 */
export const useWebPushDebugListener = () => {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return undefined;
    }

    if (!('serviceWorker' in navigator)) {
      return undefined;
    }

    /**
     * Service Worker からのメッセージを処理する
     * @param {MessageEvent} event - メッセージイベント
     * @returns {void}
     */
    const handleMessage = (event) => {
      /** 受信データ */
      const data = event?.data;
      if (data?.type !== SW_PUSH_DEBUG_MESSAGE_TYPE) {
        return;
      }

      console.info('[web-push][browser]', data.payload);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);
};

