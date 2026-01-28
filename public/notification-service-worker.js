/**
 * 通知用Service Worker
 * プッシュ通知の受信とバックグラウンド処理を担当
 */

// Service Workerのバージョン
const CACHE_VERSION = 'v1';
const NOTIFICATION_CACHE = `notification-cache-${CACHE_VERSION}`;

/**
 * Service Workerのインストール
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(NOTIFICATION_CACHE).then((cache) => {
      console.log('[Service Worker] Cache opened');
      return cache.addAll([
        '/icons/icon-192x192.png',
        '/icons/badge-72x72.png',
      ]);
    })
  );

  // 新しいService Workerを即座にアクティブ化
  self.skipWaiting();
});

/**
 * Service Workerのアクティベーション
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    // 古いキャッシュを削除
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== NOTIFICATION_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // すべてのクライアントを即座に制御
  return self.clients.claim();
});

/**
 * プッシュ通知の受信
 */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');

  let notificationData = {
    title: 'お知らせ',
    body: '新しい通知があります',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: {},
  };

  // プッシュデータを解析
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.message || data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.id || 'notification',
        requireInteraction: data.priority >= 2, // 警告以上は自動で閉じない
        data: {
          deepLink: data.deep_link,
          notificationId: data.id,
          ...data.metadata,
        },
      };
    } catch (error) {
      console.error('[Service Worker] Failed to parse push data:', error);
    }
  }

  // 通知を表示
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
      vibrate: [200, 100, 200], // バイブレーションパターン
      actions: [
        {
          action: 'open',
          title: '開く',
        },
        {
          action: 'close',
          title: '閉じる',
        },
      ],
    })
  );
});

/**
 * 通知のクリック処理
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.action);

  // 通知を閉じる
  event.notification.close();

  // アクションに応じた処理
  if (event.action === 'close') {
    // 何もしない（通知を閉じるだけ）
    return;
  }

  // 'open' アクションまたは通知本体のクリック
  const deepLink = event.notification.data?.deepLink;
  const urlToOpen = deepLink 
    ? new URL(deepLink, self.location.origin).href 
    : self.location.origin;

  event.waitUntil(
    // 既に開いているウィンドウを探す
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // すでに開いているタブがあれば、そこにフォーカス
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }

      // 同じオリジンのタブがあれば、そこに遷移
      if (clientList.length > 0) {
        const client = clientList[0];
        if ('focus' in client) {
          client.focus();
        }
        if ('navigate' in client) {
          return client.navigate(urlToOpen);
        }
      }

      // なければ新しいウィンドウを開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/**
 * 通知を閉じた時の処理
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event.notification.tag);
  
  // 必要に応じて分析データを送信
  // TODO: 通知の閉じられた履歴を記録
});

/**
 * バックグラウンド同期
 */
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      // 未読通知の同期処理
      fetch('/api/notifications/sync')
        .then((response) => response.json())
        .then((data) => {
          console.log('[Service Worker] Notifications synced:', data);
        })
        .catch((error) => {
          console.error('[Service Worker] Sync failed:', error);
        })
    );
  }
});

/**
 * メッセージ受信（クライアントからの通信）
 */
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
