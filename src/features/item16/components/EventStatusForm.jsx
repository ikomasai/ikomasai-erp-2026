/**
 * 企画開始/終了報告フォームコンポーネント
 * 報告種別選択だけを提供する
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EVENT_STATUS_OPTIONS } from '../constants';

/**
 * 企画開始/終了報告フォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {string} props.eventStatus - 選択中の報告種別キー
 * @param {(value: string) => void} props.onChangeEventStatus - 報告種別変更コールバック
 * @param {(options: Array, selectedValue: string, onSelect: Function, renderSubLabel?: Function) => JSX.Element} props.renderOptionButtons - 選択ボタン群描画関数
 * @returns {JSX.Element} 企画開始/終了報告フォーム
 */
const EventStatusForm = ({
  theme,
  eventStatus,
  onChangeEventStatus,
  renderOptionButtons,
}) => {
  return (
    <View style={styles.formSection}>
      <Text style={[styles.label, { color: theme.text }]}>報告種別</Text>
      {renderOptionButtons(EVENT_STATUS_OPTIONS, eventStatus, onChangeEventStatus)}
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
});

export default EventStatusForm;
