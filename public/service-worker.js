/**
 * PWAサービスワーカー
 * オフラインキャッシュと通知を管理します
 */

// キャッシュバージョン
const CACHE_VERSION = 'v3';
// キャッシュ名
const CACHE_NAME = `ikoma-erp-cache-${CACHE_VERSION}`;
// プリキャッシュ対象
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/favicon.ico',
];
// キャッシュ対象のリソース種別
const ASSET_DESTINATIONS = ['style', 'script', 'image', 'font'];
// 通知のデフォルトタイトル
const DEFAULT_NOTIFICATION_TITLE = 'Ikoma Festival ERP 2026';
// 通知のデフォルト本文
const DEFAULT_NOTIFICATION_BODY = '新しい通知があります。';
// 通知のデフォルト遷移先
const DEFAULT_NOTIFICATION_URL = '/notifications';
// 通知アイコン
const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';
// 通知バッジ
const DEFAULT_NOTIFICATION_BADGE = '/icons/icon-192.png';
// 通知アクション
const DEFAULT_NOTIFICATION_ACTIONS = [
  { action: 'open', title: '開く' },
  { action: 'close', title: '閉じる' },
];
// 通知バイブレーション
const DEFAULT_NOTIFICATION_VIBRATE = [160, 80, 160];

/**
 * プリキャッシュを実行する
 * @returns {Promise<void>} 実行結果
 */
const precacheAssets = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PRECACHE_URLS);
};

/**
 * 古いキャッシュを削除する
 * @returns {Promise<void>} 削除結果
 */
const clearOldCaches = async () => {
  const cacheKeys = await caches.keys();
  const obsoleteKeys = cacheKeys.filter((key) => key !== CACHE_NAME);
  await Promise.all(obsoleteKeys.map((key) => caches.delete(key)));
};

/**
 * キャッシュにレスポンスを保存する
 * @param {Request} request - 対象リクエスト
 * @param {Response} response - 対象レスポンス
 * @returns {Promise<void>} 保存結果
 */
const cacheResponse = async (request, response) => {
  if (!response || response.status !== 200) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

/**
 * ナビゲーションリクエストを処理する
 * @param {Request} request - 対象リクエスト
 * @returns {Promise<Response>} レスポンス
 */
const handleNavigationRequest = async (request) => {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await caches.match('/index.html');
    return cachedResponse || Response.error();
  }
};

/**
 * 静的アセットリクエストを処理する
 * @param {Request} request - 対象リクエスト
 * @returns {Promise<Response>} レスポンス
 */
const handleAssetRequest = async (request) => {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  await cacheResponse(request, response);
  return response;
};

/**
 * プッシュ通知のデータを取得する
 * @param {PushEvent} event - プッシュイベント
 * @returns {Object} 通知データ
 */
const getNotificationData = (event) => {
  if (!event.data) {
    return {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: DEFAULT_NOTIFICATION_BODY,
      url: DEFAULT_NOTIFICATION_URL,
      navigateTo: null,
      notificationId: null,
      icon: DEFAULT_NOTIFICATION_ICON,
      badge: DEFAULT_NOTIFICATION_BADGE,
      image: null,
      requireInteraction: true,
      vibrate: DEFAULT_NOTIFICATION_VIBRATE,
      actions: DEFAULT_NOTIFICATION_ACTIONS,
      timestamp: Date.now(),
    };
  }

  try {
    const parsedData = event.data.json();
    return {
      title: parsedData.title || DEFAULT_NOTIFICATION_TITLE,
      body: parsedData.body || DEFAULT_NOTIFICATION_BODY,
      url: parsedData.url || DEFAULT_NOTIFICATION_URL,
      /** 遷移先情報（{ screen: string, tab: string } または null） */
      navigateTo: parsedData.navigateTo || null,
      /** 通知ID（重複排除タグとして使用） */
      notificationId: parsedData.notificationId || null,
      /** 表示オプション */
      icon: parsedData.icon || DEFAULT_NOTIFICATION_ICON,
      badge: parsedData.badge || DEFAULT_NOTIFICATION_BADGE,
      image: parsedData.image || null,
      requireInteraction: parsedData.requireInteraction !== false,
      vibrate:
        Array.isArray(parsedData.vibrate) && parsedData.vibrate.length > 0
          ? parsedData.vibrate
          : DEFAULT_NOTIFICATION_VIBRATE,
      actions:
        Array.isArray(parsedData.actions) && parsedData.actions.length > 0
          ? parsedData.actions
          : DEFAULT_NOTIFICATION_ACTIONS,
      timestamp:
        typeof parsedData.timestamp === 'number' && Number.isFinite(parsedData.timestamp)
          ? parsedData.timestamp
          : Date.now(),
    };
  } catch (error) {
    return {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: event.data.text(),
      url: DEFAULT_NOTIFICATION_URL,
      navigateTo: null,
      notificationId: null,
      icon: DEFAULT_NOTIFICATION_ICON,
      badge: DEFAULT_NOTIFICATION_BADGE,
      image: null,
      requireInteraction: true,
      vibrate: DEFAULT_NOTIFICATION_VIBRATE,
      actions: DEFAULT_NOTIFICATION_ACTIONS,
      timestamp: Date.now(),
    };
  }
};

