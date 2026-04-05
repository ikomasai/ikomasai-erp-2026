/**
 * スケルトンローダーコンポーネント
 * データ読み込み中にプレースホルダーアニメーションを表示する
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** アニメーション周期（ミリ秒） */
const ANIMATION_DURATION = 1200;
/** デフォルトの行数 */
const DEFAULT_LINE_COUNT = 3;

/**
 * 1行分のスケルトンバー
 * @param {Object} props - プロパティ
 * @param {Object} props.style - 追加スタイル
 * @param {Animated.Value} props.opacity - アニメーション用 Animated 値
 * @param {string} props.baseColor - ベースカラー
 * @returns {JSX.Element} スケルトンバー
 */
const SkeletonBar = ({ style, opacity, baseColor }) => {
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: baseColor, opacity },
        style,
      ]}
    />
  );
};

/**
 * スケルトンローダー
 * @param {Object} props - プロパティ
 * @param {number} [props.lines=3] - 表示行数
 * @param {string} [props.baseColor='#E0E0E0'] - バーの色
 * @param {Object} [props.style] - コンテナの追加スタイル
 * @returns {JSX.Element} スケルトンローダー
 */
const SkeletonLoader = ({ lines = DEFAULT_LINE_COUNT, baseColor = '#E0E0E0', style }) => {
  /** アニメーション値 */
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  /**
   * パルスアニメーションを開始
   */
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  /** 行幅のバリエーション（見た目に変化をつける） */
  const lineWidths = ['100%', '85%', '70%', '90%', '60%'];

  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBar
          key={index}
          opacity={animatedValue}
          baseColor={baseColor}
          style={{ width: lineWidths[index % lineWidths.length] }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingVertical: 8,
  },
  bar: {
    height: 14,
    borderRadius: 7,
  },
});

export default SkeletonLoader;
