/**
 * アクセス権限管理カスタムフック
 * ロール・項目の一覧管理、権限の変更状態追跡、保存処理を提供
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  selectAllRoles,
  updateRoleScreens,
  updateMultipleRoleScreens,
  insertRole,
  selectRoleUserCount,
  deleteRole,
} from '../services/permissionManageService.js';
import { MANAGED_SCREENS, PROTECTED_PERMISSIONS, TAB_TYPES } from '../constants.js';

/**
 * 指定のロール名 + permission名の組み合わせが保護対象か判定
 * @param {string} roleName - ロール名
 * @param {string} permissionName - 項目のpermission名
 * @returns {boolean} 保護対象の場合 true
 */
const isProtectedPermission = (roleName, permissionName) => {
  return PROTECTED_PERMISSIONS.some(
    (p) => p.roleName === roleName && p.permissionName === permissionName
  );
};

/**
 * アクセス権限管理フック
 * @returns {Object} 権限管理に必要な状態と操作関数
 */
const usePermissionManage = () => {
  // ==================== 状態定義 ====================

  /** 全ロールデータ（DBから取得した原本） */
  const [roles, setRoles] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState(null);
  /** 保存中状態 */
  const [isSaving, setIsSaving] = useState(false);
  /** 現在のタブ */
  const [activeTab, setActiveTab] = useState(TAB_TYPES.ROLE);
  /** ロール別タブ: 選択中のロールID */
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  /** 項目別タブ: 選択中の項目番号 */
  const [selectedScreenIndex, setSelectedScreenIndex] = useState(null);
  /** ロール別タブ: 編集中のscreens（ロールIDをキー） */
  const [editedRoleScreens, setEditedRoleScreens] = useState({});
  /** 項目別タブ: 編集中のロールIDセット（項目番号をキー） */
  const [editedScreenRoles, setEditedScreenRoles] = useState({});
  /** ロール検索フィルター */
  const [roleSearchText, setRoleSearchText] = useState('');
  /** 項目検索フィルター */
  const [screenSearchText, setScreenSearchText] = useState('');

  // ==================== データ取得 ====================

  /**
   * 全ロールデータを取得して状態にセット
   */
  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await selectAllRoles();

    if (error) {
      setErrorMessage('ロール一覧の取得に失敗しました');
      setIsLoading(false);
      return;
    }

    setRoles(data || []);
    /** 編集状態をリセット */
    setEditedRoleScreens({});
    setEditedScreenRoles({});
    setIsLoading(false);
  }, []);

  /** 初回マウント時にデータ取得 */
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // ==================== 算出値 ====================

  /**
   * ロール検索フィルター適用済みのロール一覧
   * @type {Array}
   */
  const filteredRoles = useMemo(() => {
    if (!roleSearchText.trim()) {
      return roles;
    }
    /** 検索テキストを小文字化して部分一致検索 */
    const keyword = roleSearchText.trim().toLowerCase();
    return roles.filter((role) => {
      const name = (role.display_name || role.name || '').toLowerCase();
      return name.includes(keyword);
    });
  }, [roles, roleSearchText]);

  /**
   * 項目検索フィルター適用済みの項目一覧
   * @type {Array<{itemNumber: number, permissionName: string, label: string, index: number}>}
   */
  const filteredScreens = useMemo(() => {
    /** インデックス情報を付与した項目一覧 */
    const screensWithIndex = MANAGED_SCREENS.map((screen, index) => ({ ...screen, index }));
    if (!screenSearchText.trim()) {
      return screensWithIndex;
    }
    /** 検索テキストを小文字化して部分一致検索 */
    const keyword = screenSearchText.trim().toLowerCase();
    return screensWithIndex.filter((screen) =>
      screen.label.toLowerCase().includes(keyword)
    );
  }, [screenSearchText]);

  /**
   * 各ロールのアクセス可能項目数マップ
   * @type {Object<string, number>} roleId → 項目数
   */
  const roleScreenCounts = useMemo(() => {
    /** permission名の全セット（高速ルックアップ用） */
    const managedPermissionNames = new Set(MANAGED_SCREENS.map((s) => s.permissionName));
    const counts = {};
    roles.forEach((role) => {
      /** 管理対象項目のうち、このロールがアクセスできるものをカウント */
      const screens = role.permissions?.screens || [];
      counts[role.id] = screens.filter((s) => managedPermissionNames.has(s)).length;
    });
    return counts;
  }, [roles]);

  /**
   * 各項目にアクセス可能なロール数マップ
   * @type {Object<number, number>} itemNumber → ロール数
   */
  const screenRoleCounts = useMemo(() => {
    const counts = {};
    MANAGED_SCREENS.forEach((screen) => {
      counts[screen.itemNumber] = roles.filter((role) => {
        const screens = role.permissions?.screens || [];
        return screens.includes(screen.permissionName);
      }).length;
    });
    return counts;
  }, [roles]);

  /**
   * 選択中ロールの現在のscreens配列（編集反映済み）
   * @type {Array<string>}
   */
  const currentRoleScreens = useMemo(() => {
    if (!selectedRoleId) {
      return [];
    }
    /** 編集中のデータがあればそちらを返す */
    if (editedRoleScreens[selectedRoleId]) {
      return editedRoleScreens[selectedRoleId];
    }
    /** なければDB原本のデータ */
    const role = roles.find((r) => r.id === selectedRoleId);
    return role?.permissions?.screens || [];
  }, [selectedRoleId, roles, editedRoleScreens]);

  /**
   * 選択中項目にアクセス可能なロールIDセット（編集反映済み）
   * @type {Set<string>}
   */
  const currentScreenRoleIds = useMemo(() => {
    if (selectedScreenIndex === null) {
      return new Set();
    }
    /** 編集中データがあればそちらを返す */
    if (editedScreenRoles[selectedScreenIndex]) {
      return editedScreenRoles[selectedScreenIndex];
    }
    /** なければDB原本から算出 */
    const screen = MANAGED_SCREENS[selectedScreenIndex];
    if (!screen) {
      return new Set();
    }
    const roleIds = new Set();
    roles.forEach((role) => {
      const screens = role.permissions?.screens || [];
      if (screens.includes(screen.permissionName)) {
        roleIds.add(role.id);
      }
    });
    return roleIds;
  }, [selectedScreenIndex, roles, editedScreenRoles]);

  /**
   * ロール別タブで未保存の変更があるか
   * @type {boolean}
   */
  const hasRoleChanges = useMemo(() => {
    return Object.keys(editedRoleScreens).length > 0;
  }, [editedRoleScreens]);

  /**
   * 項目別タブで未保存の変更があるか
   * @type {boolean}
   */
  const hasScreenChanges = useMemo(() => {
    return Object.keys(editedScreenRoles).length > 0;
  }, [editedScreenRoles]);

  // ==================== ロール別タブ操作 ====================

  /**
   * ロール別タブ: ロールを選択する
   * 未保存変更がある場合はtrueを返して呼び出し元で警告表示
   * @param {string} roleId - 選択するロールのID
   * @returns {boolean} 未保存変更の警告が必要な場合 true
   */
  const selectRole = useCallback(
    (roleId) => {
      setSelectedRoleId(roleId);
    },
    []
  );

  /**
   * ロール別タブ: 項目のチェック状態を切り替え
   * @param {string} permissionName - 切り替える項目のpermission名
   */
  const toggleRoleScreen = useCallback(
    (permissionName) => {
      if (!selectedRoleId) {
        return;
      }

      /** 保護対象チェック */
      const selectedRole = roles.find((r) => r.id === selectedRoleId);
      if (selectedRole && isProtectedPermission(selectedRole.name, permissionName)) {
        return;
      }

      /** 現在のscreens配列を取得（編集中 or DB原本） */
      const currentScreens =
        editedRoleScreens[selectedRoleId] ||
        [...(roles.find((r) => r.id === selectedRoleId)?.permissions?.screens || [])];

      /** トグル処理 */
      let newScreens;
      if (currentScreens.includes(permissionName)) {
        newScreens = currentScreens.filter((s) => s !== permissionName);
      } else {
        newScreens = [...currentScreens, permissionName];
      }

      /** DB原本と同一なら編集状態を削除、異なれば保持 */
      const originalScreens = roles.find((r) => r.id === selectedRoleId)?.permissions?.screens || [];
      const isSameAsOriginal =
        newScreens.length === originalScreens.length &&
        newScreens.every((s) => originalScreens.includes(s));

      if (isSameAsOriginal) {
        setEditedRoleScreens((prev) => {
          const next = { ...prev };
          delete next[selectedRoleId];
          return next;
        });
      } else {
        setEditedRoleScreens((prev) => ({
          ...prev,
          [selectedRoleId]: newScreens,
        }));
      }
    },
    [selectedRoleId, roles, editedRoleScreens]
  );

  /**
   * ロール別タブ: 変更を保存する
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  const saveRoleScreens = useCallback(async () => {
    if (!selectedRoleId || !editedRoleScreens[selectedRoleId]) {
      return { success: false, error: '保存する変更がありません' };
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { data, error } = await updateRoleScreens(
      selectedRoleId,
      editedRoleScreens[selectedRoleId]
    );

    if (error) {
      setErrorMessage('権限の更新に失敗しました');
      setIsSaving(false);
      return { success: false, error: '権限の更新に失敗しました' };
    }

    /** ロール一覧を更新（DB原本を差し替え） */
    setRoles((prev) =>
      prev.map((role) => (role.id === selectedRoleId ? data : role))
    );
    /** 編集状態をクリア */
    setEditedRoleScreens((prev) => {
      const next = { ...prev };
      delete next[selectedRoleId];
      return next;
    });
    setIsSaving(false);

    return { success: true, error: null };
  }, [selectedRoleId, editedRoleScreens]);

  /**
   * ロール別タブ: 変更をリセットする
   */
  const resetRoleScreens = useCallback(() => {
    if (!selectedRoleId) {
      return;
    }
    setEditedRoleScreens((prev) => {
      const next = { ...prev };
      delete next[selectedRoleId];
      return next;
    });
  }, [selectedRoleId]);

  // ==================== 項目別タブ操作 ====================

  /**
   * 項目別タブ: 項目を選択する
   * @param {number} screenIndex - 選択する項目のインデックス（MANAGED_SCREENS配列のインデックス）
   */
  const selectScreen = useCallback(
    (screenIndex) => {
      setSelectedScreenIndex(screenIndex);
    },
    []
  );

  /**
   * 項目別タブ: ロールのチェック状態を切り替え
   * @param {string} roleId - 切り替えるロールのID
   */
  const toggleScreenRole = useCallback(
    (roleId) => {
      if (selectedScreenIndex === null) {
        return;
      }

      const screen = MANAGED_SCREENS[selectedScreenIndex];
      if (!screen) {
        return;
      }

      /** 保護対象チェック */
      const role = roles.find((r) => r.id === roleId);
      if (role && isProtectedPermission(role.name, screen.permissionName)) {
        return;
      }

      /** 現在のロールIDセットを取得 */
      let currentRoleIds;
      if (editedScreenRoles[selectedScreenIndex]) {
        currentRoleIds = new Set(editedScreenRoles[selectedScreenIndex]);
      } else {
        /** DB原本から算出 */
        currentRoleIds = new Set();
        roles.forEach((r) => {
          const screens = r.permissions?.screens || [];
          if (screens.includes(screen.permissionName)) {
            currentRoleIds.add(r.id);
          }
        });
      }

      /** トグル処理 */
      if (currentRoleIds.has(roleId)) {
        currentRoleIds.delete(roleId);
      } else {
        currentRoleIds.add(roleId);
      }

      /** DB原本と同一なら編集状態を削除 */
      const originalRoleIds = new Set();
      roles.forEach((r) => {
        const screens = r.permissions?.screens || [];
        if (screens.includes(screen.permissionName)) {
          originalRoleIds.add(r.id);
        }
      });

      const isSameAsOriginal =
        currentRoleIds.size === originalRoleIds.size &&
        [...currentRoleIds].every((id) => originalRoleIds.has(id));

      if (isSameAsOriginal) {
        setEditedScreenRoles((prev) => {
          const next = { ...prev };
          delete next[selectedScreenIndex];
          return next;
        });
      } else {
        setEditedScreenRoles((prev) => ({
          ...prev,
          [selectedScreenIndex]: currentRoleIds,
        }));
      }
    },
    [selectedScreenIndex, roles, editedScreenRoles]
  );

  /**
   * 項目別タブ: 全ロールのチェックをONにする
   */
  const selectAllRolesForScreen = useCallback(() => {
    if (selectedScreenIndex === null) {
      return;
    }

    const screen = MANAGED_SCREENS[selectedScreenIndex];
    if (!screen) {
      return;
    }

    /** 全ロールIDをセット */
    const allRoleIds = new Set(roles.map((r) => r.id));

    /** DB原本と同一なら編集状態を削除 */
    const originalRoleIds = new Set();
    roles.forEach((r) => {
      const screens = r.permissions?.screens || [];
      if (screens.includes(screen.permissionName)) {
        originalRoleIds.add(r.id);
      }
    });

    const isSameAsOriginal =
      allRoleIds.size === originalRoleIds.size &&
      [...allRoleIds].every((id) => originalRoleIds.has(id));

    if (isSameAsOriginal) {
      setEditedScreenRoles((prev) => {
        const next = { ...prev };
        delete next[selectedScreenIndex];
        return next;
      });
    } else {
      setEditedScreenRoles((prev) => ({
        ...prev,
        [selectedScreenIndex]: allRoleIds,
      }));
    }
  }, [selectedScreenIndex, roles]);

  /**
   * 項目別タブ: 全ロールのチェックをOFFにする（保護対象は除外）
   */
  const deselectAllRolesForScreen = useCallback(() => {
    if (selectedScreenIndex === null) {
      return;
    }

    const screen = MANAGED_SCREENS[selectedScreenIndex];
    if (!screen) {
      return;
    }

    /** 保護対象のロールIDだけ残す */
    const protectedRoleIds = new Set();
    roles.forEach((r) => {
      if (isProtectedPermission(r.name, screen.permissionName)) {
        protectedRoleIds.add(r.id);
      }
    });

    /** DB原本と同一なら編集状態を削除 */
    const originalRoleIds = new Set();
    roles.forEach((r) => {
      const screens = r.permissions?.screens || [];
      if (screens.includes(screen.permissionName)) {
        originalRoleIds.add(r.id);
      }
    });

    const isSameAsOriginal =
      protectedRoleIds.size === originalRoleIds.size &&
      [...protectedRoleIds].every((id) => originalRoleIds.has(id));

    if (isSameAsOriginal) {
      setEditedScreenRoles((prev) => {
        const next = { ...prev };
        delete next[selectedScreenIndex];
        return next;
      });
    } else {
      setEditedScreenRoles((prev) => ({
        ...prev,
        [selectedScreenIndex]: protectedRoleIds,
      }));
    }
  }, [selectedScreenIndex, roles]);

  /**
   * 項目別タブ: 変更を保存する
   * 変更のあったロールのpermissions.screensをそれぞれ更新
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  const saveScreenRoles = useCallback(async () => {
    if (selectedScreenIndex === null || !editedScreenRoles[selectedScreenIndex]) {
      return { success: false, error: '保存する変更がありません' };
    }

    setIsSaving(true);
    setErrorMessage(null);

    const screen = MANAGED_SCREENS[selectedScreenIndex];
    const newRoleIds = editedScreenRoles[selectedScreenIndex];

    /** 変更が必要なロールの更新データを組み立てる */
    const updates = [];
    roles.forEach((role) => {
      const currentScreens = role.permissions?.screens || [];
      const hasPermission = currentScreens.includes(screen.permissionName);
      const shouldHavePermission = newRoleIds.has(role.id);

      if (hasPermission !== shouldHavePermission) {
        let newScreens;
        if (shouldHavePermission) {
          /** 権限を追加 */
          newScreens = [...currentScreens, screen.permissionName];
        } else {
          /** 権限を削除 */
          newScreens = currentScreens.filter((s) => s !== screen.permissionName);
        }
        updates.push({ roleId: role.id, newScreens });
      }
    });

    if (updates.length === 0) {
      setIsSaving(false);
      return { success: true, error: null };
    }

    const { results, hasError } = await updateMultipleRoleScreens(updates);

    if (hasError) {
      /** 失敗したロール名を取得 */
      const failedRoleNames = results
        .filter((r) => !r.success)
        .map((r) => {
          const role = roles.find((rl) => rl.id === r.roleId);
          return role?.display_name || role?.name || r.roleId;
        });
      setErrorMessage(`以下のロールの更新に失敗しました: ${failedRoleNames.join(', ')}`);
    }

    /** 成功した分のロールデータをローカルに反映 */
    setRoles((prev) =>
      prev.map((role) => {
        const result = results.find((r) => r.roleId === role.id && r.success);
        return result ? result.data : role;
      })
    );

    /** 編集状態をクリア */
    setEditedScreenRoles((prev) => {
      const next = { ...prev };
      delete next[selectedScreenIndex];
      return next;
    });
    setIsSaving(false);

    return { success: !hasError, error: hasError ? '一部の更新に失敗しました' : null };
  }, [selectedScreenIndex, roles, editedScreenRoles]);

  /**
   * 項目別タブ: 変更をリセットする
   */
  const resetScreenRoles = useCallback(() => {
    if (selectedScreenIndex === null) {
      return;
    }
    setEditedScreenRoles((prev) => {
      const next = { ...prev };
      delete next[selectedScreenIndex];
      return next;
    });
  }, [selectedScreenIndex]);

  // ==================== 共通操作 ====================

  /**
   * 指定のロール名 + permission名の組み合わせが保護対象か（外部公開用）
   * @param {string} roleName - ロール名
   * @param {string} permissionName - 項目のpermission名
   * @returns {boolean} 保護対象の場合 true
   */
  const checkIsProtected = useCallback((roleName, permissionName) => {
    return isProtectedPermission(roleName, permissionName);
  }, []);

  // ==================== ロール作成・削除 ====================

  /**
   * 新規ロールを作成する
   * @param {string} name - ロール名（内部識別名）
   * @param {string} displayName - 表示名
   * @param {Array<string>} initialScreens - 初期アクセス権限
   * @param {string|null} description - ロール説明（任意）
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  const createRole = useCallback(async (name, displayName, initialScreens, description = null) => {
    setIsSaving(true);
    setErrorMessage(null);

    const { data, error } = await insertRole(name, displayName, initialScreens, description);

    if (error) {
      const message = error.code === '23505'
        ? '同じ名前のロールが既に存在します'
        : 'ロールの作成に失敗しました';
      setErrorMessage(message);
      setIsSaving(false);
      return { success: false, error: message };
    }

    /** ロール一覧に追加 */
    setRoles((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setIsSaving(false);

    return { success: true, error: null };
  }, []);

  /**
   * ロールを削除する（確認用のユーザー数取得 → 削除実行）
   * @param {string} roleId - 削除対象ロールのID
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  const removeRole = useCallback(async (roleId) => {
    /** 保護対象ロールの削除を拒否 */
    const role = roles.find((r) => r.id === roleId);
    if (!role) {
      return { success: false, error: 'ロールが見つかりません' };
    }
    const isProtectedRole = PROTECTED_PERMISSIONS.some((p) => p.roleName === role.name);
    if (isProtectedRole) {
      return { success: false, error: `「${role.display_name || role.name}」は保護対象のため削除できません` };
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { success, error } = await deleteRole(roleId);

    if (!success) {
      setErrorMessage('ロールの削除に失敗しました');
      setIsSaving(false);
      return { success: false, error: 'ロールの削除に失敗しました' };
    }

    /** ローカルの一覧から削除 */
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    /** 選択中のロールが削除された場合はクリア */
    if (selectedRoleId === roleId) {
      setSelectedRoleId(null);
    }
    setIsSaving(false);

    return { success: true, error: null };
  }, [roles, selectedRoleId]);

  /**
   * 指定ロールを所持しているユーザー数を取得する
   * @param {string} roleId - 対象ロールのID
   * @returns {Promise<{count: number, error: string|null}>}
   */
  const getRoleUserCount = useCallback(async (roleId) => {
    const { count, error } = await selectRoleUserCount(roleId);
    if (error) {
      return { count: 0, error: 'ユーザー数の取得に失敗しました' };
    }
    return { count, error: null };
  }, []);

  return {
    /** 状態 */
    roles,
    filteredRoles,
    filteredScreens,
    isLoading,
    isSaving,
    errorMessage,
    activeTab,
    selectedRoleId,
    selectedScreenIndex,
    roleSearchText,
    screenSearchText,
    roleScreenCounts,
    screenRoleCounts,
    currentRoleScreens,
    currentScreenRoleIds,
    hasRoleChanges,
    hasScreenChanges,

    /** 操作 */
    setActiveTab,
    setRoleSearchText,
    setScreenSearchText,
    selectRole,
    toggleRoleScreen,
    saveRoleScreens,
    resetRoleScreens,
    selectScreen,
    toggleScreenRole,
    selectAllRolesForScreen,
    deselectAllRolesForScreen,
    saveScreenRoles,
    resetScreenRoles,
    fetchRoles,
    checkIsProtected,
    createRole,
    removeRole,
    getRoleUserCount,
  };
};

export default usePermissionManage;
