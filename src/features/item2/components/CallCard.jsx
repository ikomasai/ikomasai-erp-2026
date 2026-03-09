/**
 * 呼び出しカード
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
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
  isEmergencyMode = false,
  chatAssigneeLabel,
  responderLabel,
  onOpenChat,
  onOpenAssigneeSettingModal,
  onOpenChatAssigneeModal,
  onOpenResponderModal,
}) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 緊急呼び出しかどうか */
  const isEmergency = callData.call_type === 'emergency';
  /** 要約 */
  const summaryText = callData.call_type === 'emergency'
    ? (callData.detail || '状況未入力')
    : (callData.purpose || callData.detail || '内容未入力');

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: theme.surface, shadowOpacity: theme.shadowOpacity, borderColor: theme.border }]} onPress={() => onOpenChat(callData)} activeOpacity={0.85}>
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={[styles.typeText, { color: theme.textSecondary }]}>{isEmergency ? '緊急' : '不急'}</Text>
          <StatusBadge status={callData.status} isEmergency={isEmergency} />
        </View>
      </View>
      <Text style={[styles.summaryText, { color: theme.text }]}>{summaryText}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>場所: {callData.location_text}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>呼び出し者: {callData.requester_name}</Text>
      <Text style={[styles.metaText, { color: theme.textSecondary }]}>時刻: {formatDateTime(callData.created_at)}</Text>
      {!isEmergencyMode ? (
        <View style={styles.assigneeRow}>
          <View style={styles.assigneeTextBox}>
            <Text style={[styles.assigneeTitle, { color: theme.textSecondary }]}>救護者</Text>
            <Text style={[styles.assigneeValue, { color: theme.text }]}>{responderLabel}</Text>
            <Text style={[styles.assigneeTitle, { color: theme.textSecondary }]}>チャット対応者</Text>
            <Text style={[styles.assigneeValue, { color: theme.text }]}>{chatAssigneeLabel}</Text>
          </View>
          {typeof onOpenAssigneeSettingModal === 'function' ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primaryVariant }]} onPress={() => onOpenAssigneeSettingModal(callData)}>
              <Text style={styles.actionButtonText}>担当者設定</Text>
            </TouchableOpacity>
          ) : typeof onOpenChatAssigneeModal === 'function' ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primaryVariant }]} onPress={() => onOpenChatAssigneeModal(callData)}>
              <Text style={styles.actionButtonText}>担当者設定</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.assigneeRow}>
          <View style={styles.assigneeTextBox}>
            <Text style={[styles.assigneeTitle, { color: theme.textSecondary }]}>救護者</Text>
            <Text style={[styles.assigneeValue, { color: theme.text }]}>{responderLabel}</Text>
          </View>
          {typeof onOpenAssigneeSettingModal === 'function' ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primaryVariant }]} onPress={() => onOpenAssigneeSettingModal(callData)}>
              <Text style={styles.actionButtonText}>担当者設定</Text>
            </TouchableOpacity>
          ) : typeof onOpenResponderModal === 'function' ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primaryVariant }]} onPress={() => onOpenResponderModal(callData)}>
              <Text style={styles.actionButtonText}>救護者設定</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
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
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#616161',
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
});

export default CallCard;
