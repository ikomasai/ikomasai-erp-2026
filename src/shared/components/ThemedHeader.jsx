/**
 * テーマ対応ヘッダー
 * モバイル・設置型どちらでも読みやすい共通ヘッダーを提供する。
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const MOBILE_BREAKPOINT = 768;

const buildSubline = () => {
  const now = new Date();
  return now.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const ThemedHeader = ({ title, navigation }) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const subline = useMemo(() => buildSubline(), []);

  const openDrawer = () => {
    navigation?.openDrawer?.();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.headerBackground || theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.inner}>
        {isMobile ? (
          <TouchableOpacity
            style={[styles.menuButton, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary || theme.surface }]}
            onPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="メニューを開く"
          >
            <Ionicons name="menu" size={22} color={theme.headerText || theme.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.menuSpacer} />
        )}

        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.headerText || theme.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.subline, { color: theme.textSecondary }]}>
            企画管理部統合システム / {subline}
          </Text>
        </View>

        <View style={[styles.modePill, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary || theme.surface }]}>
          <Text style={[styles.modePillText, { color: theme.primary }]}>
            運用中
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inner: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSpacer: {
    width: 42,
    height: 42,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subline: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
  },
  modePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modePillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

