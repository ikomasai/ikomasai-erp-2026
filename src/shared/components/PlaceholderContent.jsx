/**
 * プレースホルダーコンテンツ
 * 未実装機能やエラー時に表示する共通コンポーネント
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

/**
 * プレースホルダーコンテンツコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.title - 表示タイトル
 * @param {string} [props.message] - 表示メッセージ（省略時はデフォルトメッセージ）
 * @param {boolean} [props.isError] - エラー状態かどうか
 * @returns {JSX.Element} プレースホルダーコンテンツ
 */
const PlaceholderContent = ({ title, message, isError = false }) => {
  const { theme } = useTheme();
  
  /** デフォルトメッセージ */
  const defaultMessage = isError
    ? 'エラーが発生しました。しばらくしてから再度お試しください。'
    : 'この機能は現在開発中です';

  /** 表示するアイコン */
  const icon = isError ? '⚠️' : '🚧';

  return (
    <View style={styles.content}>
      <View style={[
        styles.placeholderBox, 
        { backgroundColor: theme.surface },
        isError && { borderWidth: 2, borderColor: theme.error }
      ]}>
        <Text style={styles.placeholderIcon}>{icon}</Text>
        <Text style={[styles.placeholderTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.placeholderDescription, { color: theme.textSecondary }]}>
          {message || defaultMessage}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderBox: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholderDescription: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default PlaceholderContent;
