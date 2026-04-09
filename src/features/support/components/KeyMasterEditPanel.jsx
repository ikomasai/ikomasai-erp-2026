/**
 * 鍵マスタ管理パネル
 * 鍵の追加・編集・有効/無効切替をUIから行う
 * 本部サポート画面の管理者向けセクションに表示する
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  insertKey,
  listBuildings,
  listKeys,
  setKeyActive,
  updateKey,
} from '../../../services/supabase/keyMasterService';

const normalizeText = (value) => (value || '').trim();

/**
 * メッセージをプラットフォームに合わせて表示する
 * @param {string} title - タイトル
 * @param {string} message - 本文
 * @returns {void}
 */
const showMessage = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
};

/**
 * 建物名が未入力のときに表示するプリセット一覧
 * DBから動的取得した棟名で補完するが、空の場合のフォールバックとして使用
 */
const BUILDING_PRESETS_FALLBACK = ['A館', 'B館', 'C館', 'D館', 'E館', 'F館'];

/**
 * 棟選択ボタン群コンポーネント
 * 既存の棟名をボタンで表示し、タップで選択できる
 * @param {Object} props - プロパティ
 * @param {string[]} props.buildings - 棟名一覧
 * @param {string} props.selectedBuilding - 現在選択中の棟名
 * @param {Function} props.onSelect - 選択コールバック（棟名を引数に取る）
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} 棟選択ボタン群
 */
