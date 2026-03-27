/**
 * テーマ選択セクションコンポーネント
 * 設定画面の表示セクション内に表示するテーマ選択UI
 * ロジックは既存の useTheme フックを再利用
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemeOptionRow } from './ThemeOptionRow';
import { ThemeStatusText } from './ThemeStatusText';
import { THEME_OPTIONS } from '../constants';

/**
 * テーマ選択セクション
 * 設定画面内にインラインで表示するテーマ選択UI
 * @returns {JSX.Element} テーマ選択セクション
 */
const SettingsThemeSection = () => {
  /** テーマコンテキスト */
  const { themeMode, theme, changeTheme, isTransitioning } = useTheme();
  /** テーマ変更時のステータスメッセージ */
  const [status, setStatus] = useState(null);

  /**
   * テーマ変更ハンドラー
   * 選択されたテーマモードに切り替え、結果をステータス表示する
   * @param {string} newMode - 新しいテーマモード
   */
  const handleThemeChange = async (newMode) => {
    setStatus(null);
    const success = await changeTheme(newMode);

    if (success) {
      setStatus({ type: 'success', message: '保存しました' });
    } else {
      setStatus({ type: 'error', message: '保存に失敗しました（ローカルに保持）' });
    }

    // 3秒後にステータスを自動非表示
    setTimeout(() => {
      setStatus(null);
    }, 3000);
  };

  return (
    <View style={styles.container}>
      {/* 説明テキスト */}
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        お好みのテーマを選択してください
      </Text>

      {/* テーマ選択肢一覧 */}
      <View style={styles.options}>
        {THEME_OPTIONS.map((option) => (
          <ThemeOptionRow
            key={option.value}
            option={option}
            isSelected={themeMode === option.value}
            onSelect={handleThemeChange}
            disabled={isTransitioning}
          />
        ))}
      </View>

      {/* ステータスメッセージ */}
      <ThemeStatusText status={status} />
    </View>
  );
};

const styles = StyleSheet.create({
  /** セクション全体のコンテナ */
  container: {
    gap: 0,
  },
  /** 説明テキスト */
  description: {
    fontSize: 14,
    marginBottom: 12,
  },
  /** テーマ選択肢のコンテナ */
  options: {
    gap: 0,
  },
});

export default SettingsThemeSection;
