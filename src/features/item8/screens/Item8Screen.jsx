/**
 * 臨時ヘルプ機能のメイン画面。
 * 管理者/一般ユーザーの表示切り替えと、管理者向けフッタータブ制御を行う。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, Button, ActivityIndicator, Pressable, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { Ionicons } from '../../../shared/components/icons';
import { useRinjiHelp } from '../hooks/useRinjiHelp.js';
import RecruitForm from '../components/RecruitForm.jsx';
import RecruitList from '../components/RecruitList.jsx';

const MANAGER_TABS = {
  CREATE: 'create',
  LIST: 'list',
  HISTORY: 'history',
};
const USER_TABS = {
  LIST: 'user_list',
  APPLIED: 'user_applied',
};

const MANAGER_TAB_OPTIONS = [
  { key: MANAGER_TABS.CREATE, label: '募集作成' },
  { key: MANAGER_TABS.LIST, label: '募集一覧' },
  { key: MANAGER_TABS.HISTORY, label: '募集履歴' },
];
const USER_TAB_OPTIONS = [
  { key: USER_TABS.LIST, label: '募集一覧' },
  { key: USER_TABS.APPLIED, label: '応募済み' },
];
const SUCCESS_MESSAGE_DURATION_MS = 4000;
const SUCCESS_TOAST_BACKGROUND = '#63E57B';
const SUCCESS_TOAST_TEXT = '#FFFFFF';
const ERROR_TOAST_BACKGROUND = '#D93B3B';
const ERROR_TOAST_TEXT = '#FFFFFF';
const TOGGLE_ACTIVE_COLOR = '#2563EB';
const DEFAULT_DELETE_CONFIRM_MESSAGE = 'この募集を削除します。削除後は一覧に表示されなくなります。よろしいですか？';
const APPLICANTS_DELETE_CONFIRM_MESSAGE =
  'この募集を削除します。削除後は一覧に表示されなくなり、応募者情報も削除されます。よろしいですか？';
const DEPARTMENT_FILTER_ALL = '__all__';
const SORT_CREATED_DESC = 'created_desc';
const SORT_CREATED_ASC = 'created_asc';
const SORT_HEADCOUNT_DESC = 'headcount_desc';
const SORT_HEADCOUNT_ASC = 'headcount_asc';

/**
 * 生エラーメッセージをユーザー表示向けに正規化する。
 *
 * @param {any} raw
 * @returns {string}
 */
const toDisplayErrorMessage = (raw) => {
  const text = `${raw || ''}`;
  if (/failed to fetch|network request failed|networkerror|timeout|offline|unreachable/i.test(text)) {
    return '通信エラーが発生しました。接続を確認して再度お試しください。';
  }
  return text || '処理中にエラーが発生しました。';
};

/**
 * 現在表示中のエラーメッセージが通信系エラーかを判定する。
 *
 * @param {any} raw
 * @returns {boolean}
 */
const isNetworkErrorMessage = (raw) => {
  const text = toDisplayErrorMessage(raw);
  return text === '通信エラーが発生しました。接続を確認して再度お試しください。';
};

/**
 * 16進カラーにアルファ値を付与する。
 *
 * @param {string} hexColor
 * @param {string} alpha
 * @returns {string}
 */
const withAlpha = (hexColor, alpha) => {
  if (typeof hexColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return `${hexColor}${alpha}`;
  }
  return hexColor;
};

/**
 * カラーを少し暗くする。
 *
 * @param {string} hexColor
 * @param {number} ratio
 * @returns {string}
 */
