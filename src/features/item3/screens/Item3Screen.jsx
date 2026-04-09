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
  TextInput,
} from 'react-native';
import TicketDistributionCard from '../components/TicketDistributionCard';
import useTicketDistributionData from '../hooks/useTicketDistributionData';
import {
  DISTRIBUTION_TYPES,
  SCREEN_LABELS,
  STATUS_LABELS,
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
  /** 企画名検索文字列 */
  const [eventNameQuery, setEventNameQuery] = useState('');
  /** 企画名入力フォーカス状態 */
  const [isNameFocused, setIsNameFocused] = useState(false);
  /** ステータス検索 */
  const [selectedStatus, setSelectedStatus] = useState('');
  /** ステータスモーダル表示 */
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
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
    refresh,
  } = useTicketDistributionData();

  /** フィルタ済みデータ */
  const filteredList = useMemo(() => {
    /** 日付検索文字列 */
    const normalizedDateQuery = dateQuery.trim();
    /** 企画名検索文字列 */
    const normalizedEventNameQuery = eventNameQuery.trim().toLowerCase();
    /** 開始時間検索 */
    const normalizedStartTime = selectedStartTime.trim();
    /** ステータス検索 */
    const normalizedStatus = selectedStatus.trim();

    const typeFilteredList = selectedFilter === FILTER_TYPES.ALL
      ? distributionList
      : distributionList.filter(
          (item) => item.type === selectedFilter
        );

    const dateFilteredList = normalizedDateQuery
      ? typeFilteredList.filter((item) => item.date === normalizedDateQuery)
      : typeFilteredList;

    const nameFilteredList = normalizedEventNameQuery
      ? dateFilteredList.filter((item) =>
        (item.eventName || '').toLowerCase().includes(normalizedEventNameQuery)
      )
      : dateFilteredList;

    const statusFilteredList = normalizedStatus
      ? nameFilteredList.map((item) => {
        if (item.type !== FILTER_TYPES.TIME_SLOT) {
          return item.status === normalizedStatus ? item : null;
        }

        /** ステータスで絞り込み */
        const filteredTimeSlots = (item.timeSlots || []).filter(
          (slot) => slot.status === normalizedStatus
        );

        if (!filteredTimeSlots.length) {
          return null;
        }

        return {
          ...item,
          timeSlots: filteredTimeSlots,
        };
      }).filter(Boolean)
      : nameFilteredList;

    if (!normalizedStartTime) {
      return statusFilteredList;
    }

    return statusFilteredList.map((item) => {
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
    }).filter((item) => item.type !== FILTER_TYPES.TIME_SLOT || item.timeSlots.length > 0);
  }, [distributionList, selectedFilter, dateQuery, eventNameQuery, selectedStartTime, selectedStatus]);

  /** 企画ごとにまとめた配布状況一覧 */
  const groupedDistributionList = useMemo(() => {
    /** 企画単位のマップ */
    const groupedMap = new Map();

    filteredList.forEach((item) => {
      if (!groupedMap.has(item.eventId)) {
        groupedMap.set(item.eventId, {
          eventId: item.eventId,
          eventName: item.eventName,
          location: item.location,
          type: item.type,
          dateEntries: [],
        });
      }

      groupedMap.get(item.eventId).dateEntries.push(item);
    });

    /** 企画配列 */
    const groupedArray = Array.from(groupedMap.values());

    groupedArray.forEach((group) => {
      group.dateEntries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    });

    return groupedArray.sort((a, b) => {
      const firstDateA = a.dateEntries[0]?.date || '';
      const firstDateB = b.dateEntries[0]?.date || '';
      return firstDateA.localeCompare(firstDateB);
    });
  }, [filteredList]);

  /** 空状態メッセージ */
  const emptyMessage = useMemo(() => {
    if (selectedStartTime) {
      return '条件をクリアしてください';
    }
    if (dateQuery) {
      return '該当日付に企画がありません';
    }
    if (eventNameQuery) {
      return '該当する企画がありません';
    }
    if (selectedStatus) {
      return '該当するステータスがありません';
    }
    return '表示できるデータがありません';
  }, [dateQuery, eventNameQuery, selectedStartTime, selectedStatus]);

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

    if (eventNameQuery) {
      filterList.push(`企画名: ${eventNameQuery}`);
    }

    if (selectedStatus) {
      filterList.push(`ステータス: ${STATUS_LABELS[selectedStatus] || selectedStatus}`);
    }

    return filterList;
  }, [dateQuery, eventNameQuery, selectedStartTime, selectedStatus]);

  /**
   * ステータスを選択する
   * @param {string} value - ステータス
   */
  const handleStatusSelect = (value) => {
    setSelectedStatus(value);
    setIsStatusModalOpen(false);
  };

  /**
   * ステータスモーダルを開く
   */
  const openStatusModal = () => {
    setIsStatusModalOpen(true);
  };

  /**
   * ステータスモーダルを閉じる
   */
  const closeStatusModal = () => {
    setIsStatusModalOpen(false);
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

  /**
   * 企画名入力フォーカス時の処理
   */
  const handleNameFocus = () => {
    setIsNameFocused(true);
  };

  /**
   * 企画名入力フォーカス解除時の処理
   */
  const handleNameBlur = () => {
    setIsNameFocused(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ヘッダー */}
      <ThemedHeader title={SCREEN_LABELS.title} navigation={navigation} />

      {/* コンテンツ */}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.filterContainer, { backgroundColor: theme.surface, borderRadius: theme.borderRadius, shadowOpacity: theme.shadowOpacity }]}>
          <View style={styles.filterHeaderRow}>
            <Text style={[styles.filterHeaderTitle, { color: theme.text }]}>表示フィルタ</Text>
            <TouchableOpacity
              style={[styles.filterRefreshButton, { backgroundColor: theme.primary, borderRadius: theme.borderRadius }]}
              onPress={refresh}
            >
              <Text style={styles.filterRefreshText}>更新</Text>
            </TouchableOpacity>
          </View>
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

            <View style={styles.nameSearchGroup}>
              <Text style={[styles.searchLabel, { color: theme.textSecondary }]}>企画名検索</Text>
              <View
                style={[
                  styles.searchInputWrapper,
                  { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.borderRadius },
                  isNameFocused && { borderColor: theme.primary },
                ]}
              >
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  value={eventNameQuery}
                  onChangeText={setEventNameQuery}
                  onFocus={handleNameFocus}
                  onBlur={handleNameBlur}
                  placeholder="企画名を入力"
                  placeholderTextColor={theme.textSecondary}
                />
                {eventNameQuery.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setEventNameQuery('')}
                  >
                    <Text style={[styles.clearButtonText, { color: theme.textSecondary }]}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.dropdownGroup}>
              <Text style={[styles.searchLabel, { color: theme.textSecondary }]}>ステータス</Text>
              <TouchableOpacity
                style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.borderRadius }]}
                onPress={openStatusModal}
              >
                <Text style={[styles.dropdownButtonText, { color: theme.text }]}
                >
                  {selectedStatus ? STATUS_LABELS[selectedStatus] : '全てのステータス'}
                </Text>
                <Text style={[styles.dropdownIcon, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
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

        {!isLoading && !errorMessage && groupedDistributionList.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyMessage}</Text>
          </View>
        )}

        {!isLoading && !errorMessage && groupedDistributionList.length > 0 && (
          <View style={[styles.cardList, !isMobile && styles.cardListDesktop]}>
            {groupedDistributionList.map((item) => (
              <View
                key={item.eventId}
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

      <Modal
        transparent
        visible={isStatusModalOpen}
        animationType="slide"
        onRequestClose={closeStatusModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}
            >
              <TouchableOpacity onPress={closeStatusModal}>
                <Text style={[styles.modalActionText, { color: theme.primary }]}
                >
                  キャンセル
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}
              >
                ステータス
              </Text>
              <View style={styles.modalSpacer} />
            </View>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={[styles.modalOption, { borderBottomColor: theme.border }]}
                onPress={() => handleStatusSelect('')}
              >
                <Text style={[styles.modalOptionText, { color: theme.text }]}
                >
                  全てのステータス
                </Text>
              </TouchableOpacity>
              {Object.keys(STATUS_LABELS).map((statusKey) => (
                <TouchableOpacity
                  key={statusKey}
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => handleStatusSelect(statusKey)}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }]}
                  >
                    {STATUS_LABELS[statusKey]}
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
  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  filterRefreshButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  filterRefreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  nameSearchGroup: {
    minWidth: 200,
  },
  dropdownGroup: {
    minWidth: 160,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    minHeight: 44,
    alignItems: 'center',
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
    justifyContent: 'center',
    alignItems: 'center',
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
    minHeight: 44,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#2c3e50',
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dfe6e9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 0,
    minHeight: 44,
    backgroundColor: '#fdfdfd',
    marginTop: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 44,
    outlineStyle: 'none',
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  clearButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '700',
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
