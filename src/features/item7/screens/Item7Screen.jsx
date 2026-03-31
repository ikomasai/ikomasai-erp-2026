/**
 * アクセス権限制御画面
 * ロールごとの画面アクセス権限（permissions.screens）をGUIで確認・編集する
 * 「ロール別」「項目別」「ユーザ管理」の3タブで操作可能
 * ロールの新規作成・削除、ユーザーのロール付け外しも行える
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import usePermissionManage from '../hooks/usePermissionManage';
import useUserRoleManage, { NO_ROLE_PSEUDO_ID } from '../hooks/useUserRoleManage';
import { MANAGED_SCREENS, PROTECTED_PERMISSIONS, TAB_TYPES, SENSITIVE_ROLES } from '../constants';
import RoleListPanel from '../components/RoleListPanel';
import ScreenListPanel from '../components/ScreenListPanel';
import PermissionCheckList from '../components/PermissionCheckList';
import RoleCreateScreen from '../components/RoleCreateScreen';
import UserListPanel from '../components/UserListPanel';

/** 画面名 */
const SCREEN_NAME = 'アクセス権限制御';
/** モバイルブレークポイント */
const MOBILE_BREAKPOINT = 768;

/** ビューの種類 */
const VIEW_TYPES = {
  /** メインビュー（タブ切替） */
  MAIN: 'main',
  /** ロール作成ビュー */
  CREATE_ROLE: 'createRole',
};

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
  /** 現在のビュー */
  const [currentView, setCurrentView] = useState(VIEW_TYPES.MAIN);

  /**
   * 確認/アラートモーダルの状態
   * isAlert=true の場合はキャンセルボタンなし（アラート扱い）
   */
  const [dialogModal, setDialogModal] = useState({
    /** 表示フラグ */
    visible: false,
    /** タイトル（省略可） */
    title: '',
    /** メッセージ本文 */
    message: '',
    /** 確認ボタンラベル */
    confirmText: 'OK',
    /** アラートモード（キャンセルボタン非表示） */
    isAlert: false,
    /** 確認時のコールバック */
    onConfirm: null,
  });

  /**
   * 確認モーダルを表示する
   * @param {string} title - タイトル
   * @param {string} message - メッセージ
   * @param {Function} onConfirm - 確認ボタン押下時のコールバック
   * @param {string} [confirmText] - 確認ボタンのラベル
   */
  const showConfirm = useCallback((title, message, onConfirm, confirmText = '実行') => {
    setDialogModal({ visible: true, title, message, confirmText, isAlert: false, onConfirm });
  }, []);

  /**
   * アラートモーダルを表示する
   * @param {string} title - タイトル
   * @param {string} message - メッセージ
   */
  const showAlert = useCallback((title, message) => {
    setDialogModal({ visible: true, title, message, confirmText: '閉じる', isAlert: true, onConfirm: null });
  }, []);

  /**
   * モーダルを閉じる
   */
  const closeDialog = useCallback(() => {
    setDialogModal((prev) => ({ ...prev, visible: false }));
  }, []);

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
    createRole,
    removeRole,
    getRoleUserCount,
  } = usePermissionManage();

  /** ユーザーロール管理フック */
  const {
    selectedUserTabRoleId,
    selectedUserId,
    filteredUserTabRoles,
    filteredUsersForRole,
    isLoadingUsers,
    isLoadingUserRoles,
    isUserSaving,
    userErrorMessage,
    userRoleSearchText,
    userSearchText,
    roleUserCounts,
    noRoleUserCount,
    selectedUserName,
    selectedUserTabRoleName,
    editedUserRoleIds,
    hasUserRoleChanges,
    setUserRoleSearchText,
    setUserSearchText,
    selectRoleForUserTab,
    selectUser,
    toggleUserRole,
    saveUserRoles,
    resetUserRoles,
    fetchRoleUserCounts,
  } = useUserRoleManage(roles);

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

  // ==================== ユーザ管理タブ: チェックリストデータ ====================

  /**
   * ユーザ管理タブ: 選択ユーザーのロールチェックリスト項目
   * @type {Array<{id: string, label: string, isChecked: boolean, isDisabled: boolean}>}
   */
  const userRoleCheckItems = useMemo(() => {
    if (!selectedUserId) {
      return [];
    }
    return roles.map((role) => ({
      id: role.id,
      label: role.display_name || role.name,
      isChecked: editedUserRoleIds.has(role.id),
      isDisabled: false,
    }));
  }, [selectedUserId, roles, editedUserRoleIds]);

  /**
   * ユーザ管理タブ: ロール切り替えハンドラ（機密ロールの確認モーダル付き）
   * @param {string} roleId - 切り替えるロールID
   */
  const handleToggleUserRole = useCallback((roleId) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) {
      return;
    }

    /** 機密ロールかチェック */
    const sensitiveRole = SENSITIVE_ROLES.find((sr) => sr.roleName === role.name);
    if (sensitiveRole) {
      /** 付与 or 解除の判定 */
      const isAdding = !editedUserRoleIds.has(roleId);
      const message = isAdding ? sensitiveRole.addMessage : sensitiveRole.removeMessage;
      const title = isAdding ? 'ロールの付与' : 'ロールの解除';

      showConfirm(title, message, () => {
        closeDialog();
        toggleUserRole(roleId);
      }, isAdding ? '付与する' : '解除する');
    } else {
      /** 通常ロールはそのまま切り替え */
      toggleUserRole(roleId);
    }
  }, [roles, editedUserRoleIds, toggleUserRole, showConfirm, closeDialog]);

  /**
   * ユーザ管理タブ: 保存処理（確認モーダル付き）
   */
  const handleSaveUserRoles = useCallback(() => {
    showConfirm(
      'ロール割り当ての更新',
      `「${selectedUserName}」のロール割り当てを更新しますか？`,
      async () => {
        closeDialog();
        const { error } = await saveUserRoles();
        if (error) {
          showAlert('更新エラー', error);
        } else {
          showAlert('更新完了', `「${selectedUserName}」のロール割り当てを更新しました。`);
        }
      },
      '更新する'
    );
  }, [selectedUserName, saveUserRoles, showConfirm, showAlert, closeDialog]);

  // ==================== 保存処理（確認ダイアログ付き） ====================

  /**
   * ロール別タブ: 保存処理（確認モーダル付き）
   */
  const handleSaveRoleScreens = useCallback(() => {
    showConfirm(
      'アクセス権限の更新',
      `「${selectedRoleName}」のアクセス権限を更新しますか？`,
      async () => {
        closeDialog();
        const { error } = await saveRoleScreens();
        if (error) {
          showAlert('更新エラー', error);
        } else {
          showAlert('更新完了', `「${selectedRoleName}」のアクセス権限を更新しました。`);
        }
      },
      '更新する'
    );
  }, [selectedRoleName, saveRoleScreens, showConfirm, showAlert, closeDialog]);

  /**
   * 項目別タブ: 保存処理（確認モーダル付き）
   */
  const handleSaveScreenRoles = useCallback(() => {
    showConfirm(
      'アクセス権限の更新',
      `「${selectedScreenName}」のアクセス権限を更新しますか？`,
      async () => {
        closeDialog();
        const { error } = await saveScreenRoles();
        if (error) {
          showAlert('更新エラー', error);
        } else {
          showAlert('更新完了', `「${selectedScreenName}」のアクセス権限を更新しました。`);
        }
      },
      '更新する'
    );
  }, [selectedScreenName, saveScreenRoles, showConfirm, showAlert, closeDialog]);

  // ==================== タブ切替 ====================

  /**
   * タブを押した時の処理
   * 既にアクティブなタブを再度押すと選択状態をリセット（一覧に戻る）
   * @param {string} tab - 押したタブの種類
   */
  const handleTabPress = useCallback((tab) => {
    if (activeTab === tab) {
      /** 同じタブを再押し → 選択リセット */
      if (tab === TAB_TYPES.ROLE) {
        selectRole(null);
      } else if (tab === TAB_TYPES.SCREEN) {
        selectScreen(null);
      } else if (tab === TAB_TYPES.USER) {
        selectRoleForUserTab(null);
      }
    } else {
      setActiveTab(tab);
    }
  }, [activeTab, setActiveTab, selectRole, selectScreen, selectRoleForUserTab]);

  // ==================== ロール作成・削除 ====================

  /**
   * 新規ロール作成画面に遷移
   */
  const handleNavigateToCreate = useCallback(() => {
    setCurrentView(VIEW_TYPES.CREATE_ROLE);
  }, []);

  /**
   * メインビューに戻る
   */
  const handleBackToMain = useCallback(() => {
    setCurrentView(VIEW_TYPES.MAIN);
  }, []);

  /**
   * ロール削除処理（確認モーダル付き）
   * ユーザー数を事前取得してモーダルに表示する
   * @param {string} roleId - 削除対象のロールID
   */
  const handleDeleteRole = useCallback(async (roleId) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) {
      return;
    }

    /** ユーザー数を取得して確認モーダルに表示 */
    const { count } = await getRoleUserCount(roleId);
    const roleName = role.display_name || role.name;

    /** 確認メッセージを組み立て */
    let confirmMessage = `「${roleName}」を削除しますか？\nこの操作は元に戻せません。`;
    if (count > 0) {
      confirmMessage = `現在 ${count} 人のユーザーがこのロールを所持しています。\n削除するとこれらのユーザーからこのロールが除外されます。\n\n「${roleName}」を削除しますか？`;
    }

    showConfirm(
      'ロールの削除',
      confirmMessage,
      async () => {
        closeDialog();
        const { error } = await removeRole(roleId);
        if (error) {
          showAlert('削除エラー', error);
        } else {
          showAlert('削除完了', `「${roleName}」を削除しました。`);
        }
      },
      '削除する'
    );
  }, [roles, getRoleUserCount, removeRole, showConfirm, showAlert, closeDialog]);

  /**
   * 保護対象ロールか判定する（削除ボタンの表示制御用）
   * @param {string} roleName - ロール名
   * @returns {boolean} 保護対象の場合 true
   */
  const isProtectedRole = useCallback((roleName) => {
    return PROTECTED_PERMISSIONS.some((p) => p.roleName === roleName);
  }, []);

  // ==================== モバイル: 戻るボタン ====================

  /**
   * モバイル時に一覧以外のパネルが表示されているか
   * @type {boolean}
   */
  const isShowingDetail = isMobile && (
    (activeTab === TAB_TYPES.ROLE && selectedRoleId !== null) ||
    (activeTab === TAB_TYPES.SCREEN && selectedScreenIndex !== null) ||
    (activeTab === TAB_TYPES.USER && (selectedUserTabRoleId !== null))
  );

  /**
   * モバイル: 前の画面に戻る
   * ユーザ管理タブは3段階（ロール一覧→ユーザ一覧→ロール編集）なので段階的に戻る
   */
  const handleBackToList = useCallback(() => {
    if (activeTab === TAB_TYPES.ROLE) {
      selectRole(null);
    } else if (activeTab === TAB_TYPES.SCREEN) {
      selectScreen(null);
    } else if (activeTab === TAB_TYPES.USER) {
      if (selectedUserId) {
        /** ロール編集→ユーザ一覧に戻る */
        selectUser(null);
      } else {
        /** ユーザ一覧→ロール一覧に戻る */
        selectRoleForUserTab(null);
      }
    }
  }, [activeTab, selectRole, selectScreen, selectedUserId, selectUser, selectRoleForUserTab]);

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

  // ==================== ロール作成ビュー ====================

  if (currentView === VIEW_TYPES.CREATE_ROLE) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
        <RoleCreateScreen
          onSave={createRole}
          onCancel={handleBackToMain}
          isSaving={isSaving}
          theme={theme}
        />
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
          onPress={() => handleTabPress(TAB_TYPES.ROLE)}
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
          onPress={() => handleTabPress(TAB_TYPES.SCREEN)}
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
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === TAB_TYPES.USER && { borderBottomColor: theme.primary },
          ]}
          onPress={() => handleTabPress(TAB_TYPES.USER)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === TAB_TYPES.USER ? theme.primary : theme.textSecondary },
            ]}
          >
            ユーザ管理
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
                  onCreateRole={handleNavigateToCreate}
                  onDeleteRole={handleDeleteRole}
                  isProtectedRole={isProtectedRole}
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

        {/* ユーザ管理タブ */}
        {activeTab === TAB_TYPES.USER && (
          <>
            {/* エラーメッセージ（ユーザ管理タブ固有） */}
            {userErrorMessage && (
              <View style={[styles.userErrorBanner, { backgroundColor: theme.error + '15' }]}>
                <Text style={[styles.errorText, { color: theme.error }]}>{userErrorMessage}</Text>
              </View>
            )}

            {/* 左パネル: ロール一覧 + ロール未所持セクション */}
            {(!isMobile || !selectedUserTabRoleId) && (
              <View style={[styles.userListPanel, isMobile && styles.listPanelMobile]}>
                {/* ロール一覧（作成/削除なし、ユーザー数バッジ） */}
                <View style={styles.userRoleListContainer}>
                  <RoleListPanel
                    roles={filteredUserTabRoles}
                    selectedRoleId={selectedUserTabRoleId}
                    onSelectRole={selectRoleForUserTab}
                    roleScreenCounts={roleUserCounts}
                    searchText={userRoleSearchText}
                    onSearchTextChange={setUserRoleSearchText}
                    onCreateRole={null}
                    onDeleteRole={null}
                    isProtectedRole={() => false}
                    theme={theme}
                  />
                </View>
                {/* ロール未所持セクション（独立した別枠） */}
                <TouchableOpacity
                  style={[
                    styles.noRoleSection,
                    {
                      backgroundColor: selectedUserTabRoleId === NO_ROLE_PSEUDO_ID
                        ? theme.primary + '18'
                        : theme.surface,
                      borderColor: selectedUserTabRoleId === NO_ROLE_PSEUDO_ID
                        ? theme.primary
                        : theme.border,
                    },
                  ]}
                  onPress={() => selectRoleForUserTab(NO_ROLE_PSEUDO_ID)}
                  activeOpacity={0.7}
                >
                  <View style={styles.noRoleSectionHeader}>
                    <Text style={[
                      styles.noRoleSectionTitle,
                      {
                        color: selectedUserTabRoleId === NO_ROLE_PSEUDO_ID
                          ? theme.primary
                          : theme.textSecondary,
                      },
                    ]}>
                      ロール未所持
                    </Text>
                    <Text style={[styles.noRoleSectionCount, { color: theme.textSecondary }]}>
                      {noRoleUserCount} 人
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* 中央パネル: ユーザー一覧 */}
            {(!isMobile || (selectedUserTabRoleId && !selectedUserId)) && (
              <View style={[styles.userMiddlePanel, isMobile && styles.listPanelMobile]}>
                {selectedUserTabRoleId ? (
                  <UserListPanel
                    users={filteredUsersForRole}
                    selectedUserId={selectedUserId}
                    onSelectUser={selectUser}
                    searchText={userSearchText}
                    onSearchTextChange={setUserSearchText}
                    roleName={selectedUserTabRoleName}
                    isLoading={isLoadingUsers}
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

            {/* 右パネル: ロールチェックリスト */}
            {(!isMobile || selectedUserId) && (
              <View style={[styles.detailPanel, isMobile && styles.detailPanelMobile]}>
                {selectedUserId ? (
                  isLoadingUserRoles ? (
                    <View style={[styles.placeholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <ActivityIndicator size="small" color={theme.primary} />
                    </View>
                  ) : (
                    <PermissionCheckList
                      title={`${selectedUserName} のロール`}
                      items={userRoleCheckItems}
                      onToggle={handleToggleUserRole}
                      onSave={handleSaveUserRoles}
                      onReset={resetUserRoles}
                      hasChanges={hasUserRoleChanges}
                      isSaving={isUserSaving}
                      theme={theme}
                    />
                  )
                ) : (
                  <View style={[styles.placeholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                      ユーザーを選択してください
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
      {/* 確認/アラートモーダル */}
      <Modal
        visible={dialogModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeDialog}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {/* タイトル */}
            {!!dialogModal.title && (
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {dialogModal.title}
              </Text>
            )}
            {/* メッセージ */}
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              {dialogModal.message}
            </Text>
            {/* ボタン行 */}
            <View style={styles.modalButtons}>
              {/* キャンセルボタン（アラートモードでは非表示） */}
              {!dialogModal.isAlert && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel, { borderColor: theme.border }]}
                  onPress={closeDialog}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalButtonCancelText, { color: theme.textSecondary }]}>
                    キャンセル
                  </Text>
                </TouchableOpacity>
              )}
              {/* 確認ボタン */}
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonConfirm,
                  {
                    backgroundColor:
                      dialogModal.confirmText === '削除する' ? theme.error : theme.primary,
                  },
                ]}
                onPress={() => {
                  if (dialogModal.isAlert) {
                    closeDialog();
                  } else if (dialogModal.onConfirm) {
                    dialogModal.onConfirm();
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {dialogModal.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  /** ユーザ管理タブ: 左パネル全体（ロール一覧 + 未所持セクションの縦並び） */
  userListPanel: {
    flex: 1,
    maxWidth: 240,
    flexDirection: 'column',
    gap: 8,
  },
  /** ユーザ管理タブ: ロール一覧部分（flex:1 で残り領域を使う） */
  userRoleListContainer: {
    flex: 1,
    minHeight: 0,
  },
  /** ロール未所持セクション（独立した別枠） */
  noRoleSection: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /** ロール未所持セクションのヘッダー行 */
  noRoleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** ロール未所持セクションのタイトル */
  noRoleSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  /** ロール未所持セクションのユーザー数 */
  noRoleSectionCount: {
    fontSize: 13,
  },
  /** ユーザ管理タブ: 中央パネル（PC、ユーザー一覧） */
  userMiddlePanel: {
    flex: 1,
    maxWidth: 280,
  },
  /** ユーザ管理タブ: エラーバナー */
  userErrorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
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
  /** モーダルオーバーレイ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** モーダルコンテンツ */
  modalContent: {
    borderRadius: 12,
    padding: 24,
    width: 360,
    maxWidth: '90%',
  },
  /** モーダルタイトル */
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
  },
  /** モーダルメッセージ */
  modalMessage: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  /** ボタン行 */
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  /** ボタン共通 */
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  /** キャンセルボタン */
  modalButtonCancel: {
    borderWidth: 1,
  },
  /** キャンセルボタンテキスト */
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  /** 確認ボタン */
  modalButtonConfirm: {
    minWidth: 80,
    alignItems: 'center',
  },
  /** 確認ボタンテキスト */
  modalButtonConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default Item7Screen;
