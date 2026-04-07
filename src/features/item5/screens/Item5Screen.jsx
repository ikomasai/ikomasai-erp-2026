/**
 * 迷子検索メイン画面
 * タブ切り替え方式で「迷子登録」「申請履歴」「迷子管理（管理ロールのみ）」を表示する
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { hasRole } from '../../../services/supabase/permissionService';
import { useMissingChildren } from '../hooks/useMissingChildren';
import MissingChildForm from '../components/MissingChildForm';
import MissingChildConfirmModal from '../components/MissingChildConfirmModal';
import MissingChildCard from '../components/MissingChildCard';
import StatusChangeModal from '../components/StatusChangeModal';
import DeleteAllDataSection from '../components/DeleteAllDataSection';
import DebugDatePicker from '../components/DebugDatePicker';
import {
  ADMIN_ROLE_NAMES,
  JITCHO_ROLE_NAME,
  MISSING_CHILD_STATUS,
  MISSING_CHILD_STATUS_LABELS,
} from '../constants';

/** 画面名 */
const SCREEN_NAME = '迷子検索';

/** タブ定義 */
const TAB_REGISTER = 'register';
const TAB_HISTORY = 'history';
const TAB_MANAGE = 'manage';

/** ステータスフィルタの選択肢（管理タブ用） */
const STATUS_FILTER_OPTIONS = [
  { label: '全件', value: null },
  { label: MISSING_CHILD_STATUS_LABELS[MISSING_CHILD_STATUS.PENDING], value: MISSING_CHILD_STATUS.PENDING },
  { label: MISSING_CHILD_STATUS_LABELS[MISSING_CHILD_STATUS.IN_PROGRESS], value: MISSING_CHILD_STATUS.IN_PROGRESS },
  { label: MISSING_CHILD_STATUS_LABELS[MISSING_CHILD_STATUS.ON_HOLD], value: MISSING_CHILD_STATUS.ON_HOLD },
  { label: MISSING_CHILD_STATUS_LABELS[MISSING_CHILD_STATUS.COMPLETED], value: MISSING_CHILD_STATUS.COMPLETED },
];

/**
 * 迷子検索メイン画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 迷子検索画面
 */
