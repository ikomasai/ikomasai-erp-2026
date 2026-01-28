import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useUnreadCount } from '../hooks/useUnreadCount';

/**
 * 未読バッジ付きベルアイコンコンポーネント
 * ヘッダーに表示する通知アイコン
 * 
 * @param {Object} props - プロパティ
 * @param {string} props.userId - ユーザーID
 * @param {Function} props.onPress - クリック時のハンドラー
 * @returns {JSX.Element}
 */
export const NotificationBell = ({ userId, onPress }) => {
  const { unreadCount } = useUnreadCount(userId);

  return (
    <TouchableOpacity
      onPress={onPress}
      className="relative p-2"
      accessibilityLabel="通知"
      accessibilityHint={`未読通知が${unreadCount}件あります`}
    >
      {/* ベルアイコン */}
      <View className="w-6 h-6 items-center justify-center">
        <Text className="text-2xl">🔔</Text>
      </View>

      {/* 未読バッジ */}
      {unreadCount > 0 && (
        <View className="absolute top-0 right-0 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
          <Text className="text-white text-xs font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
