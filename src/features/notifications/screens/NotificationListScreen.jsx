/**
 * 通知一覧画面
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../../shared/services/notificationService';
import {
  getNavigationTargetByType,
  getNavigationButtonLabel,
} from '../../../shared/utils/notificationNavigation';

/** 画面名 */
const SCREEN_NAME = '通知一覧';

/**
 * 通知一覧画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationオブジェクト
 * @returns {JSX.Element} 通知一覧画面
 */
const NotificationListScreen = ({ navigation }) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 認証コンテキスト */
  const { user } = useAuth();
  /** 通知一覧 */
  const [items, setItems] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** フィルター */
  const [filter, setFilter] = useState('all');
  /** 詳細モーダルに表示する通知（null のとき非表示） */
  const [selectedItem, setSelectedItem] = useState(null);
  /** 画面を開いた時点で未読だった通知のrecipientIdセット（NEWバッジ表示用） */
  const [newItemIds, setNewItemIds] = useState(new Set());

  /**
   * 通知一覧を読み込む
   * ロード時点で readAt が null の通知を「新着」として newItemIds に記録する
   */
  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    const { items: fetchedItems, error } = await getNotificationsForUser(user.id);
    if (error) {
      setErrorMessage('通知の取得に失敗しました');
      setIsLoading(false);
      return;
    }
    /** ロード時点で未読の通知IDセット（NEWバッジ用） */
    const unreadIds = new Set(fetchedItems.filter((i) => !i.readAt).map((i) => i.recipientId));
    setNewItemIds(unreadIds);
    setItems(fetchedItems);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  /**
   * 自動更新：60秒ごとに通知一覧を再取得する
   * マウント中はポーリングを継続し、アンマウント時にインターバルをクリアする
   */
  useEffect(() => {
    /** 60秒間隔の更新タイマー */
    const interval = setInterval(loadNotifications, 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  /**
   * 画面を離れた時（別タブへ移動等）に残った未読を全て既読にしてNEWバッジをクリア
   * モーダルを開かずに離れたケースの補完として機能する
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (!user?.id) {
        return;
      }
      // モーダルを開かなかった未読通知を一括で既読化（補完処理）
      markAllNotificationsRead(user.id);
      setNewItemIds(new Set());
    });
    return unsubscribe;
  }, [navigation, user?.id]);

  /**
   * 通知をタップした時の処理（詳細モーダルを開き、未読なら即座に既読化する）
   * @param {Object} item - 通知アイテム
   */
  const handlePressItem = (item) => {
    setSelectedItem(item);

    // 未読の場合はモーダルを開いた時点で即座に既読化する
    if (!item.readAt) {
      const now = new Date().toISOString();
      // DBを更新
      markNotificationRead(item.recipientId);
      // items の readAt を楽観的に更新
      setItems((prev) =>
        prev.map((row) =>
          row.recipientId === item.recipientId ? { ...row, readAt: now } : row
        )
      );
      // NEWバッジを該当通知だけ消す
      setNewItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.recipientId);
        return next;
      });
    }
  };

  /**
   * 詳細モーダルを閉じる
   */
  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  /**
   * 詳細モーダルの「確認する」ボタンを押した時の処理
   * 該当画面（タブ）へ遷移してモーダルを閉じる
   */
  const handleNavigateFromDetail = () => {
    if (!selectedItem) {
      return;
    }
    /** 通知タイプ */
    const type = selectedItem.notification?.metadata?.type;
    /** 遷移先情報 */
    const target = getNavigationTargetByType(type);
    if (!target) {
      return;
    }
    setSelectedItem(null);
    navigation.navigate(target.screen, { initialTab: target.tab });
  };

  /**
   * 通知アイテムを描画
   * @param {Object} param - FlatListのrenderItem引数
   * @returns {JSX.Element} 通知カード
   */
  const renderItem = ({ item }) => {
    /** 画面を開いた時点で未読だったかどうか（NEWバッジ表示に使用） */
    const isNew = newItemIds.has(item.recipientId);
    /** 通知タイトル */
    const title = item.notification?.title ?? '（タイトルなし）';
    /** 通知本文 */
    const body = item.notification?.body ?? '';
    /** 作成日時 */
    const createdAt = item.notification?.created_at ?? item.createdAt;
    /** 作成日時の表示文字列 */
    const createdText = createdAt ? new Date(createdAt).toLocaleString() : '';

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: isNew ? theme.primary : theme.border,
          },
        ]}
        onPress={() => handlePressItem(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
          {isNew && (
            <View style={[styles.newBadge, { borderColor: theme.primary }]}>
              <Text style={[styles.newBadgeText, { color: theme.primary }]}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]} numberOfLines={2}>
          {body}
        </Text>
        <Text style={[styles.cardDate, { color: theme.textSecondary }]}>{createdText}</Text>
      </TouchableOpacity>
    );
  };

  /** フィルター適用済み通知一覧 */
  const filteredItems = items.filter((item) => {
    if (filter === 'unread') {
      return !item.readAt;
    }
    if (filter === 'read') {
      return !!item.readAt;
    }
    return true;
  });

  /** 詳細モーダルに表示する通知の情報 */
  const detailTitle = selectedItem?.notification?.title ?? '';
  const detailBody = selectedItem?.notification?.body ?? '';
  const detailCreatedAt = selectedItem?.notification?.created_at ?? selectedItem?.createdAt;
  const detailCreatedText = detailCreatedAt ? new Date(detailCreatedAt).toLocaleString() : '';
  const detailType = selectedItem?.notification?.metadata?.type;
  /** 「確認する」ボタンのラベル（null のとき非表示） */
  const navigateButtonLabel = getNavigationButtonLabel(detailType);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.refreshButton, { borderColor: theme.border }]}
          onPress={loadNotifications}
        >
          <Text style={{ color: theme.text }}>更新</Text>
        </TouchableOpacity>
        <View style={styles.filterGroup}>
          {[
            { key: 'all', label: '全て' },
            { key: 'unread', label: '未読のみ' },
            { key: 'read', label: '既読のみ' },
          ].map((option) => {
            const isActive = filter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor: isActive ? theme.primary : theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setFilter(option.key)}
              >
                <Text style={{ color: isActive ? '#fff' : theme.text }}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {errorMessage !== '' && (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
        </View>
      )}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.recipientId}
        renderItem={renderItem}
        contentContainerStyle={filteredItems.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            通知はまだありません
          </Text>
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadNotifications} />
        }
      />

      {/* 通知詳細モーダル */}
      <Modal
        visible={selectedItem !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            {/* モーダルヘッダー */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                {detailTitle}
              </Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseDetail}>
                <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>×</Text>
              </TouchableOpacity>
            </View>

            {/* 本文エリア（スクロール可能） */}
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
            >
              <Text style={[styles.modalBodyText, { color: theme.text }]}>{detailBody}</Text>
              <Text style={[styles.modalDate, { color: theme.textSecondary }]}>
                {detailCreatedText}
              </Text>
            </ScrollView>

            {/* フッター：確認するボタン */}
            <View style={[styles.modalFooter, { borderTopColor: theme.border }]}>
              {navigateButtonLabel ? (
                <TouchableOpacity
                  style={[styles.navigateButton, { backgroundColor: theme.primary }]}
                  onPress={handleNavigateFromDetail}
                >
                  <Text style={styles.navigateButtonText}>{navigateButtonLabel}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={handleCloseDetail}
              >
                <Text style={[styles.closeButtonText, { color: theme.text }]}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  errorContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 14,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  newBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardBody: {
    marginTop: 8,
    fontSize: 14,
  },
  cardDate: {
    marginTop: 8,
    fontSize: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
  },
  /* 詳細モーダル */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    lineHeight: 24,
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 22,
    lineHeight: 28,
  },
  modalBody: {
    maxHeight: 300,
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  modalBodyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  modalDate: {
    fontSize: 12,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  navigateButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  navigateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

export default NotificationListScreen;
