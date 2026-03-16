/**
 * item2 対応一覧画面
 */

import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ITEM2_CALL_STATUSES, ITEM2_CALL_TYPES } from '../constants';
import CallCard from '../components/CallCard';

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: ITEM2_CALL_STATUSES.UNHANDLED, label: '未対応' },
  { value: ITEM2_CALL_STATUSES.IN_PROGRESS, label: '対応中' },
  { value: ITEM2_CALL_STATUSES.RESOLVED, label: '対応終了' },
];

const CALL_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: ITEM2_CALL_TYPES.EMERGENCY, label: '緊急' },
  { value: ITEM2_CALL_TYPES.NON_URGENT, label: '不急' },
];

const FilterChip = ({ label, isActive, onPress, theme }) => {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        {
          backgroundColor: isActive ? theme.primaryVariant : theme.surface,
          borderColor: isActive ? theme.primaryVariant : theme.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, { color: isActive ? '#ffffff' : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
};

/**
 * 対応一覧画面
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} 画面
 */
const CallListScreen = ({
  calls,
  isRefreshing,
  onRefresh,
  getResponderLabel,
  onOpenResponderModal,
  onResolveCall,
  statusFilter = 'all',
  callTypeFilter = 'all',
  onChangeStatusFilter,
  onChangeCallTypeFilter,
}) => {
  const { theme } = useTheme();
  const shouldShowFilterControls = typeof onChangeStatusFilter === 'function' || typeof onChangeCallTypeFilter === 'function';

  const renderHeader = () => {
    if (!shouldShowFilterControls) {
      return null;
    }

    return (
      <View style={styles.filterSection}>
        <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>ステータス</Text>
        <View style={styles.filterRow}>
          {STATUS_FILTER_OPTIONS.map((option) => {
            return (
              <FilterChip
                key={option.value}
                label={option.label}
                isActive={statusFilter === option.value}
                onPress={() => onChangeStatusFilter?.(option.value)}
                theme={theme}
              />
            );
          })}
        </View>
        <Text style={[styles.filterSectionTitle, styles.filterSectionTitleSpacing, { color: theme.textSecondary }]}>種別</Text>
        <View style={styles.filterRow}>
          {CALL_TYPE_FILTER_OPTIONS.map((option) => {
            return (
              <FilterChip
                key={option.value}
                label={option.label}
                isActive={callTypeFilter === option.value}
                onPress={() => onChangeCallTypeFilter?.(option.value)}
                theme={theme}
              />
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={calls}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>呼び出しはまだありません。</Text>
        </View>
      }
      renderItem={({ item }) => (
        <CallCard
          callData={item}
          isEmergencyMode={item.call_type === ITEM2_CALL_TYPES.EMERGENCY}
          responderLabel={getResponderLabel(item)}
          onOpenResponderModal={onOpenResponderModal}
          onResolveCall={
            typeof onResolveCall === 'function' && item.status !== ITEM2_CALL_STATUSES.RESOLVED
              ? onResolveCall
              : undefined
          }
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 120,
    flexGrow: 1,
  },
  filterSection: {
    marginBottom: 14,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  filterSectionTitleSpacing: {
    marginTop: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default CallListScreen;
