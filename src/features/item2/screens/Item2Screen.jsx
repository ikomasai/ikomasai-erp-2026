/**
 * 項目2画面
 * 項目2機能のメイン画面
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
const SCREEN_NAME = '項目2';

/**
 * 項目2画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 項目2画面
 */
const Item2Screen = ({ navigation }) => {
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

export default Item2Screen;
