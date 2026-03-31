/**
 * ロール新規作成画面コンポーネント
 * ロール名・表示名・初期アクセス権限を設定して新規ロールを作成する
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { MANAGED_SCREENS } from '../constants.js';

/**
 * チェックボックス（テキストベース）
 * @param {Object} props - コンポーネントプロパティ
 * @param {boolean} props.isChecked - チェック状態
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} チェックボックス
 */
const CheckBox = ({ isChecked, theme }) => {
  /** チェック済みの背景色 */
  const backgroundColor = isChecked ? theme.primary : 'transparent';
  /** ボーダー色 */
  const borderColor = isChecked ? theme.primary : theme.textSecondary;

  return (
    <View style={[styles.checkbox, { backgroundColor, borderColor }]}>
      {isChecked && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );
};

/**
 * ロール新規作成画面
 * @param {Object} props - コンポーネントプロパティ
 * @param {Function} props.onSave - 保存コールバック（name, displayName, screens を引数）
 * @param {Function} props.onCancel - キャンセルコールバック（ロール別一覧に戻る）
 * @param {boolean} props.isSaving - 保存中状態
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} ロール新規作成画面
 */
const RoleCreateScreen = ({ onSave, onCancel, isSaving, theme }) => {
  /** ロール名（name と display_name の両方に使用） */
  const [roleName, setRoleName] = useState('');
  /** ロール説明（任意入力） */
  const [description, setDescription] = useState('');
  /** 選択中のアクセス権限（permission名のSet） */
  const [selectedScreens, setSelectedScreens] = useState(new Set());
  /** バリデーションエラー（ローカル検証用） */
  const [validationError, setValidationError] = useState(null);
  /** 完了モーダル表示状態 */
  const [isShowingSuccess, setIsShowingSuccess] = useState(false);
  /** エラーモーダルのメッセージ（サーバーエラー用） */
  const [errorModalMessage, setErrorModalMessage] = useState(null);

  /**
   * 項目のチェック状態を切り替え
   * @param {string} permissionName - 切り替える項目のpermission名
   */
  const toggleScreen = useCallback((permissionName) => {
    setSelectedScreens((prev) => {
      const next = new Set(prev);
      if (next.has(permissionName)) {
        next.delete(permissionName);
      } else {
        next.add(permissionName);
      }
      return next;
    });
  }, []);

  /**
   * 保存処理
   */
  const handleSave = useCallback(async () => {
    setValidationError(null);

    /** バリデーション */
    const trimmedName = roleName.trim();

    if (!trimmedName) {
      setValidationError('ロール名を入力してください');
      return;
    }

    const { success, error } = await onSave(
      trimmedName,
      trimmedName,
      Array.from(selectedScreens),
      description.trim() || null
    );

    if (success) {
      setIsShowingSuccess(true);
    } else if (error) {
      /** サーバーエラーはモーダルで表示 */
      setErrorModalMessage(error);
    }
  }, [roleName, description, selectedScreens, onSave]);

  /**
   * 完了モーダルの閉じる処理
   */
  const handleCloseSuccess = useCallback(() => {
    setIsShowingSuccess(false);
    onCancel();
  }, [onCancel]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onCancel} activeOpacity={0.7}>
          <Text style={[styles.backText, { color: theme.primary }]}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>新規ロールの作成</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* フォーム */}
      <ScrollView
        style={styles.formContainer}
        contentContainerStyle={styles.formContent}
      >
        {/* バリデーションエラー */}
        {validationError && (
          <View style={[styles.errorBanner, { backgroundColor: theme.error + '15' }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>
              {validationError}
            </Text>
          </View>
        )}

        {/* ロール名入力（必須） */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: theme.text }]}>ロール名 <Text style={{ color: theme.error }}>*</Text></Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder="例: 新規部署"
            placeholderTextColor={theme.textSecondary}
            value={roleName}
            onChangeText={setRoleName}
            autoComplete="off"
            textContentType="none"
          />
        </View>

        {/* ロール説明（任意） */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: theme.text }]}>ロール説明</Text>
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>任意入力</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder="このロールの用途や対象者を入力"
            placeholderTextColor={theme.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoComplete="off"
            textContentType="none"
          />
        </View>

        {/* 初期アクセス権限 */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: theme.text }]}>初期アクセス権限</Text>
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
            作成後にロール別タブからも変更できます
          </Text>
          <View style={[styles.checkListContainer, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            {MANAGED_SCREENS.map((screen) => (
              <TouchableOpacity
                key={screen.permissionName}
                style={[styles.checkItem, { borderBottomColor: theme.border }]}
                onPress={() => toggleScreen(screen.permissionName)}
                activeOpacity={0.7}
              >
                <CheckBox
                  isChecked={selectedScreens.has(screen.permissionName)}
                  theme={theme}
                />
                <Text style={[styles.checkItemLabel, { color: theme.text }]}>
                  {screen.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 保存ボタン */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: isSaving ? theme.primary + '50' : theme.primary },
          ]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? '作成中...' : 'ロールを作成'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* エラーモーダル */}
      <Modal
        visible={!!errorModalMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModalMessage(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              作成エラー
            </Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              {errorModalMessage}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: theme.primary }]}
              onPress={() => setErrorModalMessage(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 完了モーダル */}
      <Modal
        visible={isShowingSuccess}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccess}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              ロールを作成しました
            </Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              「{roleName.trim()}」を作成しました。{'\n'}
              ロール別タブからアクセス権限を確認・変更できます。
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: theme.primary }]}
              onPress={handleCloseSuccess}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  /** コンテナ */
  container: {
    flex: 1,
  },
  /** ヘッダー */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  /** 戻るテキスト */
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** ヘッダータイトル */
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  /** ヘッダー右側スペーサー（中央寄せ用） */
  headerSpacer: {
    width: 40,
  },
  /** フォームコンテナ */
  formContainer: {
    flex: 1,
  },
  /** フォームコンテンツ */
  formContent: {
    padding: 16,
    maxWidth: 600,
  },
  /** フォームグループ */
  formGroup: {
    marginBottom: 20,
  },
  /** ラベル */
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  /** サブラベル */
  subLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  /** テキスト入力 */
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  /** テキストエリア（複数行入力） */
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  /** チェックリストコンテナ */
  checkListContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  /** チェック項目行 */
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  /** エラーバナー */
  errorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  /** エラーテキスト */
  errorText: {
    fontSize: 14,
  },
  /** 保存ボタン */
  saveButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  /** 保存ボタンテキスト */
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  /** モーダルオーバーレイ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** モーダルコンテンツ */
  modalContent: {
    borderRadius: 12,
    padding: 24,
    width: 340,
    alignItems: 'center',
  },
  /** モーダルタイトル */
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  /** モーダルメッセージ */
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  /** モーダルボタン */
  modalButton: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  /** モーダルボタンテキスト */
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RoleCreateScreen;
