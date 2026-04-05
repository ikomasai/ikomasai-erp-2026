/**
 * 質問フォームコンポーネント
 * 質問種別を選び、本文を入力する
 */

import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { QUESTION_TYPES } from '../constants';

/**
 * 質問フォームコンポーネント
 * @param {Object} props - コンポーネント引数
 * @param {Object} props.theme - テーマオブジェクト
 * @param {string} props.questionType - 選択中の質問種別キー
 * @param {(value: string) => void} props.onChangeQuestionType - 質問種別変更コールバック
 * @param {string} props.questionDetail - 質問詳細本文
 * @param {(value: string) => void} props.onChangeQuestionDetail - 質問本文変更コールバック
 * @returns {JSX.Element} 質問フォーム
 */
const QuestionForm = ({
  theme,
  questionType,
  onChangeQuestionType,
  questionDetail,
  onChangeQuestionDetail,
}) => {
  /** 現在の画面幅 */
  const { width } = useWindowDimensions();
  /** 狭いスマホ幅では縦1列にして崩れを防ぐ */
  const isCompactLayout = width < 430;

  return (
    <View style={styles.formSection}>
      <Text style={[styles.label, { color: theme.text }]}>質問種別</Text>
      <View style={styles.questionTypeList}>
        {QUESTION_TYPES.map((option) => {
          /** 選択中かどうか */
          const isSelected = option.key === questionType;

          return (
            <Pressable
              key={option.key}
              style={[
                styles.questionTypeButton,
                isCompactLayout ? styles.questionTypeButtonCompact : styles.questionTypeButtonWide,
                {
                  borderColor: isSelected ? theme.primary : theme.border,
                  backgroundColor: isSelected ? `${theme.primary}18` : theme.background,
                },
              ]}
              onPress={() => onChangeQuestionType(option.key)}
            >
              <Text
                style={[
                  styles.questionTypeButtonText,
                  { color: isSelected ? theme.primary : theme.text },
                ]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.noticeCard,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: theme.text }]}>写真添付について</Text>
        <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
          質問系統では写真を添付できません。写真が必要な場合は Discord で連絡してください。
        </Text>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>詳細</Text>
      <TextInput
        value={questionDetail}
        onChangeText={onChangeQuestionDetail}
        multiline
        placeholder="相談内容を入力してください"
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
  questionTypeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  questionTypeButton: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questionTypeButtonCompact: {
    width: '100%',
  },
  questionTypeButtonWide: {
    width: '48.5%',
  },
  questionTypeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  noticeBody: {
    fontSize: 12,
    lineHeight: 18,
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

export default QuestionForm;
