/**
 * 管理者通知送信セクションコンポーネント
 * 設定画面の管理者セクション内に表示する通知送信UI
 * ロジックは既存の notificationService を再利用
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  getRoles,
  getUsersByRole,
  getUserProfilesByIds,
  sendNotificationToRoles,
  sendNotificationToUser,
} from '../../../shared/services/notificationService';

/**
 * ドロップダウン選択コンポーネント
 * モーダルで選択肢を表示するセレクトUI
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.label - ラベルテキスト
 * @param {string} props.placeholder - 未選択時のプレースホルダー
 * @param {Array} props.items - 選択肢の配列（{ id, label }）
 * @param {string} props.selectedId - 選択中の項目ID
 * @param {Function} props.onSelect - 選択時のコールバック
 * @param {Object} props.theme - テーマオブジェクト
 * @param {boolean} props.isOpen - モーダルの開閉状態
 * @param {Function} props.onOpen - モーダルを開く時のコールバック
 * @param {Function} props.onClose - モーダルを閉じる時のコールバック
 * @returns {JSX.Element} ドロップダウンコンポーネント
 */
const DropdownSelect = ({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  theme,
  isOpen,
  onOpen,
  onClose,
}) => {
  /** 選択中の項目 */
  const selectedItem = items.find((item) => item.id === selectedId);

  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.dropdownButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
        onPress={onOpen}
      >
        <Text style={{ color: selectedItem ? theme.text : theme.textSecondary }}>
          {selectedItem ? selectedItem.label : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{label}</Text>
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                /** 選択中かどうか */
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      { borderColor: theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' },
                    ]}
                    onPress={() => {
                      onSelect(item.id);
                      onClose();
                    }}
                  >
                    <Text style={{ color: isSelected ? '#fff' : theme.text }}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.helperText, { color: theme.textSecondary }]}>選択肢がありません</Text>
              }
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={{ color: theme.text }}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

/**
 * 管理者通知送信セクション
 * 設定画面内にインラインで表示する通知送信UI
 * @returns {JSX.Element} 管理者通知送信セクション
 */
