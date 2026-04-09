/**
 * 全データ削除セクションコンポーネント
 * 実長のみ表示。祭期間判定・全件対応完了判定・二重確認モーダルを含む
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { MISSING_CHILD_STATUS } from '../constants';

/**
 * 現在が祭期間内かどうかを判定する
 * @param {Date|null} debugDate - デバッグ用の日付（nullの場合は現在日付を使用）
 * @returns {boolean} 祭期間内の場合true
 */
const isFestivalPeriod = (debugDate = null) => {
  const now = debugDate || new Date();
  /** 現在の年 */
  const currentYear = now.getFullYear();

  /** 祭開始日（MM-DD形式） */
  const startStr = process.env.EXPO_PUBLIC_FESTIVAL_START_DATE || '11-01';
  /** 祭終了日（MM-DD形式） */
  const endStr = process.env.EXPO_PUBLIC_FESTIVAL_END_DATE || '11-05';

  const [startMonth, startDay] = startStr.split('-').map(Number);
  const [endMonth, endDay] = endStr.split('-').map(Number);

  /** 祭開始日時 */
  const startDate = new Date(currentYear, startMonth - 1, startDay, 0, 0, 0);
  /** 祭終了日時 */
  const endDate = new Date(currentYear, endMonth - 1, endDay, 23, 59, 59);

  return now >= startDate && now <= endDate;
};

/**
 * 全データ削除セクション
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.statusCounts - ステータス別件数
 * @param {number} props.totalCount - 全件数
 * @param {Function} props.onDelete - 削除実行時のコールバック
 * @param {boolean} [props.isDeleting] - 削除中かどうか
 * @param {Date|null} [props.debugDate] - デバッグ用の日付
 * @returns {JSX.Element} 全データ削除セクション
 */
const DeleteAllDataSection = ({ statusCounts, totalCount, onDelete, isDeleting = false, debugDate = null }) => {
  const { theme } = useTheme();

  /** 1回目の確認モーダル表示状態 */
  const [isFirstModalVisible, setIsFirstModalVisible] = useState(false);
  /** 2回目の確認モーダル表示状態 */
  const [isSecondModalVisible, setIsSecondModalVisible] = useState(false);

  /** 祭期間中かどうか */
  const isDuringFestival = isFestivalPeriod(debugDate);

  /** 完了済み以外の件数 */
  const nonCompletedCount = totalCount - (statusCounts[MISSING_CHILD_STATUS.COMPLETED] || 0);

  /** 全件が対応完了かどうか（0件の場合は削除不要なので無効） */
  const isAllCompleted = totalCount > 0 && nonCompletedCount === 0;

  /** 削除可能かどうか */
  const canDelete = !isDuringFestival && isAllCompleted;

  /**
   * 無効理由テキストを取得する
   * @returns {string} 無効理由
   */
  const getDisabledReason = () => {
    if (isDuringFestival) {
      return '生駒祭期間中のためこの操作は無効です。';
    }
    if (totalCount === 0) {
      return '削除対象のデータがありません。';
    }
    if (!isAllCompleted) {
      return '全ての迷子情報が対応完了になっていません。';
    }
    return '';
  };

  /**
   * 1回目の確認モーダルで「削除する」を押した時のハンドラ
   */
  const handleFirstConfirm = () => {
    setIsFirstModalVisible(false);
    setIsSecondModalVisible(true);
  };

  /**
   * 2回目の確認モーダルで「はい、削除します」を押した時のハンドラ
   */
  const handleSecondConfirm = async () => {
    setIsSecondModalVisible(false);
    await onDelete();
  };

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>全データ削除</Text>
      <Text style={[styles.warningNote, { color: theme.textSecondary }]}>
        この操作は、生駒祭行事全てが完了した後に行なってください。
      </Text>

      {/* 無効理由メッセージ */}
      {!canDelete && (
        <Text style={styles.disabledReason}>{getDisabledReason()}</Text>
      )}

      {/* 削除ボタン */}
      <TouchableOpacity
        style={[
          styles.deleteButton,
          canDelete ? styles.deleteButtonActive : styles.deleteButtonDisabled,
        ]}
        onPress={() => setIsFirstModalVisible(true)}
        disabled={!canDelete || isDeleting}
        activeOpacity={0.7}
      >
        <Text style={[
          styles.deleteButtonText,
          !canDelete && styles.deleteButtonTextDisabled,
        ]}>
          {isDeleting ? '削除中...' : '全データ削除'}
        </Text>
      </TouchableOpacity>

      {/* 1回目の確認モーダル */}
      <Modal visible={isFirstModalVisible} transparent animationType="fade" onRequestClose={() => setIsFirstModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>全データ削除</Text>
            <Text style={[styles.modalMessage, { color: theme.text }]}>
              迷子データを全件削除します。この操作は取り消せません。
            </Text>
            <Text style={[styles.modalWarning, { color: '#F44336' }]}>
              この操作は、生駒祭行事全てが完了した後に行なってください。
            </Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => setIsFirstModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteButton}
                onPress={handleFirstConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.modalDeleteText}>削除する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2回目の確認モーダル */}
      <Modal visible={isSecondModalVisible} transparent animationType="fade" onRequestClose={() => setIsSecondModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: '#F44336' }]}>本当に削除しますか？</Text>
            <Text style={[styles.modalMessage, { color: theme.text }]}>
              全 {totalCount} 件の迷子データが完全に削除されます。
            </Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => setIsSecondModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>やめる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteButton}
                onPress={handleSecondConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.modalDeleteText}>はい、削除します</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  warningNote: { fontSize: 12, marginBottom: 12 },
  disabledReason: { color: '#F44336', fontSize: 13, marginBottom: 12, fontWeight: '500' },
  deleteButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteButtonActive: { backgroundColor: '#F44336' },
  deleteButtonDisabled: { backgroundColor: '#E0E0E0' },
  deleteButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  deleteButtonTextDisabled: { color: '#9E9E9E' },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  modalMessage: { fontSize: 14, textAlign: 'center', marginBottom: 12, lineHeight: 20 },
  modalWarning: { fontSize: 12, textAlign: 'center', marginBottom: 20, fontWeight: '500' },
  modalButtonRow: { flexDirection: 'row', gap: 12 },
  modalCancelButton: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalDeleteButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F44336', alignItems: 'center' },
  modalDeleteText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

export default DeleteAllDataSection;
