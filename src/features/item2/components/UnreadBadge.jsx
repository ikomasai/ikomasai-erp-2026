/**
 * 未読バッジ
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * 未読バッジ
 * @param {Object} props - プロパティ
 * @param {number} props.count - 未読件数
 * @returns {JSX.Element|null} 未読バッジ
 */
const UnreadBadge = ({ count }) => {
  /** 未読かどうか */
  const isUnread = Number(count) > 0;

  return (
    <View style={[styles.badge, isUnread ? styles.badgeUnread : styles.badgeRead]}>
      <Text style={styles.badgeText}>{isUnread ? `未読${count > 99 ? '99+' : count}` : '既読'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 52,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeUnread: {
    backgroundColor: '#00c853',
  },
  badgeRead: {
    backgroundColor: '#607d8b',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default UnreadBadge;