/**
 * 通知のオプションを生成する
 * requireInteraction: true でユーザーが閉じるまでポップアップを維持する（Discord 方式）
 * @param {Object} data - 通知データ
 * @returns {NotificationOptions} 通知オプション
 */
const buildNotificationOptions = (data) => {
  return {
    body: data.body,
    icon: data.icon || DEFAULT_NOTIFICATION_ICON,
    badge: data.badge || DEFAULT_NOTIFICATION_BADGE,
    image: data.image || undefined,
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : DEFAULT_NOTIFICATION_VIBRATE,
    actions: Array.isArray(data.actions) ? data.actions : DEFAULT_NOTIFICATION_ACTIONS,
    timestamp: data.timestamp || Date.now(),
    silent: false,
    lang: 'ja',
    /** ユーザーが操作するまでポップアップを閉じない */
    requireInteraction: data.requireInteraction !== false,
    /** 同じ notificationId の重複通知を排除し、新着時は再通知する */
    tag: data.notificationId || 'ikoma-erp-notification',
    renotify: Boolean(data.notificationId),
    data: {
      url: data.url,
      /** 遷移先情報（postMessage で使用） */
      navigateTo: data.navigateTo,
      notificationId: data.notificationId,
    },
  };
};

/**
 * URLにクエリパラメータを付与する（アプリ未起動時のフォールバック用）
 * @param {string} baseUrl - ベースURL
 * @param {Object|null} navigateTo - 遷移先情報
 * @returns {string} パラメータ付きURL
 */
const buildFallbackUrl = (baseUrl, navigateTo) => {
  if (!navigateTo || !navigateTo.screen || !navigateTo.tab) {
    return baseUrl;
  }
  const url = new URL(baseUrl, self.location.origin);
  url.searchParams.set('sw_screen', navigateTo.screen);
  url.searchParams.set('sw_tab', navigateTo.tab);
  return url.href;
};

/**
 * 通知クリック時の遷移を処理する
 * アプリが開いている場合は postMessage でナビゲートし、
 * 開いていない場合はURLパラメータ付きで新規ウィンドウを開く
 * @param {NotificationEvent} event - 通知イベント
 * @returns {Promise<void>} 処理結果
 */
const handleNotificationClick = async (event) => {
  const targetUrl = event.notification?.data?.url || '/';
  const navigateTo = event.notification?.data?.navigateTo || null;

  const clientList = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  // アプリが既に開いている場合：postMessage でナビゲートを通知
  for (const client of clientList) {
    if (client.url.startsWith(self.location.origin)) {
      await client.focus();
      if (navigateTo) {
        client.postMessage({
          type: 'SW_NAVIGATE',
          screen: navigateTo.screen,
          tab: navigateTo.tab,
        });
      }
      return;
    }
  }

  // アプリが開いていない場合：URLパラメータ付きで新規ウィンドウを開く
  if (clients.openWindow) {
    await clients.openWindow(buildFallbackUrl(targetUrl, navigateTo));
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAssets());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clearOldCaches());
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (ASSET_DESTINATIONS.includes(event.request.destination)) {
    event.respondWith(handleAssetRequest(event.request));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const notificationData = getNotificationData(event);
      const notificationOptions = buildNotificationOptions(notificationData);

      if (notificationOptions.tag) {
        const existingNotifications = await self.registration.getNotifications({
          tag: notificationOptions.tag,
        });
        existingNotifications.forEach((notification) => notification.close());
      }

      await self.registration.showNotification(notificationData.title, notificationOptions);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') {
    return;
  }
  event.waitUntil(handleNotificationClick(event));
});
