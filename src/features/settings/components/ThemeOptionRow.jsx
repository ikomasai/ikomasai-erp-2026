/**
 * テーマ選択肢コンポーネント
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../shared/hooks/useTheme';

const IconComponent = ({ iconFamily, iconName, color, size }) => {
  const Icon = iconFamily === 'Ionicons' ? Ionicons : MaterialCommunityIcons;
  const resolvedIcon = iconName || (iconFamily === 'Ionicons' ? 'color-palette-outline' : 'palette');
  return <Icon name={resolvedIcon} size={size} color={color} />;
};

export const ThemeOptionRow = ({ option, isSelected, onSelect, disabled }) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: isSelected ? theme.primary : theme.divider || theme.border,
          borderWidth: isSelected ? 2 : 1,
          opacity: disabled ? 0.5 : 1,
        }
      ]}
      onPress={() => !disabled && onSelect(option.value)}
      disabled={disabled}
      activeOpacity={0.88}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isSelected
                ? `${theme.primary}20`
                : theme.surfaceSecondary || theme.background,
            },
          ]}
        >
          <IconComponent
            iconFamily={option.iconFamily}
            iconName={option.iconName}
            color={isSelected ? theme.primary : theme.text}
            size={24}
          />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.label, { color: theme.text }]}>{option.label}</Text>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            {option.caption}
          </Text>
        </View>
      </View>
      <Ionicons
        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={isSelected ? theme.primary : theme.textSecondary}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 7,
    borderRadius: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  iconContainer: {
    marginRight: 12,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  caption: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
  },
});
