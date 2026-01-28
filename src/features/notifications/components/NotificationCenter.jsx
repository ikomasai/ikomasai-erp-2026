import React, { useState } from 'react';
import { View, Modal, TouchableOpacity, Text } from 'react-native';
import { NotificationList } from './NotificationList';
import { useNotifications } from '../hooks/useNotifications';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../../shared/services/notificationService';

/**
 * 通知センターコンポーネント
 * モーダルで通知一覧を表示
 * 
 * @param {Object} props - プロパティ
 * @param {boolean} props.visible - モーダルの表示状態
 * @param {Function} props.onClose - モーダルを閉じる時のハンドラー
 * @param {string} props.userId - ユーザーID
 * @param {Function} [props.onNotificationClick] - 通知クリック時のハンドラー
 * @returns {JSX.Element}
 */
export const NotificationCenter = ({ visible, onClose, userId, onNotificationClick }) => {
  /** 通知データ */
  const { notifications, isLoading, refetch } = useNotifications(userId, { limit: 50 });

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

    // カスタムハンドラーを呼び出し
    if (onNotificationClick) {
      onNotificationClick(notification);
    }

    // deepLinkがある場合は画面遷移
    if (notification.deep_link) {
      // TODO: ナビゲーション処理を実装
      console.log('Navigate to:', notification.deep_link);
    }

    // モーダルを閉じる
    onClose();
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        {/* ヘッダー */}
        <View className="bg-blue-600 pt-12 pb-4 px-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-white text-xl font-bold">通知</Text>
            
            <View className="flex-row">
              {/* すべて既読ボタン */}
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                disabled={isMarkingAllRead || notifications.length === 0}
                className="mr-4"
              >
                <Text className="text-white text-sm">
                  {isMarkingAllRead ? '処理中...' : 'すべて既読'}
                </Text>
              </TouchableOpacity>

              {/* 閉じるボタン */}
              <TouchableOpacity onPress={onClose}>
                <Text className="text-white text-2xl">✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 通知リスト */}
        <NotificationList
          notifications={notifications}
          isLoading={isLoading}
          onNotificationPress={handleNotificationPress}
          onRefresh={refetch}
        />
      </View>
    </Modal>
  );
};
