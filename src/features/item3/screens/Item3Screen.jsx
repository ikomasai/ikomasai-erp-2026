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
} from 'react-native';
import TicketDistributionCard from '../components/TicketDistributionCard';
import useTicketDistributionData from '../hooks/useTicketDistributionData';
import {
  DISTRIBUTION_TYPES,
  SCREEN_LABELS,
} from '../constants';

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
  /** フィルタ状態 */
  const [selectedFilter, setSelectedFilter] = useState(FILTER_TYPES.ALL);
  /** 日付検索文字列 */
  const [dateQuery, setDateQuery] = useState('');
  /** 日付プルダウン表示 */
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  /** 開始時間フィルタ */
  const [selectedStartTime, setSelectedStartTime] = useState('');
  /** 開始時間プルダウン表示 */
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);

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
   * ドロワーを開く
   */
  const openDrawer = () => {
    navigation.openDrawer();
  };

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
      setIsTimeDropdownOpen(false);
    }
  };

  /**
   * 日付検索を更新する
   * @param {string} value - 入力値
   */
  const handleDateSelect = (value) => {
    setDateQuery(value);
    setIsDateDropdownOpen(false);
  };

  /**
   * 日付プルダウンを開閉する
   */
  const toggleDateDropdown = () => {
    setIsDateDropdownOpen((prev) => !prev);
  };

  /**
   * 開始時間を選択する
   * @param {string} value - 開始時間
   */
  const handleStartTimeSelect = (value) => {
    setSelectedStartTime(value);
    setIsTimeDropdownOpen(false);
  };

  /**
   * 開始時間プルダウンを開閉する
   */
  const toggleTimeDropdown = () => {
    setIsTimeDropdownOpen((prev) => !prev);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {isMobile && (
            <TouchableOpacity style={styles.menuButton} onPress={openDrawer}>
              <Text style={styles.menuButtonText}>☰</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerTitle}>{SCREEN_LABELS.title}</Text>
        <TouchableOpacity style={styles.refreshIconButton} onPress={refresh}>
          <Text style={styles.refreshIconText}>更新</Text>
        </TouchableOpacity>
      </View>

      {/* コンテンツ */}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>{SCREEN_LABELS.summaryTitle}</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{SCREEN_LABELS.summaryActiveEvents}</Text>
              <Text style={styles.summaryValue}>{summaryData.activeEventCount}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{SCREEN_LABELS.summaryFullSlots}</Text>
              <Text style={styles.summaryValue}>{summaryData.fullSlotCount}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{SCREEN_LABELS.summaryActiveSlots}</Text>
              <Text style={styles.summaryValue}>{summaryData.activeSlotCount}</Text>
            </View>
          </View>
          <Text style={styles.lastUpdatedText}>
            最終更新: {lastUpdatedAt ? lastUpdatedAt.toLocaleString('ja-JP') : '取得中'}
          </Text>
        </View>

        <View style={styles.filterContainer}>
          <View style={styles.filterRow}>
            <View style={styles.filterGroup}>
              <Text style={styles.searchLabel}>{SCREEN_LABELS.filterLabel}</Text>
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
                      selectedFilter === filter.value && styles.filterButtonActive,
                    ]}
                    onPress={() => handleFilterChange(filter.value)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
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
              <Text style={styles.searchLabel}>{SCREEN_LABELS.dateSearch}</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={toggleDateDropdown}
              >
                <Text style={styles.dropdownButtonText}>
                  {dateQuery
                    ? dateOptions.find((option) => option.value === dateQuery)?.label
                    : SCREEN_LABELS.allDates}
                </Text>
                <Text style={styles.dropdownIcon}>{isDateDropdownOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {isDateDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleDateSelect('')}
                  >
                    <Text style={styles.dropdownItemText}>{SCREEN_LABELS.allDates}</Text>
                  </TouchableOpacity>
                  {dateOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.dropdownItem}
                      onPress={() => handleDateSelect(option.value)}
                    >
                      <Text style={styles.dropdownItemText}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.dropdownGroup}>
              <Text style={styles.searchLabel}>{SCREEN_LABELS.timeSearch}</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={toggleTimeDropdown}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedStartTime || SCREEN_LABELS.allTimes}
                </Text>
                <Text style={styles.dropdownIcon}>{isTimeDropdownOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {isTimeDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleStartTimeSelect('')}
                  >
                    <Text style={styles.dropdownItemText}>{SCREEN_LABELS.allTimes}</Text>
                  </TouchableOpacity>
                  {startTimeOptions.map((timeValue) => (
                    <TouchableOpacity
                      key={timeValue}
                      style={styles.dropdownItem}
                      onPress={() => handleStartTimeSelect(timeValue)}
                    >
                      <Text style={styles.dropdownItemText}>{timeValue}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refresh}>
              <Text style={styles.retryButtonText}>再取得</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoading && !errorMessage && filteredList.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
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

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerSide: {
    width: 44,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    fontSize: 24,
    color: '#333333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
  },
  refreshIconButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#007AFF',
  },
  refreshIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  dropdownMenu: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 10,
    elevation: 10,
  },
  dropdownMenuOverlay: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    marginTop: 0,
    zIndex: 10,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#2c3e50',
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
