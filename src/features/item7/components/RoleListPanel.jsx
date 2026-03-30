/**
 * ロール一覧パネルコンポーネント
 * ロール別タブの左パネル: 全ロールを一覧表示し、選択・検索できる
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
 * ロール一覧パネル
 * @param {Object} props - コンポーネントプロパティ
 * @param {Array} props.roles - フィルター適用済みのロール一覧
 * @param {string|null} props.selectedRoleId - 選択中のロールID
 * @param {Function} props.onSelectRole - ロール選択時のコールバック
 * @param {Object<string, number>} props.roleScreenCounts - 各ロールのアクセス項目数
 * @param {string} props.searchText - 検索テキスト
 * @param {Function} props.onSearchTextChange - 検索テキスト変更時のコールバック
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} ロール一覧パネル
 */
const RoleListPanel = ({
  roles,
  selectedRoleId,
  onSelectRole,
  roleScreenCounts,
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
          placeholder="ロール検索..."
          placeholderTextColor={theme.textSecondary}
          value={searchText}
          onChangeText={onSearchTextChange}
          autoComplete="off"
          textContentType="none"
        />
      </View>

      {/* ロール一覧 */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {roles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              該当するロールがありません
            </Text>
          </View>
        ) : (
          roles.map((role) => {
            /** 選択状態の判定 */
            const isSelected = role.id === selectedRoleId;
            return (
              <TouchableOpacity
                key={role.id}
                style={[
                  styles.roleItem,
                  {
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                    borderBottomColor: theme.border,
                  },
                ]}
                onPress={() => onSelectRole(role.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.roleName,
                    { color: isSelected ? '#FFFFFF' : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {role.display_name || role.name}
                </Text>
                <PermissionBadge
                  count={roleScreenCounts[role.id] || 0}
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
  /** リストコンテナ */
  listContainer: {
    flex: 1,
  },
  /** リストコンテンツ */
  listContent: {
    paddingVertical: 4,
  },
  /** ロール項目 */
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** ロール名 */
  roleName: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
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
});

export default RoleListPanel;
