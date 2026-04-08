/**
 * 成功通知モーダルコンポーネント
 * 迷子登録完了やステータス更新完了など、操作成功を明示的に知らせるモーダル
 * 従来の画面上部の緑バー通知を置き換える
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';

/** 成功アイコンの色（緑） */
const SUCCESS_COLOR = '#4CAF50';
/** エラーアイコンの色（赤） */
const ERROR_COLOR = '#F44336';

/**
 * 結果通知モーダル（成功・エラー共用）
 * @param {Object} props - コンポーネントプロパティ
 * @param {boolean} props.isVisible - モーダル表示状態
 * @param {string} props.title - タイトル
 * @param {string} props.message - 本文メッセージ
 * @param {Function} props.onClose - 閉じるボタン押下時のコールバック
 * @param {'success'|'error'} [props.variant] - 表示バリアント（省略時は success）
 * @returns {JSX.Element} 結果通知モーダル
 */
const SuccessModal = ({ isVisible, title, message, onClose, variant = 'success' }) => {
  const { theme } = useTheme();

  /** バリアントに応じたアクセントカラー */
  const accentColor = variant === 'error' ? ERROR_COLOR : SUCCESS_COLOR;
  /** バリアントに応じたアイコン文字 */
  const iconChar = variant === 'error' ? '✕' : '✓';

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
          {/* アイコン */}
          <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
            <Text style={styles.iconText}>{iconChar}</Text>
          </View>

          {/* タイトル */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {/* メッセージ */}
          {message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
          ) : null}

          {/* 閉じるボタン */}
          <TouchableOpacity
            style={[styles.okButton, { backgroundColor: accentColor }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

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
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  /** アイコンの円 */
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SUCCESS_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  /** アイコンテキスト（チェック） */
  iconText: {
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: 'bold',
    lineHeight: 40,
  },
  /** タイトル */
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  /** メッセージ */
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  /** OKボタン */
  okButton: {
    paddingVertical: 12,
    paddingHorizontal: 48,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 140,
  },
  /** OKボタンテキスト */
  okButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SuccessModal;
