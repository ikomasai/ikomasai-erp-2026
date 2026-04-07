/**
 * アプリケーションナビゲーター
 * アプリ全体のナビゲーション構造を定義します
 */

import React, { useCallback, useRef, useState } from 'react';
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
import { useWebPushDebugListener } from '../shared/hooks/useWebPushDebugListener';
import GlobalWebPushPrompt from '../features/notifications/components/GlobalWebPushPrompt';
import ToastMessage from '../shared/components/ToastMessage';

/**
 * スタックナビゲーター
 */
const Stack = createNativeStackNavigator();

/** 画面内バナーを持つ Push 対象画面 */
const INLINE_PUSH_NOTICE_SCREENS = ['Item12', 'Item13', 'Item14', 'Item15', 'Item16'];

/** アプリ内 Push トーストの初期値 */
const INITIAL_PUSH_TOAST = {
  visible: false,
  message: '',
  type: 'info',
  notificationId: null,
};

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
 * Push デバッグログからトースト文言を組み立てる
 * @param {Object|null|undefined} payload - Push デバッグログ
 * @returns {string} 表示文言
 */
const buildPushToastMessage = (payload) => {
  /** 通知タイトル */
  const title =
    typeof payload?.title === 'string' && payload.title.trim() !== ''
      ? payload.title.trim()
      : '新しい通知があります';
  /** 通知本文の先頭行 */
  const bodyLine =
    typeof payload?.body === 'string' && payload.body.trim() !== ''
      ? payload.body.split('\n').map((line) => line.trim()).find(Boolean) || ''
      : '';

  if (!bodyLine) {
    return title;
  }

  return `${title}\n${bodyLine}`;
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
  // アプリ内 Push トースト状態
  const [pushToast, setPushToast] = useState(INITIAL_PUSH_TOAST);
  // 直近表示した通知ID
  const latestPushToastIdRef = useRef(null);

  // パスワード変更フォーム表示状態
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // パスワード変更成功モーダル表示状態
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // 現在表示中の画面名
  const [currentRouteName, setCurrentRouteName] = useState(null);

  /**
   * Push 受信ログに応じてアプリ内トーストを表示する
   * @param {Object} payload - Push デバッグログ
   * @returns {void}
   */
  const handlePushDebug = useCallback((payload) => {
    /** 通知段階 */
    const phase = typeof payload?.phase === 'string' ? payload.phase : '';
    /** 通知ID */
    const notificationId =
      typeof payload?.notificationId === 'string' && payload.notificationId.trim() !== ''
        ? payload.notificationId.trim()
        : null;

    if (phase === 'notification_shown') {
      if (notificationId && latestPushToastIdRef.current === notificationId) {
        return;
      }

      latestPushToastIdRef.current = notificationId;
      setPushToast({
        visible: true,
        message: buildPushToastMessage(payload),
        type: 'info',
        notificationId,
      });
      return;
    }

    if (phase === 'notification_show_error') {
      latestPushToastIdRef.current = notificationId;
      setPushToast({
        visible: true,
        message: 'Push 通知の画面表示に失敗しました',
        type: 'error',
        notificationId,
      });
    }
  }, []);

  // push通知の受信デバッグログをブラウザコンソールへ出し、必要ならアプリ内トーストも表示する
  useWebPushDebugListener({ onPushDebug: handlePushDebug });

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

  /**
   * Push トーストを閉じる
   * @returns {void}
   */
  const hidePushToast = () => {
    setPushToast((prev) => ({
      ...prev,
      visible: false,
    }));
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

      <ToastMessage
        visible={pushToast.visible}
        message={pushToast.message}
        type={pushToast.type}
        onHide={hidePushToast}
      />

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
