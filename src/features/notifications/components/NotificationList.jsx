import React from 'react';
import { View, FlatList, Text, ActivityIndicator, StyleSheet } from 'react-native';
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
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>
        通知はありません
      </Text>
      <Text style={styles.emptyDescription}>
        新しい通知が届くとここに表示されます
      </Text>
    </View>
  );

  /**
   * ローディング中の表示
   * @returns {JSX.Element}
   */
  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text style={styles.loadingText}>読み込み中...</Text>
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
        notifications.length === 0 ? styles.emptyList : styles.listContent
      }
      style={styles.list}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 16,
  },
});
