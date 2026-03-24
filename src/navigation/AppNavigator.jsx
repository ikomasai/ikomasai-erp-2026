/**
 * アプリケーションナビゲーター
 * アプリ全体のナビゲーション構造を定義します
 */

import React, { useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../shared/contexts/AuthContext';
import DrawerNavigator from './DrawerNavigator';
import LoginScreen from '../features/auth/screens/LoginScreen';
import PasswordChangeModal from '../features/auth/components/PasswordChangeModal';
import PasswordChangeForm from '../features/auth/components/PasswordChangeForm';
import PasswordSuccessModal from '../features/auth/components/PasswordSuccessModal';
import { usePasswordChange } from '../features/auth/hooks/usePasswordChange';
import { usePushNavigationListener } from '../shared/hooks/usePushNavigationListener';
import GlobalWebPushPrompt from '../features/notifications/components/GlobalWebPushPrompt';

/**
 * スタックナビゲーター
 */
const Stack = createNativeStackNavigator();

/** 画面内バナーを持つ Push 対象画面 */
const INLINE_PUSH_NOTICE_SCREENS = ['Item12', 'Item13', 'Item14', 'Item15', 'Item16'];

/**
 * ネストしたナビゲーション状態から最深部の画面名を取得する
 * @param {Object|null|undefined} state - ナビゲーション状態
 * @returns {string|null} 最深部の画面名
 */
const getDeepestRouteName = (state) => {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) {
    return null;
  }

  /** 現在選択中のルート */
  const currentRoute = state.routes[state.index ?? 0];
  if (!currentRoute) {
    return null;
  }

  if (currentRoute.state) {
    return getDeepestRouteName(currentRoute.state) ?? currentRoute.name ?? null;
  }

  return currentRoute.name ?? null;
};

/**
 * アプリケーションナビゲーター
 * 認証状態に応じてログイン画面またはメイン画面を表示します
 * @returns {JSX.Element} ナビゲーターコンポーネント
 */
const AppNavigator = () => {
  const {
    isAuthenticated,
    isLoading,
    isFirstLogin,
    setFirstLoginHandled,
    refreshUserInfo,
  } = useAuth();

  // パスワード変更フック
  const passwordChange = usePasswordChange();

  // ナビゲーション参照（パスワード変更後の画面遷移・push通知遷移用）
  const navigationRef = useRef(null);

  // push通知タップ時の画面遷移リスナー（Service Worker postMessage + URLパラメータ）
  usePushNavigationListener({ navigationRef, isAuthenticated });

  // パスワード変更フォーム表示状態
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // パスワード変更成功モーダル表示状態
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // 現在表示中の画面名
  const [currentRouteName, setCurrentRouteName] = useState(null);

  /**
   * 「今すぐ変更」ボタン押下時の処理
   */
  const handleChangeNow = () => {
    setShowPasswordForm(true);
  };

  /**
   * 「後で変更」ボタン押下時の処理
   */
  const handleChangeLater = () => {
    setFirstLoginHandled(true);
  };

  /**
   * パスワード変更フォームのキャンセル
   */
  const handlePasswordFormCancel = () => {
    setShowPasswordForm(false);
    passwordChange.resetForm();
  };

  /**
   * パスワード変更の実行
   */
  const handlePasswordSubmit = async () => {
    const result = await passwordChange.handleChangePassword();

    if (result.success) {
      setShowPasswordForm(false);
      setShowSuccessModal(true);
      // ユーザー情報を再取得してpassword_changed_atを更新
      await refreshUserInfo();
    }
  };

  /**
   * パスワード変更成功モーダルを閉じる
   */
  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setFirstLoginHandled(true);
    passwordChange.resetForm();

    // 当日部員シフト確認画面（jimu-shift）に遷移
    // ネストされたナビゲーターなので、Main -> JimuShift の順で遷移
    if (navigationRef.current) {
      navigationRef.current.navigate('Main', { screen: 'JimuShift' });
    }
  };

  /**
   * 現在表示中の画面名を更新する
   */
  const updateCurrentRouteName = () => {
    /** ルート全体の状態 */
    const rootState = navigationRef.current?.getRootState?.();
    /** 現在ルート */
    const routeName = getDeepestRouteName(rootState);
    setCurrentRouteName(routeName);
  };

  /** グローバル Push 導線を非表示にする画面かどうか */
  const hasInlinePushNotice = INLINE_PUSH_NOTICE_SCREENS.includes(currentRouteName);
  /** グローバル Push 導線を出すかどうか */
  const shouldShowGlobalPushPrompt =
    isAuthenticated &&
    !showSuccessModal &&
    !(isFirstLogin && !showPasswordForm) &&
    !hasInlinePushNotice;

  // ローディング中の表示
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // パスワード変更フォーム表示中
  if (showPasswordForm) {
    return (
      <PasswordChangeForm
        currentPassword={passwordChange.currentPassword}
        onCurrentPasswordChange={passwordChange.setCurrentPassword}
        newPassword={passwordChange.newPassword}
        onNewPasswordChange={passwordChange.setNewPassword}
        confirmPassword={passwordChange.confirmPassword}
        onConfirmPasswordChange={passwordChange.setConfirmPassword}
        errors={passwordChange.errors}
        onClearError={passwordChange.clearError}
        isSubmitting={passwordChange.isSubmitting}
        onSubmit={handlePasswordSubmit}
        onCancel={handlePasswordFormCancel}
      />
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={updateCurrentRouteName}
      onStateChange={updateCurrentRouteName}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          // ログイン済み: メイン画面を表示
          <Stack.Screen name="Main" component={DrawerNavigator} />
        ) : (
          // 未ログイン: ログイン画面を表示
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>

      <GlobalWebPushPrompt visible={shouldShowGlobalPushPrompt} />

      {/* 初回ログイン時のパスワード変更推奨モーダル */}
      <PasswordChangeModal
        visible={isAuthenticated && isFirstLogin && !showPasswordForm}
        onChangeNow={handleChangeNow}
        onChangeLater={handleChangeLater}
      />

      {/* パスワード変更成功モーダル */}
      <PasswordSuccessModal
        visible={showSuccessModal}
        onClose={handleSuccessModalClose}
      />
    </NavigationContainer>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});

export default AppNavigator;
