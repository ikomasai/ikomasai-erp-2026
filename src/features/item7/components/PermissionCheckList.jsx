/**
 * 権限チェックリストコンポーネント
 * ロール別・項目別タブ共通で使用するチェックボックス一覧
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

/**
 * チェックボックスアイコン（テキストベース）
 * @param {Object} props - コンポーネントプロパティ
 * @param {boolean} props.isChecked - チェック状態
 * @param {boolean} props.isDisabled - 無効状態
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} チェックボックス
 */
const CheckBox = ({ isChecked, isDisabled, theme }) => {
  /** チェック済み・無効の場合はグレー表示 */
  const backgroundColor = isDisabled
    ? theme.textSecondary + '30'
    : isChecked
      ? theme.primary
      : 'transparent';
  /** ボーダー色 */
  const borderColor = isDisabled
    ? theme.textSecondary + '50'
    : isChecked
      ? theme.primary
      : theme.textSecondary;

  return (
    <View
      style={[
        styles.checkbox,
        {
          backgroundColor,
          borderColor,
        },
      ]}
    >
      {isChecked && (
        <Text style={styles.checkmark}>✓</Text>
      )}
    </View>
  );
};

/**
 * 権限チェックリスト
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.title - ヘッダータイトル（例: 「企画管理部 のアクセス権限」）
 * @param {Array<{id: string, label: string, isChecked: boolean, isDisabled: boolean}>} props.items - チェック項目一覧
 * @param {Function} props.onToggle - チェック切り替え時のコールバック（idを引数に呼ばれる）
 * @param {Function} props.onSave - 保存ボタン押下時のコールバック
 * @param {Function} props.onReset - リセットボタン押下時のコールバック
 * @param {boolean} props.hasChanges - 未保存の変更があるか
 * @param {boolean} props.isSaving - 保存中状態
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Function|null} [props.onSelectAll] - 全選択ボタン押下時のコールバック（項目別タブ用）
 * @param {Function|null} [props.onDeselectAll] - 全解除ボタン押下時のコールバック（項目別タブ用）
 * @returns {JSX.Element} チェックリスト
 */
const PermissionCheckList = ({
  title,
  items,
  onToggle,
  onSave,
  onReset,
  hasChanges,
  isSaving,
  theme,
  onSelectAll,
  onDeselectAll,
}) => {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      </View>

      {/* 全選択・全解除ボタン（項目別タブ用） */}
      {(onSelectAll || onDeselectAll) && (
        <View style={[styles.bulkActions, { borderBottomColor: theme.border }]}>
          {onSelectAll && (
            <TouchableOpacity
              style={[styles.bulkButton, { backgroundColor: theme.primary + '15' }]}
              onPress={onSelectAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.bulkButtonText, { color: theme.primary }]}>
                全団体アクセス可能
              </Text>
            </TouchableOpacity>
          )}
          {onDeselectAll && (
            <TouchableOpacity
              style={[styles.bulkButton, { backgroundColor: theme.error + '15' }]}
              onPress={onDeselectAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.bulkButtonText, { color: theme.error }]}>
                全団体解除
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* チェックリスト */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.checkItem,
              { borderBottomColor: theme.border },
              item.isDisabled && styles.checkItemDisabled,
            ]}
            onPress={() => !item.isDisabled && onToggle(item.id)}
            activeOpacity={item.isDisabled ? 1 : 0.7}
            disabled={item.isDisabled}
          >
            <CheckBox
              isChecked={item.isChecked}
              isDisabled={item.isDisabled}
              theme={theme}
            />
            <Text
              style={[
                styles.checkItemLabel,
                { color: item.isDisabled ? theme.textSecondary : theme.text },
              ]}
            >
              {item.label}
            </Text>
            {item.isDisabled && (
              <Text style={[styles.protectedLabel, { color: theme.textSecondary }]}>
                (変更不可)
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* フッター: 保存・リセットボタン */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.resetButton,
            {
              borderColor: theme.border,
              opacity: hasChanges ? 1 : 0.4,
            },
          ]}
          onPress={onReset}
          disabled={!hasChanges || isSaving}
          activeOpacity={0.7}
        >
          <Text style={[styles.resetButtonText, { color: theme.textSecondary }]}>
            リセット
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.saveButton,
            {
              backgroundColor: hasChanges ? theme.primary : theme.primary + '50',
            },
          ]}
          onPress={onSave}
          disabled={!hasChanges || isSaving}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>
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
  /** ヘッダー */
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  /** タイトル */
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  /** 全選択・全解除ボタン行 */
  bulkActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  /** 全選択・全解除ボタン */
  bulkButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  /** 全選択・全解除ボタンテキスト */
  bulkButtonText: {
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
  /** チェック項目行 */
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** 無効状態のチェック項目 */
  checkItemDisabled: {
    opacity: 0.6,
  },
  /** チェックボックス */
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  /** チェックマーク */
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  /** チェック項目ラベル */
  checkItemLabel: {
    fontSize: 15,
    flex: 1,
  },
  /** 保護対象ラベル */
  protectedLabel: {
    fontSize: 12,
    marginLeft: 8,
  },
  /** フッター */
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  /** リセットボタン */
  resetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  /** リセットボタンテキスト */
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  /** 保存ボタン */
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  /** 保存ボタンテキスト */
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PermissionCheckList;
