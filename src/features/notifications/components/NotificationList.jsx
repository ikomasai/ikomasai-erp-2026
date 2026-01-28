import React from 'react';
import { View, FlatList, Text, ActivityIndicator } from 'react-native';
import { NotificationItem } from './NotificationItem';

/**
 * 通知リスト表示コンポーネント
 * 
 * @param {Object} props - プロパティ
 * @param {Array} props.notifications - 通知の配列
 * @param {boolean} [props.isLoading=false] - ローディング状態
 * @param {Function} props.onNotificationPress - 通知クリック時のハンドラー
 * @param {Function} [props.onRefresh] - リフレッシュ時のハンドラー
 * @param {Function} [props.onEndReached] - リストの最後に到達時のハンドラー
 * @returns {JSX.Element}
 */
export const NotificationList = ({
  notifications,
  isLoading = false,
  onNotificationPress,
  onRefresh,
  onEndReached,
}) => {
  /**
   * 通知が既読かどうかを判定
   * @param {Object} notification - 通知オブジェクト
   * @returns {boolean}
   */
  const isNotificationRead = (notification) => {
    return notification.notification_reads && notification.notification_reads.length > 0;
  };

  /**
   * 空の状態を表示
   * @returns {JSX.Element}
   */
  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-6xl mb-4">📭</Text>
      <Text className="text-lg font-semibold text-gray-700 mb-2">
        通知はありません
      </Text>
      <Text className="text-sm text-gray-500 text-center">
        新しい通知が届くとここに表示されます
      </Text>
    </View>
  );

  /**
   * ローディング中の表示
   * @returns {JSX.Element}
   */
  const renderLoadingState = () => (
    <View className="flex-1 items-center justify-center p-8">
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text className="text-sm text-gray-500 mt-4">読み込み中...</Text>
    </View>
  );

  /**
   * 各通知アイテムをレンダリング
   * @param {Object} item - 通知オブジェクト
   * @returns {JSX.Element}
   */
  const renderItem = ({ item }) => (
    <NotificationItem
      notification={item}
      onPress={onNotificationPress}
      isRead={isNotificationRead(item)}
    />
  );

  if (isLoading && notifications.length === 0) {
    return renderLoadingState();
  }

  return (
    <FlatList
      data={notifications}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={renderEmptyState}
      onRefresh={onRefresh}
      refreshing={isLoading}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={
        notifications.length === 0 ? { flex: 1 } : undefined
      }
    />
  );
};
