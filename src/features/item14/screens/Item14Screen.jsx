/**
 * 項目14画面（会計）
 * 会計機能のメイン画面
 */

import React from 'react';
import { StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import PlaceholderContent from '../../../shared/components/PlaceholderContent';

/** 画面名 */
const SCREEN_NAME = '会計';

/**
 * 項目14画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 項目14画面
 */
const Item14Screen = ({ navigation }) => {
  /** テーマ情報 */
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
      <PlaceholderContent title={SCREEN_NAME} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Item14Screen;
