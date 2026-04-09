/**
 * 権限バッジコンポーネント
 * ロール・項目の横にアクセス数を表示するバッジ
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * 権限数バッジ
 * @param {Object} props - コンポーネントプロパティ
 * @param {number} props.count - 表示する数値
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} バッジ
 */
const PermissionBadge = ({ count, theme }) => {
  return (
    <View style={[styles.badge, { backgroundColor: theme.primary + '20' }]}>
      <Text style={[styles.badgeText, { color: theme.primary }]}>
        {count}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /** バッジコンテナ */
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  /** バッジテキスト */
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default PermissionBadge;
