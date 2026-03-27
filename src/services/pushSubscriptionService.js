/**
 * Web Push購読再同期サービス
 * shared 配下を編集せず、各業務画面から Push購読を再同期する
 */

import { Platform } from 'react-native';
import { getSupabaseClient } from './supabase/client.js';

/** Push購読状態 */
export const WEB_PUSH_SYNC_STATES = {
  UNSUPPORTED: 'unsupported',
  ENABLED: 'enabled',
  PERMISSION_REQUIRED: 'permission_required',
  PERMISSION_DENIED: 'permission_denied',
  ERROR: 'error',
};

/**
 * URL-safe Base64文字列をUint8Arrayへ変換する
 * @param {string} base64String - URL-safe Base64文字列
 * @returns {Uint8Array} 変換後の配列
 */
const convertBase64ToUint8Array = (base64String) => {
  /** Base64のパディング */
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  /** 標準Base64へ変換した文字列 */
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  /** デコード済み文字列 */
  const raw = window.atob(normalized);
  /** 出力配列 */
  const outputArray = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    outputArray[index] = raw.charCodeAt(index);
  }

  return outputArray;
};

/**
 * Web Push利用可否を判定する
 * @returns {boolean} 利用可能ならtrue
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
 * Service Workerを即時登録可能か判定する
 * @returns {boolean} 登録可能ならtrue
 */
const canRegisterServiceWorkerNow = () => {
  if (!canUseWebPush()) {
    return false;
  }

  /** localhost 判定 */
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]';
  /** HTTPS 判定 */
  const isSecureContext = window.location.protocol === 'https:';

  return isLocalhost || isSecureContext;
};

/**
 * 有効なアクセストークンを取得する
 * @returns {Promise<string|null>} アクセストークン
 */
const getValidAccessToken = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();
  /** セッション取得結果 */
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data?.session?.access_token ?? null;
};

/**
 * Edge Functionエラーが401かを判定する
 * @param {unknown} error - Edge Functionエラー
 * @returns {boolean} 401ならtrue
 */
const isUnauthorizedFunctionError = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  /** 参照用エラー */
  const maybeError = /** @type {{ context?: { status?: number }; status?: number; message?: string }} */ (error);
  /** HTTPステータス */
  const status = maybeError.context?.status ?? maybeError.status;

  if (status === 401) {
    return true;
  }

  /** エラーメッセージ */
  const message = (maybeError.message ?? '').toLowerCase();
  return message.includes('401') || message.includes('unauthorized');
};

/**
 * Edge Functionエラーを整形する
 * @param {unknown} error - 元エラー
 * @returns {Promise<Error>} 整形済みエラー
 */
const normalizeFunctionError = async (error) => {
  if (error && typeof error === 'object') {
    /** 参照用エラー */
    const maybeError = /** @type {{ context?: { json?: Function }; message?: string }} */ (error);
    /** レスポンスコンテキスト */
    const responseContext = maybeError.context;

    if (responseContext && typeof responseContext.json === 'function') {
      /** Edge Functionレスポンス */
      const payload = await responseContext.json().catch(() => null);
      if (payload && typeof payload.error === 'string' && payload.error.trim() !== '') {
        return new Error(payload.error);
      }
    }

    if (typeof maybeError.message === 'string' && maybeError.message.trim() !== '') {
      return new Error(maybeError.message);
    }
  }

  return new Error('Push購読の保存に失敗しました。');
};

/**
 * Service Workerを登録し、利用可能なRegistrationを返す
 * @returns {Promise<ServiceWorkerRegistration>} 登録済みService Worker
 */
const ensureServiceWorkerRegistration = async () => {
  if (!canRegisterServiceWorkerNow()) {
    throw new Error('この環境では Service Worker を登録できません。HTTPS または localhost で開いてください。');
  }

  /** 既存の登録 */
  const existingRegistration = await navigator.serviceWorker.getRegistration('/service-worker.js');
  if (existingRegistration) {
    return existingRegistration;
  }

  /** 新規登録結果 */
  const registration = await navigator.serviceWorker.register('/service-worker.js');
  await navigator.serviceWorker.ready;
  return registration;
};

/**
 * Push購読情報をEdge Functionへ保存する
 * @param {PushSubscription} subscription - Push購読情報
 * @returns {Promise<void>} 保存結果
 */
