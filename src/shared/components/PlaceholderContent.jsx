/**
 * プレースホルダー表示
 * 未実装画面・一時的なエラー画面の共通表示コンポーネント。
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const PlaceholderContent = ({ title, message, isError = false }) => {
  const { theme } = useTheme();

  const iconName = isError ? 'alert-circle-outline' : 'construct-outline';
  const accentColor = isError ? theme.error : theme.primary;
  const resolvedMessage = message || (isError
    ? '画面表示中に問題が発生しました。再読み込みを試してください。'
    : 'この機能は現在仕上げ中です。次のフェーズで利用可能になります。');

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.card,
          {
            borderColor: isError ? theme.error : theme.border,
            backgroundColor: theme.surface,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}66` }]}>
          <Ionicons name={iconName} size={30} color={accentColor} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>{resolvedMessage}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});

export default PlaceholderContent;

