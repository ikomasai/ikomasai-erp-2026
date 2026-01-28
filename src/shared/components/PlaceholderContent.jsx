/**
 * プレースホルダーコンテンツ
 * 未実装機能やエラー時に表示する共通コンポーネント
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

/**
 * プレースホルダーコンテンツコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.title - 表示タイトル
 * @param {string} [props.message] - 表示メッセージ（省略時はデフォルトメッセージ）
 * @param {boolean} [props.isError] - エラー状態かどうか
 * @returns {JSX.Element} プレースホルダーコンテンツ
 */
const PlaceholderContent = ({ title, message, isError = false }) => {
  /** デフォルトメッセージ */
  const defaultMessage = isError
    ? 'エラーが発生しました。しばらくしてから再度お試しください。'
    : 'この機能は現在開発中です';

  /** 表示するアイコン */
  const icon = isError ? '⚠️' : '🚧';

  return (
    <View style={styles.content}>
      <View style={[styles.placeholderBox, isError && styles.errorBox]}>
        <Text style={styles.placeholderIcon}>{icon}</Text>
        <Text style={styles.placeholderTitle}>{title}</Text>
        <Text style={styles.placeholderDescription}>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  errorBox: {
    borderWidth: 2,
    borderColor: '#ff6b6b',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 8,
  },
  placeholderDescription: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
});

export default PlaceholderContent;
