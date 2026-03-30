/**
 * アクセス権限制御画面
 * ロールごとの画面アクセス権限（permissions.screens）をGUIで確認・編集する
 * 「ロール別」「項目別」の2タブで操作可能
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import usePermissionManage from '../hooks/usePermissionManage';
import { MANAGED_SCREENS, TAB_TYPES } from '../constants';
import RoleListPanel from '../components/RoleListPanel';
import ScreenListPanel from '../components/ScreenListPanel';
import PermissionCheckList from '../components/PermissionCheckList';

/** 画面名 */
const SCREEN_NAME = 'アクセス権限制御';
/** モバイルブレークポイント */
const MOBILE_BREAKPOINT = 768;

/**
 * アクセス権限制御画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} アクセス権限制御画面
 */
const Item7Screen = ({ navigation }) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 画面幅 */
  const { width } = useWindowDimensions();
  /** モバイル判定 */
  const isMobile = width < MOBILE_BREAKPOINT;

  /** 権限管理フック */
  const {
    roles,
    filteredRoles,
    filteredScreens,
    isLoading,
    isSaving,
    errorMessage,
    activeTab,
    selectedRoleId,
    selectedScreenIndex,
    roleSearchText,
    screenSearchText,
    roleScreenCounts,
    screenRoleCounts,
    currentRoleScreens,
    currentScreenRoleIds,
    hasRoleChanges,
    hasScreenChanges,
    setActiveTab,
    setRoleSearchText,
    setScreenSearchText,
    selectRole,
    toggleRoleScreen,
    saveRoleScreens,
    resetRoleScreens,
    selectScreen,
    toggleScreenRole,
    selectAllRolesForScreen,
    deselectAllRolesForScreen,
    saveScreenRoles,
    resetScreenRoles,
    fetchRoles,
    checkIsProtected,
  } = usePermissionManage();

  // ==================== ロール別タブ: チェックリストデータ ====================

  /**
   * ロール別タブ: 選択中ロールのチェックリスト項目
   * @type {Array<{id: string, label: string, isChecked: boolean, isDisabled: boolean}>}
   */
  const roleCheckItems = useMemo(() => {
    if (!selectedRoleId) {
      return [];
    }
    /** 選択中ロールの名前を取得 */
    const selectedRole = roles.find((r) => r.id === selectedRoleId);
    const roleName = selectedRole?.name || '';

    return MANAGED_SCREENS.map((screen) => ({
      id: screen.permissionName,
      label: screen.label,
      isChecked: currentRoleScreens.includes(screen.permissionName),
      isDisabled: checkIsProtected(roleName, screen.permissionName),
    }));
  }, [selectedRoleId, roles, currentRoleScreens, checkIsProtected]);

  /**
   * 選択中ロールの表示名
   * @type {string}
   */
  const selectedRoleName = useMemo(() => {
    const role = roles.find((r) => r.id === selectedRoleId);
    return role?.display_name || role?.name || '';
  }, [selectedRoleId, roles]);

  // ==================== 項目別タブ: チェックリストデータ ====================

  /**
   * 項目別タブ: 選択中項目のチェックリスト項目（ロール一覧）
   * @type {Array<{id: string, label: string, isChecked: boolean, isDisabled: boolean}>}
   */
  const screenCheckItems = useMemo(() => {
    if (selectedScreenIndex === null) {
      return [];
    }
    const screen = MANAGED_SCREENS[selectedScreenIndex];
    if (!screen) {
      return [];
    }

    return roles.map((role) => ({
      id: role.id,
      label: role.display_name || role.name,
      isChecked: currentScreenRoleIds.has(role.id),
      isDisabled: checkIsProtected(role.name, screen.permissionName),
    }));
  }, [selectedScreenIndex, roles, currentScreenRoleIds, checkIsProtected]);

  /**
   * 選択中項目の表示名
   * @type {string}
   */
  const selectedScreenName = useMemo(() => {
    if (selectedScreenIndex === null) {
      return '';
    }
    return MANAGED_SCREENS[selectedScreenIndex]?.label || '';
  }, [selectedScreenIndex]);

  // ==================== 保存処理（確認ダイアログ付き） ====================

  /**
   * ロール別タブ: 保存処理（確認ダイアログ付き）
   */
  const handleSaveRoleScreens = useCallback(async () => {
    const confirmed = window.confirm(`「${selectedRoleName}」のアクセス権限を更新しますか？`);
    if (!confirmed) {
      return;
    }
    const { success, error } = await saveRoleScreens();
    if (success) {
      window.alert('権限を更新しました');
    } else if (error) {
      window.alert(error);
    }
  }, [selectedRoleName, saveRoleScreens]);

  /**
   * 項目別タブ: 保存処理（確認ダイアログ付き）
   */
  const handleSaveScreenRoles = useCallback(async () => {
    const confirmed = window.confirm(`「${selectedScreenName}」のアクセス権限を更新しますか？`);
    if (!confirmed) {
      return;
    }
    const { success, error } = await saveScreenRoles();
    if (success) {
      window.alert('権限を更新しました');
    } else if (error) {
      window.alert(error);
    }
  }, [selectedScreenName, saveScreenRoles]);

  // ==================== モバイル: 戻るボタン ====================

  /**
   * モバイル時に詳細パネルが表示されているか
   * @type {boolean}
   */
  const isShowingDetail = isMobile && (
    (activeTab === TAB_TYPES.ROLE && selectedRoleId !== null) ||
    (activeTab === TAB_TYPES.SCREEN && selectedScreenIndex !== null)
  );

  /**
   * モバイル: 一覧に戻る
   */
  const handleBackToList = useCallback(() => {
    if (activeTab === TAB_TYPES.ROLE) {
      selectRole(null);
    } else {
      selectScreen(null);
    }
  }, [activeTab, selectRole, selectScreen]);

  // ==================== ローディング表示 ====================

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            ロール情報を読み込み中...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== メイン描画 ====================

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      {/* エラーメッセージ */}
      {errorMessage && (
        <View style={[styles.errorBanner, { backgroundColor: theme.error + '15' }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          <TouchableOpacity onPress={fetchRoles} activeOpacity={0.7}>
            <Text style={[styles.retryText, { color: theme.primary }]}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* タブ切替 */}
      <View style={[styles.tabContainer, { borderBottomColor: theme.border }]}>
        {/* モバイル: 戻るボタン */}
        {isShowingDetail && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToList}
            activeOpacity={0.7}
          >
            <Text style={[styles.backButtonText, { color: theme.primary }]}>← 一覧</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === TAB_TYPES.ROLE && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab(TAB_TYPES.ROLE)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === TAB_TYPES.ROLE ? theme.primary : theme.textSecondary },
            ]}
          >
            ロール別
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === TAB_TYPES.SCREEN && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab(TAB_TYPES.SCREEN)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === TAB_TYPES.SCREEN ? theme.primary : theme.textSecondary },
            ]}
          >
            項目別
          </Text>
        </TouchableOpacity>
      </View>

      {/* メインコンテンツ */}
      <View style={[styles.mainContent, isMobile && styles.mainContentMobile]}>
        {/* ロール別タブ */}
        {activeTab === TAB_TYPES.ROLE && (
          <>
            {/* 左パネル: ロール一覧（モバイル時は詳細未選択時のみ表示） */}
            {(!isMobile || !selectedRoleId) && (
              <View style={[styles.listPanel, isMobile && styles.listPanelMobile]}>
                <RoleListPanel
                  roles={filteredRoles}
                  selectedRoleId={selectedRoleId}
                  onSelectRole={selectRole}
                  roleScreenCounts={roleScreenCounts}
                  searchText={roleSearchText}
                  onSearchTextChange={setRoleSearchText}
                  theme={theme}
                />
              </View>
            )}

            {/* 右パネル: チェックリスト */}
            {(!isMobile || selectedRoleId) && (
              <View style={[styles.detailPanel, isMobile && styles.detailPanelMobile]}>
                {selectedRoleId ? (
                  <PermissionCheckList
                    title={`${selectedRoleName} のアクセス権限`}
                    items={roleCheckItems}
                    onToggle={toggleRoleScreen}
                    onSave={handleSaveRoleScreens}
                    onReset={resetRoleScreens}
                    hasChanges={hasRoleChanges}
                    isSaving={isSaving}
                    theme={theme}
                  />
                ) : (
                  <View style={[styles.placeholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                      左のリストからロールを選択してください
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* 項目別タブ */}
        {activeTab === TAB_TYPES.SCREEN && (
          <>
            {/* 左パネル: 項目一覧 */}
            {(!isMobile || selectedScreenIndex === null) && (
              <View style={[styles.listPanel, isMobile && styles.listPanelMobile]}>
                <ScreenListPanel
                  screens={filteredScreens}
                  selectedScreenIndex={selectedScreenIndex}
                  onSelectScreen={selectScreen}
                  screenRoleCounts={screenRoleCounts}
                  searchText={screenSearchText}
                  onSearchTextChange={setScreenSearchText}
                  theme={theme}
                />
              </View>
            )}

            {/* 右パネル: チェックリスト */}
            {(!isMobile || selectedScreenIndex !== null) && (
              <View style={[styles.detailPanel, isMobile && styles.detailPanelMobile]}>
                {selectedScreenIndex !== null ? (
                  <PermissionCheckList
                    title={`${selectedScreenName} にアクセスできるロール`}
                    items={screenCheckItems}
                    onToggle={toggleScreenRole}
                    onSave={handleSaveScreenRoles}
                    onReset={resetScreenRoles}
                    hasChanges={hasScreenChanges}
                    isSaving={isSaving}
                    theme={theme}
                    onSelectAll={selectAllRolesForScreen}
                    onDeselectAll={deselectAllRolesForScreen}
                  />
                ) : (
                  <View style={[styles.placeholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                      左のリストから項目を選択してください
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  /** 画面コンテナ */
  container: {
    flex: 1,
  },
  /** ローディングコンテナ */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  /** ローディングテキスト */
  loadingText: {
    fontSize: 14,
  },
  /** エラーバナー */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  /** エラーテキスト */
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  /** 再読み込みテキスト */
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  /** タブコンテナ */
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  /** タブ */
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  /** タブテキスト */
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** 戻るボタン */
  backButton: {
    paddingVertical: 12,
    paddingRight: 12,
  },
  /** 戻るボタンテキスト */
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** メインコンテンツ（PC） */
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  /** メインコンテンツ（モバイル） */
  mainContentMobile: {
    flexDirection: 'column',
    padding: 12,
    gap: 0,
  },
  /** 左パネル（PC） */
  listPanel: {
    flex: 1,
    maxWidth: 320,
  },
  /** 左パネル（モバイル） */
  listPanelMobile: {
    flex: 1,
    maxWidth: '100%',
  },
  /** 右パネル（PC） */
  detailPanel: {
    flex: 2,
  },
  /** 右パネル（モバイル） */
  detailPanelMobile: {
    flex: 1,
  },
  /** プレースホルダー */
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  /** プレースホルダーテキスト */
  placeholderText: {
    fontSize: 14,
  },
});

export default Item7Screen;
