/**
 * 迷子登録フォームコンポーネント
 * 迷子発見時の新規登録フォーム
 * 名前は管理ロール（実長・渉外部）が対応・編集モーダルから登録する
 * 保護テントで「移動不可」を選択すると迎え場所入力が表示される
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import {
  GENDER_OPTIONS,
  SHELTER_TENT_OPTIONS,
  UNABLE_TO_MOVE,
  CHARACTERISTICS_PLACEHOLDER,
} from '../constants';

/**
 * プルダウン選択コンポーネント（シンプルなボタン群で実装）
 * @param {Object} props - プロパティ
 * @param {Array} props.options - 選択肢配列 [{label, value}]
 * @param {string} props.selectedValue - 選択中の値
 * @param {Function} props.onSelect - 選択時のコールバック
 * @param {Object} props.theme - テーマ
 * @returns {JSX.Element} プルダウン
 */
const OptionSelector = ({ options, selectedValue, onSelect, theme }) => (
  <View style={styles.optionContainer}>
    {options.map((option) => {
      /** 選択されているかどうか */
      const isSelected = selectedValue === option.value;
      return (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.optionButton,
            { borderColor: theme.border },
            isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
          ]}
          onPress={() => onSelect(option.value)}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.optionText,
            { color: theme.textSecondary },
            isSelected && { color: '#FFFFFF', fontWeight: '600' },
          ]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

/**
 * 迷子登録フォーム
 * @param {Object} props - コンポーネントプロパティ
 * @param {Function} props.onSubmit - フォーム送信時のコールバック（確認モーダル表示用）
 * @returns {JSX.Element} 登録フォーム
 */
const MissingChildForm = ({ onSubmit }) => {
  const { theme } = useTheme();

  /** 年齢 */
  const [age, setAge] = useState('');
  /** 性別 */
  const [gender, setGender] = useState('');
  /** 特徴 */
  const [characteristics, setCharacteristics] = useState('');
  /** 発見場所 */
  const [discoveryLocation, setDiscoveryLocation] = useState('');
  /** 保護テント */
  const [shelterTent, setShelterTent] = useState('');
  /** 迎えに来て欲しい場所（移動不可時のみ） */
  const [pickupLocation, setPickupLocation] = useState('');
  /** バリデーションエラーメッセージ */
  const [validationError, setValidationError] = useState('');

  /** 移動不可が選択されているかどうか */
  const isUnableToMove = shelterTent === UNABLE_TO_MOVE;


  /**
   * 保護テント変更時のハンドラ
   * 移動不可以外に変更した場合は迎え場所をクリアする
   * @param {string} value - 選択された値
   */
  const handleShelterTentChange = useCallback((value) => {
    setShelterTent(value);
    if (value !== UNABLE_TO_MOVE) {
      setPickupLocation('');
    }
  }, []);

  /**
   * フォームのバリデーションを実行する
   * @returns {boolean} バリデーション成功かどうか
   */
  const validate = () => {
    if (!age.trim()) {
      setValidationError('年齢を入力してください。');
      return false;
    }
    if (!gender) {
      setValidationError('性別を選択してください。');
      return false;
    }
    if (!characteristics.trim()) {
      setValidationError('特徴を入力してください。');
      return false;
    }
    if (!discoveryLocation.trim()) {
      setValidationError('発見場所を入力してください。');
      return false;
    }
    if (!shelterTent) {
      setValidationError('保護テントを選択してください。');
      return false;
    }
    if (isUnableToMove && !pickupLocation.trim()) {
      setValidationError('迎えに来て欲しい場所を入力してください。');
      return false;
    }
    setValidationError('');
    return true;
  };

  /**
   * 送信ボタン押下時のハンドラ
   * バリデーション後に確認モーダル表示用のコールバックを呼ぶ
   */
  const handleSubmit = () => {
    if (!validate()) return;

    /** 確認モーダルに渡す迷子情報（名前は管理ロールが後から登録するため含めない） */
    const childData = {
      age: age.trim(),
      gender,
      characteristics: characteristics.trim(),
      discovery_location: discoveryLocation.trim(),
      shelter_tent: shelterTent,
      pickup_location: isUnableToMove ? pickupLocation.trim() : null,
    };

    onSubmit(childData);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* 年齢 */}
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>年齢 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          value={age}
          onChangeText={setAge}
          placeholder="例: 3歳"
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      {/* 性別 */}
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>性別 <Text style={styles.required}>*</Text></Text>
        <OptionSelector options={GENDER_OPTIONS} selectedValue={gender} onSelect={setGender} theme={theme} />
      </View>

      {/* 特徴 */}
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>特徴 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          value={characteristics}
          onChangeText={setCharacteristics}
          placeholder={CHARACTERISTICS_PLACEHOLDER}
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* 発見場所 */}
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>発見場所 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          value={discoveryLocation}
          onChangeText={setDiscoveryLocation}
          placeholder="例: B館前広場"
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      {/* 保護テント */}
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>保護テント <Text style={styles.required}>*</Text></Text>
        <OptionSelector options={SHELTER_TENT_OPTIONS} selectedValue={shelterTent} onSelect={handleShelterTentChange} theme={theme} />
      </View>

      {/* 迎えに来て欲しい場所（移動不可時のみ表示） */}
      {isUnableToMove && (
        <View style={[styles.fieldContainer, styles.pickupFieldContainer]}>
          <Text style={[styles.fieldLabel, { color: '#F44336' }]}>
            迎えに来て欲しい場所 <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: '#FFF3F3', borderColor: '#F44336', color: theme.text }]}
            value={pickupLocation}
            onChangeText={setPickupLocation}
            placeholder="例: A館1階エレベーター前"
            placeholderTextColor={theme.textSecondary}
          />
          <Text style={styles.pickupHint}>
            ※ 迷子が移動できないため、迎えに来てもらう場所を入力してください
          </Text>
        </View>
      )}

      {/* バリデーションエラー */}
      {validationError !== '' && (
        <Text style={styles.errorText}>{validationError}</Text>
      )}

      {/* 登録ボタン */}
      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: theme.primary }]}
        onPress={handleSubmit}
        activeOpacity={0.7}
      >
        <Text style={styles.submitButtonText}>登録</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /** コンテナ */
  container: {
    flex: 1,
  },
  /** コンテンツコンテナ */
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  /** フィールドコンテナ */
  fieldContainer: {
    marginBottom: 16,
  },
  /** フィールドラベル */
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  /** 必須マーク */
  required: {
    color: '#F44336',
  },
  /** テキスト入力 */
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  /** 複数行テキスト入力 */
  multilineInput: {
    minHeight: 80,
    paddingTop: 10,
  },
  /** 選択肢コンテナ */
  optionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  /** 選択肢ボタン */
  optionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  /** 選択肢テキスト */
  optionText: {
    fontSize: 14,
  },
  /** 迎え場所フィールド（赤枠） */
  pickupFieldContainer: {
    backgroundColor: '#FFF3F3',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  /** 迎え場所ヒントテキスト */
  pickupHint: {
    fontSize: 11,
    color: '#F44336',
    marginTop: 6,
  },
  /** 読み取り専用フィールド */
  readonlyField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  /** 読み取り専用テキスト */
  readonlyText: {
    fontSize: 14,
  },
  /** エラーテキスト */
  errorText: {
    color: '#F44336',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  /** 登録ボタン */
  submitButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  /** 登録ボタンテキスト */
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MissingChildForm;
