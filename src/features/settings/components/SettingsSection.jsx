/**
 * 設定画面のセクションヘッダーコンポーネント
 * セクション名と区切り線を表示する汎用コンポーネント
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';

/**
 * 設定セクションコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.title - セクションタイトル
 * @param {React.ReactNode} props.children - セクション内のコンテンツ
 * @returns {JSX.Element} セクションコンポーネント
 */
const SettingsSection = ({ title, children }) => {
  /** テーマコンテキスト */
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      {/* セクションヘッダー */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      {/* セクションコンテンツ */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** セクション全体のコンテナ */
  container: {
    marginBottom: 24,
  },
  /** セクションヘッダー */
  header: {
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 16,
  },
  /** セクションタイトル */
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  /** セクションコンテンツ */
  content: {
    paddingHorizontal: 4,
  },
});

export default SettingsSection;
