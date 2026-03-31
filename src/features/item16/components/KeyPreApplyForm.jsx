/**
 * 鍵事前申請フォームコンポーネント
 * 棟選択、鍵選択、複数追加を提供する
 * 希望時刻・理由・添付情報は不要のため削除済み
 */

import React, { useMemo, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

/**
 * 文字列を正規化する
 * @param {*} value - 入力値
 * @returns {string} trim済み文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * 検索可能な選択コンポーネント
 * 鍵貸出/返却端末の借受人選択・団体選択と同じ操作感で選べるようにする
 * @param {Object} props - プロパティ
 * @param {Array<{id: string, name: string}>} props.options - 選択肢一覧
 * @param {{id: string, name: string}|null} props.value - 選択中項目
 * @param {(value: Object|null) => void} props.onChange - 選択変更コールバック
 * @param {string} props.placeholder - プレースホルダー
 * @param {Object} props.theme - テーマ
 * @returns {JSX.Element} 選択UI
 */
const SearchableDropdown = ({ options, value, onChange, placeholder, theme }) => {
  /** 検索クエリ */
  const [query, setQuery] = useState('');
  /** ドロップダウン展開状態 */
  const [isOpen, setIsOpen] = useState(false);

  /** クエリ適用後の候補一覧 */
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query).toLowerCase();
    const baseOptions = normalizedQuery
      ? (Array.isArray(options) ? options : []).filter((option) =>
          normalizeText(option?.name).toLowerCase().includes(normalizedQuery)
        )
      : Array.isArray(options)
        ? options
        : [];

    return baseOptions.slice(0, 50);
  }, [options, query]);

  /**
   * 候補選択時の処理
   * @param {Object} option - 選択した候補
   * @returns {void}
   */
  const handleSelect = (option) => {
    onChange(option);
    setQuery('');
    setIsOpen(false);
  };

  /**
   * 選択をクリアする
   * @returns {void}
   */
  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
  };

  if (value) {
    return (
      <View
        style={[
          searchableDropdownStyles.selectedBadge,
          { backgroundColor: `${theme.primary}18`, borderColor: theme.primary },
        ]}
      >
        <Text
          style={[searchableDropdownStyles.selectedBadgeText, { color: theme.primary }]}
          numberOfLines={1}
        >
          {value.name}
        </Text>
        <TouchableOpacity
          onPress={handleClear}
          style={searchableDropdownStyles.clearButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[searchableDropdownStyles.clearButtonText, { color: theme.primary }]}>×</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          searchableDropdownStyles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
        ]}
      />

      {isOpen ? (
        <View
          style={[
            searchableDropdownStyles.dropdownInline,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <ScrollView
            style={searchableDropdownStyles.dropdownScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {filteredOptions.length === 0 ? (
              <View style={searchableDropdownStyles.emptyRow}>
                <Text style={[searchableDropdownStyles.emptyRowText, { color: theme.textSecondary }]}>
                  候補が見つかりません
                </Text>
              </View>
            ) : (
              filteredOptions.map((option, index) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    searchableDropdownStyles.dropdownItem,
                    {
                      borderBottomColor: theme.border,
                      borderBottomWidth:
                        index < filteredOptions.length - 1 ? StyleSheet.hairlineWidth : 0,
                    },
                  ]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[searchableDropdownStyles.dropdownItemText, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {option.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <TouchableOpacity
            style={[searchableDropdownStyles.closeButton, { borderTopColor: theme.border }]}
            onPress={() => {
              setQuery('');
              setIsOpen(false);
            }}
          >
            <Text style={[searchableDropdownStyles.closeButtonText, { color: theme.textSecondary }]}>
              閉じる
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

/**
 * 鍵事前申請フォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Array<{id: string, name: string}>} props.borrowerOrganizationOptions - 借受団体候補
 * @param {(value: Object|null) => void} props.onChangeBorrowerOrganization - 借受団体変更コールバック
 * @param {{id: string, name: string}|null} props.selectedBorrowerOrganization - 選択中借受団体
 * @param {Array<{id: string, name: string}>} props.borrowerUserOptions - 借受人候補
 * @param {(value: Object|null) => void} props.onChangeBorrowerUser - 借受人変更コールバック
 * @param {{id: string, name: string}|null} props.selectedBorrowerUser - 選択中借受人
 * @param {boolean} props.isLoadingBorrowerOptions - 候補読込中フラグ
 * @param {string} props.keyBuilding - 選択中の棟
 * @param {(value: string) => void} props.onChangeKeyBuilding - 棟変更コールバック
 * @param {string} props.keySelectedId - 選択中の鍵ID
 * @param {(value: string) => void} props.onChangeKeySelectedId - 鍵選択変更コールバック
 * @param {() => void} props.onAddSelectedKey - 鍵追加コールバック
 * @param {(keyId: string) => void} props.onRemoveSelectedKey - 鍵削除コールバック
 * @param {Array} props.selectedKeyItems - 追加済みの鍵一覧
 * @param {Array} props.filteredKeyCatalog - 棟フィルタ適用後の鍵候補一覧
 * @param {Array} props.keyBuildings - 棟一覧
 * @param {string} props.allBuildingsValue - 「すべての棟」の値定数
 * @returns {JSX.Element} 鍵事前申請フォーム
 */
const KeyPreApplyForm = ({
  theme,
  borrowerOrganizationOptions,
  onChangeBorrowerOrganization,
  selectedBorrowerOrganization,
  borrowerUserOptions,
  onChangeBorrowerUser,
  selectedBorrowerUser,
  isLoadingBorrowerOptions,
  keyBuilding,
  onChangeKeyBuilding,
  keySelectedId,
  onChangeKeySelectedId,
  onAddSelectedKey,
  onRemoveSelectedKey,
  selectedKeyItems,
  filteredKeyCatalog,
  keyBuildings,
  allBuildingsValue,
}) => {
  return (
    <View style={styles.formSection}>
      {/* 借受人選択 */}
      <Text style={[styles.label, { color: theme.text }]}>
        借受人を選択 <Text style={[styles.required, { color: theme.error }]}>*</Text>
      </Text>
      {isLoadingBorrowerOptions ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>借受人候補を読み込み中...</Text>
      ) : (
        <SearchableDropdown
          options={borrowerUserOptions}
          value={selectedBorrowerUser}
          onChange={onChangeBorrowerUser}
          placeholder="名前で検索..."
          theme={theme}
        />
      )}

      {/* 借受団体選択 */}
      <Text style={[styles.label, { color: theme.text }]}>
        団体を選択 <Text style={[styles.required, { color: theme.error }]}>*</Text>
      </Text>
      {isLoadingBorrowerOptions ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>団体候補を読み込み中...</Text>
      ) : (
        <SearchableDropdown
          options={borrowerOrganizationOptions}
          value={selectedBorrowerOrganization}
          onChange={onChangeBorrowerOrganization}
          placeholder="団体名で検索..."
          theme={theme}
        />
      )}

      <Text style={[styles.label, { color: theme.text }]}>棟を選択</Text>
      <View
        style={[
          styles.pickerContainer,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}
      >
        <Picker
          selectedValue={keyBuilding}
          onValueChange={(value) => onChangeKeyBuilding(value)}
          style={[
            styles.picker,
            styles.themedPicker,
            {
              color: theme.text,
              backgroundColor: theme.surface,
            },
          ]}
          itemStyle={{ color: theme.text }}
          dropdownIconColor={theme.text}
        >
          <Picker.Item label="すべての棟" value={allBuildingsValue} color={theme.text} />
          {keyBuildings.map((building) => (
            <Picker.Item key={building} label={building} value={building} color={theme.text} />
          ))}
        </Picker>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>鍵を選択</Text>
      <View
        style={[
          styles.pickerContainer,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}
      >
        <Picker
          selectedValue={keySelectedId}
          onValueChange={(value) => onChangeKeySelectedId(value)}
          style={[
            styles.picker,
            styles.themedPicker,
            {
              color: theme.text,
              backgroundColor: theme.surface,
            },
          ]}
          itemStyle={{ color: theme.text }}
          dropdownIconColor={theme.text}
        >
          {filteredKeyCatalog.length === 0 ? (
            <Picker.Item label="選択できる鍵がありません" value="" color={theme.text} />
          ) : (
            filteredKeyCatalog.map((item) => (
              <Picker.Item
                key={item.id}
                label={`${item.building} / ${item.name}`}
                value={item.id}
                color={theme.text}
              />
            ))
          )}
        </Picker>
      </View>

      <TouchableOpacity
        style={[styles.addKeyButton, { borderColor: theme.border, backgroundColor: theme.background }]}
        onPress={onAddSelectedKey}
      >
        <Text style={[styles.addKeyButtonText, { color: theme.textSecondary }]}>この鍵を追加</Text>
      </TouchableOpacity>

      <Text style={[styles.selectedKeyTitle, { color: theme.text }]}>
        申請対象（{selectedKeyItems.length}件）
      </Text>

      {selectedKeyItems.length === 0 ? (
        <Text style={[styles.selectedKeyEmpty, { color: theme.textSecondary }]}>
          まだ鍵が追加されていません
        </Text>
      ) : (
        <View style={styles.selectedKeyList}>
          {selectedKeyItems.map((item) => (
            <View
              key={item.id}
              style={[
                styles.selectedKeyRow,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Text style={[styles.selectedKeyText, { color: theme.text }]} numberOfLines={1}>
                {item.building} / {item.name}
              </Text>
              <TouchableOpacity
                style={[styles.removeKeyButton, { borderColor: theme.border }]}
                onPress={() => onRemoveSelectedKey(item.id)}
              >
                <Text style={[styles.removeKeyButtonText, { color: theme.textSecondary }]}>削除</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  formSection: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  required: {
    fontSize: 13,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 12,
    lineHeight: 18,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 52,
  },
  themedPicker: {
    borderWidth: 0,
  },
  addKeyButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addKeyButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectedKeyTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectedKeyEmpty: {
    fontSize: 12,
    lineHeight: 18,
  },
  selectedKeyList: {
    gap: 8,
  },
  selectedKeyRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedKeyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  removeKeyButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeKeyButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const searchableDropdownStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  dropdownInline: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemText: {
    fontSize: 15,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  selectedBadgeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  closeButton: {
    borderTopWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyRowText: {
    fontSize: 13,
  },
});

export default KeyPreApplyForm;