const Item5Screen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { userInfo } = useAuth();

  /** ユーザーのロール一覧 */
  const userRoles = userInfo?.roles || [];

  /** 管理ロール（実長 or 渉外部）を持つかどうか */
  const isAdmin = ADMIN_ROLE_NAMES.some((roleName) => hasRole(userRoles, roleName));

  /** 実長ロールを持つかどうか（全データ削除用） */
  const isJitcho = hasRole(userRoles, JITCHO_ROLE_NAME);

  /** 選択中のタブ */
  const [activeTab, setActiveTab] = useState(TAB_REGISTER);

  /** 確認モーダルに渡す迷子情報 */
  const [pendingChildData, setPendingChildData] = useState(null);
  /** 確認モーダル表示状態 */
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  /** 送信中かどうか */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** ステータス変更モーダルの対象 */
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);
  /** ステータス変更モーダル表示状態 */
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);

  /** ステータスフィルタ（管理タブ用） */
  const [statusFilter, setStatusFilter] = useState(null);

  /** デバッグ用日付 */
  const [debugDate, setDebugDate] = useState(null);

  /** 成功メッセージ */
  const [successMessage, setSuccessMessage] = useState('');

  const {
    myChildren,
    allChildren,
    statusCounts,
    totalCount,
    isLoading,
    errorMessage,
    fetchMyChildren,
    fetchAllChildren,
    fetchStatusCounts,
    registerChild,
    updateStatus,
    deleteAll,
    clearError,
  } = useMissingChildren();

  /**
   * 通知から遷移した時のパラメータを監視してタブを切り替える
   */
  useEffect(() => {
    if (route?.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  /**
   * 管理ロールの場合、常にステータス件数を取得（タブバッジ表示用）
   */
  useEffect(() => {
    if (isAdmin) {
      fetchStatusCounts();
    }
  }, [isAdmin, fetchStatusCounts]);

  /**
   * タブ切り替え時にデータを取得する
   */
  useEffect(() => {
    if (activeTab === TAB_HISTORY && userInfo?.user_id) {
      fetchMyChildren(userInfo.user_id);
    } else if (activeTab === TAB_MANAGE && isAdmin) {
      fetchAllChildren(statusFilter);
    }
  }, [activeTab, userInfo?.id, isAdmin, statusFilter, fetchMyChildren, fetchAllChildren]);

  /**
   * 成功メッセージを一定時間後に消す
   */
  useEffect(() => {
    if (successMessage) {
      /** 3秒後にメッセージを消すタイマー */
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  /**
   * フォーム送信時（確認モーダル表示）のハンドラ
   * @param {Object} childData - 入力された迷子情報
   */
  const handleFormSubmit = useCallback((childData) => {
    setPendingChildData(childData);
    setIsConfirmModalVisible(true);
  }, []);

  /**
   * 確認モーダルで「申請する」を押した時のハンドラ
   */
  const handleConfirm = useCallback(async () => {
    if (!pendingChildData || !userInfo?.user_id) return;

    setIsSubmitting(true);

    /** 登録データに登録者IDと送信時刻を追加 */
    const dataWithUser = {
      ...pendingChildData,
      reported_by: userInfo.user_id,
      discovered_at: new Date().toISOString(),
    };

    const { success, notificationError } = await registerChild(dataWithUser, userInfo.user_id);

    setIsSubmitting(false);
    setIsConfirmModalVisible(false);
    setPendingChildData(null);

    if (success) {
      if (notificationError) {
        setSuccessMessage('迷子情報は登録されましたが、通知の送信に失敗しました。');
      } else {
        setSuccessMessage('迷子情報を登録し、通知を送信しました。');
      }
    }
  }, [pendingChildData, userInfo?.id, registerChild]);

  /**
   * 確認モーダルで「キャンセル」を押した時のハンドラ
   */
  const handleCancelConfirm = useCallback(() => {
    setIsConfirmModalVisible(false);
    setPendingChildData(null);
  }, []);

  /**
   * 管理タブでカードの「対応・編集」ボタンを押した時のハンドラ
   * @param {Object} child - 対象の迷子情報
   */
  const handlePressAction = useCallback((child) => {
    setStatusChangeTarget(child);
    setIsStatusModalVisible(true);
  }, []);

  /**
   * ステータス変更モーダルで「更新」を押した時のハンドラ
   * @param {string} id - 迷子情報ID
   * @param {string} status - 新しいステータス
   * @param {string|null} comment - コメント
   * @param {string|null} shelterTent - 保護テント
   * @param {string|null} pickupLocation - 迎え場所
   * @param {string|null} name - 迷子の名前
   */
  const handleStatusUpdate = useCallback(async (id, status, comment, shelterTent, pickupLocation, name) => {
    setIsSubmitting(true);

    /** 通知判定用に変更前の迷子情報を保持 */
    const originalChild = statusChangeTarget;
    const success = await updateStatus(id, status, comment, shelterTent, pickupLocation, name, originalChild, userInfo?.user_id);

    setIsSubmitting(false);
    setIsStatusModalVisible(false);
    setStatusChangeTarget(null);

    if (success) {
      setSuccessMessage('ステータスを更新しました。');
      /* リストを再取得 */
      fetchAllChildren(statusFilter);
      fetchStatusCounts();
    }
  }, [updateStatus, fetchAllChildren, fetchStatusCounts, statusFilter, statusChangeTarget, userInfo?.user_id]);

  /**
   * 全データ削除時のハンドラ
   */
  const handleDeleteAll = useCallback(async () => {
    const success = await deleteAll();
    if (success) {
      setSuccessMessage('全データを削除しました。');
      fetchStatusCounts();
    }
  }, [deleteAll, fetchStatusCounts]);

  /**
   * タブを描画する
   * @returns {JSX.Element} タブバー
   */
  const renderTabs = () => {
    /** タブ定義一覧 */
    const tabs = [
      { key: TAB_REGISTER, label: '迷子登録' },
      { key: TAB_HISTORY, label: '申請履歴' },
    ];

    /* 管理ロールの場合は迷子管理タブを追加 */
    if (isAdmin) {
      tabs.push({ key: TAB_MANAGE, label: '迷子管理' });
    }

    return (
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {tabs.map((tab) => {
          /** 選択中かどうか */
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && { borderBottomColor: theme.primary, borderBottomWidth: 3 },
              ]}
              onPress={() => {
                setActiveTab(tab.key);
                clearError();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.tabLabelContainer}>
                <Text style={[
                  styles.tabText,
                  { color: theme.textSecondary },
                  isActive && { color: theme.primary, fontWeight: '600' },
                ]}>
                  {tab.label}
                </Text>
                {tab.key === TAB_MANAGE && isAdmin && (
                  <>
                    {(() => {
                      /** 未対応+対応中+保留中の合計 */
                      const unreadCount = (statusCounts[MISSING_CHILD_STATUS.PENDING] || 0)
                        + (statusCounts[MISSING_CHILD_STATUS.IN_PROGRESS] || 0)
                        + (statusCounts[MISSING_CHILD_STATUS.ON_HOLD] || 0);
                      return unreadCount > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                      );
                    })()}
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  /**
   * 迷子登録タブの内容を描画する
   * @returns {JSX.Element} 登録タブ
   */
  const renderRegisterTab = () => (
    <View style={styles.tabContent}>
      <MissingChildForm onSubmit={handleFormSubmit} />
    </View>
  );

  /**
   * 申請履歴タブの内容を描画する
   * @returns {JSX.Element} 申請履歴タブ
   */
  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      {isLoading ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : myChildren.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>申請履歴がありません</Text>
        </View>
      ) : (
        <FlatList
          data={myChildren}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MissingChildCard child={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  /**
   * ステータスフィルタバーを描画する
   * @returns {JSX.Element} フィルタバー
   */
  const renderStatusFilter = () => (
    <View style={styles.filterContainer}>
      {STATUS_FILTER_OPTIONS.map((option) => {
        /** 選択中かどうか */
        const isActive = statusFilter === option.value;
        /** バッジを表示するステータス（未対応・対応中・保留中） */
        const BADGE_STATUSES = [
          MISSING_CHILD_STATUS.PENDING,
          MISSING_CHILD_STATUS.IN_PROGRESS,
          MISSING_CHILD_STATUS.ON_HOLD,
        ];
        /** このフィルタに対応するバッジ件数（0件の場合は非表示） */
        const badgeCount = option.value && BADGE_STATUSES.includes(option.value)
          ? (statusCounts[option.value] || 0)
          : 0;
        return (
          <TouchableOpacity
            key={option.label}
            style={[
              styles.filterButton,
              { borderColor: theme.border },
              isActive && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            onPress={() => setStatusFilter(option.value)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterText,
              { color: theme.textSecondary },
              isActive && { color: '#FFFFFF' },
            ]}>
              {option.label}
            </Text>
            {/* 件数バッジ（未対応・対応中・保留中のみ、0件は非表示） */}
            {badgeCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{badgeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  /**
   * 迷子管理タブの内容を描画する
   * @returns {JSX.Element} 管理タブ
   */
  const renderManageTab = () => (
    <View style={styles.tabContent}>
      {/* ステータスフィルタ */}
      {renderStatusFilter()}

      {isLoading ? (
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      ) : allChildren.length === 0 ? (
        <View style={styles.emptyManageContainer}>
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>迷子情報がありません</Text>
          </View>

          {/* リストが空の場合でも全データ削除とデバッグは表示（実長のみ） */}
          {isJitcho && (
            <View style={styles.listContent}>
              <DeleteAllDataSection
                statusCounts={statusCounts}
                totalCount={totalCount}
                onDelete={handleDeleteAll}
                isDeleting={isLoading}
                debugDate={debugDate}
              />
              <DebugDatePicker debugDate={debugDate} onDateChange={setDebugDate} />
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={allChildren}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MissingChildCard
              child={item}
              showReporterName
              showActionButton
              onPressAction={handlePressAction}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <>
              {/* 全データ削除セクション（実長のみ） */}
              {isJitcho && (
                <DeleteAllDataSection
                  statusCounts={statusCounts}
                  totalCount={totalCount}
                  onDelete={handleDeleteAll}
                  isDeleting={isLoading}
                  debugDate={debugDate}
                />
              )}

              {/* デバッグ用日付操作（実長のみ） */}
              {isJitcho && (
                <DebugDatePicker debugDate={debugDate} onDateChange={setDebugDate} />
              )}

              {/* フッターの余白 */}
              <View style={styles.footerSpacer} />
            </>
          }
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      {/* 成功メッセージ */}
      {successMessage !== '' && (
        <View style={[styles.successBar, { backgroundColor: '#4CAF50' }]}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {/* エラーメッセージ */}
      {errorMessage && (
        <View style={[styles.errorBar, { backgroundColor: '#F44336' }]}>
          <Text style={styles.errorBarText}>{errorMessage}</Text>
          <TouchableOpacity onPress={clearError} activeOpacity={0.7}>
            <Text style={styles.errorDismiss}>閉じる</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* タブバー */}
      {renderTabs()}

      {/* タブコンテンツ */}
      {activeTab === TAB_REGISTER && renderRegisterTab()}
      {activeTab === TAB_HISTORY && renderHistoryTab()}
      {activeTab === TAB_MANAGE && renderManageTab()}

      {/* 確認モーダル */}
      <MissingChildConfirmModal
        isVisible={isConfirmModalVisible}
        childData={pendingChildData}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        isSubmitting={isSubmitting}
      />

      {/* ステータス変更モーダル */}
      <StatusChangeModal
        isVisible={isStatusModalVisible}
        child={statusChangeTarget}
        onSubmit={handleStatusUpdate}
        onClose={() => { setIsStatusModalVisible(false); setStatusChangeTarget(null); }}
        isSubmitting={isSubmitting}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  /** 画面コンテナ */
  container: {
    flex: 1,
  },
  /** タブバー */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  /** タブ */
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  /** タブテキスト */
  tabText: {
    fontSize: 14,
  },
  /** タブラベルコンテナ（テキスト+バッジ） */
  tabLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** バッジ */
  badge: {
    backgroundColor: '#F44336',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** バッジテキスト */
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  /** タブコンテンツ */
  tabContent: {
    flex: 1,
  },
  /** リストコンテンツ */
  listContent: {
    padding: 16,
  },
  /** ローダー */
  loader: {
    marginTop: 40,
  },
  /** 空リストコンテナ */
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  /** 管理タブの空コンテナ（削除セクションも表示するためflex:1） */
  emptyManageContainer: {
    flex: 1,
  },
  /** 空リストテキスト */
  emptyText: {
    fontSize: 14,
  },
  /** フィルタコンテナ */
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  /** フィルタボタン */
  filterButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  /** フィルタテキスト */
  filterText: {
    fontSize: 12,
  },
  /** フィルタバッジ（件数表示の赤丸） */
  filterBadge: {
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  /** フィルタバッジのテキスト */
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  /** 成功メッセージバー */
  successBar: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  /** 成功テキスト */
  successText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  /** エラーメッセージバー */
  errorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  /** エラーテキスト */
  errorBarText: {
    color: '#FFFFFF',
    fontSize: 13,
    flex: 1,
  },
  /** エラー閉じるボタン */
  errorDismiss: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  /** フッターの余白 */
  footerSpacer: {
    height: 40,
  },
});

export default Item5Screen;
