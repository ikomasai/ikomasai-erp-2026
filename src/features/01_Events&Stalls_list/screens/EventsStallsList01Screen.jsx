/**
 * 項目1画面 (企画・屋台一覧)
 * 企画・屋台の一覧表示、検索、絞り込みを行います
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, Text, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '../../../shared/components/icons';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { SORT_OPTIONS, SORT_COLUMNS, TABS, TAB_NAMES, AREA_ALL } from '../constants';
import { useEventsStallsList01Data } from '../hooks/useEventsStallsList01Data';
import FilterBar from '../components/FilterBar';
import ItemCard from '../components/ItemCard';
import DetailModal from '../components/DetailModal';

/** 画面名 */
const SCREEN_NAME = '企画・屋台一覧';

/**
 * 企画・屋台一覧画面コンポーネント
 */
const EventsStallsList01Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;

  // 状態管理
  const [activeTab, setActiveTab] = useState(TABS.ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedArea, setSelectedArea] = useState(AREA_ALL);
  const [selectedBuilding, setSelectedBuilding] = useState('すべて');
  const [selectedStallLetter, setSelectedStallLetter] = useState('すべて');
  const [sortOrder, setSortOrder] = useState(SORT_OPTIONS.NAME_ASC);
  const [showFilters, setShowFilters] = useState(false);

  // 詳細モーダルの状態
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // カスタムフックでデータ取得
  const { data, stallCategories, eventCategories, areas, buildings, stallAreaLetters, loading, error } = useEventsStallsList01Data(
    activeTab,
    searchQuery,
    selectedCategories,
    sortOrder,
    selectedArea,
    selectedBuilding,
    selectedStallLetter
  );

  // エリア変更ハンドラ（詳細建物をリセットする）
  const handleAreaChange = useCallback((areaId) => {
    setSelectedArea(areaId);
    setSelectedBuilding('すべて');
    setSelectedStallLetter('すべて');
  }, []);

  // タブ切り替えハンドラ
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedCategories([]);
  };

  // カテゴリのトグル（選択/解除）
  const handleToggleCategory = useCallback((categoryId) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  }, []);

  // カテゴリ選択をすべてクリア
  const handleClearCategories = useCallback(() => {
    setSelectedCategories([]);
  }, []);

  // ソートヘッダータップハンドラ
  const handleSortChange = (key) => {
    setSortOrder(key);
  };

  // スクロール時に絞り込みメニューを閉じる
  const handleScroll = useCallback(() => {
    if (showFilters) {
      setShowFilters(false);
    }
  }, [showFilters]);

  // アイテムタップハンドラ
  const handleItemPress = (item) => {
    setSelectedItem(item);
    setIsModalVisible(true);
  };

  // 一覧の各要素レンダリング
  const renderItem = ({ item }) => (
    <ItemCard item={item} onPress={() => handleItemPress(item)} />
  );

  // 一覧が空の場合の表示
  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          該当するデータが見つかりませんでした。
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      {/* 検索・絞り込みバー */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategories={selectedCategories}
        onToggleCategory={handleToggleCategory}
        onClearCategories={handleClearCategories}
        stallCategories={stallCategories}
        eventCategories={eventCategories}
        selectedArea={selectedArea}
        onAreaChange={handleAreaChange}
        areas={areas}
        buildings={buildings}
        selectedBuilding={selectedBuilding}
        onBuildingChange={setSelectedBuilding}
        stallAreaLetters={stallAreaLetters}
        selectedStallLetter={selectedStallLetter}
        onStallLetterChange={setSelectedStallLetter}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(prev => !prev)}
      />

      {/* タブナビゲーション */}
      <View style={[styles.tabContainer, { borderBottomColor: theme.border }]}>
        {[TABS.ALL, TABS.EVENTS, TABS.STALLS].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.activeTabBorder, { borderBottomColor: activeTab === tab ? theme.primary : 'transparent' }]}
            onPress={() => handleTabChange(tab)}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? theme.primary : theme.textSecondary },
              activeTab === tab && styles.activeTabText
            ]}>
              {TAB_NAMES[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 並べ替え＋件数（モバイル：件数のみ / デスクトップ：並べ替えラベル＋件数） */}
      <View style={[styles.sortInfoRow, { borderBottomColor: theme.border }]}>
        {!isMobile && <Text style={[styles.sortInfoLabel, { color: theme.textSecondary }]}>並べ替え</Text>}
        <Text style={[styles.sortInfoCount, { color: theme.textSecondary, marginLeft: isMobile ? 0 : 'auto' }]}>{data.length}件表示</Text>
      </View>

      {!isMobile && (
        /* デスクトップ：カラムヘッダー（カードと同じ構造で配置） */
        <View style={[styles.columnHeaderOuter, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <View style={styles.columnHeaderInner}>
            <View style={styles.row}>
              {/* 名称列（カードのnameColと同じ構造） */}
              <TouchableOpacity
                style={styles.nameCol}
                onPress={() => handleSortChange(SORT_OPTIONS.NAME_ASC)}
                activeOpacity={0.6}
              >
                <View style={styles.headerContent}>
                  <Text style={[
                    styles.headerText,
                    { color: sortOrder === SORT_OPTIONS.NAME_ASC ? theme.primary : theme.textSecondary },
                    sortOrder === SORT_OPTIONS.NAME_ASC && styles.headerTextActive,
                  ]}>
                    名称
                  </Text>
                  {sortOrder === SORT_OPTIONS.NAME_ASC && (
                    <Ionicons name="chevron-down" size={12} color={theme.primary} style={{ marginLeft: 2 }} />
                  )}
                </View>
              </TouchableOpacity>

              {/* カテゴリ・場所・運営団体列（カードのcolと同じ構造） */}
              {SORT_COLUMNS.filter(col => col.icon != null).map((col) => {
                const isActive = sortOrder === col.key;
                return (
                  <TouchableOpacity
                    key={col.key}
                    style={styles.col}
                    onPress={() => handleSortChange(col.key)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.iconCell}>
                      <Ionicons name={col.icon} size={13} color={isActive ? theme.primary : theme.textSecondary} />
                      <Text style={[
                        styles.headerText,
                        { color: isActive ? theme.primary : theme.textSecondary },
                        isActive && styles.headerTextActive,
                      ]}>
                        {col.label}
                      </Text>
                      {isActive && (
                        <Ionicons name="chevron-down" size={12} color={theme.primary} style={{ marginLeft: 2 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* メインのリストビューまたは状態表示 */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>読み込み中...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={[styles.errorText, { color: '#ef4444' }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item, index) => item.id ? String(item.id) : String(index)}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={renderEmptyComponent}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      {/* 詳細モーダル */}
      <DetailModal
        visible={isModalVisible}
        item={selectedItem}
        onClose={() => setIsModalVisible(false)}
      />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabBorder: {},
  activeTabText: {
    fontWeight: 'bold',
  },
  sortInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  sortInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  sortInfoCount: {
    fontSize: 11,
  },
  mobileSortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  columnHeaderOuter: {
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  columnHeaderInner: {
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  typeBadgeSpacer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    opacity: 0,
  },
  badgeTextSpacer: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  nameCol: {
    flex: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  col: {
    flex: 1.5,
    paddingHorizontal: 4,
  },
  iconCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerTextActive: {
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
  },
  flatListContent: {
    padding: 12,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default EventsStallsList01Screen;
