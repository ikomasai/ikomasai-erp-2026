/**
 * item2 対応一覧画面
 */

import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ITEM2_CALL_STATUSES } from '../constants';
import CallCard from '../components/CallCard';

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: ITEM2_CALL_STATUSES.UNHANDLED, label: '未対応' },
  { value: ITEM2_CALL_STATUSES.IN_PROGRESS, label: '対応中' },
  { value: ITEM2_CALL_STATUSES.RESOLVED, label: '対応終了' },
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
  onOpenAdditionalInfoModal,
  onResolveCall,
  statusFilter = 'all',
  onChangeStatusFilter,
  headerActionLabel = '',
  onPressHeaderAction,
  isHeaderActionDisabled = false,
}) => {
  const { theme } = useTheme();
  const shouldShowFilterControls = typeof onChangeStatusFilter === 'function';
  const shouldShowHeaderAction = typeof onPressHeaderAction === 'function' && headerActionLabel;

  const renderHeader = () => {
    if (!shouldShowFilterControls) {
      return null;
    }

    return (
      <View style={styles.filterSection}>
        <View style={styles.filterHeaderRow}>
          <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>ステータス</Text>
        </View>
        <View style={styles.filterControlsRow}>
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
          {shouldShowHeaderAction ? (
            <TouchableOpacity
              style={[styles.refreshButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={onPressHeaderAction}
              disabled={isHeaderActionDisabled}
            >
              <Text style={[styles.refreshButtonText, { color: theme.text }]}>
                {headerActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
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
          responderLabel={getResponderLabel(item)}
          onOpenResponderModal={onOpenResponderModal}
          onOpenAdditionalInfoModal={onOpenAdditionalInfoModal}
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
  filterHeaderRow: {
    marginBottom: 6,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterControlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterRow: {
    flex: 1,
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
  refreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 0,
    alignSelf: 'flex-start',
  },
  refreshButtonText: {
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
