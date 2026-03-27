/**
 * Web Push購読状態カード
 * 閉じたPWA向け通知の有効化・再登録導線を表示する
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * Web Push購読状態カード
 * @param {Object} props - プロパティ
 * @param {Object} props.theme - テーマ
 * @param {string} props.title - 見出し
 * @param {string} props.description - 補足説明
 * @param {string} props.actionLabel - ボタンラベル
 * @param {boolean} props.isLoading - 実行中フラグ
 * @param {Function|null} props.onPress - ボタン押下処理
 * @returns {JSX.Element|null} 表示要素
 */
const WebPushStatusCard = ({ theme, title, description, actionLabel, isLoading, onPress }) => {
  if (!title || !description) {
    return null;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      {onPress && actionLabel ? (
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: isLoading ? theme.border : theme.primary,
            },
          ]}
          onPress={onPress}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? '確認中...' : actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default WebPushStatusCard;
