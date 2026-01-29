import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/useNotifications';

/**
 * 通知コンテキスト
 * アプリ全体で通知状態を共有
 */
const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  refetch: () => {},
});

/**
 * 通知コンテキストプロバイダー
 * @param {Object} props - プロパティ
 * @param {React.ReactNode} props.children - 子コンポーネント
 */
export const NotificationProvider = ({ children }) => {
  // 通知データを取得（自動更新あり）
  const notificationData = useNotifications({
    limit: 100,
    refreshInterval: 30000, // 30秒ごとに更新
  });

  console.log('[NotificationProvider] 通知データ更新:', {
    count: notificationData.notifications.length,
    unreadCount: notificationData.unreadCount,
    isLoading: notificationData.isLoading,
  });

  return (
    <NotificationContext.Provider value={notificationData}>
      {children}
    </NotificationContext.Provider>
  );
};

/**
 * 通知コンテキストを使用するカスタムフック
 * @returns {Object} 通知データ
 */
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  return context;
};
