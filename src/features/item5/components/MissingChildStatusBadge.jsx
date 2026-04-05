/**
 * ステータスバッジコンポーネント
 * 迷子情報のステータスを色分けバッジで表示する
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MISSING_CHILD_STATUS_LABELS, MISSING_CHILD_STATUS_COLORS } from '../constants';

/**
 * ステータスバッジ
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.status - ステータス値（pending/in_progress/on_hold/completed）
 * @returns {JSX.Element} ステータスバッジ
 */
const MissingChildStatusBadge = ({ status }) => {
  /** ステータスの日本語ラベル */
  const label = MISSING_CHILD_STATUS_LABELS[status] || status;
  /** ステータスに対応するバッジ色 */
  const color = MISSING_CHILD_STATUS_COLORS[status] || '#9E9E9E';

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /** バッジ外枠 */
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  /** バッジテキスト */
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default MissingChildStatusBadge;
