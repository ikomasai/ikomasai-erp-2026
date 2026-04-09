import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Pushデバッグ用のメッセージ種別 */
const SW_PUSH_DEBUG_MESSAGE_TYPE = 'SW_PUSH_DEBUG';
/** 閉じている間の Push トースト保持用キャッシュ */
const PUSH_NOTICE_CACHE_NAME = 'ikoma-erp-push-notice-v1';
/** 閉じている間の Push トースト保持キー */
const PUSH_NOTICE_CACHE_KEY = '/__push__/pending-notices';

/**
 * Service Worker が保持した Push ログを取り出して削除する
 * @returns {Promise<Object[]>} 保持中の Push ログ一覧
 */
const consumePendingPushDebugLogs = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return [];
  }

  const cache = await window.caches.open(PUSH_NOTICE_CACHE_NAME);
  const response = await cache.match(PUSH_NOTICE_CACHE_KEY);

  if (!response) {
    return [];
  }

  try {
    const payload = await response.json();
    await cache.delete(PUSH_NOTICE_CACHE_KEY);
    return Array.isArray(payload?.notices) ? payload.notices : [];
  } catch (error) {
    await cache.delete(PUSH_NOTICE_CACHE_KEY);
    return [];
  }
};

/**
 * Service Worker から届く Push デバッグログをブラウザコンソールへ出す
 * @param {Object} [options={}] - オプション
 * @param {(payload: Object) => void} [options.onPushDebug] - 受信ログの購読コールバック
 * @returns {void}
 */
export const useWebPushDebugListener = ({ onPushDebug } = {}) => {
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
      onPushDebug?.(data.payload);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    /** フック有効中フラグ */
    let isActive = true;

    consumePendingPushDebugLogs()
      .then((pendingLogs) => {
        if (!isActive || !Array.isArray(pendingLogs) || pendingLogs.length === 0) {
          return;
        }

        pendingLogs.forEach((payload) => {
          console.info('[web-push][browser][pending]', payload);
          onPushDebug?.(payload);
        });
      })
      .catch(() => {});

    return () => {
      isActive = false;
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [onPushDebug]);
};
