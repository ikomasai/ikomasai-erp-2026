/**
 * 迷子登録確認モーダルコンポーネント
 * 登録前に入力内容を確認させるモーダル
 * 移動不可の場合は緊急バッジを表示する
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import UrgencyBadge from './UrgencyBadge';
import {
  GENDER_LABELS,
  SHELTER_TENT_LABELS,
  UNABLE_TO_MOVE,
  URGENCY_CARD_BACKGROUND_COLOR,
  URGENCY_CARD_BORDER_COLOR,
} from '../constants';

/**
 * 発見時刻を「YYYY/MM/DD HH:MM」形式にフォーマットする
 * @param {string} isoString - ISO日時文字列
 * @returns {string} フォーマット済み日時
 */
const formatDateTime = (isoString) => {
  const date = new Date(isoString);
  /** 年 */
  const year = date.getFullYear();
  /** 月 */
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  /** 日 */
  const day = date.getDate().toString().padStart(2, '0');
  /** 時 */
  const hours = date.getHours().toString().padStart(2, '0');
  /** 分 */
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

/**
 * 確認モーダル
 * @param {Object} props - コンポーネントプロパティ
 * @param {boolean} props.isVisible - モーダル表示状態
 * @param {Object} props.childData - 確認対象の迷子情報
 * @param {Function} props.onConfirm - 申請確定時のコールバック
 * @param {Function} props.onCancel - キャンセル時のコールバック
 * @param {boolean} [props.isSubmitting] - 送信中かどうか
 * @returns {JSX.Element} 確認モーダル
 */
const MissingChildConfirmModal = ({ isVisible, childData, onConfirm, onCancel, isSubmitting = false }) => {
  const { theme } = useTheme();

  if (!childData) return null;

  /** 移動不可の案件かどうか */
  const isUrgent = childData.shelter_tent === UNABLE_TO_MOVE;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* タイトル */}
            <Text style={[styles.title, { color: theme.text }]}>この内容で申請しますか？</Text>

            {/* 緊急バッジ（移動不可時） */}
            {isUrgent && (
              <View style={styles.urgencyContainer}>
                <UrgencyBadge />
              </View>
            )}

            {/* 入力内容一覧 */}
            <View style={[
              styles.contentBox,
              { backgroundColor: theme.background, borderColor: isUrgent ? URGENCY_CARD_BORDER_COLOR : theme.border },
              isUrgent && { backgroundColor: URGENCY_CARD_BACKGROUND_COLOR },
            ]}>
              <ConfirmRow label="年齢" value={childData.age} theme={theme} />
              <ConfirmRow label="性別" value={GENDER_LABELS[childData.gender]} theme={theme} />
              <ConfirmRow label="特徴" value={childData.characteristics} theme={theme} />
              <ConfirmRow label="発見場所" value={childData.discovery_location} theme={theme} />
              <ConfirmRow
                label="保護テント"
                value={SHELTER_TENT_LABELS[childData.shelter_tent]}
                theme={theme}
                isHighlighted={isUrgent}
              />
              {isUrgent && childData.pickup_location && (
                <ConfirmRow
                  label="迎え場所"
                  value={childData.pickup_location}
                  theme={theme}
                  isHighlighted
                />
              )}
            </View>

            {/* 注意文 */}
            <Text style={[styles.warningText, { color: theme.textSecondary }]}>
              ※ 申請後の編集・削除はできません。内容をよく確認してください。
            </Text>

            {/* ボタン */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={onCancel}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: isUrgent ? URGENCY_CARD_BORDER_COLOR : theme.primary, opacity: isSubmitting ? 0.6 : 1 }]}
                onPress={onConfirm}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmButtonText}>
                  {isSubmitting ? '送信中...' : '申請する'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

/**
 * 確認行コンポーネント
 * @param {Object} props - プロパティ
 * @param {string} props.label - ラベル
 * @param {string} props.value - 値
 * @param {Object} props.theme - テーマ
 * @param {boolean} [props.isHighlighted] - 強調表示するか
 * @returns {JSX.Element} 確認行
 */
const ConfirmRow = ({ label, value, theme, isHighlighted = false }) => (
  <View style={styles.confirmRow}>
    <Text style={[styles.confirmLabel, { color: isHighlighted ? URGENCY_CARD_BORDER_COLOR : theme.textSecondary }]}>
      {label}
    </Text>
    <Text style={[styles.confirmValue, { color: isHighlighted ? URGENCY_CARD_BORDER_COLOR : theme.text }, isHighlighted && styles.highlightedText]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  /** オーバーレイ */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  /** モーダルコンテナ */
  modalContainer: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
  },
  /** タイトル */
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  /** 緊急バッジコンテナ */
  urgencyContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  /** 内容ボックス */
  contentBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  /** 確認行 */
  confirmRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  /** 確認ラベル */
  confirmLabel: {
    fontSize: 13,
    width: 80,
    fontWeight: '500',
  },
  /** 確認値 */
  confirmValue: {
    fontSize: 13,
    flex: 1,
  },
  /** 強調テキスト */
  highlightedText: {
    fontWeight: 'bold',
  },
  /** 注意文 */
  warningText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  /** ボタン行 */
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  /** キャンセルボタン */
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  /** キャンセルボタンテキスト */
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  /** 確定ボタン */
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  /** 確定ボタンテキスト */
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default MissingChildConfirmModal;