const BuildingSelector = ({ buildings, selectedBuilding, onSelect, theme }) => {
  /** 表示する棟名一覧（DBが空の場合はフォールバックを使用） */
  const displayBuildings = buildings.length > 0 ? buildings : BUILDING_PRESETS_FALLBACK;

  return (
    <View style={styles.buildingSelectorRow}>
      {displayBuildings.map((name) => {
        /** 選択中かどうか */
        const isSelected = selectedBuilding === name;
        return (
          <TouchableOpacity
            key={name}
            style={[
              styles.buildingPill,
              {
                backgroundColor: isSelected ? theme.primary : theme.background,
                borderColor: isSelected ? theme.primary : theme.border,
              },
            ]}
            onPress={() => onSelect(isSelected ? '' : name)}
          >
            <Text
              style={[
                styles.buildingPillText,
                { color: isSelected ? '#FFFFFF' : theme.textSecondary },
              ]}
            >
              {name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/**
 * 鍵マスタ管理パネルコンポーネント
 * @param {Object} props - プロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} 鍵マスタ管理パネル
 */
const KeyMasterEditPanel = ({ theme }) => {
  /** 全鍵一覧（有効・無効含む） */
  const [keys, setKeys] = useState([]);
  /** 読み込み中フラグ */
  const [isLoading, setIsLoading] = useState(false);
  /** 登録/更新処理中フラグ */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 既存棟名一覧（ボタン選択に使用） */
  const [buildings, setBuildings] = useState([]);

  /** 追加フォームの鍵コード */
  const [newKeyCode, setNewKeyCode] = useState('');
  /** 追加フォームの棟名（ボタン選択 or カスタム入力） */
  const [newBuilding, setNewBuilding] = useState('');
  /** 追加フォームの教室名 */
  const [newClassroomName, setNewClassroomName] = useState('');
  /** 追加フォームの表示名（棟名+教室名から自動生成、上書き可） */
  const [newDisplayName, setNewDisplayName] = useState('');
  /** 追加フォームの表示名が手動で上書きされたか */
  const [isDisplayNameManuallyEdited, setIsDisplayNameManuallyEdited] = useState(false);

  /** 編集中の鍵（null のとき非表示） */
  const [editingKey, setEditingKey] = useState(null);
  /** 編集フォームの棟名 */
  const [editBuilding, setEditBuilding] = useState('');
  /** 編集フォームの教室名 */
  const [editClassroomName, setEditClassroomName] = useState('');
  /** 編集フォームの表示名 */
  const [editDisplayName, setEditDisplayName] = useState('');
  /** 編集フォームの表示名が手動で上書きされたか */
  const [isEditDisplayNameManuallyEdited, setIsEditDisplayNameManuallyEdited] = useState(false);

  /** 一覧の表示フィルタ（all / active / inactive） */
  const [filter, setFilter] = useState('all');

  /**
   * building + classroom_name から自動生成した表示名を返す
   * @param {string} building - 棟名
   * @param {string} classroomName - 教室名
   * @returns {string} 自動生成された表示名
   */
  const buildAutoDisplayName = (building, classroomName) => {
    const parts = [normalizeText(building), normalizeText(classroomName)].filter(Boolean);
    return parts.join(' ');
  };

  /**
   * 棟名一覧を読み込む
   * @returns {Promise<void>} 読み込み処理
   */
  const loadBuildings = async () => {
    const { data } = await listBuildings();
    setBuildings(data || []);
  };

  /**
   * 鍵一覧を再読み込みする
   * @returns {Promise<void>} 読み込み処理
   */
  const loadKeys = async () => {
    setIsLoading(true);
    const { data, error } = await listKeys({ activeOnly: false, limit: 600 });
    setIsLoading(false);

    if (error) {
      showMessage('取得エラー', '鍵一覧の取得に失敗しました');
      return;
    }

    setKeys(data || []);
  };

  useEffect(() => {
    loadBuildings();
    loadKeys();
  }, []);

  /**
   * 追加フォームの棟名が変わったとき、未手動編集なら表示名を自動更新する
   * @param {string} building - 新しい棟名
   * @returns {void}
   */
  const handleNewBuildingChange = (building) => {
    setNewBuilding(building);
    if (!isDisplayNameManuallyEdited) {
      setNewDisplayName(buildAutoDisplayName(building, newClassroomName));
    }
  };

  /**
   * 追加フォームの教室名が変わったとき、未手動編集なら表示名を自動更新する
   * @param {string} classroomName - 新しい教室名
   * @returns {void}
   */
  const handleNewClassroomNameChange = (classroomName) => {
    setNewClassroomName(classroomName);
    if (!isDisplayNameManuallyEdited) {
      setNewDisplayName(buildAutoDisplayName(newBuilding, classroomName));
    }
  };

  /**
   * 編集フォームの棟名が変わったとき、未手動編集なら表示名を自動更新する
   * @param {string} building - 新しい棟名
   * @returns {void}
   */
  const handleEditBuildingChange = (building) => {
    setEditBuilding(building);
    if (!isEditDisplayNameManuallyEdited) {
      setEditDisplayName(buildAutoDisplayName(building, editClassroomName));
    }
  };

  /**
   * 編集フォームの教室名が変わったとき、未手動編集なら表示名を自動更新する
   * @param {string} classroomName - 新しい教室名
   * @returns {void}
   */
  const handleEditClassroomNameChange = (classroomName) => {
    setEditClassroomName(classroomName);
    if (!isEditDisplayNameManuallyEdited) {
      setEditDisplayName(buildAutoDisplayName(editBuilding, classroomName));
    }
  };

  /**
   * 新規鍵を追加する
   * @returns {Promise<void>} 追加処理
   */
  const handleInsert = async () => {
    const keyCode = normalizeText(newKeyCode);
    const displayName = normalizeText(newDisplayName);

    if (!keyCode) {
      showMessage('入力不足', '鍵コードは必須です');
      return;
    }
    if (!displayName) {
      showMessage('入力不足', '表示名（棟名+教室名）は必須です');
      return;
    }

    setIsSubmitting(true);
    const { error } = await insertKey({
      keyCode,
      displayName,
      building: normalizeText(newBuilding),
      classroomName: normalizeText(newClassroomName),
      locationText: displayName,
    });
    setIsSubmitting(false);

    if (error) {
      const msg = error.message?.includes('duplicate')
        ? 'その鍵コードはすでに登録されています'
        : (error.message || '鍵の追加に失敗しました');
      showMessage('追加エラー', msg);
      return;
    }

    /** フォームをリセット */
    setNewKeyCode('');
    setNewBuilding('');
    setNewClassroomName('');
    setNewDisplayName('');
    setIsDisplayNameManuallyEdited(false);
    await Promise.all([loadKeys(), loadBuildings()]);
    showMessage('追加完了', `「${displayName}」を追加しました`);
  };

  /**
   * 編集モーダルを開く
   * @param {Object} key - 編集対象の鍵
   * @returns {void}
   */
  const handleOpenEdit = (key) => {
    const metadata = key.metadata && typeof key.metadata === 'object' ? key.metadata : {};
    /** building カラム優先、なければ metadata.building を使用 */
    const building = normalizeText(key.building || metadata.building);
    const classroomName = normalizeText(key.classroom_name);

    setEditingKey(key);
    setEditBuilding(building);
    setEditClassroomName(classroomName);
    setEditDisplayName(normalizeText(key.display_name));
    setIsEditDisplayNameManuallyEdited(true);
  };

  /**
   * 鍵情報を更新する
   * @returns {Promise<void>} 更新処理
   */
  const handleUpdate = async () => {
    if (!editingKey) {
      return;
    }
    const displayName = normalizeText(editDisplayName);
    if (!displayName) {
      showMessage('入力不足', '表示名は必須です');
      return;
    }

    setIsSubmitting(true);
    const { error } = await updateKey(editingKey.id, {
      displayName,
      building: normalizeText(editBuilding),
      classroomName: normalizeText(editClassroomName),
      locationText: displayName,
    });
    setIsSubmitting(false);

    if (error) {
      showMessage('更新エラー', error.message || '鍵情報の更新に失敗しました');
      return;
    }

    setEditingKey(null);
    await Promise.all([loadKeys(), loadBuildings()]);
    showMessage('更新完了', `「${displayName}」を更新しました`);
  };

  /**
   * 鍵の有効/無効を切り替える
   * @param {Object} key - 対象の鍵
   * @returns {Promise<void>} 切替処理
   */
  const handleToggleActive = async (key) => {
    const nextActive = !key.is_active;
    const label = nextActive ? '有効化' : '無効化';

    const confirmMessage = `「${key.display_name}」を${label}しますか？`;
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMessage)) {
        return;
      }
    } else {
      const confirmed = await new Promise((resolve) => {
        Alert.alert('確認', confirmMessage, [
          { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
          { text: label, onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) {
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await setKeyActive(key.id, nextActive);
    setIsSubmitting(false);

    if (error) {
      showMessage('エラー', error.message || `鍵の${label}に失敗しました`);
      return;
    }

    await loadKeys();
  };

  /**
   * フィルタ済み鍵一覧
   */
  const filteredKeys = keys.filter((key) => {
    if (filter === 'active') {
      return key.is_active;
    }
    if (filter === 'inactive') {
      return !key.is_active;
    }
    return true;
  });

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ヘッダー */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>鍵マスタ管理</Text>
        <TouchableOpacity
          style={[styles.refreshButton, { borderColor: theme.border }]}
          onPress={() => { loadKeys(); loadBuildings(); }}
          disabled={isLoading || isSubmitting}
        >
          <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
            {isLoading ? '読込中' : '更新'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.helpText, { color: theme.textSecondary }]}>
        来年以降も使う鍵情報をここで管理します。追加・編集・無効化が可能です。
      </Text>

      {/* ── 追加フォーム ── */}
      <Text style={[styles.subTitle, { color: theme.text }]}>新規追加</Text>

      <Text style={[styles.label, { color: theme.text }]}>鍵コード（必須・一意）</Text>
      <TextInput
        value={newKeyCode}
        onChangeText={setNewKeyCode}
        placeholder="例: A101"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
        ]}
      />

      <Text style={[styles.label, { color: theme.text }]}>棟名（タップで選択 or 直接入力）</Text>
      <BuildingSelector
        buildings={buildings}
        selectedBuilding={newBuilding}
        onSelect={handleNewBuildingChange}
        theme={theme}
      />
      <TextInput
        value={newBuilding}
        onChangeText={handleNewBuildingChange}
        placeholder="例: A館（直接入力も可）"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 6 },
        ]}
      />

      <Text style={[styles.label, { color: theme.text }]}>教室名</Text>
      <TextInput
        value={newClassroomName}
        onChangeText={handleNewClassroomNameChange}
        placeholder="例: 101教室"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
        ]}
      />

      <Text style={[styles.label, { color: theme.text }]}>
        表示名（必須・棟名+教室名から自動生成、上書き可）
      </Text>
      <TextInput
        value={newDisplayName}
        onChangeText={(text) => {
          setNewDisplayName(text);
          setIsDisplayNameManuallyEdited(true);
        }}
        placeholder="例: A館 101教室"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
        ]}
      />

      <TouchableOpacity
        style={[styles.mainActionButton, { backgroundColor: theme.primary }]}
        onPress={handleInsert}
        disabled={isSubmitting}
      >
        <Text style={styles.mainActionButtonText}>
          {isSubmitting ? '追加中...' : '追加する'}
        </Text>
      </TouchableOpacity>

      {/* ── 鍵一覧 ── */}
      <View style={styles.listHeader}>
        <Text style={[styles.subTitle, { color: theme.text }]}>
          鍵一覧（{filteredKeys.length}件）
        </Text>
        <View style={styles.filterGroup}>
          {[
            { key: 'all', label: '全て' },
            { key: 'active', label: '有効のみ' },
            { key: 'inactive', label: '無効のみ' },
          ].map((option) => {
            /** フィルタが一致するか */
            const isActive = filter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor: isActive ? theme.primary : theme.background,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setFilter(option.key)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    { color: isActive ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {filteredKeys.length === 0 && !isLoading ? (
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {filter === 'inactive' ? '無効化された鍵はありません' : '鍵が登録されていません'}
        </Text>
      ) : null}

      <View style={styles.list}>
        {filteredKeys.map((key) => {
          /** メタデータ */
          const metadata = key.metadata && typeof key.metadata === 'object' ? key.metadata : {};
          /** 棟名: building カラム優先、フォールバックで metadata.building を使用 */
          const building = normalizeText(key.building || metadata.building);
          /** 教室名 */
          const classroomName = normalizeText(key.classroom_name);

          return (
            <View
              key={key.id}
              style={[
                styles.listRow,
                {
                  borderColor: key.is_active ? theme.border : theme.textSecondary,
                  backgroundColor: key.is_active ? theme.background : `${theme.textSecondary}18`,
                  opacity: key.is_active ? 1 : 0.65,
                },
              ]}
            >
              <View style={styles.listRowMain}>
                <View style={styles.listRowInfo}>
                  <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>
                    {key.display_name || key.key_code}
                  </Text>
                  <Text style={[styles.listMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    コード: {key.key_code}
                    {building ? `　棟: ${building}` : ''}
                    {classroomName ? `　教室: ${classroomName}` : ''}
                  </Text>
                  {!key.is_active ? (
                    <Text style={[styles.inactiveBadge, { color: theme.textSecondary }]}>
                      （無効）
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={[styles.subActionButton, { borderColor: theme.border }]}
                    onPress={() => handleOpenEdit(key)}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.subActionText, { color: theme.primary }]}>編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subActionButton, { borderColor: theme.border }]}
                    onPress={() => handleToggleActive(key)}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.subActionText,
                        { color: key.is_active ? '#C0392B' : '#27AE60' },
                      ]}
                    >
                      {key.is_active ? '無効化' : '有効化'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── 編集モーダル ── */}
      <Modal
        visible={editingKey !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingKey(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            {/* モーダルヘッダー */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>鍵情報を編集</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setEditingKey(null)}
              >
                <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* 鍵コードは変更不可 */}
              <Text style={[styles.label, { color: theme.text }]}>鍵コード（変更不可）</Text>
              <View
                style={[
                  styles.readonlyField,
                  { backgroundColor: `${theme.textSecondary}18`, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.readonlyText, { color: theme.textSecondary }]}>
                  {editingKey?.key_code}
                </Text>
              </View>

              <Text style={[styles.label, { color: theme.text }]}>棟名（タップで選択 or 直接入力）</Text>
              <BuildingSelector
                buildings={buildings}
                selectedBuilding={editBuilding}
                onSelect={handleEditBuildingChange}
                theme={theme}
              />
              <TextInput
                value={editBuilding}
                onChangeText={handleEditBuildingChange}
                placeholder="例: A館"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 6 },
                ]}
              />

              <Text style={[styles.label, { color: theme.text }]}>教室名</Text>
              <TextInput
                value={editClassroomName}
                onChangeText={handleEditClassroomNameChange}
                placeholder="例: 101教室"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              />

              <Text style={[styles.label, { color: theme.text }]}>表示名（必須）</Text>
              <TextInput
                value={editDisplayName}
                onChangeText={(text) => {
                  setEditDisplayName(text);
                  setIsEditDisplayNameManuallyEdited(true);
                }}
                placeholder="例: A館 101教室"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                    marginBottom: 16,
                  },
                ]}
              />
            </ScrollView>

            {/* モーダルフッター */}
            <View style={[styles.modalFooter, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.mainActionButton, { backgroundColor: theme.primary }]}
                onPress={handleUpdate}
                disabled={isSubmitting}
              >
                <Text style={styles.mainActionButtonText}>
                  {isSubmitting ? '更新中...' : '更新する'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setEditingKey(null)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>
                  キャンセル
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  subTitle: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  buildingSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  buildingPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buildingPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  mainActionButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  mainActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  listHeader: {
    marginTop: 16,
    gap: 8,
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
  },
  list: {
    gap: 6,
    marginTop: 6,
  },
  listRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  listRowInfo: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  listMeta: {
    fontSize: 12,
  },
  inactiveBadge: {
    fontSize: 11,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'column',
    gap: 4,
  },
  subActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subActionText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  refreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /* モーダル */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  readonlyField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readonlyText: {
    fontSize: 14,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default KeyMasterEditPanel;
