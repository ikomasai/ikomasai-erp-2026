/**
 * 緊急連絡フォームコンポーネント
 * 現在地・場所の必須入力と緊急内容の任意入力を提供する
 */

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * 緊急連絡フォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {string} props.emergencyLocation - 現在地・場所入力値
 * @param {(value: string) => void} props.onChangeLocation - 場所変更コールバック
 * @param {string} props.emergencyDetail - 緊急内容入力値（任意）
 * @param {(value: string) => void} props.onChangeDetail - 緊急内容変更コールバック
 * @returns {JSX.Element} 緊急連絡フォーム
 */
const EmergencyForm = ({
  theme,
  emergencyLocation,
  onChangeLocation,
  emergencyDetail,
  onChangeDetail,
}) => {
  return (
    <View style={styles.formSection}>
      {/* 場所入力（必須）: 本部側が「どこ・誰か」を即判断できるよう先頭に配置 */}
      <Text style={[styles.label, { color: theme.text }]}>現在地・場所 <Text style={[styles.required, { color: '#D1242F' }]}>必須</Text></Text>
      <TextInput
        value={emergencyLocation}
        onChangeText={onChangeLocation}
        placeholder="例: A館2F廊下、正門前など"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.singleLineInput,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
      />

      {/* 緊急内容（任意） */}
      <Text style={[styles.label, { color: theme.text }]}>緊急内容（任意）</Text>
      <TextInput
        value={emergencyDetail}
        onChangeText={onChangeDetail}
        multiline
        placeholder="緊急内容（任意）"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.multilineInput,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  formSection: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  /** 必須マーク */
  required: {
    fontSize: 12,
    fontWeight: '700',
  },
  singleLineInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multilineInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

export default EmergencyForm;