const darkenHex = (hexColor, ratio = 0.04) => {
  if (typeof hexColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return hexColor;
  }
  const value = hexColor.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const lower = (v) => Math.max(0, Math.round(v * (1 - ratio)));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(lower(r))}${toHex(lower(g))}${toHex(lower(b))}`;
};

/**
 * item8 画面内で発生する描画エラーを閉じ込めるローカル境界。
 */
class LocalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Item8 local error boundary:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const { theme, onReload } = this.props;
      return (
        <View
          style={[
            styles.localErrorBox,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderRadius: theme.borderRadius,
            },
          ]}
        >
          <Text style={[styles.localErrorTitle, { color: theme.error }]}>項目8 内部エラー</Text>
          <Text style={[styles.localErrorMessage, { color: theme.text }]}>
            {toDisplayErrorMessage(this.state.error?.message)}
          </Text>
          <Button title="再読み込み" onPress={onReload} color={theme.primary} />
        </View>
      );
    }
    return this.props.children;
  }
}

const SCREEN_NAME = '臨時ヘルプ';

/**
 * item8 画面コンポーネント。
 *
 * @param {{navigation: any}} props
 * @returns {JSX.Element}
 */
const Item8Screen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const {
    manager,
    loading,
    authLoading,
    error,
    recruits,
    historyRecruits,
    appliedRecruits,
    applications,
    retrySuccessEvent,
    clearRetrySuccessEvent,
    currentUserId,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleClose,
    handleReopen,
    handleApply,
    handleCancelApply,
    loadApplications,
    refresh,
  } = useRinjiHelp();

  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(MANAGER_TABS.CREATE);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [openApplicantsByRecruitId, setOpenApplicantsByRecruitId] = useState({});
  const [loadingApplicantsByRecruitId, setLoadingApplicantsByRecruitId] = useState({});
  const [createFormResetToken, setCreateFormResetToken] = useState(0);
  const [pendingCreateDraftClear, setPendingCreateDraftClear] = useState(false);
  const [deleteConfirmRecruitId, setDeleteConfirmRecruitId] = useState(null);
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState(DEFAULT_DELETE_CONFIRM_MESSAGE);
  const [deletingRecruit, setDeletingRecruit] = useState(false);
  const [showOnlyMyRecruits, setShowOnlyMyRecruits] = useState(false);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState(DEPARTMENT_FILTER_ALL);
  const [selectedSortKey, setSelectedSortKey] = useState(SORT_CREATED_DESC);
  const scrollViewRef = useRef(null);
  const toastTimerRef = useRef(null);

  const departmentFilterOptions = useMemo(() => {
    const organizations = [...new Set((recruits || []).map((item) => `${item?.head_organization || ''}`.trim()))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ja'));
    return [
      { label: 'すべての部署', value: DEPARTMENT_FILTER_ALL },
      ...organizations.map((organization) => ({ label: organization, value: organization })),
    ];
  }, [recruits]);

  const sortOptions = useMemo(
    () => [
      { label: '新しい順', value: SORT_CREATED_DESC },
      { label: '古い順', value: SORT_CREATED_ASC },
      { label: '募集人数の多い順', value: SORT_HEADCOUNT_DESC },
      { label: '募集人数の少ない順', value: SORT_HEADCOUNT_ASC },
    ],
    []
  );

  const filteredAndSortedRecruits = useMemo(() => {
    if (selectedDepartmentFilter === DEPARTMENT_FILTER_ALL) return recruits;
    const filtered = (recruits || []).filter(
      (item) => `${item?.head_organization || ''}`.trim() === selectedDepartmentFilter
    );
    return filtered;
  }, [recruits, selectedDepartmentFilter]);

  const sortedFilteredRecruits = useMemo(() => {
    const toTimestamp = (value) => {
      const timestamp = new Date(value || 0).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    const toHeadcount = (value) => {
      const headcount = Number(value);
      return Number.isFinite(headcount) ? headcount : 0;
    };

    const list = [...(filteredAndSortedRecruits || [])];
    list.sort((a, b) => {
      if (selectedSortKey === SORT_CREATED_ASC) {
        return toTimestamp(a?.created_at) - toTimestamp(b?.created_at);
      }
      if (selectedSortKey === SORT_HEADCOUNT_DESC) {
        return toHeadcount(b?.headcount) - toHeadcount(a?.headcount);
      }
      if (selectedSortKey === SORT_HEADCOUNT_ASC) {
        return toHeadcount(a?.headcount) - toHeadcount(b?.headcount);
      }
      return toTimestamp(b?.created_at) - toTimestamp(a?.created_at);
    });
    return list;
  }, [filteredAndSortedRecruits, selectedSortKey]);

  const managerFilteredRecruits = useMemo(() => {
    if (!manager || !showOnlyMyRecruits || !currentUserId) {
      return recruits;
    }
    return (recruits || []).filter((recruit) => recruit?.head_user_id === currentUserId);
  }, [currentUserId, manager, recruits, showOnlyMyRecruits]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setActiveTab(manager ? MANAGER_TABS.CREATE : USER_TABS.LIST);
    setOpenApplicantsByRecruitId({});
    setLoadingApplicantsByRecruitId({});
  }, [manager]);

  useEffect(() => {
    if (selectedDepartmentFilter === DEPARTMENT_FILTER_ALL) return;
    const exists = departmentFilterOptions.some((option) => option.value === selectedDepartmentFilter);
    if (!exists) {
      setSelectedDepartmentFilter(DEPARTMENT_FILTER_ALL);
    }
  }, [departmentFilterOptions, selectedDepartmentFilter]);

  /**
   * 募集編集開始時に作成タブへ遷移し、先頭へスクロールする。
   *
   * @param {Record<string, any>} recruit
   */
  const handleStartEdit = (recruit) => {
    setEditing(recruit);
    setActiveTab(MANAGER_TABS.CREATE);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo?.({ y: 0, animated: true });
    }, 0);
  };

  /**
   * 新規作成/更新送信を実行し、成功時は一覧タブへ戻す。
   *
   * @param {Record<string, any>} payload
   * @returns {Promise<void>}
   */
  const onSubmit = async (payload) => {
    const isEditing = Boolean(editing);
    try {
      setSubmitting(true);
      const ok = isEditing ? await handleUpdate(editing.id, payload) : await handleCreate(payload);
      setSubmitting(false);
      if (ok) {
        setEditing(null);
        setActiveTab(MANAGER_TABS.LIST);
        showSuccessToast(isEditing ? '募集を更新しました' : '募集を作成しました');
      } else {
        showErrorToast(
          isEditing
            ? '募集の更新に失敗しました。入力内容を確認して再度お試しください。'
            : '募集の作成に失敗しました。入力内容を確認して再度お試しください。'
        );
      }
    } catch (unexpectedError) {
      setSubmitting(false);
      showErrorToast(toDisplayErrorMessage(unexpectedError?.message || unexpectedError));
    }
  };

  /**
   * トーストメッセージを表示する。
   *
   * @param {string} message
   * @param {'success' | 'error'} type
   */
  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast({ message: '', type: 'success' });
      toastTimerRef.current = null;
    }, SUCCESS_MESSAGE_DURATION_MS);
  };

  /**
   * 成功メッセージをトースト表示する。
   *
   * @param {string} message
   */
  const showSuccessToast = (message) => showToast(message, 'success');

  /**
   * 失敗メッセージをトースト表示する。
   *
   * @param {string} message
   */
  const showErrorToast = (message) => showToast(message, 'error');

  useEffect(() => {
    if (!retrySuccessEvent?.message) return;
    showSuccessToast(retrySuccessEvent.message);
    if (retrySuccessEvent.type === 'create' && !editing) {
      setCreateFormResetToken((prev) => prev + 1);
      setPendingCreateDraftClear(false);
    }
    clearRetrySuccessEvent();
  }, [clearRetrySuccessEvent, editing, retrySuccessEvent]);

  useEffect(() => {
    if (!pendingCreateDraftClear) return;
    if (!error) {
      setCreateFormResetToken((prev) => prev + 1);
      setPendingCreateDraftClear(false);
      return;
    }
    if (!isNetworkErrorMessage(error)) {
      setPendingCreateDraftClear(false);
    }
  }, [error, pendingCreateDraftClear]);

  /**
   * 募集を終了し、成功時はトーストを表示する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onCloseRecruit = async (recruitId) => {
    const ok = await handleClose(recruitId);
    if (ok) {
      showSuccessToast('募集を終了しました');
    } else {
      showErrorToast('募集の終了に失敗しました。通信状況を確認して再度お試しください。');
    }
  };

  /**
   * 削除確認モーダルを開く。
   *
   * @param {string | Record<string, any>} recruitOrId
   * @returns {void}
   */
  const onDeleteRecruit = (recruitOrId) => {
    const recruitId = typeof recruitOrId === 'string' ? recruitOrId : recruitOrId?.id;
    if (!recruitId) return;

    const rawApplicantCount =
      typeof recruitOrId === 'object' && recruitOrId !== null ? recruitOrId.applicant_count : null;
    const numericApplicantCount = Number(rawApplicantCount);
    const hasApplicantsByCount = Number.isFinite(numericApplicantCount) && numericApplicantCount > 0;
    const hasApplicantsByLoadedList = (applications[recruitId]?.length || 0) > 0;
    setDeleteConfirmMessage(
      hasApplicantsByCount || hasApplicantsByLoadedList
        ? APPLICANTS_DELETE_CONFIRM_MESSAGE
        : DEFAULT_DELETE_CONFIRM_MESSAGE
    );
    setDeleteConfirmRecruitId(recruitId);
  };

  /**
   * 削除確認モーダルを閉じる。
   */
  const onCancelDeleteRecruit = () => {
    if (deletingRecruit) return;
    setDeleteConfirmRecruitId(null);
    setDeleteConfirmMessage(DEFAULT_DELETE_CONFIRM_MESSAGE);
  };

  /**
   * 削除確認モーダルで確定した削除処理を実行する。
   */
  const onConfirmDeleteRecruit = async () => {
    if (!deleteConfirmRecruitId || deletingRecruit) return;
    setDeletingRecruit(true);
    const ok = await handleDelete(deleteConfirmRecruitId);
    setDeletingRecruit(false);
    setDeleteConfirmRecruitId(null);
    setDeleteConfirmMessage(DEFAULT_DELETE_CONFIRM_MESSAGE);
    if (ok) {
      showSuccessToast('募集を削除しました');
    } else {
      showErrorToast('募集の削除に失敗しました。作成者権限と通信状況を確認してください。');
    }
  };

  /**
   * 募集人数到達で自動クローズ中の案件を、本クローズ（手動終了）へ確定する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onFinalizeAutoClosedRecruit = async (recruitId) => {
    const ok = await handleClose(recruitId);
    if (ok) {
      showSuccessToast('募集を終了しました');
    } else {
      showErrorToast('募集の終了に失敗しました。通信状況を確認して再度お試しください。');
    }
  };

  /**
   * 募集を再開し、成功時はトーストを表示する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onReopenRecruit = async (recruitId) => {
    const result = await handleReopen(recruitId);
    if (result.ok) {
      showSuccessToast('募集を再開しました');
    } else {
      showErrorToast(result.message || '募集の再開に失敗しました。通信状況を確認して再度お試しください。');
    }
  };

  /**
   * 一般ユーザーの応募を実行し、結果をトースト表示する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onApplyRecruit = async (recruitId) => {
    try {
      const ok = await handleApply(recruitId);
      if (ok) {
        showSuccessToast('応募しました');
      } else {
        showErrorToast('応募に失敗しました。すでに応募済みの場合は応募済みタブをご確認ください。');
      }
    } catch (unexpectedError) {
      showErrorToast(toDisplayErrorMessage(unexpectedError?.message || unexpectedError));
    }
  };

  /**
   * 一般ユーザーの応募を取り消し、成功時はトーストを表示する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onCancelApplyRecruit = async (recruitId) => {
    const ok = await handleCancelApply(recruitId);
    if (ok) {
      showSuccessToast('応募を取り消しました');
    } else {
      showErrorToast('応募の取り消しに失敗しました。通信状況を確認して再度お試しください。');
    }
  };

  /**
   * 一覧を再読み込みし、応募者一覧の開閉状態も初期化する。
   *
   * @returns {Promise<void>}
   */
  const handleRefresh = async () => {
    const shouldClearCreateDraftAfterRefresh = isNetworkErrorMessage(error) && !editing;
    if (shouldClearCreateDraftAfterRefresh) {
      setPendingCreateDraftClear(true);
    }
    await refresh();
    setOpenApplicantsByRecruitId({});
    setLoadingApplicantsByRecruitId({});
  };

  /**
   * 管理者向けに募集単位の応募者一覧を開閉する。
   * 初回オープン時のみ応募者データを取得する。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const onToggleApplicants = async (recruitId) => {
    const isOpen = Boolean(openApplicantsByRecruitId[recruitId]);
    if (isOpen) {
      setOpenApplicantsByRecruitId((prev) => ({ ...prev, [recruitId]: false }));
      return;
    }

    setOpenApplicantsByRecruitId((prev) => ({ ...prev, [recruitId]: true }));
    if (applications[recruitId]) {
      return;
    }

    setLoadingApplicantsByRecruitId((prev) => ({ ...prev, [recruitId]: true }));
    await loadApplications(recruitId);
    setLoadingApplicantsByRecruitId((prev) => ({ ...prev, [recruitId]: false }));
  };

  /**
   * エラーメッセージ表示要素を返す。
   *
   * @returns {JSX.Element | null}
   */
  const renderError = () =>
    error ? <Text style={[styles.error, { color: theme.error }]}>{toDisplayErrorMessage(error)}</Text> : null;
  const listAndHistorySectionBackground = darkenHex(theme.surface, 0.04);

  /**
   * 募集作成/編集セクションを描画する。
   *
   * @returns {JSX.Element}
   */
  const renderCreateSection = () => (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderRadius: theme.borderRadius,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>
        {editing ? '募集を編集' : '募集を作成'}
      </Text>
      <RecruitForm
        initialValues={editing || {}}
        resetDraftToken={createFormResetToken}
        submitLabel={editing ? '更新する' : '募集を作成'}
        onSubmit={onSubmit}
        disabled={submitting}
      />
      {editing && <Button title="編集をやめる" onPress={() => setEditing(null)} color={theme.textSecondary} />}
    </View>
  );

  /**
   * 募集一覧セクションを描画する。
   *
   * @returns {JSX.Element}
   */
  const renderListSection = () => (
    <View
      style={[
        styles.section,
        {
          backgroundColor: listAndHistorySectionBackground,
          borderColor: theme.border,
          borderRadius: theme.borderRadius,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>募集一覧</Text>
        <View style={styles.sectionHeaderActions}>
          {!manager ? (
            <View
              style={[
                styles.departmentFilterContainer,
                {
                  borderColor: theme.border,
                  borderRadius: theme.borderRadius,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <View style={styles.dropdownWithIcon}>
                <Ionicons name="funnel-outline" size={16} color={theme.textSecondary} />
                <View style={styles.dropdownInputArea}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={selectedDepartmentFilter}
                      onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                      style={{
                        ...styles.departmentFilterSelectWeb,
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      }}
                    >
                      {departmentFilterOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          style={{
                            color: theme.text,
                            backgroundColor: theme.background,
                          }}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (() => {
                      const { Picker } = require('@react-native-picker/picker');
                      return (
                        <Picker
                          selectedValue={selectedDepartmentFilter}
                          onValueChange={setSelectedDepartmentFilter}
                          style={[
                            styles.departmentFilterSelectNative,
                            {
                              color: theme.text,
                              backgroundColor: theme.background,
                            },
                          ]}
                          itemStyle={{ color: theme.text }}
                          dropdownIconColor={theme.text}
                        >
                          {departmentFilterOptions.map((option) => (
                            <Picker.Item key={option.value} label={option.label} value={option.value} />
                          ))}
                        </Picker>
                      );
                    })()
                  )}
                </View>
              </View>
            </View>
          ) : null}
          {!manager ? (
            <View
              style={[
                styles.departmentFilterContainer,
                {
                  borderColor: theme.border,
                  borderRadius: theme.borderRadius,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <View style={styles.dropdownWithIcon}>
                <Ionicons name="swap-vertical-outline" size={16} color={theme.textSecondary} />
                <View style={styles.dropdownInputArea}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={selectedSortKey}
                      onChange={(e) => setSelectedSortKey(e.target.value)}
                      style={{
                        ...styles.departmentFilterSelectWeb,
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      }}
                    >
                      {sortOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          style={{
                            color: theme.text,
                            backgroundColor: theme.background,
                          }}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (() => {
                      const { Picker } = require('@react-native-picker/picker');
                      return (
                        <Picker
                          selectedValue={selectedSortKey}
                          onValueChange={setSelectedSortKey}
                          style={[
                            styles.departmentFilterSelectNative,
                            {
                              color: theme.text,
                              backgroundColor: theme.background,
                            },
                          ]}
                          itemStyle={{ color: theme.text }}
                          dropdownIconColor={theme.text}
                        >
                          {sortOptions.map((option) => (
                            <Picker.Item key={option.value} label={option.label} value={option.value} />
                          ))}
                        </Picker>
                      );
                    })()
                  )}
                </View>
              </View>
            </View>
          ) : null}
          {manager ? (
            <View style={styles.managerInlineToggleGroup}>
              <Text style={[styles.managerOnlyToggleLabel, { color: theme.textSecondary }]}>
                自分が作成した募集のみ表示
              </Text>
              <Pressable
                style={[
                  styles.customToggleTrack,
                  {
                    backgroundColor: showOnlyMyRecruits
                      ? withAlpha(TOGGLE_ACTIVE_COLOR, '55')
                      : withAlpha(theme.textSecondary, '55'),
                  },
                ]}
                onPress={() => setShowOnlyMyRecruits((prev) => !prev)}
              >
                <View
                  style={[
                    styles.customToggleThumb,
                    {
                      backgroundColor: showOnlyMyRecruits ? TOGGLE_ACTIVE_COLOR : theme.surface,
                      borderColor: showOnlyMyRecruits ? TOGGLE_ACTIVE_COLOR : withAlpha(theme.textSecondary, '88'),
                      transform: [{ translateX: showOnlyMyRecruits ? 18 : 0 }],
                    },
                  ]}
                />
              </Pressable>
            </View>
          ) : null}
          <Button title="再読み込み" onPress={handleRefresh} color={theme.primary} />
        </View>
      </View>
      <RecruitList
        data={manager ? managerFilteredRecruits : sortedFilteredRecruits}
        isManager={manager}
        onApply={onApplyRecruit}
        onEdit={manager ? handleStartEdit : undefined}
        onClose={manager ? onCloseRecruit : undefined}
        onDelete={manager ? onDeleteRecruit : undefined}
        onReopen={manager ? onReopenRecruit : undefined}
        onFinalizeAutoClose={manager ? onFinalizeAutoClosedRecruit : undefined}
        refreshing={loading}
        onRefresh={handleRefresh}
        appliedRecruitIds={appliedRecruits.map((recruit) => recruit.id)}
        onToggleApplicants={manager ? onToggleApplicants : undefined}
        applicationsByRecruitId={applications}
        openApplicantsByRecruitId={openApplicantsByRecruitId}
        loadingApplicantsByRecruitId={loadingApplicantsByRecruitId}
        showApplicantsToggle={manager}
        showAutoClosedBadge={manager}
        currentUserId={currentUserId}
      />
    </View>
  );

  /**
   * 募集履歴セクションを描画する。
   *
   * @returns {JSX.Element}
   */
  const renderHistorySection = () => (
    <View
      style={[
        styles.section,
        {
          backgroundColor: listAndHistorySectionBackground,
          borderColor: theme.border,
          borderRadius: theme.borderRadius,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>募集履歴</Text>
        <Button title="再読み込み" onPress={handleRefresh} color={theme.primary} />
      </View>
      <RecruitList
        data={historyRecruits}
        isManager
        onApply={handleApply}
        onEdit={handleStartEdit}
        onClose={onCloseRecruit}
        onDelete={onDeleteRecruit}
        onReopen={onReopenRecruit}
        onToggleApplicants={onToggleApplicants}
        refreshing={loading}
        onRefresh={handleRefresh}
        emptyText="履歴はありません"
        showStatus
        applicationsByRecruitId={applications}
        openApplicantsByRecruitId={openApplicantsByRecruitId}
        loadingApplicantsByRecruitId={loadingApplicantsByRecruitId}
        showApplicantsToggle
        showAutoClosedBadge
        currentUserId={currentUserId}
      />
    </View>
  );

  /**
   * 一般ユーザー向けの応募済みセクションを描画する。
   *
   * @returns {JSX.Element}
   */
  const renderAppliedSection = () => (
    <View
      style={[
        styles.section,
        {
          backgroundColor: listAndHistorySectionBackground,
          borderColor: theme.border,
          borderRadius: theme.borderRadius,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>応募済み</Text>
        <Button title="再読み込み" onPress={handleRefresh} color={theme.primary} />
      </View>
      <RecruitList
        data={appliedRecruits}
        refreshing={loading}
        onRefresh={handleRefresh}
        emptyText="応募済みの案件はありません。"
        showStatus
        showApplyButton={false}
        showCancelButton
        onCancelApply={onCancelApplyRecruit}
      />
    </View>
  );

  /**
   * 管理者向けタブ状態に応じて表示セクションを切り替える。
   *
   * @returns {JSX.Element}
   */
  const renderManagerTabContent = () => {
    if (activeTab === MANAGER_TABS.CREATE) return renderCreateSection();
    if (activeTab === MANAGER_TABS.HISTORY) return renderHistorySection();
    return renderListSection();
  };

  /**
   * 一般ユーザー向けタブ状態に応じて表示セクションを切り替える。
   *
   * @returns {JSX.Element}
   */
  const renderUserTabContent = () => {
    if (activeTab === USER_TABS.APPLIED) return renderAppliedSection();
    return renderListSection();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
      {(authLoading || loading) && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      )}
      {!authLoading && (
        <LocalErrorBoundary onReload={handleRefresh} theme={theme}>
          <View style={styles.body}>
            <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.content}>
              {renderError()}
              {manager ? renderManagerTabContent() : renderUserTabContent()}
            </ScrollView>

            {manager ? (
              <View
                style={[
                  styles.footer,
                  {
                    backgroundColor: theme.surface,
                    borderTopColor: theme.border,
                    paddingBottom: insets.bottom + 18,
                  },
                ]}
              >
                {MANAGER_TAB_OPTIONS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[
                        styles.footerTab,
                        {
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? theme.primary : theme.background,
                          borderRadius: theme.borderRadius,
                        },
                      ]}
                      onPress={() => setActiveTab(tab.key)}
                    >
                      <Text
                        style={[
                          styles.footerTabLabel,
                          {
                            color: active ? '#FFFFFF' : theme.textSecondary,
                            fontWeight: active ? '700' : theme.fontWeight,
                          },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View
                style={[
                  styles.footer,
                  {
                    backgroundColor: theme.surface,
                    borderTopColor: theme.border,
                    paddingBottom: insets.bottom + 18,
                  },
                ]}
              >
                {USER_TAB_OPTIONS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[
                        styles.footerTab,
                        {
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? theme.primary : theme.background,
                          borderRadius: theme.borderRadius,
                        },
                      ]}
                      onPress={() => setActiveTab(tab.key)}
                    >
                      <Text
                        style={[
                          styles.footerTabLabel,
                          {
                            color: active ? '#FFFFFF' : theme.textSecondary,
                            fontWeight: active ? '700' : theme.fontWeight,
                          },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {toast.message ? (
              <View
                pointerEvents="none"
                style={[
                  styles.toastContainer,
                  {
                    top: 8,
                  },
                ]}
              >
                <View
                  style={[
                    styles.toastBox,
                    {
                      backgroundColor: toast.type === 'error' ? ERROR_TOAST_BACKGROUND : SUCCESS_TOAST_BACKGROUND,
                      borderColor: toast.type === 'error' ? ERROR_TOAST_BACKGROUND : SUCCESS_TOAST_BACKGROUND,
                      borderRadius: theme.borderRadius,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toastText,
                      {
                        color: toast.type === 'error' ? ERROR_TOAST_TEXT : SUCCESS_TOAST_TEXT,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {toast.message}
                  </Text>
                </View>
              </View>
            ) : null}
            <Modal
              transparent
              visible={Boolean(deleteConfirmRecruitId)}
              animationType="fade"
              onRequestClose={onCancelDeleteRecruit}
            >
              <View style={styles.deleteConfirmOverlay}>
                <View
                  style={[
                    styles.deleteConfirmDialog,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      borderRadius: theme.borderRadius,
                    },
                  ]}
                >
                  <Text style={[styles.deleteConfirmTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>
                    募集を削除
                  </Text>
                  <Text style={[styles.deleteConfirmMessage, { color: theme.textSecondary }]}>
                    {deleteConfirmMessage}
                  </Text>
                  <View style={styles.deleteConfirmActions}>
                    <Pressable
                      style={[
                        styles.deleteConfirmButton,
                        styles.deleteConfirmCancelButton,
                        { borderColor: theme.border, borderRadius: theme.borderRadius },
                      ]}
                      onPress={onCancelDeleteRecruit}
                      disabled={deletingRecruit}
                    >
                      <Text style={[styles.deleteConfirmButtonText, { color: theme.textSecondary }]}>
                        キャンセル
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.deleteConfirmButton,
                        styles.deleteConfirmDestructiveButton,
                        { borderColor: theme.error, borderRadius: theme.borderRadius },
                      ]}
                      onPress={() => void onConfirmDeleteRecruit()}
                      disabled={deletingRecruit}
                    >
                      <Text style={[styles.deleteConfirmButtonText, { color: theme.error }]}>
                        {deletingRecruit ? '削除中...' : '削除する'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        </LocalErrorBoundary>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
  },
  section: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  departmentFilterContainer: {
    minWidth: 140,
    maxWidth: 220,
    width: 'auto',
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    gap: 2,
  },
  dropdownInputArea: {
    flex: 1,
    marginLeft: -2,
  },
  departmentFilterSelectWeb: {
    height: 34,
    borderWidth: 0,
    backgroundColor: 'transparent',
    width: '100%',
    paddingLeft: 2,
    paddingRight: 8,
    fontSize: 14,
  },
  departmentFilterSelectNative: {
    height: 34,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 16,
    flexShrink: 1,
  },
  managerInlineToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  managerOnlyToggleLabel: {
    fontSize: 14,
  },
  customToggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  customToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
  },
  error: {
    padding: 8,
  },
  loading: {
    padding: 24,
    alignItems: 'center',
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 10,
  },
  footerTab: {
    flex: 1,
    borderWidth: 1,
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTabLabel: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5000,
  },
  toastBox: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 19,
    minWidth: 264,
    maxWidth: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  toastText: {
    fontSize: 18,
    textAlign: 'center',
  },
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  deleteConfirmDialog: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  deleteConfirmTitle: {
    fontSize: 18,
  },
  deleteConfirmMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  deleteConfirmButton: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  deleteConfirmCancelButton: {
    backgroundColor: 'transparent',
  },
  deleteConfirmDestructiveButton: {
    backgroundColor: 'transparent',
  },
  deleteConfirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  localErrorBox: {
    margin: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  localErrorTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  localErrorMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default Item8Screen;
