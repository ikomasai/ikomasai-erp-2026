/**
 * トースト通知コンポーネント
 * 操作結果を画面下部にフェードイン表示し、一定時間後に自動消去する
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';

/** トースト表示時間（ミリ秒） */
const TOAST_DURATION_MS = 2500;

/** フェードアニメーション時間（ミリ秒） */
const FADE_DURATION_MS = 220;

/** トースト種別ごとの背景色 */
const TOAST_BG_COLORS = {
  success: '#22C55E',
  error: '#EF4444',
  info: '#3B82F6',
};

/** トースト種別ごとの先頭アイコン */
const TOAST_ICONS = {
  success: '✓ ',
  error: '✗ ',
  info: 'ℹ ',
};

/**
 * トースト通知コンポーネント
 * @param {Object} props - プロパティ
 * @param {boolean} props.visible - 表示フラグ
 * @param {string} props.message - 表示メッセージ
 * @param {'success'|'error'|'info'} [props.type='success'] - トースト種別
 * @param {Function} [props.onHide] - 自動消去後コールバック
 * @returns {JSX.Element|null} トーストUI
 */
const ToastMessage = ({ visible, message, type = 'success', onHide }) => {
  /** フェードアウト用の透明度アニメーション値 */
  const opacity = useRef(new Animated.Value(0)).current;
  /** スライドアップ用の縦方向アニメーション値 */
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    /** フェードイン + スライドアップ */
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    /** 自動消去タイマー */
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_DURATION_MS,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: FADE_DURATION_MS,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(() => {
        onHide?.();
      });
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }

  /** 背景色（種別別） */
  const bgColor = TOAST_BG_COLORS[type] || TOAST_BG_COLORS.info;
  /** アイコン（種別別） */
  const icon = TOAST_ICONS[type] || '';

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.toastText}>
        {icon}{message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 105,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 9999,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});

export default ToastMessage;
