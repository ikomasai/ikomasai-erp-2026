/**
 * 項目12画面
 * 巡回サポート（patrol_tasks ベース）
 * state管理とAPI呼び出しを集約するコンテナコンポーネント
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { PATROL_TABS, PATROL_TAB_TYPES, SCREEN_NAME } from '../constants';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { canAccessManagementSupportScreen } from '../../../services/supabase/permissionService';
import {
  acceptPatrolTask,
  completePatrolTask,
  listPatrolTaskResults,
  listPatrolTasks,
  PATROL_RESULT_CODES,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import { createTicketMessage, listTicketMessages } from '../../../services/supabase/supportTicketService';
import {
  createPatrolCheck,
  listPatrolChecks,
  listPatrolLocations,
  listUnvisitedLocations,
} from '../../../services/supabase/patrolCheckService';
import { selectOrganizationEvents } from '../../../services/supabase/organizationEventService';
import {
  ALL_ORGANIZATION_EVENT_FILTER,
  buildOrganizationEventOptions,
  matchesOrganizationEventSearchKeyword,
  normalizeOrganizationEventSearchValue,
  ORGANIZATION_EVENT_OPTION_LIMIT,
} from '../../../shared/utils/organizationEventList';
import PatrolTaskList from '../components/PatrolTaskList';
import PatrolTaskDetail from '../components/PatrolTaskDetail';
import PatrolCheckForm, { PATROL_CHECK_ITEM_OPTIONS } from '../components/PatrolCheckForm';
import UnvisitedAlertList from '../components/UnvisitedAlertList';
import ToastMessage from '../../../shared/components/ToastMessage';
import OfflineBanner from '../../../shared/components/OfflineBanner';
import { useManagedPushSubscription } from '../../notifications/hooks/useManagedPushSubscription';
import WebPushStatusCard from '../../notifications/components/WebPushStatusCard';
import SupportScreenAccessGuard from '../../support/components/SupportScreenAccessGuard';

/** 種別ごとの完了結果候補 */
const RESULT_OPTIONS_BY_TASK_TYPE = {
  [PATROL_TASK_TYPES.CONFIRM_START]: [
    { key: PATROL_RESULT_CODES.OK, label: '問題なし' },
    { key: PATROL_RESULT_CODES.NOT_STARTED, label: '開始していない' },
    { key: PATROL_RESULT_CODES.NEED_SUPPORT, label: '別対応必要' },
  ],
  [PATROL_TASK_TYPES.CONFIRM_END]: [
    { key: PATROL_RESULT_CODES.OK, label: '問題なし' },
    { key: PATROL_RESULT_CODES.NOT_ENDED, label: '終了していない' },
    { key: PATROL_RESULT_CODES.NEED_SUPPORT, label: '別対応必要' },
  ],
  [PATROL_TASK_TYPES.LOCK_CHECK]: [
    { key: PATROL_RESULT_CODES.LOCKED, label: '施錠済' },
    { key: PATROL_RESULT_CODES.UNLOCKED, label: '未施錠' },
    { key: PATROL_RESULT_CODES.CANNOT_CONFIRM, label: '確認不可' },
  ],
};

/** デフォルトの完了結果候補 */
const DEFAULT_RESULT_OPTIONS = [
  { key: PATROL_RESULT_CODES.OK, label: '問題なし' },
  { key: PATROL_RESULT_CODES.NEED_SUPPORT, label: '別対応必要' },
];

/** 種別ごとの「向かいます」メッセージ */
const GO_MESSAGES = {
  [PATROL_TASK_TYPES.CONFIRM_START]: '巡回担当が企画開始確認のため現地へ向かいます。',
  [PATROL_TASK_TYPES.CONFIRM_END]: '巡回担当が企画終了確認のため現地へ向かいます。',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '巡回担当が施錠確認のため現地へ向かいます。',
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '巡回担当が緊急対応のため現地へ向かいます。',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '巡回担当が定常巡回のため現地へ向かいます。',
  [PATROL_TASK_TYPES.OTHER]: '巡回担当が現地へ向かいます。',
};

/** 結果コードごとの表示名 */
const RESULT_LABELS = {
  [PATROL_RESULT_CODES.OK]: '問題なし',
  [PATROL_RESULT_CODES.NOT_STARTED]: '開始していない',
  [PATROL_RESULT_CODES.NOT_ENDED]: '終了していない',
  [PATROL_RESULT_CODES.NEED_SUPPORT]: '別対応必要',
  [PATROL_RESULT_CODES.LOCKED]: '施錠済',
  [PATROL_RESULT_CODES.UNLOCKED]: '未施錠',
  [PATROL_RESULT_CODES.CANNOT_CONFIRM]: '確認不可',
};

/** タスク種別表示名 */
const TASK_TYPE_LABELS = {
  [PATROL_TASK_TYPES.CONFIRM_START]: '企画開始確認',
  [PATROL_TASK_TYPES.CONFIRM_END]: '企画終了確認',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '施錠確認',
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '緊急対応',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '定常巡回',
  [PATROL_TASK_TYPES.OTHER]: 'その他',
};

/** 未巡回アラートのデフォルト閾値（分） */
const DEFAULT_UNVISITED_ALERT_MINUTES = 90;

/** タブごとの案内文 */
const PATROL_TAB_DESCRIPTIONS = {
  [PATROL_TAB_TYPES.DASHBOARD]: '件数と優先タスクだけを短く確認する巡回用の要約です。',
  [PATROL_TAB_TYPES.TASKS]: '優先度の高い巡回依頼を選んで、そのまま対応まで進めます。',
  [PATROL_TAB_TYPES.CHECK]: '定常巡回の記録と未巡回箇所の確認を同じ流れで行います。',
  [PATROL_TAB_TYPES.EVENT_ORGS]: '団体別の企画一覧を絞り込みながら確認できます。',
};

