/**
 * 項目一覧パネルコンポーネント
 * 項目別タブの左パネル: 全16項目を一覧表示し、選択できる
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import PermissionBadge from './PermissionBadge';

/**
 * 項目一覧パネル
 * @param {Object} props - コンポーネントプロパティ
 * @param {Array<{itemNumber: number, permissionName: string, label: string, index: number}>} props.screens - フィルター適用済みの項目一覧
 * @param {number|null} props.selectedScreenIndex - 選択中の項目インデックス
 * @param {Function} props.onSelectScreen - 項目選択時のコールバック（インデックスを引数）
 * @param {Object<number, number>} props.screenRoleCounts - 各項目にアクセス可能なロール数
 * @param {string} props.searchText - 検索テキスト
 * @param {Function} props.onSearchTextChange - 検索テキスト変更時のコールバック
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} 項目一覧パネル
 */
const ScreenListPanel = ({
  screens,
  selectedScreenIndex,
  onSelectScreen,
  screenRoleCounts,
  searchText,
  onSearchTextChange,
  theme,
}) => {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* 検索バー */}
      <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="項目検索..."
          placeholderTextColor={theme.textSecondary}
          value={searchText}
          onChangeText={onSearchTextChange}
          autoComplete="off"
          textContentType="none"
        />
      </View>

      {/* 項目一覧 */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {screens.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              該当する項目がありません
            </Text>
          </View>
        ) : (
          screens.map((screen) => {
            /** 選択状態の判定（元のインデックスで比較） */
            const isSelected = screen.index === selectedScreenIndex;
            return (
              <TouchableOpacity
                key={screen.itemNumber}
                style={[
                  styles.screenItem,
                  {
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                    borderBottomColor: theme.border,
                  },
                ]}
                onPress={() => onSelectScreen(screen.index)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.screenLabel,
                    { color: isSelected ? '#FFFFFF' : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {screen.label}
                </Text>
                <PermissionBadge
                  count={screenRoleCounts[screen.itemNumber] || 0}
                  theme={theme}
                />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  /** コンテナ */
  container: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  /** 検索バーコンテナ */
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  /** 検索入力 */
  searchInput: {
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  /** 空表示コンテナ */
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  /** 空表示テキスト */
  emptyText: {
    fontSize: 14,
  },
  /** リストコンテナ */
  listContainer: {
    flex: 1,
  },
  /** リストコンテンツ */
  listContent: {
    paddingVertical: 4,
  },
  /** 項目行 */
  screenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** 項目ラベル */
  screenLabel: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
});

export default ScreenListPanel;
