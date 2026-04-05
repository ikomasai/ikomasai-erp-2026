/**
 * デバッグ用日付操作コンポーネント
 * 祭期間判定のテスト用に、任意の日付を設定できるUI
 * IS_DEBUG_MODE が false の場合は何も表示しない
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { IS_DEBUG_MODE } from '../constants';

/**
 * デバッグ用日付操作
 * @param {Object} props - コンポーネントプロパティ
 * @param {Date|null} props.debugDate - 現在設定されているデバッグ日付
 * @param {Function} props.onDateChange - 日付変更時のコールバック(Date|null)
 * @returns {JSX.Element|null} デバッグ用日付操作UI（IS_DEBUG_MODE=falseの場合null）
 */
const DebugDatePicker = ({ debugDate, onDateChange }) => {
  const { theme } = useTheme();

  /* デバッグモードでない場合は何も表示しない */
  if (!IS_DEBUG_MODE) {
    return null;
  }

  /**
   * 入力された日付文字列をDateオブジェクトに変換して設定する
   * @param {string} text - 日付文字列（YYYY-MM-DD形式）
   */
  const handleTextChange = (text) => {
    if (!text.trim()) {
      onDateChange(null);
      return;
    }

    /** パースした日付オブジェクト */
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      onDateChange(parsed);
    }
  };

  /**
   * デバッグ日付をリセットする（現在日付に戻す）
   */
  const handleReset = () => {
    onDateChange(null);
  };

  /** 表示用の日付文字列 */
  const displayDate = debugDate
    ? `${debugDate.getFullYear()}-${(debugDate.getMonth() + 1).toString().padStart(2, '0')}-${debugDate.getDate().toString().padStart(2, '0')}`
    : '';

  /** 現在の実際の日付 */
  const today = new Date();
  /** 実際の日付表示 */
  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  return (
    <View style={[styles.container, { borderColor: '#FF9800', backgroundColor: '#FFF8E1' }]}>
      <Text style={styles.title}>デバッグ用: 現在日付の操作</Text>
      <Text style={styles.description}>
        祭期間判定のテスト用です。YYYY-MM-DD形式で入力してください。
      </Text>
      <Text style={[styles.actualDate, { color: theme.textSecondary }]}>
        実際の今日: {todayStr}
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.dateInput, { borderColor: '#FF9800', color: theme.text }]}
          value={displayDate}
          onChangeText={handleTextChange}
          placeholder="例: 2026-11-03"
          placeholderTextColor={theme.textSecondary}
        />
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Text style={styles.resetButtonText}>リセット</Text>
        </TouchableOpacity>
      </View>

      {/* 便利なプリセットボタン */}
      <View style={styles.presetRow}>
        <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>プリセット:</Text>
        <TouchableOpacity style={styles.presetButton} onPress={() => onDateChange(new Date(today.getFullYear(), 10, 1))} activeOpacity={0.7}>
          <Text style={styles.presetButtonText}>11/01</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.presetButton} onPress={() => onDateChange(new Date(today.getFullYear(), 10, 3))} activeOpacity={0.7}>
          <Text style={styles.presetButtonText}>11/03</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.presetButton} onPress={() => onDateChange(new Date(today.getFullYear(), 10, 5))} activeOpacity={0.7}>
          <Text style={styles.presetButtonText}>11/05</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.presetButton} onPress={() => onDateChange(new Date(today.getFullYear(), 10, 6))} activeOpacity={0.7}>
          <Text style={styles.presetButtonText}>11/06</Text>
        </TouchableOpacity>
      </View>

      {debugDate && (
        <Text style={styles.activeNotice}>
          デバッグ日付が有効: {displayDate}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 16, marginTop: 20 },
  title: { fontSize: 14, fontWeight: 'bold', color: '#E65100', marginBottom: 4 },
  description: { fontSize: 11, color: '#795548', marginBottom: 4 },
  actualDate: { fontSize: 12, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dateInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  resetButton: { backgroundColor: '#FF9800', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
  resetButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  presetLabel: { fontSize: 12 },
  presetButton: { backgroundColor: '#FFE0B2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  presetButtonText: { fontSize: 12, color: '#E65100', fontWeight: '500' },
  activeNotice: { color: '#E65100', fontSize: 12, fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
});

export default DebugDatePicker;
