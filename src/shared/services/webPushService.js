/**
 * Web Pushサービス
 * ブラウザ通知の許可取得と購読登録を管理します
 */

import { Platform } from 'react-native';
import { getSupabaseClient } from '../../services/supabase/client.js';
import { registerServiceWorker } from '../utils/serviceWorker.js';

/** 通知許可案内のローカルストレージキー接頭辞 */
const WEB_PUSH_PROMPT_KEY_PREFIX = 'ikoma_erp_web_push_prompted_';

/**
 * URL-safe Base64文字列をUint8Arrayへ変換
 * @param {string} base64String - URL-safe Base64文字列
 * @returns {Uint8Array} 変換後の配列
 */
const convertBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);

  const outputArray = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    outputArray[index] = raw.charCodeAt(index);
  }

  return outputArray;
};

/**
 * Web Pushが利用可能かどうか
 * @returns {boolean} 利用可否
 */
const canUseWebPush = () => {
  if (Platform.OS !== 'web') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  if (!('Notification' in window)) {
    return false;
  }

  if (!('serviceWorker' in navigator)) {
    return false;
  }

  if (!('PushManager' in window)) {
    return false;
  }

  return true;
};

/**
 * 通知許可案内を表示し、許可が必要な場合は許可を要求する
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 許可されている場合true
 */
const requestNotificationPermissionIfNeeded = async (userId) => {
  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  const promptKey = `${WEB_PUSH_PROMPT_KEY_PREFIX}${userId}`;
  const hasPrompted = window.localStorage.getItem(promptKey) === '1';
  if (hasPrompted) {
    return false;
  }

  const shouldEnable = window.confirm(
    '新着通知をブラウザで受け取りますか？\n「OK」で通知許可を求めます。'
  );
  window.localStorage.setItem(promptKey, '1');

  if (!shouldEnable) {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

/**
 * 有効なアクセストークンを取得
 *
 * getSession() のみを使用し、手動 refreshSession() は一切呼ばない。
 * refreshSession() を手動で呼ぶと autoRefreshToken との競合でリフレッシュトークンが
 * 使用済みになり、Supabase JS クライアントが 400 を受けた際に内部でサインアウトを
 * 発火させるため使用しない。
 *
 * @returns {Promise<string|null>}
 */
const getValidAccessToken = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }
  return data?.session?.access_token ?? null;
};

/**
 * Edge Functionエラーが401か判定
 * @param {unknown} error
 * @returns {boolean}
 */
const isUnauthorizedFunctionError = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = /** @type {{ context?: { status?: number }; status?: number; message?: string }} */ (error);
  const status = maybeError.context?.status ?? maybeError.status;
  if (status === 401) {
    return true;
  }

  const message = (maybeError.message ?? '').toLowerCase();
  return message.includes('401') || message.includes('unauthorized');
};

/**
 * Functionエラーを整形
 * @param {unknown} error
 * @returns {Promise<Error>}
 */
const normalizeFunctionError = async (error) => {
  if (error && typeof error === 'object') {
    const maybeError = /** @type {{ context?: { json?: Function }; message?: string }} */ (error);
    const responseContext = maybeError.context;

    if (responseContext && typeof responseContext.json === 'function') {
      const payload = await responseContext.json().catch(() => null);
      if (payload && typeof payload.error === 'string' && payload.error.trim() !== '') {
        return new Error(payload.error);
      }
    }

    if (typeof maybeError.message === 'string' && maybeError.message.trim() !== '') {
      return new Error(maybeError.message);
    }
  }

  return new Error('push-subscription の呼び出しに失敗しました');
};

/**
 * Push購読情報をEdge Functionへ保存する
 * @param {PushSubscription} subscription - Push購読情報
 * @returns {Promise<void>} 保存結果
 */
const savePushSubscription = async (subscription) => {
  const serialized = subscription.toJSON();
  let accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('ログインセッションが見つかりません。再ログインしてください。');
  }

  const invokeSubscription = async (token) =>
    getSupabaseClient().functions.invoke('push-subscription', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        subscription: serialized,
      },
    });

  let { error } = await invokeSubscription(accessToken);

  if (error && isUnauthorizedFunctionError(error)) {
    // autoRefreshToken の完了を待ってから再試行する
    await new Promise((resolve) => setTimeout(resolve, 600));
    accessToken = await getValidAccessToken();
    if (accessToken) {
      ({ error } = await invokeSubscription(accessToken));
    }
  }

  if (error) {
    throw await normalizeFunctionError(error);
  }
};

/**
 * 認証済みユーザーのWeb Push購読を初期化する
 * @param {string} userId - ユーザーID
 * @returns {Promise<Object>} 実行結果
 */
export const initializeWebPushSubscription = async (userId) => {
  try {
    if (!userId || !canUseWebPush()) {
      return { enabled: false, error: null };
    }

    const hasPermission = await requestNotificationPermissionIfNeeded(userId);
    if (!hasPermission) {
      return { enabled: false, error: null };
    }

    registerServiceWorker();
    const serviceWorkerRegistration = await navigator.serviceWorker.ready;

    let subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (!subscription) {
      const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error(
          'EXPO_PUBLIC_VAPID_PUBLIC_KEY が未設定です。.env に公開鍵を設定してください。'
        );
      }

      subscription = await serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertBase64ToUint8Array(vapidPublicKey),
      });
    }

    await savePushSubscription(subscription);
    return { enabled: true, error: null };
  } catch (error) {
    console.error('Web Push初期化エラー:', error);
    return { enabled: false, error };
  }
};
