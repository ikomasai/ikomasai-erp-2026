import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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
      style={[styles.container, isRead ? styles.containerRead : styles.containerUnread]}
      accessibilityLabel={`${config.displayName}の通知: ${notification.message}`}
    >
      <View style={styles.content}>
        {/* 通知アイコン */}
        <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
          <Text style={styles.iconText}>{config.icon}</Text>
        </View>

        <View style={styles.textContainer}>
          {/* タイトル */}
          {notification.title && (
            <Text style={styles.title}>
              {notification.title}
            </Text>
          )}

          {/* メッセージ */}
          <Text style={styles.message} numberOfLines={2}>
            {notification.message}
          </Text>

          {/* メタ情報 */}
          <View style={styles.metaContainer}>
            <View style={[styles.typeBadge, { backgroundColor: `${config.color}20` }]}>
              <Text style={[styles.typeBadgeText, { color: config.color }]}>
                {config.displayName}
              </Text>
            </View>

            <Text style={styles.timestamp}>
              {formatRelativeTime(notification.created_at)}
            </Text>
          </View>
        </View>

        {/* 未読インジケーター */}
        {!isRead && (
          <View style={styles.unreadIndicator} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
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
  containerRead: {
    backgroundColor: '#FFFFFF',
  },
  containerUnread: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  unreadIndicator: {
    width: 10,
    height: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 5,
    marginLeft: 8,
    marginTop: 4,
  },
});