const SettingsAdminNotificationSection = () => {
  /** テーマコンテキスト */
  const { theme } = useTheme();
  /** 認証コンテキスト */
  const { user } = useAuth();

  /** 送信対象タイプ（user: 個人, role: ロール） */
  const [targetType, setTargetType] = useState('user');
  /** 取得済みロール一覧 */
  const [roles, setRoles] = useState([]);
  /** ロール送信時の選択済みロールID一覧 */
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  /** 個人送信時の送信方法（userId: ID直接入力, roleName: ロール+氏名選択） */
  const [userSelectMode, setUserSelectMode] = useState('userId');
  /** 個人送信時のユーザーID直接入力値 */
  const [targetUserId, setTargetUserId] = useState('');
  /** ロール+氏名選択時のロールID */
  const [targetRoleIdForUser, setTargetRoleIdForUser] = useState('');
  /** ロール+氏名選択時のユーザー一覧 */
  const [availableUsers, setAvailableUsers] = useState([]);
  /** ロール+氏名選択時の選択済みユーザーID */
  const [selectedUserIdByRole, setSelectedUserIdByRole] = useState('');
  /** ロールドロップダウンの開閉状態 */
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  /** ユーザードロップダウンの開閉状態 */
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  /** 通知タイトル */
  const [title, setTitle] = useState('');
  /** 通知本文 */
  const [body, setBody] = useState('');
  /** 送信結果ステータスメッセージ */
  const [statusMessage, setStatusMessage] = useState('');
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** 送信中フラグ */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 初回マウント時にロール一覧を取得
   */
  useEffect(() => {
    const loadRoles = async () => {
      const { roles: data, error } = await getRoles();
      if (!error) {
        setRoles(data);
      }
    };
    loadRoles();
  }, []);

  /**
   * ロール選択時にそのロールのユーザー一覧を取得
   */
  useEffect(() => {
    const loadUsers = async () => {
      if (!targetRoleIdForUser) {
        setAvailableUsers([]);
        setSelectedUserIdByRole('');
        return;
      }
      const { users, error: usersError } = await getUsersByRole(targetRoleIdForUser);
      if (usersError) {
        setAvailableUsers([]);
        return;
      }
      const { profiles, error: profileError } = await getUserProfilesByIds(users);
      if (profileError) {
        setAvailableUsers([]);
        return;
      }
      /** 名前順にソートしたユーザー一覧 */
      const sorted = [...profiles].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAvailableUsers(
        sorted.map((profile) => ({
          id: profile.user_id,
          label: profile.name || '（名前なし）',
        }))
      );
      setSelectedUserIdByRole('');
    };
    loadUsers();
  }, [targetRoleIdForUser]);

  /**
   * ロールのチェック状態をトグルする
   * @param {string} roleId - トグル対象のロールID
   */
  const toggleRole = (roleId) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  /**
   * 全ロールを選択する
   */
  const handleSelectAllRoles = () => {
    setSelectedRoleIds(roles.map((role) => role.id));
  };

  /**
   * 全ロールの選択を解除する
   */
  const handleClearRoles = () => {
    setSelectedRoleIds([]);
  };

  /**
   * 通知送信を実行する
   */
  const handleSubmit = async () => {
    setErrorMessage('');
    setStatusMessage('');

    if (title.trim() === '') {
      setErrorMessage('タイトルは必須です');
      return;
    }

    setIsSubmitting(true);
    if (targetType === 'user') {
      /** 送信先ユーザーIDを解決 */
      let resolvedUserId = '';
      if (userSelectMode === 'userId') {
        if (targetUserId.trim() === '') {
          setErrorMessage('送信先ユーザーIDを入力してください');
          setIsSubmitting(false);
          return;
        }
        resolvedUserId = targetUserId.trim();
      } else {
        if (!targetRoleIdForUser) {
          setErrorMessage('送信先ロールを選択してください');
          setIsSubmitting(false);
          return;
        }
        if (!selectedUserIdByRole) {
          setErrorMessage('送信先の氏名を選択してください');
          setIsSubmitting(false);
          return;
        }
        resolvedUserId = selectedUserIdByRole;
      }

      const result = await sendNotificationToUser(
        resolvedUserId,
        title.trim(),
        body.trim(),
        {},
        user?.id ?? null
      );
      if (result.error) {
        setErrorMessage(result.error?.message || '通知送信に失敗しました');
      } else {
        /** Push通知の送信結果テキスト */
        const pushText = result.push
          ? ` / Push: ${result.push.succeeded}/${result.push.attempted}（失敗${result.push.failed}）`
          : '';
        setStatusMessage(`送信完了: ${result.notification.id}（1件）${pushText}`);
        setTargetUserId('');
        setTargetRoleIdForUser('');
        setAvailableUsers([]);
        setSelectedUserIdByRole('');
        setTitle('');
        setBody('');
      }
    } else {
      if (selectedRoleIds.length === 0) {
        setErrorMessage('送信先ロールを選択してください');
        setIsSubmitting(false);
        return;
      }
      const result = await sendNotificationToRoles(
        selectedRoleIds,
        title.trim(),
        body.trim(),
        {},
        user?.id ?? null
      );
      if (result.error) {
        setErrorMessage(result.error?.message || '通知送信に失敗しました');
      } else {
        /** Push通知の送信結果テキスト */
        const pushText = result.push
          ? ` / Push: ${result.push.succeeded}/${result.push.attempted}（失敗${result.push.failed}）`
          : '';
        setStatusMessage(`送信完了: ${result.notification.id}（${result.recipientsCount}件）${pushText}`);
        setSelectedRoleIds([]);
        setTitle('');
        setBody('');
      }
    }
    setIsSubmitting(false);
  };

  return (
    <View style={styles.container}>
      {/* 対象タイプ選択 */}
      <Text style={[styles.fieldLabel, { color: theme.text }]}>対象タイプ</Text>
      <View style={styles.segment}>
        {['user', 'role'].map((type) => {
          /** セグメントのラベル */
          const label = type === 'user' ? '個人' : 'ロール';
          /** 選択中かどうか */
          const isSelected = targetType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.segmentButton,
                {
                  backgroundColor: isSelected ? theme.primary : theme.surface,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setTargetType(type)}
            >
              <Text style={{ color: isSelected ? '#fff' : theme.text }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 個人送信モード */}
      {targetType === 'user' ? (
        <>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>送信方法</Text>
          <View style={styles.segment}>
            {[
              { key: 'userId', label: 'ユーザーID' },
              { key: 'roleName', label: 'ロール + 氏名' },
            ].map((mode) => {
              /** 選択中かどうか */
              const isSelected = userSelectMode === mode.key;
              return (
                <TouchableOpacity
                  key={mode.key}
                  style={[
                    styles.segmentButton,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setUserSelectMode(mode.key)}
                >
                  <Text style={{ color: isSelected ? '#fff' : theme.text }}>{mode.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {userSelectMode === 'userId' ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>送信先ユーザーID</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                placeholder="ユーザーIDを入力"
                placeholderTextColor={theme.textSecondary}
                value={targetUserId}
                onChangeText={setTargetUserId}
                autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <DropdownSelect
                label="送信先ロール"
                placeholder="ロールを選択"
                items={roles.map((role) => ({
                  id: role.id,
                  label: role.display_name || role.name,
                }))}
                selectedId={targetRoleIdForUser}
                onSelect={setTargetRoleIdForUser}
                theme={theme}
                isOpen={roleDropdownOpen}
                onOpen={() => setRoleDropdownOpen(true)}
                onClose={() => setRoleDropdownOpen(false)}
              />

              <DropdownSelect
                label="送信先氏名"
                placeholder="氏名を選択"
                items={availableUsers}
                selectedId={selectedUserIdByRole}
                onSelect={setSelectedUserIdByRole}
                theme={theme}
                isOpen={userDropdownOpen}
                onOpen={() => setUserDropdownOpen(true)}
                onClose={() => setUserDropdownOpen(false)}
              />
            </>
          )}
        </>
      ) : (
        <>
          {/* ロール送信モード */}
          <Text style={[styles.fieldLabel, { color: theme.text }]}>送信先ロール（複数選択可）</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: theme.border }]}
              onPress={handleSelectAllRoles}
            >
              <Text style={{ color: theme.text }}>全選択</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: theme.border }]}
              onPress={handleClearRoles}
            >
              <Text style={{ color: theme.text }}>全解除</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.roleList}>
            {roles.map((role) => {
              /** 選択中かどうか */
              const isSelected = selectedRoleIds.includes(role.id);
              return (
                <TouchableOpacity
                  key={role.id}
                  style={[
                    styles.roleItem,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => toggleRole(role.id)}
                >
                  <Text style={{ color: isSelected ? '#fff' : theme.text }}>
                    {role.display_name || role.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* 通知タイトル */}
      <Text style={[styles.fieldLabel, { color: theme.text }]}>通知タイトル（必須）</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        placeholder="タイトルを入力"
        placeholderTextColor={theme.textSecondary}
        value={title}
        onChangeText={setTitle}
      />

      {/* 通知本文 */}
      <Text style={[styles.fieldLabel, { color: theme.text }]}>通知本文</Text>
      <TextInput
        style={[styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        placeholder="本文を入力"
        placeholderTextColor={theme.textSecondary}
        value={body}
        onChangeText={setBody}
        multiline
      />

      {/* ステータスメッセージ */}
      {statusMessage !== '' && (
        <Text style={[styles.statusText, { color: theme.primary }]}>{statusMessage}</Text>
      )}
      {errorMessage !== '' && (
        <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
      )}

      {/* 送信ボタン */}
      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: theme.primary }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? '送信中...' : '送信'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  /** セクション全体のコンテナ */
  container: {
    gap: 0,
  },
  /** フィールドラベル */
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  /** セグメントコントロール */
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  /** セグメントボタン */
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  /** テキスト入力 */
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  /** 複数行テキスト入力 */
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
  },
  /** ロール一覧 */
  roleList: {
    gap: 8,
  },
  /** ドロップダウンボタン */
  dropdownButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  /** モーダルオーバーレイ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  /** モーダルカード */
  modalCard: {
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  /** モーダルタイトル */
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  /** モーダル項目 */
  modalItem: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  /** モーダル閉じるボタン */
  modalCloseButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  /** ヘルパーテキスト */
  helperText: {
    fontSize: 12,
  },
  /** アクションボタン行 */
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  /** アクションボタン */
  actionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  /** ロール項目 */
  roleItem: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  /** ステータステキスト */
  statusText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  /** エラーテキスト */
  errorText: {
    marginTop: 12,
    fontSize: 14,
  },
  /** 送信ボタン */
  submitButton: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  /** 送信ボタンテキスト */
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsAdminNotificationSection;
