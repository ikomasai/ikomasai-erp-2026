/**
 * パスワード変更セクションコンポーネント
 * 設定画面のアカウントセクション内に表示するパスワード変更フォーム
 * 全フィールドに目のアイコン付き（タップで5秒間表示、カウントダウン付き）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { Ionicons } from '../../../shared/components/icons';
import { usePasswordChange } from '../../auth/hooks/usePasswordChange';
import {
  SETTINGS_PASSWORD_TEXT,
  SETTINGS_PASSWORD_SUCCESS_MESSAGE,
  PASSWORD_REVEAL_DURATION_SEC,
} from '../constants';

/**
 * 目のアイコン＋カウントダウン付きパスワード入力フィールド
 * アイコンタップで一定時間パスワードを表示し、残り秒数をカウントダウン表示する
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.label - フィールドラベル
 * @param {string} props.placeholder - プレースホルダーテキスト
 * @param {string} props.value - 入力値
 * @param {Function} props.onChangeText - 入力変更コールバック
 * @param {string} props.errorMessage - エラーメッセージ（あれば表示）
 * @param {boolean} props.disabled - 送信中などの無効化フラグ
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} 目のアイコン付きパスワード入力フィールド
 */
const PasswordInputWithReveal = ({
  label,
  placeholder,
  value,
  onChangeText,
  errorMessage,
  disabled,
  theme,
}) => {
  /** パスワード表示中フラグ */
  const [isRevealed, setIsRevealed] = useState(false);
  /** カウントダウンの残り秒数（表示中のみ更新） */
  const [countdown, setCountdown] = useState(PASSWORD_REVEAL_DURATION_SEC);
  /** 自動非表示用タイマーのref */
  const revealTimerRef = useRef(null);
  /** カウントダウンインターバルのref */
  const countdownIntervalRef = useRef(null);

  /**
   * 表示を終了してタイマーを全てクリアする
   */
  const stopReveal = useCallback(() => {
    clearTimeout(revealTimerRef.current);
    clearInterval(countdownIntervalRef.current);
    setIsRevealed(false);
    setCountdown(PASSWORD_REVEAL_DURATION_SEC);
  }, []);

  /**
   * 目のアイコンタップ時の処理
   * 表示中なら即座に非表示。非表示なら表示開始＋カウントダウン開始
   */
  const handleRevealToggle = useCallback(() => {
    if (isRevealed) {
      stopReveal();
      return;
    }

    // 表示開始
    setIsRevealed(true);
    setCountdown(PASSWORD_REVEAL_DURATION_SEC);

    // 自動非表示タイマー
    revealTimerRef.current = setTimeout(() => {
      stopReveal();
    }, PASSWORD_REVEAL_DURATION_SEC * 1000);

    // 1秒ごとのカウントダウン更新
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          return PASSWORD_REVEAL_DURATION_SEC;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isRevealed, stopReveal]);

  /**
   * アンマウント時にタイマーをクリア
   */
  useEffect(() => {
    return () => {
      clearTimeout(revealTimerRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, []);

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.surface,
              borderColor: errorMessage ? theme.error : theme.border,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!isRevealed}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
        />
        {/* 目のアイコン＋カウントダウン */}
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={handleRevealToggle}
          accessibilityRole="button"
          accessibilityLabel={isRevealed ? 'パスワードを隠す' : 'パスワードを表示する'}
        >
          {isRevealed ? (
            <View style={styles.eyeRevealContainer}>
              <Text style={[styles.countdownText, { color: theme.primary }]}>
                {countdown}s
              </Text>
            </View>
          ) : (
            <Ionicons name="eye" size={20} color={theme.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
      {errorMessage ? (
        <Text style={[styles.fieldError, { color: theme.error }]}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
};

/**
 * パスワード変更セクション
 * 設定画面内にインラインで表示するパスワード変更フォーム
 * @returns {JSX.Element} パスワード変更セクション
 */
const SettingsPasswordSection = () => {
  /** テーマコンテキスト */
  const { theme } = useTheme();

  /** パスワード変更フック（既存ロジックを再利用） */
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    isSubmitting,
    errors,
    clearError,
    handleChangePassword,
    resetForm,
  } = usePasswordChange();

  /** 成功メッセージの表示状態 */
  const [showSuccess, setShowSuccess] = useState(false);

  /**
   * 入力時にエラーをクリアする
   * @param {string} field - フィールド名
   * @param {Function} setter - 値を設定する関数
   * @param {string} value - 新しい値
   */
  const handleInputChange = (field, setter, value) => {
    setter(value);
    if (errors[field]) {
      clearError(field);
    }
    if (showSuccess) {
      setShowSuccess(false);
    }
  };

  /**
   * パスワード変更を実行
   * 成功時はフォームをリセットし、インラインで成功メッセージを表示
   */
  const handleSubmit = async () => {
    const result = await handleChangePassword();
    if (result.success) {
      resetForm();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    }
  };

  return (
    <View style={styles.container}>
      {/* 全体エラーメッセージ */}
      {errors.general ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.error + '15', borderColor: theme.error }]}>
          <Text style={[styles.errorBannerText, { color: theme.error }]}>
            {errors.general}
          </Text>
        </View>
      ) : null}

      {/* 成功メッセージ */}
      {showSuccess ? (
        <View style={[styles.successBanner, { backgroundColor: theme.success + '15', borderColor: theme.success }]}>
          <Text style={[styles.successBannerText, { color: theme.success }]}>
            {SETTINGS_PASSWORD_SUCCESS_MESSAGE}
          </Text>
        </View>
      ) : null}

      {/* 現在のパスワード（目のアイコン付き） */}
      <PasswordInputWithReveal
        label={SETTINGS_PASSWORD_TEXT.CURRENT_PASSWORD_LABEL}
        placeholder={SETTINGS_PASSWORD_TEXT.CURRENT_PASSWORD_PLACEHOLDER}
        value={currentPassword}
        onChangeText={(value) => handleInputChange('currentPassword', setCurrentPassword, value)}
        errorMessage={errors.currentPassword}
        disabled={isSubmitting}
        theme={theme}
      />

      {/* 新しいパスワード（目のアイコン付き） */}
      <PasswordInputWithReveal
        label={SETTINGS_PASSWORD_TEXT.NEW_PASSWORD_LABEL}
        placeholder={SETTINGS_PASSWORD_TEXT.NEW_PASSWORD_PLACEHOLDER}
        value={newPassword}
        onChangeText={(value) => handleInputChange('newPassword', setNewPassword, value)}
        errorMessage={errors.newPassword}
        disabled={isSubmitting}
        theme={theme}
      />

      {/* 確認用パスワード（目のアイコン付き） */}
      <PasswordInputWithReveal
        label={SETTINGS_PASSWORD_TEXT.CONFIRM_PASSWORD_LABEL}
        placeholder={SETTINGS_PASSWORD_TEXT.CONFIRM_PASSWORD_PLACEHOLDER}
        value={confirmPassword}
        onChangeText={(value) => handleInputChange('confirmPassword', setConfirmPassword, value)}
        errorMessage={errors.confirmPassword}
        disabled={isSubmitting}
        theme={theme}
      />

      {/* 保存ボタン */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          { backgroundColor: theme.primary },
          isSubmitting && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="パスワードを変更する"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>
            {SETTINGS_PASSWORD_TEXT.SUBMIT_BUTTON}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  /** セクション全体のコンテナ */
  container: {
    gap: 0,
  },
  /** 入力グループ */
  inputGroup: {
    marginBottom: 16,
  },
  /** ラベル */
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  /** テキスト入力と目のアイコンを横並びにするラッパー */
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** テキスト入力 */
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 44,
    fontSize: 14,
  },
  /** 目のアイコンボタン */
  eyeButton: {
    position: 'absolute',
    right: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** カウントダウン表示コンテナ */
  eyeRevealContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** カウントダウンテキスト */
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  /** フィールドエラーメッセージ */
  fieldError: {
    fontSize: 12,
    marginTop: 4,
  },
  /** 全体エラーバナー */
  errorBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  /** エラーバナーテキスト */
  errorBannerText: {
    fontSize: 14,
  },
  /** 成功バナー */
  successBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  /** 成功バナーテキスト */
  successBannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  /** 送信ボタン */
  submitButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  /** 送信ボタン無効時 */
  submitButtonDisabled: {
    opacity: 0.6,
  },
  /** 送信ボタンテキスト */
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsPasswordSection;
