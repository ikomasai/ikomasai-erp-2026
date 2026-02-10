/**
 * テーマ設定ステータステキストコンポーネント
 */

import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';

export const ThemeStatusText = ({ status }) => {
  const { theme } = useTheme();

  if (!status) return null;

  const isSuccess = status.type === 'success';

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: isSuccess ? `${theme.success}55` : `${theme.error}55`,
          backgroundColor: isSuccess ? `${theme.success}14` : `${theme.error}14`,
        },
      ]}
    >
      <Text style={[styles.text, { color: isSuccess ? theme.success : theme.error }]}>
        {status.message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '700',
  },
});
