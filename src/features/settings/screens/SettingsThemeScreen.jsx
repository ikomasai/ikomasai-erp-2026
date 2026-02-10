/**
 * テーマ設定画面
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemeOptionRow } from '../components/ThemeOptionRow';
import { ThemeStatusText } from '../components/ThemeStatusText';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { THEME_OPTIONS } from '../constants';
import themeModeCompatibility from '../../../shared/utils/themeModeCompatibility';

export default function SettingsThemeScreen({ navigation }) {
  const { themeMode, theme, changeTheme, isTransitioning } = useTheme();
  const [status, setStatus] = useState(null);

  const handleThemeChange = async (newMode) => {
    setStatus(null);
    const success = await changeTheme(newMode);
    
    if (success) {
      setStatus({ type: 'success', message: '保存しました' });
    } else {
      setStatus({ type: 'error', message: '保存に失敗しました（ローカルに保持）' });
    }

    setTimeout(() => {
      setStatus(null);
    }, 3000);
  };

    return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title="テーマ設定" navigation={navigation} />
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View
            style={[
              styles.heroCard,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
              },
            ]}
          >
            <Text style={[styles.heroTitle, { color: theme.text }]}>画面表示スタイル</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              利用環境に合わせてテーマを変更できます。保存後は全画面に即時反映されます。
            </Text>
            <View style={styles.currentRow}>
              <Text style={[styles.currentLabel, { color: theme.textSecondary }]}>現在のテーマ</Text>
              <View
                style={[
                  styles.currentBadge,
                  {
                    borderColor: theme.primary,
                    backgroundColor: `${theme.primary}15`,
                  },
                ]}
              >
                <Text style={[styles.currentBadgeText, { color: theme.primary }]}>
                  {themeModeCompatibility.getThemeModeDisplayName(themeMode)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            テーマ一覧
          </Text>

          <View style={styles.options}>
            {THEME_OPTIONS.map((option) => (
              <ThemeOptionRow
                key={option.value}
                option={option}
                isSelected={themeMode === option.value}
                onSelect={handleThemeChange}
                disabled={isTransitioning}
              />
            ))}
          </View>

          <ThemeStatusText status={status} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  currentRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  currentLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  currentBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  options: {
    marginTop: 2,
  },
});
