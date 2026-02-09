/**
 * 項目15画面（物品）
 * 物品機能のメイン画面
 */

import React from 'react';
import { StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import PlaceholderContent from '../../../shared/components/PlaceholderContent';

/** 画面名 */
const SCREEN_NAME = '物品';

/**
 * 項目15画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 項目15画面
 */
const Item15Screen = ({ navigation }) => {
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

export default Item15Screen;
