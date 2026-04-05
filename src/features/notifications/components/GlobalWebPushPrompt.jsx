/**
 * 全画面共通 Web Push 有効化プロンプト
 * どの画面にいても、Web Push を未許可のユーザーへ再登録導線を出す
 */

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useManagedPushSubscription } from '../hooks/useManagedPushSubscription';
import WebPushStatusCard from './WebPushStatusCard';

/**
 * 全画面共通 Web Push 有効化プロンプト
 * @param {Object} props - プロパティ
 * @param {boolean} props.visible - 表示可否
 * @returns {JSX.Element|null} 表示要素
 */
const GlobalWebPushPrompt = ({ visible }) => {
  /** 認証中ユーザー */
  const { user } = useAuth();
  /** テーマ */
  const { theme } = useTheme();
  /** Push 購読の表示状態 */
  const pushNotice = useManagedPushSubscription({
    userId: user?.id,
    enabled: visible && !!user?.id,
  });

  if (!visible || Platform.OS !== 'web' || !pushNotice.isVisible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View pointerEvents="auto" style={styles.cardContainer}>
        <WebPushStatusCard
          theme={theme}
          title={pushNotice.title}
          description={pushNotice.description}
          actionLabel={pushNotice.actionLabel}
          isLoading={pushNotice.isSyncingPush}
          onPress={pushNotice.onPress}
        />
      </View>
    </View>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 4000,
    alignItems: 'flex-end',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
  },
});

export default GlobalWebPushPrompt;
