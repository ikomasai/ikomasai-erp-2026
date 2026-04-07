/**
 * 空状態表示コンポーネント
 * データが存在しない場合にアイコン・説明・アクションボタンを表示する
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * 空状態コンポーネント
 * @param {Object} props - プロパティ
 * @param {string} [props.icon='📭'] - 表示アイコン（Unicode絵文字）
 * @param {string} props.title - メインメッセージ
 * @param {string} [props.description] - 補足説明
 * @param {string} [props.actionLabel] - アクションボタンのラベル
 * @param {Function} [props.onAction] - アクションボタン押下時のコールバック
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Object} [props.style] - コンテナの追加スタイル
 * @returns {JSX.Element} 空状態表示
 */
const EmptyState = ({ icon = '\u{1F4ED}', title, description, actionLabel, onAction, theme, style }) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.actionButton, { borderColor: theme.border }]}
          onPress={onAction}
        >
          <Text style={[styles.actionButtonText, { color: theme.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  icon: {
    fontSize: 36,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  actionButton: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default EmptyState;
