/**
 * 対応一覧向け担当者設定モーダル
 * 救護者・チャット担当者をタブで切り替えて設定する
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';

/** タブ定義 */
const ASSIGNEE_TABS = {
  RESPONDER: 'responder',
  CHAT: 'chat',
};

/**
 * 配列を正規化する
 * @param {Array<string>|null|undefined} userIds - ユーザーID一覧
 * @returns {Array<string>} 正規化済み配列
 */
const normalizeUserIds = (userIds) => {
  return Array.from(new Set(Array.isArray(userIds) ? userIds.filter((item) => typeof item === 'string') : []));
};

/**
 * 16進カラーへアルファ値を付与する
 * @param {string} hexColor - 16進カラー
 * @param {string} alphaHex - アルファ値（16進2桁）
 * @returns {string} アルファ付きカラー
 */
const withAlpha = (hexColor, alphaHex) => {
  if (typeof hexColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
    return hexColor;
  }
  return `${hexColor}${alphaHex}`;
};

/**
 * 背景色に対して読みやすい文字色を返す
 * @param {string} hexColor - 背景色
 * @returns {string} 文字色
 */
const getReadableTextColor = (hexColor) => {
  if (typeof hexColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
    return '#ffffff';
  }

  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
  return brightness >= 150 ? '#111111' : '#ffffff';
};

/**
 * 対応一覧向け担当者設定モーダル
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} モーダル
 */
const AssigneeSettingModal = ({
  visible,
  users,
  initialResponderIds,
  initialChatAssigneeIds,
  title = '担当者設定',
  allowNoResponderOption = false,
  onClose,
  onConfirm,
  isSubmitting = false,
}) => {
  /** テーマ */
  const { theme } = useTheme();
  /** アクティブタブ */
  const [activeTab, setActiveTab] = useState(ASSIGNEE_TABS.RESPONDER);
  /** 検索文字列 */
  const [searchKeyword, setSearchKeyword] = useState('');
  /** 救護者選択状態 */
  const [selectedResponderIds, setSelectedResponderIds] = useState([]);
  /** チャット担当者選択状態 */
  const [selectedChatAssigneeIds, setSelectedChatAssigneeIds] = useState([]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setActiveTab(ASSIGNEE_TABS.RESPONDER);
    setSearchKeyword('');
    setSelectedResponderIds(normalizeUserIds(initialResponderIds));
    setSelectedChatAssigneeIds(normalizeUserIds(initialChatAssigneeIds));
  }, [initialChatAssigneeIds, initialResponderIds, visible]);

  /** 救護者なしの疑似ID */
  const NO_RESPONDER_ID = '__item2_no_responder__';
  /** 現在タブの選択中ID一覧 */
  const currentSelectedIds = activeTab === ASSIGNEE_TABS.RESPONDER ? selectedResponderIds : selectedChatAssigneeIds;

  /** フィルタ後ユーザー一覧 */
  const filteredUsers = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    /** 表示対象ユーザー */
    const baseUsers = (users ?? []).filter((user) => {
      if (!normalizedKeyword) {
        return true;
      }

      const name = (user?.name ?? '').toLowerCase();
      const organization = (user?.organization ?? '').toLowerCase();
      return name.includes(normalizedKeyword) || organization.includes(normalizedKeyword);
    });

    if (activeTab !== ASSIGNEE_TABS.RESPONDER || !allowNoResponderOption) {
      return baseUsers;
    }

    /** 救護者なしオプション */
    const noResponderOption = {
      id: NO_RESPONDER_ID,
      name: 'なし（設定しない）',
      organization: '',
    };

    if (!normalizedKeyword || noResponderOption.name.toLowerCase().includes(normalizedKeyword)) {
      return [noResponderOption, ...baseUsers];
    }

    return baseUsers;
  }, [allowNoResponderOption, activeTab, searchKeyword, users]);

  /**
   * 現在タブでユーザー選択をトグルする
   * @param {string} userId - ユーザーID
   */
  const toggleCurrentTabUser = (userId) => {
    if (activeTab === ASSIGNEE_TABS.RESPONDER && userId === NO_RESPONDER_ID) {
      setSelectedResponderIds([]);
      return;
    }

    const updateSelectedIds = (previousUserIds) => {
      if (previousUserIds.includes(userId)) {
        return previousUserIds.filter((item) => item !== userId);
      }
      return [...previousUserIds, userId];
    };

    if (activeTab === ASSIGNEE_TABS.RESPONDER) {
      setSelectedResponderIds(updateSelectedIds);
      return;
    }
    setSelectedChatAssigneeIds(updateSelectedIds);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          <View style={[styles.tabRow, { borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === ASSIGNEE_TABS.RESPONDER ? [styles.tabButtonActive, { backgroundColor: theme.primaryVariant }] : { backgroundColor: theme.surface },
              ]}
              onPress={() => setActiveTab(ASSIGNEE_TABS.RESPONDER)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === ASSIGNEE_TABS.RESPONDER
                    ? [styles.tabButtonTextActive, { color: getReadableTextColor(theme.primaryVariant) }]
                    : { color: theme.textSecondary },
                ]}
              >
                救護者
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === ASSIGNEE_TABS.CHAT ? [styles.tabButtonActive, { backgroundColor: theme.primaryVariant }] : { backgroundColor: theme.surface },
              ]}
              onPress={() => setActiveTab(ASSIGNEE_TABS.CHAT)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === ASSIGNEE_TABS.CHAT
                    ? [styles.tabButtonTextActive, { color: getReadableTextColor(theme.primaryVariant) }]
                    : { color: theme.textSecondary },
                ]}
              >
                チャット担当者
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            placeholder="名前で検索"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
          />

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {filteredUsers.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>該当するユーザーがいません。</Text>
            ) : (
              filteredUsers.map((user) => {
                const isNoResponderOption = user.id === NO_RESPONDER_ID;
                const isSelected = isNoResponderOption
                  ? activeTab === ASSIGNEE_TABS.RESPONDER && currentSelectedIds.length === 0
                  : currentSelectedIds.includes(user.id);
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[
                      styles.userRow,
                      { borderColor: theme.border, backgroundColor: theme.surface },
                      isSelected ? [
                        styles.userRowSelected,
                        {
                          borderColor: theme.primaryVariant,
                          backgroundColor: withAlpha(theme.primaryVariant, '2B'),
                        },
                      ] : null,
                    ]}
                    onPress={() => toggleCurrentTabUser(user.id)}
                  >
                    <View style={[styles.checkbox, { borderColor: theme.textSecondary }, isSelected ? [styles.checkboxSelected, { backgroundColor: theme.primaryVariant, borderColor: theme.primaryVariant }] : null]} />
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
                      {user.organization ? <Text style={[styles.userMeta, { color: theme.textSecondary }]}>{user.organization}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelText, { color: theme.text }]}>戻る</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, { backgroundColor: theme.primaryVariant }]}
              onPress={() => onConfirm({
                responderIds: selectedResponderIds,
                chatAssigneeIds: selectedChatAssigneeIds,
              })}
              disabled={isSubmitting}
            >
              <Text style={styles.confirmText}>{isSubmitting ? '保存中...' : '確定'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '84%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#1565c0',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 10,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  userRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userRowSelected: {
    backgroundColor: '#e3f2fd',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  checkboxSelected: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  buttonRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    backgroundColor: '#1565c0',
  },
  cancelText: {
    fontWeight: '700',
  },
  confirmText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default AssigneeSettingModal;
