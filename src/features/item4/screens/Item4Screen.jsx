/**
 * 項目4画面
 * 項目4機能のメイン画面
 */

import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import PlaceholderContent from '../../../shared/components/PlaceholderContent';

/** ブレークポイント（スマホ/PC切り替え） */
const MOBILE_BREAKPOINT = 768;

/** 画面名 */
const SCREEN_NAME = '項目4';

/**
 * 項目4画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 項目4画面
 */
const Item4Screen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      {/* コンテンツ */}
      <PlaceholderContent title={SCREEN_NAME} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
});

export default Item4Screen;
