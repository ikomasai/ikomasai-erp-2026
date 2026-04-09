/**
 * 円形ダイヤル式セレクター
 */

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';

/**
 * 角度を0〜2πに正規化する
 * @param {number} angle - 角度（ラジアン）
 * @returns {number} 正規化済み角度
 */
const normalizeAngle = (angle) => {
  /** 2π */
  const fullCircle = Math.PI * 2;
  /** 正規化角度 */
  let normalized = angle;

  while (normalized < 0) {
    normalized += fullCircle;
  }

  while (normalized >= fullCircle) {
    normalized -= fullCircle;
  }

  return normalized;
};

/**
 * 角度から選択インデックスを求める
 * @param {number} angle - 角度（ラジアン）
 * @param {number} optionsCount - 選択肢数
 * @returns {number} インデックス
 */
const getIndexFromAngle = (angle, optionsCount) => {
  if (!optionsCount) {
    return 0;
  }

  /** 1ステップの角度 */
  const step = (Math.PI * 2) / optionsCount;
  /** 角度をステップに変換 */
  const rawIndex = Math.round(angle / step);
  /** 正規化されたインデックス */
  const normalizedIndex = ((rawIndex % optionsCount) + optionsCount) % optionsCount;

  return normalizedIndex;
};

/**
 * ダイヤルセレクター
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.label - 見出しラベル
 * @param {Array<{value: string, label: string}>} props.options - 選択肢
 * @param {string} props.selectedValue - 選択値
 * @param {Function} props.onChange - 選択変更時の処理
 * @param {string} props.emptyLabel - 選択肢なし表示
 * @returns {JSX.Element} ダイヤルセレクター
 */
const DialSelector = ({
  label,
  options,
  selectedValue,
  onChange,
  emptyLabel,
}) => {
  /** コンテナサイズ */
  const [containerSize, setContainerSize] = useState(0);
  /** コンテナ中心座標 */
  const [centerPoint, setCenterPoint] = useState({ x: 0, y: 0 });
  /** ダイヤル参照 */
  const dialRef = useRef(null);
  /** ドラッグ中フラグ */
  const isDraggingRef = useRef(false);

  /** 選択インデックス */
  const selectedIndex = useMemo(() => {
    return Math.max(
      options.findIndex((option) => option.value === selectedValue),
      0
    );
  }, [options, selectedValue]);

  /** 選択ラベル */
  const selectedLabel = options[selectedIndex]?.label || emptyLabel;

  /** 選択角度 */
  const selectedAngle = useMemo(() => {
    if (!options.length) {
      return 0;
    }
    /** 1ステップの角度 */
    const step = (Math.PI * 2) / options.length;
    /** 上方向起点に補正 */
    return selectedIndex * step - Math.PI / 2;
  }, [options.length, selectedIndex]);

  /** パンレスポンダー */
  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        if (!options.length) {
          return;
        }

        /** タッチ座標X */
        const touchX = gesture.moveX - centerPoint.x;
        /** タッチ座標Y */
        const touchY = gesture.moveY - centerPoint.y;
        /** 角度 */
        const angle = normalizeAngle(Math.atan2(touchY, touchX) + Math.PI / 2);
        /** インデックス */
        const index = getIndexFromAngle(angle, options.length);
        /** 選択値 */
        const nextValue = options[index]?.value;

        if (nextValue && nextValue !== selectedValue) {
          onChange(nextValue);
        }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
    });
  }, [centerPoint, onChange, options, selectedValue]);

  /** レイアウト更新 */
  const handleLayout = (event) => {
    /** レイアウトサイズ */
    const { width, height } = event.nativeEvent.layout;
    /** 正方形サイズ */
    const size = Math.min(width, height);

    setContainerSize(size);

    if (dialRef.current?.measureInWindow) {
      dialRef.current.measureInWindow((pageX, pageY, viewWidth, viewHeight) => {
        /** 中心座標 */
        const center = {
          x: pageX + viewWidth / 2,
          y: pageY + viewHeight / 2,
        };

        setCenterPoint(center);
      });
    }
  };

  /** ノブ座標 */
  const knobPosition = useMemo(() => {
    /** 半径 */
    const radius = containerSize / 2 - 10;
    /** X座標 */
    const x = radius * Math.cos(selectedAngle) + containerSize / 2;
    /** Y座標 */
    const y = radius * Math.sin(selectedAngle) + containerSize / 2;

    return { x, y };
  }, [containerSize, selectedAngle]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.dialWrapper}
        onLayout={handleLayout}
        ref={dialRef}
        {...panResponder.panHandlers}
      >
        <View style={styles.dialCircle}>
          <View style={styles.dialCenter}>
            <Text style={styles.selectedLabel}>{selectedLabel}</Text>
          </View>
          {containerSize > 0 && (
            <View
              style={[
                styles.dialKnob,
                { left: knobPosition.x - 10, top: knobPosition.y - 10 },
              ]}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minWidth: 160,
  },
  label: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 8,
  },
  dialWrapper: {
    width: 120,
    height: 120,
    alignSelf: 'flex-start',
  },
  dialCircle: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#dfe6e9',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fdfdfd',
  },
  dialCenter: {
    width: 70,
    height: 70,
    borderRadius: 999,
    backgroundColor: '#eef3ff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
  },
  dialKnob: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#007AFF',
  },
});

export default DialSelector;
