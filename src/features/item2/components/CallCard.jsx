/**
 * 呼び出しカード
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ITEM2_DETAIL_STATUS_COLORS, ITEM2_DETAIL_STATUSES } from '../constants';
import StatusBadge from './StatusBadge';

/**
 * 日時を整形する
 * @param {string} value - ISO 文字列
 * @returns {string} 表示用文字列
 */
const formatDateTime = (value) => {
  if (!value) {
    return '未設定';
  }
  return new Date(value).toLocaleString('ja-JP');
};

/**
 * 呼び出しカード
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} カード
 */
const CallCard = ({
  callData,
  responderLabel,
  onOpenResponderModal,
  onOpenAdditionalInfoModal,
  onResolveCall,
}) => {
  const { theme } = useTheme();
  const summaryText = callData.detail || callData.purpose || '内容未入力';
  const requesterRolesText = Array.isArray(callData.requester_roles) && callData.requester_roles.length > 0
    ? callData.requester_roles
      .map((role) => role.display_name || role.name)
      .filter(Boolean)
      .join('、')
    : 'なし';
  const isDetailPending = callData.detail_status !== ITEM2_DETAIL_STATUSES.COMPLETED;
  const detailStatusLabel = isDetailPending ? '追加情報: 未入力' : '追加情報: 入力済み';
  const shouldShowActionRow = (
    typeof onOpenResponderModal === 'function'
    || typeof onOpenAdditionalInfoModal === 'function'
    || typeof onResolveCall === 'function'
  );
  const detailActionLabel = isDetailPending ? '詳細を入力' : '詳細を編集';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, shadowOpacity: theme.shadowOpacity, borderColor: theme.border }]}> 
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <StatusBadge status={callData.status} />
          <View style={[
            styles.detailBadge,
            { backgroundColor: ITEM2_DETAIL_STATUS_COLORS[isDetailPending ? 'pending' : 'completed'] },
          ]}>
            <Text style={styles.detailBadgeText}>
              {isDetailPending ? '詳細入力待ち' : '追加情報済み'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={[styles.summaryText, { color: theme.text }]}>{summaryText}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>場所: {callData.location_text}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>呼び出し者: {callData.requester_name}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>呼び出し者ロール: {requesterRolesText}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>時刻: {formatDateTime(callData.created_at)}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>{detailStatusLabel}</Text>
      <View style={styles.assigneeRow}>
        <View style={styles.assigneeTextBox}>
          <Text style={[styles.assigneeTitle, { color: theme.textSecondary }]}>救護者</Text>
          <Text style={[styles.assigneeValue, { color: theme.text }]}>{responderLabel}</Text>
        </View>
      </View>
      {shouldShowActionRow ? (
        <View style={styles.actionRow}>
          {typeof onOpenResponderModal === 'function' ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primaryVariant }]} onPress={() => onOpenResponderModal(callData)}>
              <Text style={styles.actionButtonText}>救護者設定</Text>
            </TouchableOpacity>
          ) : null}
          {typeof onOpenAdditionalInfoModal === 'function' ? (
            <TouchableOpacity style={[styles.resolveButton, { borderColor: theme.border }]} onPress={() => onOpenAdditionalInfoModal(callData)}>
              <Text style={[styles.resolveButtonText, { color: theme.text }]}>{detailActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {typeof onResolveCall === 'function' ? (
            <TouchableOpacity style={[styles.resolveButton, { borderColor: theme.border }]} onPress={() => onResolveCall(callData)}>
              <Text style={[styles.resolveButtonText, { color: theme.text }]}>対応終了</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  topLeft: {
    gap: 8,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 10,
  },
  metaText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4,
  },
  assigneeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  assigneeTextBox: {
    flex: 1,
  },
  assigneeTitle: {
    color: '#616161',
    fontSize: 12,
  },
  assigneeValue: {
    color: '#212121',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    backgroundColor: '#1565c0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  resolveButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resolveButtonText: {
    fontWeight: '700',
    fontSize: 12,
  },
});

export default CallCard;
