/**
 * 項目3画面
 * 項目3機能のメイン画面
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import TicketDistributionCard from '../components/TicketDistributionCard';
import useTicketDistributionData from '../hooks/useTicketDistributionData';
import {
  DISTRIBUTION_TYPES,
  SCREEN_LABELS,
} from '../constants';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';

/** ブレークポイント（スマホ/PC切り替え） */
const MOBILE_BREAKPOINT = 768;

/** フィルタ種別 */
const FILTER_TYPES = {
  /** 全て */
  ALL: 'all',
  /** 順次案内制 */
  SEQUENTIAL: DISTRIBUTION_TYPES.SEQUENTIAL,
  /** 時間枠定員制 */
  TIME_SLOT: DISTRIBUTION_TYPES.TIME_SLOT,
};

/**
 * 項目3画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} 項目3画面
 */
const Item3Screen = ({ navigation }) => {
  /** 画面サイズ取得 */
  const { width } = useWindowDimensions();
  /** モバイル判定 */
  const isMobile = width < MOBILE_BREAKPOINT;
  /** テーマ情報 */
  const { theme } = useTheme();
  /** フィルタ状態 */
  const [selectedFilter, setSelectedFilter] = useState(FILTER_TYPES.ALL);
  /** 日付検索文字列 */
  const [dateQuery, setDateQuery] = useState('');
  /** 日付モーダル表示 */
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  /** 開始時間フィルタ */
  const [selectedStartTime, setSelectedStartTime] = useState('');
  /** 時間モーダル表示 */
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

  /** 日付プルダウン候補 */
  const dateOptions = [
    { value: '2026-11-02', label: '11/2(月)' },
    { value: '2026-11-03', label: '11/3(火)' },
    { value: '2026-11-04', label: '11/4(水)' },
  ];
  /** 配布状況データ取得 */
  const {
    distributionList,
    isLoading,
    errorMessage,
    lastUpdatedAt,
    refresh,
  } = useTicketDistributionData();

  /** サマリー数値 */
  const summaryData = useMemo(() => {
    /** 案内中企画IDセット */
    const activeEventIdSet = new Set();
    /** 満員枠数 */
    let fullSlotCount = 0;
    /** 進行中枠数 */
    let activeSlotCount = 0;

    distributionList.forEach((item) => {
      if (item.status === 'active') {
        activeEventIdSet.add(item.eventId);
      }

      if (item.type === FILTER_TYPES.TIME_SLOT) {
        (item.timeSlots || []).forEach((slot) => {
          if (slot.status === 'full') {
            fullSlotCount += 1;
          }
          if (slot.status === 'active') {
            activeSlotCount += 1;
          }
        });
      }
    });

    return {
      activeEventCount: activeEventIdSet.size,
      fullSlotCount,
      activeSlotCount,
    };
  }, [distributionList]);

  /** フィルタ済みデータ */
  const filteredList = useMemo(() => {
    /** 日付検索文字列 */
    const normalizedDateQuery = dateQuery.trim();
    /** 開始時間検索 */
    const normalizedStartTime = selectedStartTime.trim();

    const typeFilteredList = selectedFilter === FILTER_TYPES.ALL
      ? distributionList
      : distributionList.filter(
          (item) => item.type === selectedFilter
        );

    const dateFilteredList = normalizedDateQuery
      ? typeFilteredList.filter((item) => item.date === normalizedDateQuery)
      : typeFilteredList;

    if (!normalizedStartTime) {
      return dateFilteredList;
    }

    return dateFilteredList.map((item) => {
      if (item.type !== FILTER_TYPES.TIME_SLOT) {
        return item;
      }

      /** 開始時間で絞り込み */
      const filteredTimeSlots = (item.timeSlots || []).filter(
        (slot) => slot.startTime?.slice(0, 5) === normalizedStartTime
      );

      return {
        ...item,
        timeSlots: filteredTimeSlots,
      };
    });
  }, [distributionList, selectedFilter, dateQuery, selectedStartTime]);

  /** 空状態メッセージ */
  const emptyMessage = useMemo(() => {
    if (selectedStartTime) {
      return '条件をクリアしてください';
    }
    if (dateQuery) {
      return '該当日付に企画がありません';
    }
    return '表示できるデータがありません';
  }, [dateQuery, selectedStartTime]);

  /** 開始時間プルダウン候補 */
  const startTimeOptions = useMemo(() => {
    /** 開始時刻一覧 */
    const timeSlotList = distributionList
      .filter((item) => item.type === FILTER_TYPES.TIME_SLOT)
      .flatMap((item) => item.timeSlots || [])
      .map((slot) => slot.startTime?.slice(0, 5))
      .filter(Boolean);

    /** 重複排除済みマップ */
    const uniqueMap = new Map();

    timeSlotList.forEach((timeValue) => {
      if (!uniqueMap.has(timeValue)) {
        uniqueMap.set(timeValue, timeValue);
      }
    });

    return Array.from(uniqueMap.values()).sort();
  }, [distributionList]);

  /** 適用中フィルタ一覧 */
  const activeFilters = useMemo(() => {
    /** 適用中フィルタ配列 */
    const filterList = [];

    if (dateQuery) {
      /** 日付ラベル */
      const dateLabel = dateOptions.find((option) => option.value === dateQuery)?.label;
      filterList.push(`日付: ${dateLabel || dateQuery}`);
    }

    if (selectedStartTime) {
      filterList.push(`時間: ${selectedStartTime}`);
    }

    return filterList;
  }, [dateQuery, selectedStartTime]);

  /**
   * フィルタを切り替える
   * @param {string} filterType - フィルタ種別
   */
  const handleFilterChange = (filterType) => {
    setSelectedFilter(filterType);

    if (
      filterType !== FILTER_TYPES.TIME_SLOT &&
      filterType !== FILTER_TYPES.ALL
    ) {
      setSelectedStartTime('');
    }
  };

  /**
   * 日付検索を更新する
   * @param {string} value - 入力値
   */
  const handleDateSelect = (value) => {
    setDateQuery(value);
    setIsDateModalOpen(false);
  };

  /**
   * 日付モーダルを開く
   */
  const openDateModal = () => {
    setIsDateModalOpen(true);
  };

  /**
   * 日付モーダルを閉じる
   */
  const closeDateModal = () => {
    setIsDateModalOpen(false);
  };

  /**
   * 開始時間を選択する
   * @param {string} value - 開始時間
   */
  const handleStartTimeSelect = (value) => {
    setSelectedStartTime(value);
    setIsTimeModalOpen(false);
  };

  /**
   * 時間モーダルを開く
   */
  const openTimeModal = () => {
    setIsTimeModalOpen(true);
  };

  /**
   * 時間モーダルを閉じる
   */
  const closeTimeModal = () => {
    setIsTimeModalOpen(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ヘッダー */}
      <ThemedHeader title={SCREEN_LABELS.title} navigation={navigation} />

      {/* コンテンツ */}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderRadius: theme.borderRadius, shadowOpacity: theme.shadowOpacity }]}> 
          <View style={styles.summaryHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{SCREEN_LABELS.summaryTitle}</Text>
            <TouchableOpacity
              style={[styles.summaryRefreshButton, { backgroundColor: theme.primary, borderRadius: theme.borderRadius }]}
              onPress={refresh}
            >
              <Text style={styles.summaryRefreshText}>更新</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryItem, { backgroundColor: theme.background, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.summaryActiveEvents}</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summaryData.activeEventCount}</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: theme.background, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.summaryFullSlots}</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summaryData.fullSlotCount}</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: theme.background, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.summaryActiveSlots}</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summaryData.activeSlotCount}</Text>
            </View>
          </View>
          <Text style={[styles.lastUpdatedText, { color: theme.textSecondary }]}>
            最終更新: {lastUpdatedAt ? lastUpdatedAt.toLocaleString('ja-JP') : '取得中'}
          </Text>
        </View>

        <View style={[styles.filterContainer, { backgroundColor: theme.surface, borderRadius: theme.borderRadius, shadowOpacity: theme.shadowOpacity }]}>
          <View style={styles.filterRow}>
            <View style={styles.filterGroup}>
              <Text style={[styles.searchLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.filterLabel}</Text>
              <View style={styles.filterButtons}>
                {[
                  { label: SCREEN_LABELS.all, value: FILTER_TYPES.ALL },
                  { label: SCREEN_LABELS.sequential, value: FILTER_TYPES.SEQUENTIAL },
                  { label: SCREEN_LABELS.timeSlot, value: FILTER_TYPES.TIME_SLOT },
                ].map((filter) => (
                  <TouchableOpacity
                    key={filter.value}
                    style={[
                      styles.filterButton,
                      { backgroundColor: theme.surface, borderRadius: theme.borderRadius, borderColor: theme.border, borderWidth: 1 },
                      selectedFilter === filter.value && [styles.filterButtonActive, { backgroundColor: theme.primary, borderColor: theme.primary }],
                    ]}
                    onPress={() => handleFilterChange(filter.value)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        { color: theme.text },
                        selectedFilter === filter.value && styles.filterButtonTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.dropdownGroup}>
              <Text style={[styles.searchLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.dateSearch}</Text>
              <TouchableOpacity
                style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.borderRadius }]}
                onPress={openDateModal}
              >
                <Text style={[styles.dropdownButtonText, { color: theme.text }]}>
                  {dateQuery
                    ? dateOptions.find((option) => option.value === dateQuery)?.label
                    : SCREEN_LABELS.allDates}
                </Text>
                <Text style={[styles.dropdownIcon, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dropdownGroup}>
              <Text style={[styles.searchLabel, { color: theme.textSecondary }]}>{SCREEN_LABELS.timeSearch}</Text>
              <TouchableOpacity
                style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.borderRadius }]}
                onPress={openTimeModal}
              >
                <Text style={[styles.dropdownButtonText, { color: theme.text }]}>
                  {selectedStartTime || SCREEN_LABELS.allTimes}
                </Text>
                <Text style={[styles.dropdownIcon, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeFilters.length > 0 && (
            <View style={styles.activeFilterRow}>
              <Text style={styles.activeFilterLabel}>{SCREEN_LABELS.activeFilters}</Text>
              <View style={styles.activeFilterList}>
                {activeFilters.map((filterText) => (
                  <View key={filterText} style={styles.activeFilterBadge}>
                    <Text style={styles.activeFilterText}>{filterText}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>データを取得中...</Text>
          </View>
        )}

        {!isLoading && errorMessage ? (
          <View style={[styles.errorBox, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary, borderRadius: theme.borderRadius }]} onPress={refresh}>
              <Text style={styles.retryButtonText}>再取得</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoading && !errorMessage && filteredList.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyMessage}</Text>
          </View>
        )}

        {!isLoading && !errorMessage && filteredList.length > 0 && (
          <View style={[styles.cardList, !isMobile && styles.cardListDesktop]}>
            {filteredList.map((item) => (
              <View
                key={`${item.eventId}_${item.eventDateId}`}
                style={[styles.cardWrapper, !isMobile && styles.cardWrapperDesktop]}
              >
                <TicketDistributionCard item={item} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={isDateModalOpen}
        animationType="slide"
        onRequestClose={closeDateModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}
            >
              <TouchableOpacity onPress={closeDateModal}>
                <Text style={[styles.modalActionText, { color: theme.primary }]}
                >
                  キャンセル
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}
              >
                {SCREEN_LABELS.dateSearch}
              </Text>
              <View style={styles.modalSpacer} />
            </View>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: theme.border }]}
                onPress={() => handleDateSelect('')}
              >
                <Text style={[styles.modalOptionText, { color: theme.text }]}
                >
                  {SCREEN_LABELS.allDates}
                </Text>
              </TouchableOpacity>
              {dateOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => handleDateSelect(option.value)}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isTimeModalOpen}
        animationType="slide"
        onRequestClose={closeTimeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}
            >
              <TouchableOpacity onPress={closeTimeModal}>
                <Text style={[styles.modalActionText, { color: theme.primary }]}
                >
                  キャンセル
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}
              >
                {SCREEN_LABELS.timeSearch}
              </Text>
              <View style={styles.modalSpacer} />
            </View>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: theme.border }]}
                onPress={() => handleStartTimeSelect('')}
              >
                <Text style={[styles.modalOptionText, { color: theme.text }]}
                >
                  {SCREEN_LABELS.allTimes}
                </Text>
              </TouchableOpacity>
              {startTimeOptions.map((timeValue) => (
                <TouchableOpacity
                  key={timeValue}
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => handleStartTimeSelect(timeValue)}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }]}
                  >
                    {timeValue}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRefreshButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    marginTop: -12,
  },
  summaryRefreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    minWidth: 120,
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
  },
  lastUpdatedText: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 12,
    textAlign: 'right',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  filterGroup: {
    minWidth: 200,
  },
  dropdownGroup: {
    minWidth: 160,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  searchLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 6,
  },
  dropdownButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fdfdfd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#2c3e50',
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalSheet: {
    backgroundColor: '#1e1e1e',
    paddingBottom: 16,
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff9f0a',
  },
  modalSpacer: {
    width: 60,
  },
  modalList: {
    maxHeight: 240,
  },
  modalOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalOptionText: {
    color: '#ffffff',
    fontSize: 16,
  },
  activeFilterRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  activeFilterLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  activeFilterList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  activeFilterBadge: {
    backgroundColor: '#eef3ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeFilterText: {
    fontSize: 11,
    color: '#2c3e50',
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#7f8c8d',
  },
  errorBox: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#c0392b',
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#95a5a6',
    fontSize: 14,
  },
  cardList: {
    gap: 12,
  },
  cardListDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrapper: {
    width: '100%',
  },
  cardWrapperDesktop: {
    width: '48%',
  },
});

export default Item3Screen;