const savePushSubscription = async (subscription) => {
  /** 直列化済み購読情報 */
  const serialized = subscription.toJSON();
  /** アクセストークン */
  let accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('ログインセッションが見つかりません。再ログインしてください。');
  }

  /**
   * push-subscription Edge Functionを呼び出す
   * @param {string} token - アクセストークン
   * @returns {Promise<{error: unknown}>} 実行結果
   */
  const invokeSubscription = async (token) =>
    getSupabaseClient().functions.invoke('push-subscription', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        subscription: serialized,
      },
    });

  /** 初回呼び出し結果 */
  let { error } = await invokeSubscription(accessToken);

  if (error && isUnauthorizedFunctionError(error)) {
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
 * 通知許可状態を確認し、必要ならブラウザへ許可を求める
 * @param {boolean} requestPermission - 許可ダイアログを出すかどうか
 * @returns {Promise<{granted: boolean, state: string, message: string}>} 判定結果
 */
const resolveNotificationPermission = async (requestPermission) => {
  if (!canUseWebPush()) {
    return {
      granted: false,
      state: WEB_PUSH_SYNC_STATES.UNSUPPORTED,
      message: '',
    };
  }

  if (Notification.permission === 'granted') {
    return {
      granted: true,
      state: WEB_PUSH_SYNC_STATES.ENABLED,
      message: '',
    };
  }

  if (Notification.permission === 'denied') {
    return {
      granted: false,
      state: WEB_PUSH_SYNC_STATES.PERMISSION_DENIED,
      message: 'ブラウザ通知がブロックされています。ブラウザ設定で通知を許可した後、再登録してください。',
    };
  }

  if (!requestPermission) {
    return {
      granted: false,
      state: WEB_PUSH_SYNC_STATES.PERMISSION_REQUIRED,
      message: '閉じたPWAでも通知を受け取るには、ブラウザ通知の許可が必要です。',
    };
  }

  /** ユーザーに確認した権限 */
  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    return {
      granted: true,
      state: WEB_PUSH_SYNC_STATES.ENABLED,
      message: '',
    };
  }

  return {
    granted: false,
    state:
      permission === 'denied'
        ? WEB_PUSH_SYNC_STATES.PERMISSION_DENIED
        : WEB_PUSH_SYNC_STATES.PERMISSION_REQUIRED,
    message:
      permission === 'denied'
        ? 'ブラウザ通知がブロックされています。ブラウザ設定で通知を許可した後、再登録してください。'
        : 'ブラウザ通知の許可がまだ完了していません。',
  };
};

/**
 * 現在ユーザーのPush購読を再同期する
 * requestPermission=false の場合は無言再同期のみ行い、許可ダイアログは出さない
 * @param {Object} params - 実行パラメータ
 * @param {string} params.userId - ユーザーID
 * @param {boolean} [params.requestPermission=false] - 許可ダイアログを表示するか
 * @returns {Promise<{enabled: boolean, state: string, message: string}>} 再同期結果
 */
export const syncWebPushSubscription = async ({ userId, requestPermission = false }) => {
  try {
    /** 正常なユーザーIDかどうか */
    const hasUserId = typeof userId === 'string' && userId.trim() !== '';

    if (!hasUserId) {
      return {
        enabled: false,
        state: WEB_PUSH_SYNC_STATES.ERROR,
        message: 'ログインユーザー情報が取得できません。',
      };
    }

    if (!canUseWebPush()) {
      return {
        enabled: false,
        state: WEB_PUSH_SYNC_STATES.UNSUPPORTED,
        message: '',
      };
    }

    /** 通知権限の確認結果 */
    const permissionResult = await resolveNotificationPermission(requestPermission);
    if (!permissionResult.granted) {
      return {
        enabled: false,
        state: permissionResult.state,
        message: permissionResult.message,
      };
    }

    /** Service Worker登録 */
    const registration = await ensureServiceWorkerRegistration();
    /** 既存購読 */
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      /** 公開VAPID鍵 */
      const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('EXPO_PUBLIC_VAPID_PUBLIC_KEY が未設定です。');
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertBase64ToUint8Array(vapidPublicKey),
      });
    }

    await savePushSubscription(subscription);

    return {
      enabled: true,
      state: WEB_PUSH_SYNC_STATES.ENABLED,
      message: '',
    };
  } catch (error) {
    console.error('Push購読再同期エラー:', error);
    return {
      enabled: false,
      state: WEB_PUSH_SYNC_STATES.ERROR,
      message: error instanceof Error ? error.message : 'Push購読の再同期に失敗しました。',
    };
  }
};
