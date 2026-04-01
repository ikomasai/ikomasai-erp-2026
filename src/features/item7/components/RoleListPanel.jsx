/**
 * ロール一覧パネルコンポーネント
 * ロール別タブの左パネル: 全ロールを一覧表示し、選択・検索・作成・削除ができる
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
 * 削除アイコン（シンプルな×マーク）
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.color - アイコン色
 * @returns {JSX.Element} 削除アイコン
 */
const DeleteIcon = ({ color }) => (
  <Text style={[styles.deleteIcon, { color }]}>×</Text>
);

/**
 * ロール一覧パネル
 * @param {Object} props - コンポーネントプロパティ
 * @param {Array} props.roles - フィルター適用済みのロール一覧
 * @param {string|null} props.selectedRoleId - 選択中のロールID
 * @param {Function} props.onSelectRole - ロール選択時のコールバック
 * @param {Object<string, number>} props.roleScreenCounts - 各ロールのアクセス項目数
 * @param {string} props.searchText - 検索テキスト
 * @param {Function} props.onSearchTextChange - 検索テキスト変更時のコールバック
 * @param {Function} props.onCreateRole - 新規ロール作成ボタン押下時のコールバック（nullで非表示）
 * @param {Function} props.onDeleteRole - ロール削除時のコールバック（roleIdを引数、nullで非表示）
 * @param {Function} props.isProtectedRole - 保護対象ロールか判定する関数（roleNameを引数）
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
  onCreateRole,
  onDeleteRole,
  isProtectedRole,
  theme,
}) => {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* 検索バー + 新規作成ボタン */}
      <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
        <View style={styles.searchRow}>
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
          {onCreateRole && (
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: theme.primary }]}
              onPress={onCreateRole}
              activeOpacity={0.7}
            >
              <Text style={styles.createButtonText}>+ 新規</Text>
            </TouchableOpacity>
          )}
        </View>
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
            /** 保護対象ロールか */
            const isProtected = isProtectedRole(role.name);
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
                {/* バッジ: 固定幅で位置を揃える */}
                <View style={styles.badgeContainer}>
                  <PermissionBadge
                    count={roleScreenCounts[role.id] || 0}
                    theme={theme}
                  />
                </View>
                {/* 削除ボタン: 固定幅で位置を揃える（保護対象は空欄、onDeleteRoleが未指定なら非表示） */}
                {onDeleteRole && (
                  <View style={styles.deleteContainer}>
                    {!isProtected && (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={(e) => {
                          /** 親のonPressが発火しないようにする */
                          e.stopPropagation();
                          onDeleteRole(role.id);
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <DeleteIcon color={isSelected ? '#FFFFFF80' : theme.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
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
  /** 検索バー行 */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** 検索入力 */
  searchInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  /** 新規作成ボタン */
  createButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 新規作成ボタンテキスト */
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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
  /** バッジコンテナ（固定幅で位置を統一） */
  badgeContainer: {
    width: 40,
    alignItems: 'center',
  },
  /** 削除ボタンコンテナ（固定幅で位置を統一） */
  deleteContainer: {
    width: 28,
    alignItems: 'center',
  },
  /** 削除ボタン */
  deleteButton: {
    padding: 4,
  },
  /** 削除アイコン */
  deleteIcon: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
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
