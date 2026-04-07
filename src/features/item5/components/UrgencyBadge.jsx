/**
 * 緊急バッジコンポーネント
 * 保護テントが「移動不可」の場合に表示される赤い緊急バッジ
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { URGENCY_BADGE_COLOR } from '../constants';

/**
 * 緊急バッジ
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} [props.label] - バッジラベル（デフォルト: '緊急: 移動不可'）
 * @returns {JSX.Element} 緊急バッジ
 */
const UrgencyBadge = ({ label = '緊急: 移動不可' }) => {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /** バッジ外枠 */
  badge: {
    backgroundColor: URGENCY_BADGE_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  /** バッジテキスト */
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default UrgencyBadge;
