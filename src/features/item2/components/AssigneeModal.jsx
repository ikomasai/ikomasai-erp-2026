/**
 * 対応者モーダル
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
 * 対応者モーダル
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} モーダル
 */
const normalizeText = (value) => {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const AssigneeModal = ({ visible, title, users, selectedUserIds, onToggleUser, onClose, onConfirm }) => {
  /** テーマ */
  const { theme } = useTheme();
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!visible) {
      setSearchText('');
    }
  }, [visible]);

  const filteredUsers = useMemo(() => {
    const normalizedSearchText = normalizeText(searchText);

    if (!normalizedSearchText) {
      return users ?? [];
    }

    return (users ?? []).filter((user) => {
      const targetText = normalizeText(`${user.name ?? ''} ${user.organization ?? ''}`);
      return targetText.includes(normalizedSearchText);
    });
  }, [searchText, users]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}> 
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="名前で検索"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.searchInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.surface,
              },
            ]}
          />
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {filteredUsers.map((user) => {
              /** 選択状態 */
              const isSelected = selectedUserIds.includes(user.id);
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
                  onPress={() => onToggleUser(user.id)}
                >
                  <View style={[styles.checkbox, { borderColor: theme.textSecondary }, isSelected ? [styles.checkboxSelected, { backgroundColor: theme.primaryVariant, borderColor: theme.primaryVariant }] : null]} />
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
                    {user.organization ? <Text style={[styles.userMeta, { color: theme.textSecondary }]}>{user.organization}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {filteredUsers.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>該当する名前がありません。</Text>
            ) : null}
          </ScrollView>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.cancelButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.text }]}>戻る</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.confirmButton, { backgroundColor: theme.primaryVariant }]} onPress={onConfirm}>
              <Text style={styles.confirmText}>確定</Text>
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
    maxWidth: 480,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#212121',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 10,
  },
  userRow: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
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
    borderColor: '#90a4ae',
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
    color: '#212121',
  },
  userMeta: {
    marginTop: 2,
    color: '#616161',
    fontSize: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 18,
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
    color: '#37474f',
    fontWeight: '700',
  },
  confirmText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default AssigneeModal;
