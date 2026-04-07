/**
 * 管理部統合システムの画面アクセスガード
 * 閲覧権限がない場合はその場で案内を表示する
 */

import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useTheme } from '../../../shared/hooks/useTheme';

/**
 * 画面アクセスガード
 * @param {Object} props - コンポーネント引数
 * @param {boolean} props.canAccess - 画面を表示できるか
 * @param {string} props.title - 画面タイトル
 * @param {string} props.message - 権限不足時の案内文
 * @param {Object} props.navigation - React Navigation の navigation
 * @param {React.ReactNode} props.children - 画面本体
 * @returns {JSX.Element} ガード付き画面
 */
const SupportScreenAccessGuard = ({ canAccess, title, message, navigation, children }) => {
  const { theme } = useTheme();

  if (canAccess) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={title} navigation={navigation} />
      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>閲覧権限がありません</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
  },
});

export default SupportScreenAccessGuard;
