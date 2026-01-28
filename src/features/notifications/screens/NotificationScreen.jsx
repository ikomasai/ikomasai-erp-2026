import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { NotificationList } from '../components/NotificationList';
import { useNotifications } from '../hooks/useNotifications';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../../shared/services/notificationService';
import { NOTIFICATION_TYPES } from '../constants/notificationType';
import { useAuth } from '../../../shared/contexts/AuthContext';

/**
 * 通知画面コンポーネント
 * 全通知履歴を表示するページ
 * 
 * @param {Object} props - プロパティ
 * @param {Object} props.navigation - ナビゲーションオブジェクト
 * @returns {JSX.Element}
 */
export const NotificationScreen = ({ navigation }) => {
  /** 認証情報取得 */
  const { user } = useAuth();
  const userId = user?.id;

  /** 選択中のフィルター */
  const [selectedFilter, setSelectedFilter] = useState(null);
  
  /** 通知データ */
  const { notifications, isLoading, refetch } = useNotifications({
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
    if (!userId) return;

    try {
      // 既読にする（409エラーは無視）
      await markNotificationAsRead(notification.id, userId);
    } catch (error) {
      // 既に既読の場合（409エラー）は無視
      if (error.message?.includes('409') || error.message?.includes('Conflict')) {
        console.log('既に既読の通知です');
      } else {
        console.error('既読化エラー:', error);
      }
    }

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
    if (!userId) return;

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
      { label: 'すべて', value: null, icon: '📋' },
      { label: '情報', value: NOTIFICATION_TYPES.INFO, icon: 'ℹ️' },
      { label: '成功', value: NOTIFICATION_TYPES.SUCCESS, icon: '✅' },
      { label: '警告', value: NOTIFICATION_TYPES.WARNING, icon: '⚠️' },
      { label: 'エラー', value: NOTIFICATION_TYPES.ERROR, icon: '❌' },
    ];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.label}
            onPress={() => setSelectedFilter(filter.value)}
            style={[
              styles.filterButton,
              selectedFilter === filter.value && styles.filterButtonActive
            ]}
          >
            <Text style={styles.filterIcon}>{filter.icon}</Text>
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter.value && styles.filterTextActive
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerIcon}>🔔</Text>
            <Text style={styles.headerTitle}>通知センター</Text>
          </View>
          
          {/* すべて既読ボタン */}
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            disabled={isMarkingAllRead || notifications.length === 0}
            style={[
              styles.markAllButton,
              (isMarkingAllRead || notifications.length === 0) && styles.markAllButtonDisabled
            ]}
          >
            <Text style={styles.markAllButtonText}>
              {isMarkingAllRead ? '⏳ 処理中...' : '✓ すべて既読'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#6366F1',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 5,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  markAllButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  markAllButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  markAllButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  filterButtonActive: {
    backgroundColor: '#6366F1',
  },
  filterIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
});
