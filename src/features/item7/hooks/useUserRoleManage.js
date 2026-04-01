/**
 * ユーザーロール管理カスタムフック
 * ユーザ管理タブ用: ロール選択→ユーザ一覧→ユーザのロール編集を管理
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  selectUsersByRoleId,
  selectRoleIdsByUserId,
  updateUserRoles,
  selectAllRoleUserCounts,
  selectAllUserProfilesBasic,
  selectAllUserIdsWithAnyRole,
} from '../services/permissionManageService.js';

/**
 * ロール未所持ユーザー選択時に使用する疑似ロールID
 * 実際のDB上のロールIDではなく、フロントエンド内部での識別用
 * @type {string}
 */
export const NO_ROLE_PSEUDO_ID = '__no_role__';

/**
 * ユーザーロール管理フック
 * @param {Array} roles - 全ロール一覧（usePermissionManageから受け取る）
 * @returns {Object} ユーザーロール管理に必要な状態と操作関数
 */
const useUserRoleManage = (roles) => {
  // ==================== 状態定義 ====================

  /** 左パネル: 選択中のロールID（NO_ROLE_PSEUDO_ID の場合はロール未所持ユーザーを表示） */
  const [selectedUserTabRoleId, setSelectedUserTabRoleId] = useState(null);
  /** 中央パネル: 選択ロールに属するユーザー一覧 */
  const [usersForRole, setUsersForRole] = useState([]);
  /** 中央パネル: ユーザー一覧読み込み中フラグ */
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  /** 中央パネル: 選択中のユーザーID（user_id） */
  const [selectedUserId, setSelectedUserId] = useState(null);
  /** 右パネル: 選択ユーザーの元のロールID配列（DB原本） */
  const [originalUserRoleIds, setOriginalUserRoleIds] = useState([]);
  /** 右パネル: 編集中のロールIDセット */
  const [editedUserRoleIds, setEditedUserRoleIds] = useState(new Set());
  /** 右パネル: ロール情報読み込み中フラグ */
  const [isLoadingUserRoles, setIsLoadingUserRoles] = useState(false);
  /** 保存中フラグ */
  const [isUserSaving, setIsUserSaving] = useState(false);
  /** エラーメッセージ */
  const [userErrorMessage, setUserErrorMessage] = useState(null);
  /** ロール検索フィルター（左パネル） */
  const [userRoleSearchText, setUserRoleSearchText] = useState('');
  /** ユーザー検索フィルター（中央パネル） */
  const [userSearchText, setUserSearchText] = useState('');
  /** 全ロールのユーザー数マップ */
  const [roleUserCounts, setRoleUserCounts] = useState({});
  /** ロール未所持ユーザー一覧 */
  const [noRoleUsers, setNoRoleUsers] = useState([]);

  // ==================== 初期データ取得 ====================

  /**
   * 全ロールのユーザー数を取得
   */
  const fetchRoleUserCounts = useCallback(async () => {
    const { data, error } = await selectAllRoleUserCounts();
    if (!error && data) {
      setRoleUserCounts(data);
    }
  }, []);

  /**
   * ロール未所持ユーザーを取得する
   * 全ユーザーからロールを持つユーザーを除いた一覧
   */
  const fetchNoRoleUsers = useCallback(async () => {
    const [profilesResult, idsResult] = await Promise.all([
      selectAllUserProfilesBasic(),
      selectAllUserIdsWithAnyRole(),
    ]);

    if (profilesResult.error || idsResult.error) {
      return;
    }

    /** ロールを持つuser_idのセット */
    const idsWithRole = new Set(idsResult.data || []);

    /** ロールを持たないユーザーのみ抽出 */
    const filtered = (profilesResult.data || [])
      .filter((u) => !idsWithRole.has(u.user_id))
      .map((u) => ({
        user_id: u.user_id,
        name: u.name || '(名前なし)',
        organization: u.organization || '',
      }));

    setNoRoleUsers(filtered);
  }, []);

  /** マウント時にユーザー数とロール未所持ユーザーを取得 */
  useEffect(() => {
    fetchRoleUserCounts();
    fetchNoRoleUsers();
  }, [fetchRoleUserCounts, fetchNoRoleUsers]);

  // ==================== 算出値 ====================

  /**
   * ロール未所持ユーザー数
   * @type {number}
   */
  const noRoleUserCount = useMemo(() => noRoleUsers.length, [noRoleUsers]);

  /**
   * ロール検索フィルター適用済みのロール一覧
   * @type {Array}
   */
  const filteredUserTabRoles = useMemo(() => {
    if (!userRoleSearchText.trim()) {
      return roles;
    }
    /** 検索テキストを小文字化して部分一致検索 */
    const keyword = userRoleSearchText.trim().toLowerCase();
    return roles.filter((role) => {
      const name = (role.display_name || role.name || '').toLowerCase();
      return name.includes(keyword);
    });
  }, [roles, userRoleSearchText]);

  /**
   * ユーザー検索フィルター適用済みのユーザー一覧
   * @type {Array}
   */
  const filteredUsersForRole = useMemo(() => {
    if (!userSearchText.trim()) {
      return usersForRole;
    }
    /** 検索テキストを小文字化して名前・所属で部分一致検索 */
    const keyword = userSearchText.trim().toLowerCase();
    return usersForRole.filter((user) => {
      const name = (user.name || '').toLowerCase();
      const org = (user.organization || '').toLowerCase();
      return name.includes(keyword) || org.includes(keyword);
    });
  }, [usersForRole, userSearchText]);

  /**
   * 選択中ユーザーの名前
   * @type {string}
   */
  const selectedUserName = useMemo(() => {
    if (!selectedUserId) {
      return '';
    }
    const user = usersForRole.find((u) => u.user_id === selectedUserId);
    return user?.name || '';
  }, [selectedUserId, usersForRole]);

  /**
   * 選択中ロールの表示名（疑似IDの場合は「ロール未所持」）
   * @type {string}
   */
  const selectedUserTabRoleName = useMemo(() => {
    if (!selectedUserTabRoleId) {
      return '';
    }
    if (selectedUserTabRoleId === NO_ROLE_PSEUDO_ID) {
      return 'ロール未所持';
    }
    const role = roles.find((r) => r.id === selectedUserTabRoleId);
    return role?.display_name || role?.name || '';
  }, [selectedUserTabRoleId, roles]);

  /**
   * 未保存の変更があるか
   * @type {boolean}
   */
  const hasUserRoleChanges = useMemo(() => {
    if (!selectedUserId) {
      return false;
    }
    /** サイズが異なれば変更あり */
    if (editedUserRoleIds.size !== originalUserRoleIds.length) {
      return true;
    }
    /** 内容が異なるか確認 */
    return !originalUserRoleIds.every((id) => editedUserRoleIds.has(id));
  }, [selectedUserId, editedUserRoleIds, originalUserRoleIds]);

  // ==================== 操作 ====================

  /**
   * ロールを選択してユーザー一覧を取得する
   * NO_ROLE_PSEUDO_ID が渡された場合はロール未所持ユーザーを表示する
   * @param {string|null} roleId - 選択するロールのID（null でリセット）
   */
  const selectRoleForUserTab = useCallback(async (roleId) => {
    setSelectedUserTabRoleId(roleId);
    /** ユーザー選択をクリア */
    setSelectedUserId(null);
    setOriginalUserRoleIds([]);
    setEditedUserRoleIds(new Set());
    setUserSearchText('');
    setUserErrorMessage(null);

    if (!roleId) {
      setUsersForRole([]);
      return;
    }

    /** ロール未所持ユーザーの表示 */
    if (roleId === NO_ROLE_PSEUDO_ID) {
      setUsersForRole(noRoleUsers);
      return;
    }

    setIsLoadingUsers(true);
    const { data, error } = await selectUsersByRoleId(roleId);

    if (error) {
      setUserErrorMessage('ユーザー一覧の取得に失敗しました');
      setUsersForRole([]);
    } else {
      setUsersForRole(data || []);
    }
    setIsLoadingUsers(false);
  }, [noRoleUsers]);

  /**
   * ユーザーを選択してロール一覧を取得する
   * @param {string|null} userId - 選択するユーザーのuser_id（null でリセット）
   */
  const selectUser = useCallback(async (userId) => {
    setSelectedUserId(userId);
    setUserErrorMessage(null);

    if (!userId) {
      setOriginalUserRoleIds([]);
      setEditedUserRoleIds(new Set());
      return;
    }

    setIsLoadingUserRoles(true);
    const { data, error } = await selectRoleIdsByUserId(userId);

    if (error) {
      setUserErrorMessage('ユーザーロールの取得に失敗しました');
      setOriginalUserRoleIds([]);
      setEditedUserRoleIds(new Set());
    } else {
      const roleIds = data || [];
      setOriginalUserRoleIds(roleIds);
      setEditedUserRoleIds(new Set(roleIds));
    }
    setIsLoadingUserRoles(false);
  }, []);

  /**
   * ユーザーのロールチェック状態を切り替え
   * @param {string} roleId - 切り替えるロールのID
   */
  const toggleUserRole = useCallback((roleId) => {
    setEditedUserRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  }, []);

  /**
   * ユーザーのロール変更を保存する
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  const saveUserRoles = useCallback(async () => {
    if (!selectedUserId) {
      return { success: false, error: '保存対象のユーザーが選択されていません' };
    }

    setIsUserSaving(true);
    setUserErrorMessage(null);

    const { success, error } = await updateUserRoles(
      selectedUserId,
      originalUserRoleIds,
      Array.from(editedUserRoleIds)
    );

    if (!success) {
      setUserErrorMessage('ロールの更新に失敗しました');
      setIsUserSaving(false);
      return { success: false, error: 'ロールの更新に失敗しました' };
    }

    /** DB原本を更新 */
    const newRoleIds = Array.from(editedUserRoleIds);
    setOriginalUserRoleIds(newRoleIds);

    /** ロール未所持ユーザー一覧を再取得（ロール付与で移動する可能性がある） */
    await fetchNoRoleUsers();

    /** 選択中ロールのユーザー一覧を再取得 */
    if (selectedUserTabRoleId) {
      if (selectedUserTabRoleId === NO_ROLE_PSEUDO_ID) {
        /** ロール未所持リストを再フェッチ後に反映（fetchNoRoleUsersで更新済み） */
        /** 非同期なので少し待ってからsetUsersForRoleに反映する必要があるため再取得 */
        const [profilesResult, idsResult] = await Promise.all([
          selectAllUserProfilesBasic(),
          selectAllUserIdsWithAnyRole(),
        ]);
        if (!profilesResult.error && !idsResult.error) {
          const idsWithRole = new Set(idsResult.data || []);
          const updated = (profilesResult.data || [])
            .filter((u) => !idsWithRole.has(u.user_id))
            .map((u) => ({
              user_id: u.user_id,
              name: u.name || '(名前なし)',
              organization: u.organization || '',
            }));
          setNoRoleUsers(updated);
          setUsersForRole(updated);
          /** このユーザーがロール未所持から外れた場合は選択をクリア */
          const isStillNoRole = updated.some((u) => u.user_id === selectedUserId);
          if (!isStillNoRole && newRoleIds.length > 0) {
            setSelectedUserId(null);
            setOriginalUserRoleIds([]);
            setEditedUserRoleIds(new Set());
          }
        }
      } else {
        const { data } = await selectUsersByRoleId(selectedUserTabRoleId);
        if (data) {
          setUsersForRole(data);
          /** 削除されたユーザーが選択中だった場合の処理 */
          const isStillInList = data.some((u) => u.user_id === selectedUserId);
          if (!isStillInList) {
            setSelectedUserId(null);
            setOriginalUserRoleIds([]);
            setEditedUserRoleIds(new Set());
          }
        }
      }
    }

    /** ロールユーザー数を再取得 */
    await fetchRoleUserCounts();

    setIsUserSaving(false);
    return { success: true, error: null };
  }, [
    selectedUserId,
    selectedUserTabRoleId,
    originalUserRoleIds,
    editedUserRoleIds,
    fetchRoleUserCounts,
    fetchNoRoleUsers,
  ]);

  /**
   * ユーザーのロール変更をリセットする
   */
  const resetUserRoles = useCallback(() => {
    setEditedUserRoleIds(new Set(originalUserRoleIds));
  }, [originalUserRoleIds]);

  return {
    /** 状態 */
    selectedUserTabRoleId,
    selectedUserId,
    usersForRole,
    filteredUserTabRoles,
    filteredUsersForRole,
    isLoadingUsers,
    isLoadingUserRoles,
    isUserSaving,
    userErrorMessage,
    userRoleSearchText,
    userSearchText,
    roleUserCounts,
    noRoleUsers,
    noRoleUserCount,
    selectedUserName,
    selectedUserTabRoleName,
    editedUserRoleIds,
    hasUserRoleChanges,

    /** 操作 */
    setUserRoleSearchText,
    setUserSearchText,
    selectRoleForUserTab,
    selectUser,
    toggleUserRole,
    saveUserRoles,
    resetUserRoles,
    fetchRoleUserCounts,
    fetchNoRoleUsers,
  };
};

export default useUserRoleManage;
