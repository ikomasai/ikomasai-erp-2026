/**
 * ステータス表示バッジ
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ITEM2_CALL_STATUSES, ITEM2_STATUS_COLORS } from '../constants';

/**
 * ステータス表示ラベルを返す
 * @param {string} status - ステータス
 * @returns {string} 表示ラベル
 */
const getStatusLabel = (status) => {
  if (status === ITEM2_CALL_STATUSES.RESOLVED) {
    return '対応終了';
  }
  if (status === ITEM2_CALL_STATUSES.IN_PROGRESS) {
    return '対応中';
  }
  return '未対応';
};

/**
 * ステータスバッジ
 * @param {Object} props - プロパティ
 * @param {string} props.status - ステータス
 * @param {boolean} props.isEmergency - 緊急かどうか
 * @returns {JSX.Element} バッジ
 */
const StatusBadge = ({ status, isEmergency = false }) => {
  /** 背景色 */
  const backgroundColor = status === ITEM2_CALL_STATUSES.UNHANDLED && isEmergency
    ? ITEM2_STATUS_COLORS.emergency
    : ITEM2_STATUS_COLORS[status] ?? ITEM2_STATUS_COLORS.unhandled;

  return (
    <View style={[styles.badge, { backgroundColor }]}> 
      <Text style={styles.badgeText}>{getStatusLabel(status)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default StatusBadge;
