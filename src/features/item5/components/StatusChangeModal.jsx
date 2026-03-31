/**
 * ステータス変更モーダルコンポーネント
 * 管理ロールが迷子情報のステータス変更・コメント記入・保護場所編集・名前登録を行うモーダル
 * 移動不可案件の場合は保護テントと迎え場所の編集フィールドも表示する
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import UrgencyBadge from './UrgencyBadge';
import {
  ADMIN_CHANGEABLE_STATUSES,
  MISSING_CHILD_STATUS_LABELS,
  MISSING_CHILD_STATUS_COLORS,
  SHELTER_TENT_OPTIONS,
  SHELTER_TENT_LABELS,
  UNABLE_TO_MOVE,
  URGENCY_CARD_BORDER_COLOR,
  GENDER_LABELS,
} from '../constants';

/**
 * ステータス変更モーダル
 * @param {Object} props - コンポーネントプロパティ
 * @param {boolean} props.isVisible - モーダル表示状態
 * @param {Object|null} props.child - 対象の迷子情報
 * @param {Function} props.onSubmit - 更新確定時のコールバック(id, status, comment, shelterTent, pickupLocation, name)
 * @param {Function} props.onClose - モーダルを閉じる時のコールバック
 * @param {boolean} [props.isSubmitting] - 送信中かどうか
 * @returns {JSX.Element|null} ステータス変更モーダル
 */