/**
 * 巡回サポートのタブキーが有効か判定
 * @param {string|null|undefined} value - 判定対象タブキー
 * @returns {boolean} 有効な場合はtrue
 */
const isValidPatrolTab = (value) => {
  return PATROL_TABS.some((tab) => tab.key === value);
};

/**
 * タスク種別に応じた結果候補を取得
 * @param {string} taskType - タスク種別
 * @returns {Array} 結果候補配列
 */
const getResultOptionsByTaskType = (taskType) => {
  return RESULT_OPTIONS_BY_TASK_TYPE[taskType] || DEFAULT_RESULT_OPTIONS;
};

/**
 * タスク種別に応じた「向かいます」メッセージを取得
 * @param {string} taskType - タスク種別
 * @returns {string} メッセージ文字列
 */
const getGoMessageByTaskType = (taskType) => {
  return GO_MESSAGES[taskType] || GO_MESSAGES[PATROL_TASK_TYPES.OTHER];
};

/**
 * 項目12画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @param {Object} props.route - React Navigationのrouteオブジェクト
 * @returns {JSX.Element} 項目12画面
 */
const Item12Screen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();
  const isRoleReady = Array.isArray(userInfo?.roles);
  const canAccess = !isRoleReady || canAccessManagementSupportScreen(userInfo?.roles || [], 'item12');
  /** 通知タップなどで指定された初期タブ */
  const initialTab = route?.params?.initialTab || null;
  /** 画面単位のPush購読状態 */
  const pushNotice = useManagedPushSubscription({
    navigation,
    userId: user?.id,
    enabled: Boolean(user?.id),
  });

  if (!canAccess) {
    return (
      <SupportScreenAccessGuard
        canAccess={false}
        navigation={navigation}
        title={SCREEN_NAME}
        message="巡回サポートは企画管理部または警備部の担当者だけが閲覧できます。"
      />
    );
  }

  /* ---- タブ切替 ---- */
  /** 現在表示中のタブ（デフォルト: タスク一覧） */
  const [activeTab, setActiveTab] = useState(
    isValidPatrolTab(initialTab) ? initialTab : PATROL_TAB_TYPES.TASKS
  );

  /* ---- タスク一覧関連 ---- */
  const [tasks, setTasks] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  /* ---- タスク詳細関連 ---- */
  const [taskResults, setTaskResults] = useState([]);
  const [isLoadingTaskResults, setIsLoadingTaskResults] = useState(false);
  const [sourceMessages, setSourceMessages] = useState([]);
  const [isLoadingSourceMessages, setIsLoadingSourceMessages] = useState(false);
  const [patrolMemo, setPatrolMemo] = useState('');
  const [resultCode, setResultCode] = useState(PATROL_RESULT_CODES.OK);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ---- 巡回チェック関連 ---- */
  const [patrolLocations, setPatrolLocations] = useState([]);
  const [selectedPatrolLocationId, setSelectedPatrolLocationId] = useState('');
  const [patrolLocationText, setPatrolLocationText] = useState('');
  const [patrolCheckItems, setPatrolCheckItems] = useState({});
  const [patrolCheckMemo, setPatrolCheckMemo] = useState('');
  const [isSubmittingPatrolCheck, setIsSubmittingPatrolCheck] = useState(false);
  const [recentPatrolChecks, setRecentPatrolChecks] = useState([]);
  const [isLoadingRecentPatrolChecks, setIsLoadingRecentPatrolChecks] = useState(false);

  /* ---- 未巡回アラート関連 ---- */
  const [unvisitedLocations, setUnvisitedLocations] = useState([]);
  const [isLoadingUnvisitedLocations, setIsLoadingUnvisitedLocations] = useState(false);
  const [unvisitedAlertMinutes, setUnvisitedAlertMinutes] = useState(DEFAULT_UNVISITED_ALERT_MINUTES);

  /* ---- 自分の履歴関連 ---- */
  /** 自分が対応した過去タスク（完了・取消）一覧 */
  const [myHistory, setMyHistory] = useState([]);
  /** 履歴読み込み中フラグ */
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  /* ---- 企画一覧関連 ---- */
  /** 団体別企画一覧（organizations_events） */
  const [organizationEvents, setOrganizationEvents] = useState([]);
  /** 団体別企画一覧読み込み中フラグ */
  const [isLoadingOrganizationEvents, setIsLoadingOrganizationEvents] = useState(false);
  /** 団体候補検索テキスト */
  const [organizationEventSearch, setOrganizationEventSearch] = useState('');
  /** 選択中団体名 */
  const [selectedOrganizationEvent, setSelectedOrganizationEvent] = useState(ALL_ORGANIZATION_EVENT_FILTER);
  /** 団体候補表示フラグ */
  const [isOrganizationEventDropdownOpen, setIsOrganizationEventDropdownOpen] = useState(false);

  /* ---- トースト通知 ---- */
  /** トースト表示フラグ・メッセージ・種別 */
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  /**
   * トースト通知を表示（確認ダイアログの代替）
   * @param {string} message - 表示メッセージ
   * @param {'success'|'error'|'info'} [type='success'] - 種別
   * @returns {void}
   */
  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
  };

  /**
   * トースト通知を非表示にする
   * @returns {void}
   */
  const hideToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };

  /** 団体候補一覧 */
  const organizationEventOptions = useMemo(() => {
    return buildOrganizationEventOptions(organizationEvents);
  }, [organizationEvents]);

  /** 団体候補検索で絞り込んだ団体一覧 */
  const filteredOrganizationEventOptions = useMemo(() => {
    /** 団体候補の検索キーワード */
    const keyword = normalizeOrganizationEventSearchValue(organizationEventSearch);
    if (!keyword) {
      return organizationEventOptions;
    }

    return organizationEventOptions.filter((option) =>
      matchesOrganizationEventSearchKeyword(option.label, keyword)
    );
  }, [organizationEventOptions, organizationEventSearch]);

  /** ドロップダウンに表示する団体候補一覧 */
  const visibleOrganizationEventOptions = useMemo(() => {
    return filteredOrganizationEventOptions.slice(0, ORGANIZATION_EVENT_OPTION_LIMIT);
  }, [filteredOrganizationEventOptions]);

  /** 画面表示用の選択中団体ラベル */
  const selectedOrganizationEventLabel = useMemo(() => {
    if (selectedOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER) {
      return 'すべての団体';
    }

    return selectedOrganizationEvent;
  }, [selectedOrganizationEvent]);

  /** 選択中団体で絞り込んだ企画一覧 */
  const filteredOrganizationEvents = useMemo(() => {
    return organizationEvents.filter((item) => {
      /** 団体選択との一致判定 */
      const matchesSelectedOrganization =
        selectedOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER ||
        (item.organization_name || '') === selectedOrganizationEvent;

      return matchesSelectedOrganization;
    });
  }, [organizationEvents, selectedOrganizationEvent]);

  /** 選択中タスク */
  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) || null;
  }, [selectedTaskId, tasks]);

  /** 選択中タスクの結果候補 */
  const resultOptions = useMemo(() => {
    return getResultOptionsByTaskType(selectedTask?.task_type);
  }, [selectedTask?.task_type]);

  /** 選択中タスクの場所表示 */
  const selectedTaskLocationLabel = useMemo(() => {
    return selectedTask?.event_location || selectedTask?.location_text || '場所未設定';
  }, [selectedTask?.event_location, selectedTask?.location_text]);

  /** 未割当を含む進行中タスク件数 */
  const openTaskCount = useMemo(() => {
    return tasks.length;
  }, [tasks]);

  /** 自分が担当している進行中タスク件数 */
  const myActiveTaskCount = useMemo(() => {
    if (!user?.id) {
      return 0;
    }

    return tasks.filter((task) => task.assigned_to === user.id).length;
  }, [tasks, user?.id]);

  /** 緊急対応タスク件数 */
  const emergencyTaskCount = useMemo(() => {
    return tasks.filter((task) => task.task_type === PATROL_TASK_TYPES.EMERGENCY_SUPPORT).length;
  }, [tasks]);

  /** 閾値超過の未巡回場所件数 */
  const overdueAlertCount = useMemo(() => {
    return unvisitedLocations.filter((location) => location.is_alert).length;
  }, [unvisitedLocations]);

  /** ダッシュボード用の件数カード一覧 */
  const dashboardMetrics = useMemo(() => {
    return [
      {
        key: 'open',
        label: '進行中',
        value: openTaskCount,
        helper: 'タスク対応へ',
      },
      {
        key: 'mine',
        label: 'あなた担当',
        value: myActiveTaskCount,
        helper: '現在の持ち件数',
      },
      {
        key: 'emergency',
        label: '緊急',
        value: emergencyTaskCount,
        helper: '最優先確認',
      },
      {
        key: 'alert',
        label: '未巡回',
        value: overdueAlertCount,
        helper: `${unvisitedAlertMinutes}分基準`,
      },
    ];
  }, [
    emergencyTaskCount,
    myActiveTaskCount,
    openTaskCount,
    overdueAlertCount,
    unvisitedAlertMinutes,
  ]);

  /**
   * タスク一覧取得
   * @param {string|null} preferredTaskId - 優先選択ID
   * @returns {Promise<void>} 取得処理
   */
  const loadTasks = async (preferredTaskId = null) => {
    if (!user?.id) {
      setTasks([]);
      setSelectedTaskId(null);
      return;
    }

    setIsLoadingTasks(true);
    const { data, error } = await listPatrolTasks({
      assignedTo: user.id,
      includeUnassigned: true,
      /** 完了・取消済みタスクは一覧から除外 */
      statuses: [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ],
      limit: 120,
    });
    setIsLoadingTasks(false);

    if (error) {
      console.error('巡回タスク取得に失敗:', error);
      return;
    }

    const nextTasks = data || [];
    setTasks(nextTasks);

    if (nextTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    const candidateId = preferredTaskId || selectedTaskId;
    if (candidateId && nextTasks.some((task) => task.id === candidateId)) {
      setSelectedTaskId(candidateId);
      return;
    }

    setSelectedTaskId(nextTasks[0].id);
  };

  /**
   * タスク結果一覧取得
   * @param {string|null} taskId - タスクID
   * @returns {Promise<void>} 取得処理
   */
  const loadTaskResults = async (taskId) => {
    if (!taskId) {
      setTaskResults([]);
      return;
    }

    setIsLoadingTaskResults(true);
    const { data, error } = await listPatrolTaskResults({ taskId });
    setIsLoadingTaskResults(false);

    if (error) {
      console.error('巡回タスク結果取得に失敗:', error);
      return;
    }

    setTaskResults(data || []);
  };

  /**
   * 元連絡案件メッセージ一覧取得
   * @param {string|null} sourceTicketId - 元連絡案件ID
   * @returns {Promise<void>} 取得処理
   */
  const loadSourceMessages = async (sourceTicketId) => {
    if (!sourceTicketId) {
      setSourceMessages([]);
      return;
    }

    setIsLoadingSourceMessages(true);
    const { data, error } = await listTicketMessages({ ticketId: sourceTicketId });
    setIsLoadingSourceMessages(false);

    if (error) {
      console.error('元連絡案件メッセージ取得に失敗:', error);
      return;
    }

    setSourceMessages(data || []);
  };

  /**
   * 巡回場所候補を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadPatrolLocations = async () => {
    const { data, error } = await listPatrolLocations({ limit: 240 });
    if (error) {
      console.error('巡回場所候補の取得に失敗:', error);
      return;
    }

    const nextLocations = data || [];
    setPatrolLocations(nextLocations);

    if (nextLocations.length === 0) {
      return;
    }

    if (
      selectedPatrolLocationId &&
      nextLocations.some((location) => location.id === selectedPatrolLocationId)
    ) {
      return;
    }

    setSelectedPatrolLocationId('');
    setPatrolLocationText('');
  };

  /**
   * 直近巡回チェック履歴を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadRecentPatrolChecks = async () => {
    setIsLoadingRecentPatrolChecks(true);
    const { data, error } = await listPatrolChecks({ limit: 12 });
    setIsLoadingRecentPatrolChecks(false);

    if (error) {
      console.error('巡回チェック履歴の取得に失敗:', error);
      return;
    }

    setRecentPatrolChecks(data || []);
  };

  /**
   * 未巡回アラート一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadUnvisitedAlerts = async () => {
    setIsLoadingUnvisitedLocations(true);
    const { data, error } = await listUnvisitedLocations({
      alertMinutes: unvisitedAlertMinutes,
      limit: 240,
    });
    setIsLoadingUnvisitedLocations(false);

    if (error) {
      console.error('未巡回アラートの取得に失敗:', error);
      return;
    }

    setUnvisitedLocations(data || []);
  };

  /**
   * 自分の過去対応タスク履歴を取得（完了・取消済み）
   * @returns {Promise<void>} 取得処理
   */
  const loadMyHistory = async () => {
    if (!user?.id) {
      setMyHistory([]);
      return;
    }

    setIsLoadingHistory(true);
    const { data, error } = await listPatrolTasks({
      assignedTo: user.id,
      includeUnassigned: false,
      /** 完了・取消のみ取得 */
      statuses: [PATROL_TASK_STATUSES.DONE, PATROL_TASK_STATUSES.CANCELED],
      limit: 100,
    });
    setIsLoadingHistory(false);

    if (error) {
      console.error('巡回履歴取得に失敗:', error);
      return;
    }

    setMyHistory(data || []);
  };

  /**
   * 団体別企画一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadOrganizationEvents = async () => {
    setIsLoadingOrganizationEvents(true);
    const { data, error } = await selectOrganizationEvents({ limit: 200 });
    setIsLoadingOrganizationEvents(false);

    if (error) {
      console.error('団体別企画一覧の取得に失敗:', error);
      return;
    }

    setOrganizationEvents(data || []);
  };

  /**
   * 団体候補検索を更新する
   * @param {string} value - 入力値
   * @returns {void}
   */
  const handleOrganizationEventSearchChange = (value) => {
    setOrganizationEventSearch(value);
    setIsOrganizationEventDropdownOpen(true);
  };

  /**
   * 団体を選択して企画一覧を絞り込む
   * @param {string} organizationName - 団体名
   * @returns {void}
   */
  const handleOrganizationEventSelect = (organizationName) => {
    setSelectedOrganizationEvent(organizationName);
    setOrganizationEventSearch('');
    setIsOrganizationEventDropdownOpen(false);
  };

  /**
   * 団体選択を解除して全件表示に戻す
   * @returns {void}
   */
  const handleOrganizationEventReset = () => {
    setSelectedOrganizationEvent(ALL_ORGANIZATION_EVENT_FILTER);
    setOrganizationEventSearch('');
    setIsOrganizationEventDropdownOpen(false);
  };

  /**
   * 巡回チェック関連情報を更新
   * @returns {Promise<void>} 更新処理
   */
  const refreshPatrolCheckData = async () => {
    await Promise.all([
      loadPatrolLocations(),
      loadRecentPatrolChecks(),
      loadUnvisitedAlerts(),
    ]);
  };

  /**
   * 巡回チェック項目の回答を更新
   * @param {string} itemKey - 項目キー
   * @param {string} answerKey - 回答キー
   * @param {string} answerLabel - 回答ラベル
   * @returns {void}
   */
  const handleChangePatrolCheckAnswer = (itemKey, answerKey, answerLabel) => {
    setPatrolCheckItems((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        answerKey,
        answerLabel,
      },
    }));
  };

  /**
   * 巡回チェック項目のメモを更新
   * @param {string} item - 項目名
   * @param {string} memo - 項目別メモ
   * @returns {void}
   */
  const handleChangePatrolCheckMemo = (item, memo) => {
    setPatrolCheckItems((prev) => ({
      ...prev,
      [item]: {
        ...(prev[item] || {}),
        memo,
      },
    }));
  };

  /**
   * 巡回場所選択ハンドラ
   * @param {Object} location - 選択された場所オブジェクト
   * @returns {void}
   */
  const handleSelectLocation = (location) => {
    setSelectedPatrolLocationId(location.id);
    setPatrolLocationText(location.label || '');
  };

  /**
   * 選択中の巡回場所を解除
   * @returns {void}
   */
  const handleClearSelectedLocation = () => {
    setSelectedPatrolLocationId('');
    setPatrolLocationText('');
  };

  /**
   * 巡回チェックを登録
   * @returns {Promise<void>} 登録処理
   */
  const handleSubmitPatrolCheck = async () => {
    if (!user?.id) {
      showToast('ログイン情報が取得できません', 'error');
      return;
    }

    const selectedLocation = patrolLocations.find((location) => location.id === selectedPatrolLocationId) || null;
    const locationText = patrolLocationText.trim() || selectedLocation?.label || '';

    if (!selectedLocation?.id) {
      showToast('対象企画を選択してください', 'error');
      return;
    }

    if (!locationText) {
      showToast('対象企画を選択してください', 'error');
      return;
    }

    /** 保存するチェック項目配列 */
    const checkItems = PATROL_CHECK_ITEM_OPTIONS.map((item) => ({
      key: item.key,
      label: item.label,
      answerKey: patrolCheckItems[item.key]?.answerKey || '',
      answerLabel: patrolCheckItems[item.key]?.answerLabel || '',
      memo: (patrolCheckItems[item.key]?.memo || '').trim(),
    }));

    if (checkItems.some((item) => !item.answerKey || !item.answerLabel)) {
      showToast('すべてのチェック項目に回答してください', 'error');
      return;
    }

    setIsSubmittingPatrolCheck(true);
    const { error } = await createPatrolCheck({
      patrolUserId: user.id,
      locationId: selectedLocation.id,
      locationText,
      checkItems,
      memo: patrolCheckMemo,
    });
    setIsSubmittingPatrolCheck(false);

    if (error) {
      showToast(error.message || '巡回チェックの登録に失敗しました', 'error');
      return;
    }

    setPatrolCheckMemo('');
    setPatrolCheckItems({});
    await Promise.all([loadRecentPatrolChecks(), loadUnvisitedAlerts()]);
    showToast('巡回チェックを記録しました');
  };

  /**
   * 向かいます（受諾）処理
   * 確認ダイアログなしで即実行し、結果をトーストで通知する
   * @returns {Promise<void>} 実行処理
   */
  const handleAcceptTask = async () => {
    if (!selectedTask || !user?.id) {
      showToast('タスクまたはログイン情報が不足しています', 'error');
      return;
    }

    setIsSubmitting(true);
    const { error } = await acceptPatrolTask({
      taskId: selectedTask.id,
      patrolUserId: user.id,
    });

    if (!error && selectedTask.source_ticket_id) {
      await createTicketMessage({
        ticketId: selectedTask.source_ticket_id,
        authorId: user.id,
        body: getGoMessageByTaskType(selectedTask.task_type),
      });
    }

    setIsSubmitting(false);

    if (error) {
      showToast(error.message || '受諾処理に失敗しました', 'error');
      return;
    }

    await Promise.all([
      loadTasks(selectedTask.id),
      loadTaskResults(selectedTask.id),
      loadSourceMessages(selectedTask.source_ticket_id || null),
    ]);
    showToast('「向かいます」を登録しました');
  };

  /**
   * 完了処理
   * 確認ダイアログなしで即実行し、結果をトーストで通知する
   * @returns {Promise<void>} 実行処理
   */
  const handleCompleteTask = async () => {
    if (!selectedTask || !user?.id) {
      showToast('タスクまたはログイン情報が不足しています', 'error');
      return;
    }
    if (!resultCode) {
      showToast('結果を選択してください', 'error');
      return;
    }

    const taskLabel = TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type;
    const resultLabel = RESULT_LABELS[resultCode] || resultCode;

    setIsSubmitting(true);
    const { error } = await completePatrolTask({
      taskId: selectedTask.id,
      patrolUserId: user.id,
      resultCode,
      memo: patrolMemo,
      taskType: selectedTask.task_type,
      sourceTicketId: selectedTask.source_ticket_id,
      sourceKeyLoanId: selectedTask.source_key_loan_id,
    });
    setIsSubmitting(false);

    if (error) {
      showToast(error.message || '完了処理に失敗しました', 'error');
      return;
    }

    setPatrolMemo('');
    await Promise.all([
      loadTasks(selectedTask.id),
      loadTaskResults(selectedTask.id),
      loadSourceMessages(selectedTask.source_ticket_id || null),
    ]);
    showToast(`${taskLabel}を「${resultLabel}」で完了しました`);
  };

  /**
   * メモのみ共有（元連絡案件がある場合）
   * @returns {Promise<void>} 実行処理
   */
  const handleSendMemoOnly = async () => {
    if (!selectedTask?.source_ticket_id) {
      showToast('このタスクは元連絡案件がないためメモのみ共有できません', 'error');
      return;
    }
    if (!user?.id) {
      showToast('ログイン情報が取得できません', 'error');
      return;
    }
    if (!patrolMemo.trim()) {
      showToast('巡回メモを入力してください', 'error');
      return;
    }

    setIsSubmitting(true);
    const { error } = await createTicketMessage({
      ticketId: selectedTask.source_ticket_id,
      authorId: user.id,
      body: patrolMemo.trim(),
    });
    setIsSubmitting(false);

    if (error) {
      showToast(error.message || 'メモ送信に失敗しました', 'error');
      return;
    }

    setPatrolMemo('');
    await loadSourceMessages(selectedTask.source_ticket_id);
    showToast('メモを共有しました');
  };

  /** 自分のタスクまたは未割当かどうか */
  const isMineOrUnassigned = useMemo(
    () =>
      selectedTask != null &&
      (!selectedTask.assigned_to || selectedTask.assigned_to === user?.id),
    [selectedTask, user?.id]
  );

  /**
   * 自分が現在受諾中/移動中の同種別タスクが存在するか
   * 未割当タスクへの「行きます」可否判定に使用する
   */
  const hasSameTypeActiveTask = useMemo(() => {
    if (!selectedTask || !user?.id) {
      return false;
    }
    return tasks.some(
      (task) =>
        task.id !== selectedTask.id &&
        task.task_type === selectedTask.task_type &&
        task.assigned_to === user.id &&
        [PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(task.task_status)
    );
  }, [tasks, selectedTask, user?.id]);

  /**
   * 受諾可能かどうか
   * - 自分に割り当て済み: ステータスが open/accepted/en_route であれば受諾可
   * - 未割当: 同種別のアクティブタスクを持っていなければ受諾可
   * - 他者に割り当て済み: 受諾不可
   */
  const canAccept = useMemo(() => {
    if (!selectedTask) {
      return false;
    }
    const isActiveStatus = [
      PATROL_TASK_STATUSES.OPEN,
      PATROL_TASK_STATUSES.ACCEPTED,
      PATROL_TASK_STATUSES.EN_ROUTE,
    ].includes(selectedTask.task_status);
    if (!isActiveStatus) {
      return false;
    }
    /** 自分が担当者の場合はそのまま受諾可 */
    if (selectedTask.assigned_to === user?.id) {
      return true;
    }
    /** 未割当の場合は同種別アクティブタスクがなければ受諾可 */
    if (!selectedTask.assigned_to) {
      return !hasSameTypeActiveTask;
    }
    /** 他者が担当者の場合は受諾不可 */
    return false;
  }, [selectedTask, user?.id, hasSameTypeActiveTask]);

  /** 完了可能かどうか（自分担当または未割当のアクティブタスクのみ） */
  const canComplete = useMemo(
    () =>
      selectedTask != null &&
      isMineOrUnassigned &&
      [PATROL_TASK_STATUSES.OPEN, PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(
        selectedTask.task_status
      ),
    [selectedTask, isMineOrUnassigned]
  );

  /** ダッシュボードに表示する直近履歴 */
  const recentHistoryItems = useMemo(() => {
    return myHistory.slice(0, 3);
  }, [myHistory]);

  /** ダッシュボードに表示する未巡回上位 */
  const topAlertLocations = useMemo(() => {
    return unvisitedLocations.slice(0, 3);
  }, [unvisitedLocations]);

  useEffect(() => {
    loadTasks();
    refreshPatrolCheckData();
    loadMyHistory();
    loadOrganizationEvents();
  }, [user?.id]);

  useEffect(() => {
    if (selectedOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER) {
      return;
    }

    /** 再取得後も選択中団体が存在するか確認 */
    const hasSelectedOrganization = organizationEventOptions.some(
      (option) => option.value === selectedOrganizationEvent
    );

    if (!hasSelectedOrganization) {
      setSelectedOrganizationEvent(ALL_ORGANIZATION_EVENT_FILTER);
      setOrganizationEventSearch('');
      setIsOrganizationEventDropdownOpen(false);
    }
  }, [organizationEventOptions, selectedOrganizationEvent]);

  useEffect(() => {
    /** 30秒ごとに自動更新（他者が受諾したタスクを即座に非表示にする） */
    const interval = setInterval(() => {
      loadTasks(selectedTaskId);
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [selectedTaskId]);

  useEffect(() => {
    loadTaskResults(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    loadSourceMessages(selectedTask?.source_ticket_id || null);
  }, [selectedTask?.source_ticket_id]);

  useEffect(() => {
    loadUnvisitedAlerts();
  }, [unvisitedAlertMinutes]);

  useEffect(() => {
    if (resultOptions.length === 0) {
      setResultCode(PATROL_RESULT_CODES.OK);
      return;
    }

    if (!resultOptions.some((option) => option.key === resultCode)) {
      setResultCode(resultOptions[0].key);
    }
  }, [resultOptions, resultCode]);

  useEffect(() => {
    if (isValidPatrolTab(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
      <OfflineBanner />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── タブコンテンツ ── */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {pushNotice.isVisible ? (
            <WebPushStatusCard
              theme={theme}
              title={pushNotice.title}
              description={pushNotice.description}
              actionLabel={pushNotice.actionLabel}
              isLoading={pushNotice.isSyncingPush}
              onPress={pushNotice.onPress}
            />
          ) : null}

          {/* ダッシュボードタブ */}
          {activeTab === PATROL_TAB_TYPES.DASHBOARD && (
            <View style={[dashboardStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={dashboardStyles.header}>
                <View style={dashboardStyles.headerTextBlock}>
                  <Text style={[dashboardStyles.title, { color: theme.text }]}>ダッシュボード</Text>
                  <Text style={[dashboardStyles.helpText, { color: theme.textSecondary }]}>
                    {PATROL_TAB_DESCRIPTIONS[PATROL_TAB_TYPES.DASHBOARD]}
                  </Text>
                </View>
                <Pressable
                  style={[dashboardStyles.refreshButton, { borderColor: theme.border }]}
                  onPress={async () => {
                    await Promise.all([
                      loadTasks(selectedTaskId),
                      refreshPatrolCheckData(),
                      loadMyHistory(),
                    ]);
                  }}
                >
                  <Text style={[dashboardStyles.refreshButtonText, { color: theme.textSecondary }]}>
                    更新
                  </Text>
                </Pressable>
              </View>

              <View style={dashboardStyles.metricGrid}>
                {dashboardMetrics.map((metric) => (
                  <View
                    key={metric.key}
                    style={[
                      dashboardStyles.metricCard,
                      { borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[dashboardStyles.metricValue, { color: theme.text }]}>{metric.value}</Text>
                    <Text style={[dashboardStyles.metricLabel, { color: theme.textSecondary }]}>
                      {metric.label}
                    </Text>
                    <Text style={[dashboardStyles.metricHelper, { color: theme.textSecondary }]}>
                      {metric.helper}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={[
                  dashboardStyles.focusCard,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
              >
                <Text style={[dashboardStyles.sectionLabel, { color: theme.textSecondary }]}>
                  次に見るべきタスク
                </Text>
                <Text style={[dashboardStyles.focusTitle, { color: theme.text }]}>
                  {selectedTask
                    ? selectedTask.event_name || TASK_TYPE_LABELS[selectedTask.task_type] || '巡回タスク'
                    : 'タスクを選択してください'}
                </Text>
                <Text style={[dashboardStyles.focusBody, { color: theme.textSecondary }]}>
                  {selectedTask
                    ? `${TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type} / ${selectedTaskLocationLabel}`
                    : '下のタブでタスクを開くと、受諾と完了登録に進めます。'}
                </Text>
              </View>

              <View style={dashboardStyles.columnGroup}>
                <View
                  style={[
                    dashboardStyles.sectionCard,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  <Text style={[dashboardStyles.sectionTitle, { color: theme.text }]}>未巡回の上位</Text>
                  {topAlertLocations.length === 0 ? (
                    <Text style={[dashboardStyles.emptyText, { color: theme.textSecondary }]}>
                      未巡回アラートはありません
                    </Text>
                  ) : (
                    topAlertLocations.map((location) => (
                      <View key={location.location_id} style={dashboardStyles.compactItem}>
                        <Text style={[dashboardStyles.compactTitle, { color: theme.text }]} numberOfLines={1}>
                          {location.location_label}
                        </Text>
                        <Text style={[dashboardStyles.compactMeta, { color: theme.textSecondary }]}>
                          {location.elapsed_minutes === null
                            ? '巡回記録なし'
                            : `${Math.floor(location.elapsed_minutes / 60)}時間${location.elapsed_minutes % 60}分`}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                <View
                  style={[
                    dashboardStyles.sectionCard,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  <Text style={[dashboardStyles.sectionTitle, { color: theme.text }]}>最近の対応</Text>
                  {isLoadingHistory ? (
                    <Text style={[dashboardStyles.emptyText, { color: theme.textSecondary }]}>読み込み中...</Text>
                  ) : recentHistoryItems.length === 0 ? (
                    <Text style={[dashboardStyles.emptyText, { color: theme.textSecondary }]}>
                      対応履歴はまだありません
                    </Text>
                  ) : (
                    recentHistoryItems.map((task) => (
                      <View key={task.id} style={dashboardStyles.compactItem}>
                        <Text style={[dashboardStyles.compactTitle, { color: theme.text }]} numberOfLines={1}>
                          {task.event_name || TASK_TYPE_LABELS[task.task_type] || '巡回対応'}
                        </Text>
                        <Text style={[dashboardStyles.compactMeta, { color: theme.textSecondary }]}>
                          {task.done_at
                            ? new Date(task.done_at).toLocaleString('ja-JP')
                            : new Date(task.updated_at || task.created_at).toLocaleString('ja-JP')}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          )}

          {/* タスクタブ */}
          {activeTab === PATROL_TAB_TYPES.TASKS && (
            <>
              <PatrolTaskList
                theme={theme}
                user={user}
                tasks={tasks}
                isLoadingTasks={isLoadingTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onRefresh={() => loadTasks(selectedTaskId)}
              />

              {selectedTask ? (
                <PatrolTaskDetail
                  theme={theme}
                  user={user}
                  selectedTask={selectedTask}
                  resultOptions={resultOptions}
                  resultCode={resultCode}
                  onChangeResultCode={setResultCode}
                  patrolMemo={patrolMemo}
                  onChangePatrolMemo={setPatrolMemo}
                  isSubmitting={isSubmitting}
                  canAccept={canAccept}
                  canComplete={canComplete}
                  onAcceptTask={handleAcceptTask}
                  onCompleteTask={handleCompleteTask}
                  onSendMemoOnly={handleSendMemoOnly}
                  taskResults={taskResults}
                  isLoadingTaskResults={isLoadingTaskResults}
                  onRefreshTaskResults={() => loadTaskResults(selectedTask.id)}
                  sourceMessages={sourceMessages}
                  isLoadingSourceMessages={isLoadingSourceMessages}
                  onRefreshSourceMessages={() => loadSourceMessages(selectedTask.source_ticket_id)}
                />
              ) : null}
            </>
          )}

          {/* チェックタブ */}
          {activeTab === PATROL_TAB_TYPES.CHECK && (
            <>
              <PatrolCheckForm
                theme={theme}
                patrolLocations={patrolLocations}
                selectedPatrolLocationId={selectedPatrolLocationId}
                onSelectLocation={handleSelectLocation}
                patrolLocationText={patrolLocationText}
                patrolCheckItems={patrolCheckItems}
                onChangeCheckAnswer={handleChangePatrolCheckAnswer}
                onChangeCheckMemo={handleChangePatrolCheckMemo}
                onClearSelectedLocation={handleClearSelectedLocation}
                patrolCheckMemo={patrolCheckMemo}
                onChangeSummaryMemo={setPatrolCheckMemo}
                isSubmittingPatrolCheck={isSubmittingPatrolCheck}
                onSubmitPatrolCheck={handleSubmitPatrolCheck}
                recentPatrolChecks={recentPatrolChecks}
                isLoadingRecentPatrolChecks={isLoadingRecentPatrolChecks}
                onRefresh={refreshPatrolCheckData}
              />

              <UnvisitedAlertList
                theme={theme}
                unvisitedLocations={unvisitedLocations}
                isLoadingUnvisitedLocations={isLoadingUnvisitedLocations}
                unvisitedAlertMinutes={unvisitedAlertMinutes}
                onChangeAlertMinutes={setUnvisitedAlertMinutes}
                onRefresh={loadUnvisitedAlerts}
              />
            </>
          )}

          {/* 企画一覧タブ */}
          {activeTab === PATROL_TAB_TYPES.EVENT_ORGS && (
            <View style={[eventOrgStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={eventOrgStyles.header}>
                <Text style={[eventOrgStyles.title, { color: theme.text }]}>企画一覧</Text>
                <Pressable
                  style={[eventOrgStyles.refreshButton, { borderColor: theme.border }]}
                  onPress={loadOrganizationEvents}
                >
                  <Text style={[eventOrgStyles.refreshButtonText, { color: theme.textSecondary }]}>
                    {isLoadingOrganizationEvents ? '読込中...' : '更新'}
                  </Text>
                </Pressable>
              </View>
              <Text style={[eventOrgStyles.helpText, { color: theme.textSecondary }]}>
                organizations_events の団体別企画一覧です。団体を選ぶと対象企画だけ確認できます。
              </Text>

              {/* 団体候補検索バー */}
              <TextInput
                value={organizationEventSearch}
                onChangeText={handleOrganizationEventSearchChange}
                onFocus={() => setIsOrganizationEventDropdownOpen(true)}
                placeholder="団体名を入力して候補を絞り込み..."
                placeholderTextColor={theme.textSecondary}
                style={[
                  eventOrgStyles.searchInput,
                  { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
                ]}
              />

              <View
                style={[
                  eventOrgStyles.selectedSummaryCard,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
              >
                <View style={eventOrgStyles.selectedSummaryContent}>
                  <Text style={[eventOrgStyles.selectedSummaryLabel, { color: theme.textSecondary }]}>
                    選択中の団体
                  </Text>
                  <Text style={[eventOrgStyles.selectedSummaryValue, { color: theme.text }]}>
                    {selectedOrganizationEventLabel}
                  </Text>
                </View>
                <Pressable
                  style={[eventOrgStyles.inlineActionButton, { borderColor: theme.border }]}
                  onPress={handleOrganizationEventReset}
                >
                  <Text style={[eventOrgStyles.inlineActionButtonText, { color: theme.textSecondary }]}>
                    すべて表示
                  </Text>
                </Pressable>
              </View>

              {isOrganizationEventDropdownOpen ? (
                <View
                  style={[
                    eventOrgStyles.dropdownOptionList,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  {filteredOrganizationEventOptions.length === 0 ? (
                    <Text style={[eventOrgStyles.helpText, { color: theme.textSecondary }]}>
                      該当する団体候補がありません
                    </Text>
                  ) : (
                    <>
                      {visibleOrganizationEventOptions.map((option) => {
                        /** 選択中団体かどうか */
                        const isSelected = option.value === selectedOrganizationEvent;

                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => handleOrganizationEventSelect(option.value)}
                            style={[
                              eventOrgStyles.dropdownOptionItem,
                              {
                                borderColor: theme.border,
                                backgroundColor: isSelected ? theme.primary : theme.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                eventOrgStyles.dropdownOptionTitle,
                                { color: isSelected ? '#FFFFFF' : theme.text },
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                eventOrgStyles.dropdownOptionMeta,
                                { color: isSelected ? 'rgba(255,255,255,0.86)' : theme.textSecondary },
                              ]}
                            >
                              企画 {option.count} 件
                            </Text>
                          </Pressable>
                        );
                      })}

                      {filteredOrganizationEventOptions.length > visibleOrganizationEventOptions.length ? (
                        <Text style={[eventOrgStyles.dropdownOverflowText, { color: theme.textSecondary }]}>
                          ほか {filteredOrganizationEventOptions.length - visibleOrganizationEventOptions.length} 件あります。さらに入力すると絞り込めます。
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}

              {isLoadingOrganizationEvents ? (
                <Text style={[eventOrgStyles.emptyText, { color: theme.textSecondary }]}>読み込み中...</Text>
              ) : organizationEvents.length === 0 ? (
                <Text style={[eventOrgStyles.emptyText, { color: theme.textSecondary }]}>
                  団体別企画データがありません
                </Text>
              ) : filteredOrganizationEvents.length === 0 ? (
                <Text style={[eventOrgStyles.emptyText, { color: theme.textSecondary }]}>
                  該当する企画がありません
                </Text>
              ) : (
                <View style={eventOrgStyles.list}>
                  {filteredOrganizationEvents.map((item) => (
                    <View
                      key={`${item.id}-${item.organization_name}-${item.event_name}`}
                      style={[eventOrgStyles.item, { borderColor: theme.border, backgroundColor: theme.background }]}
                    >
                      <Text style={[eventOrgStyles.itemMeta, { color: theme.textSecondary }]}>
                        {item.organization_name || '団体名未設定'}
                      </Text>
                      <Text style={[eventOrgStyles.itemName, { color: theme.text }]}>
                        {item.event_name || '企画名未設定'}
                      </Text>
                      {item.sheet_name ? (
                        <Text style={[eventOrgStyles.itemSubText, { color: theme.textSecondary }]}>
                          シート: {item.sheet_name}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

        </ScrollView>

        {/* ── トースト通知（タブバーの上に浮かせる） ── */}
        <ToastMessage
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={hideToast}
        />

        {/* ── 下部 iOS タブバー ── */}
        <View style={[styles.bottomArea, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <View style={[styles.iosTabBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {PATROL_TABS.map((tab) => {
              /** アクティブタブかどうか */
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.tabButton,
                    isActive && [
                      styles.tabButtonActive,
                      { backgroundColor: theme.background, borderColor: theme.border },
                    ],
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={styles.tabButtonIcon}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.tabButtonText,
                      { color: isActive ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

/** ダッシュボードタブ専用スタイル */
const dashboardStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  helpText: {
    fontSize: 12,
    lineHeight: 18,
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricHelper: {
    fontSize: 11,
  },
  focusCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  focusBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  columnGroup: {
    gap: 10,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  compactItem: {
    gap: 2,
    paddingTop: 2,
  },
  compactTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  compactMeta: {
    fontSize: 12,
  },
});

/** 企画一覧タブ専用スタイル */
const eventOrgStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
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
  helpText: {
    fontSize: 13,
    lineHeight: 18,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  selectedSummaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selectedSummaryContent: {
    flex: 1,
  },
  selectedSummaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  inlineActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inlineActionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownOptionList: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  dropdownOptionItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownOptionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  dropdownOverflowText: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  list: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    marginBottom: 4,
  },
  itemSubText: {
    fontSize: 12,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /** KeyboardAvoidingView 全体 */
  body: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  /** 下部タブバーエリア */
  bottomArea: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  /** iOS スタイルのタブバー pill */
  iosTabBar: {
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 16,
    minHeight: 58,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabButtonActive: {
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabButtonIcon: {
    fontSize: 17,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default Item12Screen;
