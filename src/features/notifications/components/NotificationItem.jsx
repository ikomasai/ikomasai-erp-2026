import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NOTIFICATION_TYPE_CONFIG } from '../constants/notificationType';

/**
 * 個別通知アイテムコンポーネント
 * 
 * @param {Object} props - プロパティ
 * @param {Object} props.notification - 通知オブジェクト
 * @param {Function} props.onPress - クリック時のハンドラー
 * @param {boolean} [props.isRead=false] - 既読状態
 * @returns {JSX.Element}
 */
export const NotificationItem = ({ notification, onPress, isRead = false }) => {
  const config = NOTIFICATION_TYPE_CONFIG[notification.type] || NOTIFICATION_TYPE_CONFIG.info;

  /**
   * 日時を相対的な表現に変換
   * @param {string} dateString - ISO形式の日時文字列
   * @returns {string}
   */
  const formatRelativeTime = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'たった今';
    if (diffMinutes < 60) return `${diffMinutes}分前`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}日前`;
    
    return date.toLocaleDateString('ja-JP');
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(notification)}
      className={`border-b border-gray-200 p-4 ${isRead ? 'bg-white' : 'bg-blue-50'}`}
      accessibilityLabel={`${config.displayName}の通知: ${notification.message}`}
    >
      <View className="flex-row items-start">
        {/* 通知タイプインジケーター */}
        <View
          className="w-1 h-full rounded-full mr-3"
          style={{ backgroundColor: config.color }}
        />

        <View className="flex-1">
          {/* タイトル */}
          {notification.title && (
            <Text className="text-base font-semibold text-gray-900 mb-1">
              {notification.title}
            </Text>
          )}

          {/* メッセージ */}
          <Text className="text-sm text-gray-700 mb-2">
            {notification.message}
          </Text>

          {/* メタ情報 */}
          <View className="flex-row items-center">
            <View
              className="px-2 py-1 rounded mr-2"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: config.color }}
              >
                {config.displayName}
              </Text>
            </View>

            <Text className="text-xs text-gray-500">
              {formatRelativeTime(notification.created_at)}
            </Text>
          </View>
        </View>

        {/* 未読インジケーター */}
        {!isRead && (
          <View className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-2" />
        )}
      </View>
    </TouchableOpacity>
  );
};