const StatusChangeModal = ({ isVisible, child, onSubmit, onClose, isSubmitting = false }) => {
  const { theme } = useTheme();

  /** 選択中のステータス */
  const [selectedStatus, setSelectedStatus] = useState('');
  /** コメント */
  const [comment, setComment] = useState('');
  /** 保護テント（移動不可案件の編集用） */
  const [shelterTent, setShelterTent] = useState('');
  /** 迎え場所（移動不可案件の編集用） */
  const [pickupLocation, setPickupLocation] = useState('');
  /** 迷子の名前（管理ロールが登録） */
  const [name, setName] = useState('');
  /** バリデーションエラー */
  const [validationError, setValidationError] = useState('');

  /* モーダル表示時に現在値で初期化する（ステータスは未選択状態にして必須選択とする） */
  useEffect(() => {
    if (child && isVisible) {
      setSelectedStatus('');
      setComment(child.admin_comment || '');
      setShelterTent(child.shelter_tent);
      setPickupLocation(child.pickup_location || '');
      setName(child.name || '');
      setValidationError('');
    }
  }, [child, isVisible]);

  if (!child) return null;

  /** 元が移動不可の案件かどうか（編集フィールド表示判定用） */
  const isOriginallyUrgent = child.shelter_tent === UNABLE_TO_MOVE;

  /** 現在の選択が移動不可かどうか */
  const isCurrentlyUrgent = shelterTent === UNABLE_TO_MOVE;

  /**
   * 登録者の表示文字列を生成する（(ロール1,ロール2)氏名 形式）
   * @returns {string} 登録者表示文字列
   */
  const getReporterLabel = () => {
    if (!child.reporter) return '不明';
    /** ロール名をカンマ区切りで結合 */
    const roleStr = child.reporter.roles?.length > 0
      ? `(${child.reporter.roles.join(',')})`
      : '';
    /** 氏名 */
    const nameStr = child.reporter.name ?? '不明';
    return roleStr ? `${roleStr}${nameStr}` : nameStr;
  };

  /**
   * 保護テント変更時のハンドラ
   * @param {string} value - 選択された値
   */
  const handleShelterTentChange = (value) => {
    setShelterTent(value);
    if (value !== UNABLE_TO_MOVE) {
      setPickupLocation('');
    }
  };

  /**
   * 送信ボタン押下時のハンドラ
   */
  const handleSubmit = () => {
    /* ステータスは必須選択 */
    if (!selectedStatus) {
      setValidationError('ステータスを選択してください。');
      return;
    }

    /* 移動不可のままの場合は迎え場所が必須 */
    if (isCurrentlyUrgent && !pickupLocation.trim()) {
      setValidationError('「移動不可」の場合は迎え場所を入力してください。');
      return;
    }

    setValidationError('');

    /** 保護テントの変更有無（元の値と比較） */
    const hasShelterChange = shelterTent !== child.shelter_tent;
    /** 迎え場所の変更有無 */
    const hasPickupChange = pickupLocation !== (child.pickup_location || '');
    /** 名前の変更有無 */
    const hasNameChange = name !== (child.name || '');

    onSubmit(
      child.id,
      selectedStatus,
      comment.trim() || null,
      (hasShelterChange || hasPickupChange) ? shelterTent : null,
      (hasShelterChange || hasPickupChange) ? (isCurrentlyUrgent ? pickupLocation.trim() : null) : null,
      hasNameChange ? name : null,
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* タイトル */}
            <Text style={[styles.title, { color: theme.text }]}>対応・編集</Text>

            {/* 迷子情報サマリ */}
            <View style={[styles.summaryBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {/* 名前（登録済みの場合のみ表示） */}
              {child.name && (
                <Text style={[styles.summaryName, { color: theme.text }]}>{child.name}</Text>
              )}
              <Text style={[styles.summaryDetail, { color: theme.textSecondary }]}>
                {child.age} / {GENDER_LABELS[child.gender] || child.gender} / {child.characteristics}
              </Text>
              <Text style={[styles.summaryDetail, { color: theme.textSecondary }]}>
                発見場所: {child.discovery_location}
              </Text>
              <Text style={[styles.summaryDetail, { color: theme.textSecondary }]}>
                保護テント: {SHELTER_TENT_LABELS[child.shelter_tent] || child.shelter_tent}
              </Text>
              {/* 登録者（(ロール)氏名 形式） */}
              {child.reporter && (
                <Text style={[styles.summaryDetail, { color: theme.textSecondary }]}>
                  登録者: {getReporterLabel()}
                </Text>
              )}
            </View>

            {/* 名前登録（管理ロールが入力） */}
            <Text style={[styles.sectionLabel, { color: theme.text, marginBottom: 8 }]}>名前（任意）</Text>
            <TextInput
              style={[styles.nameInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={name}
              onChangeText={setName}
              placeholder="迷子の名前（判明次第入力）"
              placeholderTextColor={theme.textSecondary}
            />

            {/* ステータス選択（必須） */}
            <View style={styles.sectionLabelRow}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>ステータス</Text>
              <Text style={styles.requiredBadge}>必須</Text>
            </View>
            {!selectedStatus && (
              <Text style={[styles.statusHint, { color: theme.textSecondary }]}>
                いずれかを選択してください
              </Text>
            )}
            <View style={styles.statusContainer}>
              {ADMIN_CHANGEABLE_STATUSES.map((status) => {
                /** 選択中かどうか */
                const isSelected = selectedStatus === status;
                /** ステータスに対応する色 */
                const statusColor = MISSING_CHILD_STATUS_COLORS[status];
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusButton,
                      { borderColor: statusColor },
                      isSelected && { backgroundColor: statusColor },
                    ]}
                    onPress={() => setSelectedStatus(status)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      { color: statusColor },
                      isSelected && { color: '#FFFFFF' },
                    ]}>
                      {MISSING_CHILD_STATUS_LABELS[status]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* コメント */}
            <Text style={[styles.sectionLabel, { color: theme.text, marginBottom: 8 }]}>コメント（任意）</Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={comment}
              onChangeText={setComment}
              placeholder="対応内容やメモ"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* 移動不可案件の保護場所編集（元が移動不可の場合のみ表示） */}
            {isOriginallyUrgent && (
              <View style={[styles.urgentEditSection, { borderColor: URGENCY_CARD_BORDER_COLOR }]}>
                <View style={styles.urgentEditHeader}>
                  <UrgencyBadge label="保護場所の編集" />
                </View>

                <Text style={[styles.sectionLabel, { color: '#212121', marginBottom: 8 }]}>保護テント</Text>
                <View style={styles.shelterContainer}>
                  {SHELTER_TENT_OPTIONS.map((option) => {
                    /** 選択中かどうか */
                    const isSelected = shelterTent === option.value;
                    /** 移動不可かどうか */
                    const isUrgentOption = option.value === UNABLE_TO_MOVE;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.shelterButton,
                          { borderColor: theme.border },
                          isSelected && !isUrgentOption && { backgroundColor: theme.primary, borderColor: theme.primary },
                          isSelected && isUrgentOption && { backgroundColor: URGENCY_CARD_BORDER_COLOR, borderColor: URGENCY_CARD_BORDER_COLOR },
                        ]}
                        onPress={() => handleShelterTentChange(option.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.shelterButtonText,
                          { color: '#555555' },
                          isSelected && { color: '#FFFFFF', fontWeight: '600' },
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 迎え場所（移動不可のままの場合） */}
                {isCurrentlyUrgent && (
                  <View style={styles.pickupEditContainer}>
                    <Text style={[styles.sectionLabel, { color: URGENCY_CARD_BORDER_COLOR, marginBottom: 8 }]}>
                      迎えに来て欲しい場所 *
                    </Text>
                    <TextInput
                      style={[styles.pickupInput, { backgroundColor: '#FFF3F3', borderColor: URGENCY_CARD_BORDER_COLOR, color: '#212121' }]}
                      value={pickupLocation}
                      onChangeText={setPickupLocation}
                      placeholder="例: A館1階エレベーター前"
                      placeholderTextColor="#999999"
                    />
                  </View>
                )}
              </View>
            )}

            {/* バリデーションエラー */}
            {validationError !== '' && (
              <Text style={styles.errorText}>{validationError}</Text>
            )}

            {/* ボタン */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={onClose}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary, opacity: (isSubmitting || !selectedStatus) ? 0.6 : 1 }]}
                onPress={handleSubmit}
                disabled={isSubmitting || !selectedStatus}
                activeOpacity={0.7}
              >
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? '更新中...' : '更新'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '85%' },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  summaryBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20 },
  summaryName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  summaryDetail: { fontSize: 13, marginBottom: 2 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  sectionLabel: { fontSize: 14, fontWeight: '600' },
  requiredBadge: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', backgroundColor: '#F44336', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusHint: { fontSize: 12, marginBottom: 8 },
  nameInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 20 },
  statusContainer: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  statusButton: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  statusButtonText: { fontSize: 14, fontWeight: '500' },
  commentInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, marginBottom: 20 },
  urgentEditSection: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20, backgroundColor: '#FFF8F8' },
  urgentEditHeader: { marginBottom: 12 },
  shelterContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  shelterButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  shelterButtonText: { fontSize: 13 },
  pickupEditContainer: { marginTop: 4 },
  pickupInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  errorText: { color: '#F44336', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  cancelButtonText: { fontSize: 14, fontWeight: '600' },
  submitButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

export default StatusChangeModal;
