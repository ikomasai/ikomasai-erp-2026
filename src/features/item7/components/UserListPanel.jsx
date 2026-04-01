/**
 * ユーザー一覧パネルコンポーネント
 * ユーザ管理タブの中央パネル: 選択ロールに属するユーザーを一覧表示し、選択できる
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';

/**
 * ユーザー一覧パネル
 * @param {Object} props - コンポーネントプロパティ
 * @param {Array<{user_id: string, name: string, organization: string}>} props.users - フィルター適用済みのユーザー一覧
 * @param {string|null} props.selectedUserId - 選択中のユーザーID（user_id）
 * @param {Function} props.onSelectUser - ユーザー選択時のコールバック（user_idを引数）
 * @param {string} props.searchText - 検索テキスト
 * @param {Function} props.onSearchTextChange - 検索テキスト変更時のコールバック
 * @param {string} props.roleName - 現在選択中のロール名（ヘッダー表示用）
 * @param {boolean} props.isLoading - ユーザー一覧読み込み中フラグ
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} ユーザー一覧パネル
 */
const UserListPanel = ({
  users,
  selectedUserId,
  onSelectUser,
  searchText,
  onSearchTextChange,
  roleName,
  isLoading,
  theme,
}) => {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ヘッダー: ロール名 + ユーザー数 */}
      <View style={[styles.headerContainer, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {roleName}
        </Text>
        <Text style={[styles.headerCount, { color: theme.textSecondary }]}>
          {isLoading ? '...' : `${users.length} 人`}
        </Text>
      </View>

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
          placeholder="ユーザー検索..."
          placeholderTextColor={theme.textSecondary}
          value={searchText}
          onChangeText={onSearchTextChange}
          autoComplete="off"
          textContentType="none"
        />
      </View>

      {/* ユーザー一覧 */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              該当するユーザーがいません
            </Text>
          </View>
        ) : (
          users.map((user) => {
            /** 選択状態の判定 */
            const isSelected = user.user_id === selectedUserId;
            return (
              <TouchableOpacity
                key={user.user_id}
                style={[
                  styles.userItem,
                  {
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                    borderBottomColor: theme.border,
                  },
                ]}
                onPress={() => onSelectUser(user.user_id)}
                activeOpacity={0.7}
              >
                <View style={styles.userInfo}>
                  <Text
                    style={[
                      styles.userName,
                      { color: isSelected ? '#FFFFFF' : theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {user.name}
                  </Text>
                  {!!user.organization && (
                    <Text
                      style={[
                        styles.userOrganization,
                        { color: isSelected ? '#FFFFFF99' : theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {user.organization}
                    </Text>
                  )}
                </View>
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
  /** ヘッダーコンテナ */
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  /** ヘッダータイトル（ロール名） */
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  /** ヘッダーユーザー数 */
  headerCount: {
    fontSize: 13,
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
  /** ローディングコンテナ */
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
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
  /** ユーザー行 */
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** ユーザー情報コンテナ */
  userInfo: {
    flex: 1,
  },
  /** ユーザー名 */
  userName: {
    fontSize: 15,
  },
  /** 所属団体 */
  userOrganization: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default UserListPanel;
