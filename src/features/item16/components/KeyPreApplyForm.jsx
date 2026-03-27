/**
 * 鍵事前申請フォームコンポーネント
 * 棟選択、鍵選択、複数追加を提供する
 * 希望時刻・理由・添付情報は不要のため削除済み
 */

import React from 'react';
import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * 鍵事前申請フォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
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

export default KeyPreApplyForm;
