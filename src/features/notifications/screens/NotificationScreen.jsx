import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { NotificationList } from '../components/NotificationList';
import { useNotifications } from '../hooks/useNotifications';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../../shared/services/notificationService';
import { NOTIFICATION_TYPES } from '../constants/notificationType';

/**
 * 通知画面コンポーネント
 * 全通知履歴を表示するページ
 * 
 * @param {Object} props - プロパティ
 * @param {Object} props.navigation - ナビゲーションオブジェクト
 * @param {string} props.userId - ユーザーID（AuthContextから取得想定）
 * @returns {JSX.Element}
 */
export const NotificationScreen = ({ navigation, userId = 'dummy-user-id' }) => {
  /** 選択中のフィルター */
  const [selectedFilter, setSelectedFilter] = useState(null);
  
  /** 通知データ */
  const { notifications, isLoading, refetch } = useNotifications(userId, {
    limit: 100,
    filterByType: selectedFilter,
  });

  /** 全既読処理中フラグ */
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  /**
   * 通知をクリックした時の処理
   * @param {Object} notification - 通知オブジェクト
   */
  const handleNotificationPress = async (notification) => {
    // 既読にする
    await markNotificationAsRead(notification.id, userId);

    // 通知リストを更新
    refetch();

    // deepLinkがある場合は画面遷移
    if (notification.deep_link) {
      // TODO: ナビゲーション処理を実装
      console.log('Navigate to:', notification.deep_link);
    }
  };

  /**
   * すべて既読にする
   */
  const handleMarkAllAsRead = async () => {
    try {
      setIsMarkingAllRead(true);
      await markAllNotificationsAsRead(userId);
      refetch();
    } catch (error) {
      console.error('一括既読化に失敗しました:', error);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  /**
   * フィルターボタンをレンダリング
   * @returns {JSX.Element}
   */
  const renderFilters = () => {
    const filters = [
      { label: 'すべて', value: null },
      { label: '情報', value: NOTIFICATION_TYPES.INFO },
      { label: '成功', value: NOTIFICATION_TYPES.SUCCESS },
      { label: '警告', value: NOTIFICATION_TYPES.WARNING },
      { label: 'エラー', value: NOTIFICATION_TYPES.ERROR },
    ];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 py-2"
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.label}
            onPress={() => setSelectedFilter(filter.value)}
            className={`mr-2 px-4 py-2 rounded-full ${
              selectedFilter === filter.value
                ? 'bg-blue-600'
                : 'bg-gray-200'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                selectedFilter === filter.value
                  ? 'text-white'
                  : 'text-gray-700'
              }`}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-white">
      {/* ヘッダー */}
      <View className="bg-blue-600 pt-12 pb-4 px-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-white text-2xl font-bold">通知履歴</Text>
          
          {/* すべて既読ボタン */}
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            disabled={isMarkingAllRead || notifications.length === 0}
            className="bg-white/20 px-3 py-2 rounded"
          >
            <Text className="text-white text-sm font-medium">
              {isMarkingAllRead ? '処理中...' : 'すべて既読'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* フィルター */}
      {renderFilters()}

      {/* 通知リスト */}
      <NotificationList
        notifications={notifications}
        isLoading={isLoading}
        onNotificationPress={handleNotificationPress}
        onRefresh={refetch}
      />
    </View>
  );
};
