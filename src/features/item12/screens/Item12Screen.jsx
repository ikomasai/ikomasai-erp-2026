/**
 * 項目12画面
 * 巡回サポート（patrol_tasks ベース）
 * state管理とAPI呼び出しを集約するコンテナコンポーネント
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { getSupabaseClient } from '../../../services/supabase/client';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { PATROL_TABS, PATROL_TAB_TYPES, SCREEN_NAME } from '../constants';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { canAccessManagementSupportScreen } from '../../../services/supabase/permissionService';
import { selectUserProfile, updatePatrolStatus } from '../../../services/supabase/userService';
import {
  acceptPatrolTask,
  acceptPatrolTaskGroup,
  assignPatrolTask,
  assignPatrolTaskGroup,
  buildEvaluationPatrolTaskNotes,
  completePatrolTask,
  completePatrolTaskGroup,
  getEvaluationPatrolTaskItemNames,
  getEvaluationPatrolTaskMeta,
  getPatrolTaskDisplayType,
  listPatrolTaskResults,
  listPatrolTasks,
  PATROL_TASK_DISPLAY_TYPES,
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
import { listKeyLoans } from '../../../services/supabase/keyLoanService';
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

/** 表示専用の評価タスクラベル */
const EVALUATION_TASK_LABEL = '企画評価';
/** 表示専用の評価タスク向け「向かいます」通知文 */
const EVALUATION_TASK_GO_MESSAGE = '巡回担当が企画評価のため現地へ向かいます。';
/** 既定の評価項目順 */
const DEFAULT_EVALUATION_ITEM_ORDER = ['企画書通りの進行', '安全管理', '来場者対応', '設営・片付け', '全体印象'];

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

/** AsyncStorage: 巡回サポートに施錠確認サマリーを表示するかのキー */
const ASYNC_KEY_SHOW_LOCK_CHECK_IN_PATROL = 'showLockCheckInPatrol';

/** AsyncStorage: 未巡回アラート閾値（本部が設定し、巡回サポートは読み取り専用） */
const ASYNC_KEY_UNVISITED_ALERT_MINUTES = 'unvisitedAlertMinutes';

/** タブごとの案内文 */
const PATROL_TAB_DESCRIPTIONS = {
  [PATROL_TAB_TYPES.DASHBOARD]: '件数と優先タスクだけを短く確認する巡回用の要約です。',
  [PATROL_TAB_TYPES.TASKS]: '優先度の高い巡回依頼を選んで、そのまま対応まで進めます。',
  [PATROL_TAB_TYPES.EVALUATION]: '企画評価タスクをまとめて確認し、現地評価を登録します。',
  [PATROL_TAB_TYPES.CHECK]: '定常巡回の記録と未巡回箇所の確認を同じ流れで行います。',
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
 * タスクの表示名を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 表示用種別名
 */
const getTaskTypeLabel = (task) => {
  if (!task) {
    return '巡回タスク';
  }
  if (getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION) {
    return EVALUATION_TASK_LABEL;
  }
  return TASK_TYPE_LABELS[task.task_type] || task.task_type;
};

/**
 * タスクごとの「向かいます」通知文を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 通知文
 */
const getGoMessageByTask = (task) => {
  if (task && getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION) {
    return EVALUATION_TASK_GO_MESSAGE;
  }
  return getGoMessageByTaskType(task?.task_type);
};

/**
 * 評価タスクの入力内容を完了メモへ整形する
 * @param {Object} params - 整形対象
 * @param {string[]} params.itemNames - 評価項目一覧
 * @param {Object} params.inputs - 評価項目入力状態
 * @param {string} [params.summaryMemo=''] - 総評メモ
 * @returns {string} 保存用メモ
 */
const buildEvaluationCompletionMemo = ({ itemNames, inputs, summaryMemo = '' }) => {
  const lines = [];

  if (Array.isArray(itemNames) && itemNames.length > 0) {
    lines.push('評価項目');
    itemNames.forEach((itemName) => {
      const score = Number(inputs[itemName]?.score || 0);
      const comment = (inputs[itemName]?.comment || '').trim();
      lines.push(`- ${itemName}: ${score}点`);
      if (comment) {
        lines.push(`  コメント: ${comment}`);
      }
    });
  }

  const normalizedSummaryMemo = summaryMemo.trim();
  if (normalizedSummaryMemo) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('総評');
    lines.push(normalizedSummaryMemo);
  }

  return lines.join('\n').trim();
};

/**
 * 評価項目名一覧を既定順に並べ替える
 * @param {string[]} itemNames - 評価項目一覧
 * @returns {string[]} ソート済み評価項目一覧
 */
const sortEvaluationItemNames = (itemNames) => {
  const orderMap = DEFAULT_EVALUATION_ITEM_ORDER.reduce((accumulator, itemName, index) => {
    accumulator[itemName] = index;
    return accumulator;
  }, {});

  return [...new Set((Array.isArray(itemNames) ? itemNames : []).filter(Boolean))].sort((left, right) => {
    const leftOrder = orderMap[left];
    const rightOrder = orderMap[right];

    if (Number.isInteger(leftOrder) && Number.isInteger(rightOrder) && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (Number.isInteger(leftOrder)) {
      return -1;
    }
    if (Number.isInteger(rightOrder)) {
      return 1;
    }
    return left.localeCompare(right, 'ja');
  });
};

/**
 * 旧形式の評価タスク群をまとめるためのキーを返す
 * @param {Object} task - 巡回タスク
 * @returns {string} グループキー
 */
const getLegacyEvaluationTaskGroupKey = (task) => {
  const taskMeta = getEvaluationPatrolTaskMeta(task);
  if (taskMeta.eventId) {
    return `event:${taskMeta.eventId}`;
  }

  const eventName = (task?.event_name || '').trim();
  const locationLabel = (task?.event_location || task?.location_text || '').trim();
  if (eventName || locationLabel) {
    return `name:${eventName}::${locationLabel}`;
  }

  return `task:${task?.id || 'unknown'}`;
};

/**
 * 旧形式の評価タスク（1項目1件）を画面表示上は1企画1件へまとめる
 * @param {Array} inputTasks - 巡回タスク一覧
 * @returns {Array} 画面表示用に整形した巡回タスク一覧
 */
const mergePatrolTasksForDisplay = (inputTasks) => {
  const tasks = Array.isArray(inputTasks) ? inputTasks : [];
  const groupedEvaluationTasks = new Map();
  const passthroughTasks = [];

  tasks.forEach((task) => {
    if (getPatrolTaskDisplayType(task) !== PATROL_TASK_DISPLAY_TYPES.EVALUATION) {
      passthroughTasks.push(task);
      return;
    }

    const itemNames = getEvaluationPatrolTaskItemNames(task);
    if (itemNames.length !== 1) {
      passthroughTasks.push(task);
      return;
    }

    const groupKey = getLegacyEvaluationTaskGroupKey(task);
    if (!groupedEvaluationTasks.has(groupKey)) {
      groupedEvaluationTasks.set(groupKey, []);
    }
    groupedEvaluationTasks.get(groupKey).push(task);
  });

  const mergedLegacyEvaluationTasks = Array.from(groupedEvaluationTasks.entries()).map(([groupKey, groupTasks]) => {
    if (!Array.isArray(groupTasks) || groupTasks.length <= 1) {
      return groupTasks?.[0] || null;
    }

    const latestTask = groupTasks.slice().sort((left, right) => {
      return new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0);
    })[0];

    const taskMeta = groupTasks.reduce(
      (accumulator, task) => {
        const nextMeta = getEvaluationPatrolTaskMeta(task);
        return {
          eventId: accumulator.eventId || nextMeta.eventId || '',
          organizationName: accumulator.organizationName || nextMeta.organizationName || '',
        };
      },
      { eventId: '', organizationName: '' }
    );

    const mergedItemNames = sortEvaluationItemNames(
      groupTasks.flatMap((task) => getEvaluationPatrolTaskItemNames(task))
    );

    const evaluationTaskIdByItem = {};
    groupTasks.forEach((task) => {
      getEvaluationPatrolTaskItemNames(task).forEach((itemName) => {
        if (!evaluationTaskIdByItem[itemName]) {
          evaluationTaskIdByItem[itemName] = task.id;
        }
      });
    });

    const assignedUsers = [...new Set(groupTasks.map((task) => task.assigned_to).filter(Boolean))];
    const statusPriority = [
      PATROL_TASK_STATUSES.EN_ROUTE,
      PATROL_TASK_STATUSES.ACCEPTED,
      PATROL_TASK_STATUSES.OPEN,
      PATROL_TASK_STATUSES.CANCELED,
      PATROL_TASK_STATUSES.DONE,
    ];
    const mergedStatus =
      statusPriority.find((status) => groupTasks.some((task) => task.task_status === status)) ||
      latestTask.task_status;

    return {
      ...latestTask,
      id: `evaluation-group:${groupKey}`,
      notes: buildEvaluationPatrolTaskNotes({
        items: mergedItemNames,
        eventId: taskMeta.eventId,
        organizationName: taskMeta.organizationName,
      }),
      task_status: mergedStatus,
      assigned_to: assignedUsers.length === 1 ? assignedUsers[0] : assignedUsers[0] || null,
      accepted_at:
        groupTasks
          .map((task) => task.accepted_at)
          .filter(Boolean)
          .sort((left, right) => new Date(right) - new Date(left))[0] || null,
      done_at:
        groupTasks
          .map((task) => task.done_at)
          .filter(Boolean)
          .sort((left, right) => new Date(right) - new Date(left))[0] || null,
      evaluationTaskIds: groupTasks.map((task) => task.id),
      evaluationTaskIdByItem,
      isLegacyEvaluationGroup: true,
    };
  }).filter(Boolean);

  return [...passthroughTasks, ...mergedLegacyEvaluationTasks].sort((left, right) => {
    return new Date(right.created_at || 0) - new Date(left.created_at || 0);
  });
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
  /** 画面幅（レスポンシブ対応用） */
  const { width: windowWidth } = useWindowDimensions();
  /** スマホ幅かどうか（768px 未満） */
  const isMobile = windowWidth < 768;
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
  /** タスクタブ全体のスクロール参照 */
  const patrolScrollViewRef = useRef(null);
  /** タスク詳細セクションのY座標 */
  const [taskDetailSectionY, setTaskDetailSectionY] = useState(0);
  /** 一覧選択後に詳細へ自動スクロールするか */
  const [shouldScrollToTaskDetail, setShouldScrollToTaskDetail] = useState(false);

  /* ---- タスク詳細関連 ---- */
  const [taskResults, setTaskResults] = useState([]);
  const [isLoadingTaskResults, setIsLoadingTaskResults] = useState(false);
  const [sourceMessages, setSourceMessages] = useState([]);
  const [isLoadingSourceMessages, setIsLoadingSourceMessages] = useState(false);
  const [patrolMemo, setPatrolMemo] = useState('');
  const [evaluationInputs, setEvaluationInputs] = useState({});
  const [evaluationSummaryMemo, setEvaluationSummaryMemo] = useState('');
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
  /** 団体別企画一覧（events ベースの統一企画マスタ） */
  const [organizationEvents, setOrganizationEvents] = useState([]);
  /** 団体別企画一覧読み込み中フラグ */
  const [isLoadingOrganizationEvents, setIsLoadingOrganizationEvents] = useState(false);
  /** 団体候補検索テキスト */
  const [organizationEventSearch, setOrganizationEventSearch] = useState('');
  /** 選択中団体名 */
  const [selectedOrganizationEvent, setSelectedOrganizationEvent] = useState(ALL_ORGANIZATION_EVENT_FILTER);
  /** 団体候補表示フラグ */
  const [isOrganizationEventDropdownOpen, setIsOrganizationEventDropdownOpen] = useState(false);

  /* ---- 施錠確認サマリー関連 ---- */
  /** 巡回サポートに施錠確認サマリーを表示するか（AsyncStorage 設定） */
  const [showLockCheckInPatrol, setShowLockCheckInPatrol] = useState(false);
  /** 本日貸出中の鍵一覧（施錠確認進捗計算用） */
  const [todayKeyLoans, setTodayKeyLoans] = useState([]);

  /* ---- 巡回中フラグ ---- */
  /** 現在巡回中かどうか（本部ダッシュボードに表示される） */
  const [isOnPatrol, setIsOnPatrol] = useState(false);
  /** 巡回中フラグ更新中フラグ */
  const [isUpdatingPatrolStatus, setIsUpdatingPatrolStatus] = useState(false);
  /** 初回読込より手動トグルを優先するためのフラグ */
  const hasTouchedPatrolStatusRef = useRef(false);

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

  /** 通常の巡回タスク一覧（評価タスクを除く） */
  const regularTasks = useMemo(() => {
    return tasks.filter((task) => getPatrolTaskDisplayType(task) !== PATROL_TASK_DISPLAY_TYPES.EVALUATION);
  }, [tasks]);

  /** 評価タスク一覧 */
  const evaluationTasks = useMemo(() => {
    return tasks.filter((task) => getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION);
  }, [tasks]);

  /** 選択中評価タスクの評価項目一覧 */
  const selectedEvaluationItemNames = useMemo(() => {
    if (!selectedTask || getPatrolTaskDisplayType(selectedTask) !== PATROL_TASK_DISPLAY_TYPES.EVALUATION) {
      return [];
    }

    return getEvaluationPatrolTaskItemNames(selectedTask);
  }, [selectedTask?.id, selectedTask?.notes]);

  /** 選択中タスクに紐づく実タスクID一覧 */
  const selectedTaskIds = useMemo(() => {
    if (Array.isArray(selectedTask?.evaluationTaskIds) && selectedTask.evaluationTaskIds.length > 0) {
      return selectedTask.evaluationTaskIds;
    }

    return selectedTask?.id ? [selectedTask.id] : [];
  }, [selectedTask?.id, selectedTask?.evaluationTaskIds]);

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

    const nextTasks = mergePatrolTasksForDisplay(data || []);
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
   * 一覧からタスクを選択し、詳細セクションへの移動を予約する
   * @param {string} taskId - 選択したタスクID
   * @returns {void}
   */
  const handleSelectTask = (taskId) => {
    setSelectedTaskId(taskId);
    setShouldScrollToTaskDetail(true);
  };

  /**
   * 評価項目の点数を更新
   * @param {string} itemName - 評価項目名
   * @param {number} score - 点数
   * @returns {void}
   */
  const handleChangeEvaluationScore = (itemName, score) => {
    setEvaluationInputs((prev) => ({
      ...prev,
      [itemName]: {
        ...(prev[itemName] || {}),
        score,
      },
    }));
  };

  /**
   * 評価項目のコメントを更新
   * @param {string} itemName - 評価項目名
   * @param {string} comment - コメント
   * @returns {void}
   */
  const handleChangeEvaluationComment = (itemName, comment) => {
    setEvaluationInputs((prev) => ({
      ...prev,
      [itemName]: {
        ...(prev[itemName] || {}),
        comment,
      },
    }));
  };

  /**
   * タスク結果一覧取得
   * @param {string|null} taskId - タスクID
   * @returns {Promise<void>} 取得処理
   */
  const loadTaskResults = async (taskId, taskIds = []) => {
    const normalizedTaskIds = [taskId, ...(Array.isArray(taskIds) ? taskIds : [])].filter(Boolean);
    if (normalizedTaskIds.length === 0) {
      setTaskResults([]);
      return;
    }

    setIsLoadingTaskResults(true);
    const { data, error } = await listPatrolTaskResults({ taskId, taskIds });
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
   * 巡回中フラグをトグルする
   * ON にすると本部ダッシュボードに「巡回中」として名前が表示される
   * @returns {Promise<void>} 更新処理
   */
  const handleTogglePatrolStatus = async () => {
    if (!user?.id || isUpdatingPatrolStatus) {
      return;
    }

    hasTouchedPatrolStatusRef.current = true;
    /** 切り替え後の値 */
    const nextValue = !isOnPatrol;
    setIsUpdatingPatrolStatus(true);
    const { error } = await updatePatrolStatus(user.id, nextValue);
    setIsUpdatingPatrolStatus(false);

    if (error) {
      showToast('巡回中ステータスの更新に失敗しました', 'error');
      return;
    }

    setIsOnPatrol(nextValue);
    showToast(nextValue ? '巡回開始しました（本部に通知されます）' : '巡回終了しました');
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

    const groupedTaskIds =
      Array.isArray(selectedTask.evaluationTaskIds) && selectedTask.evaluationTaskIds.length > 1
        ? selectedTask.evaluationTaskIds
        : [];

    setIsSubmitting(true);
    const { error } =
      groupedTaskIds.length > 0
        ? await acceptPatrolTaskGroup({
            taskIds: groupedTaskIds,
            patrolUserId: user.id,
          })
        : await acceptPatrolTask({
            taskId: selectedTask.id,
            patrolUserId: user.id,
          });

    if (!error && groupedTaskIds.length === 0 && selectedTask.source_ticket_id) {
      await createTicketMessage({
        ticketId: selectedTask.source_ticket_id,
        authorId: user.id,
        body: getGoMessageByTask(selectedTask),
      });
    }

    setIsSubmitting(false);

    if (error) {
      showToast(error.message || '受諾処理に失敗しました', 'error');
      return;
    }

    await Promise.all([
      loadTasks(selectedTask.id),
      loadTaskResults(selectedTask.id, selectedTask.evaluationTaskIds || []),
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

    const taskLabel = getTaskTypeLabel(selectedTask);
    const resultLabel = RESULT_LABELS[resultCode] || resultCode;
    const isEvaluationTask =
      getPatrolTaskDisplayType(selectedTask) === PATROL_TASK_DISPLAY_TYPES.EVALUATION;
    let completionMemo = patrolMemo;
    const groupedTaskIds =
      isEvaluationTask && Array.isArray(selectedTask.evaluationTaskIds) && selectedTask.evaluationTaskIds.length > 1
        ? selectedTask.evaluationTaskIds
        : [];

    if (isEvaluationTask) {
      if (selectedEvaluationItemNames.length === 0) {
        showToast('評価項目が設定されていません', 'error');
        return;
      }

      if (selectedEvaluationItemNames.some((itemName) => !Number(evaluationInputs[itemName]?.score || 0))) {
        showToast('すべての評価項目に点数を入力してください', 'error');
        return;
      }

      completionMemo = buildEvaluationCompletionMemo({
        itemNames: selectedEvaluationItemNames,
        inputs: evaluationInputs,
        summaryMemo: evaluationSummaryMemo,
      });
    }

    setIsSubmitting(true);
    const { error } =
      groupedTaskIds.length > 0
        ? await completePatrolTaskGroup({
            taskIds: groupedTaskIds,
            patrolUserId: user.id,
            resultCode,
            memosByTaskId: selectedEvaluationItemNames.reduce((accumulator, itemName) => {
              const taskId = selectedTask.evaluationTaskIdByItem?.[itemName];
              if (taskId) {
                accumulator[taskId] = buildEvaluationCompletionMemo({
                  itemNames: [itemName],
                  inputs: evaluationInputs,
                  summaryMemo: evaluationSummaryMemo,
                });
              }
              return accumulator;
            }, {}),
          })
        : await completePatrolTask({
            taskId: selectedTask.id,
            patrolUserId: user.id,
            resultCode,
            memo: completionMemo,
            taskType: selectedTask.task_type,
            sourceTicketId: selectedTask.source_ticket_id,
            sourceKeyLoanId: selectedTask.source_key_loan_id,
          });
    setIsSubmitting(false);

    if (error) {
      showToast(error.message || '完了処理に失敗しました', 'error');
      return;
    }

    if (isEvaluationTask) {
      setEvaluationInputs({});
      setEvaluationSummaryMemo('');
    } else {
      setPatrolMemo('');
    }
    await Promise.all([
      loadTasks(selectedTask.id),
      loadTaskResults(selectedTask.id, selectedTask.evaluationTaskIds || []),
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

  /**
   * 割り当てられたタスクを拒否する
   * assigned_to を null にリセットし、タスクを未割当に戻す
   * @returns {Promise<void>} 実行処理
   */
  const handleRejectTask = async () => {
    if (!selectedTask || !user?.id) {
      showToast('タスクまたはログイン情報が不足しています', 'error');
      return;
    }
    if (selectedTask.assigned_to !== user.id) {
      showToast('自分に割り当てられたタスクのみ拒否できます', 'error');
      return;
    }

    setIsSubmitting(true);
    const groupedTaskIds =
      Array.isArray(selectedTask.evaluationTaskIds) && selectedTask.evaluationTaskIds.length > 1
        ? selectedTask.evaluationTaskIds
        : [];
    const { error } =
      groupedTaskIds.length > 0
        ? await assignPatrolTaskGroup({
            taskIds: groupedTaskIds,
            assignedTo: null,
          })
        : await assignPatrolTask({
            taskId: selectedTask.id,
            assignedTo: null,
            actorUserId: user.id,
          });
    setIsSubmitting(false);

    if (error) {
      showToast(error.message || '拒否処理に失敗しました', 'error');
      return;
    }

    await loadTasks(selectedTask.id);
    showToast('タスクを拒否しました（未割当に戻しました）');
  };

  /** 自分のタスクまたは未割当かどうか */
  const isMineOrUnassigned = useMemo(
    () =>
      selectedTask != null &&
      (!selectedTask.assigned_to || selectedTask.assigned_to === user?.id),
    [selectedTask, user?.id]
  );

  /**
   * 自分が現在受諾中/移動中のタスクが種別問わず存在するか
   * 未割当タスクへの「行きます」可否判定に使用する
   */
  const hasAnyActiveTask = useMemo(() => {
    if (!user?.id) {
      return false;
    }
    return tasks.some(
      (task) =>
        task.id !== selectedTask?.id &&
        task.assigned_to === user.id &&
        [PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(task.task_status)
    );
  }, [tasks, selectedTask?.id, user?.id]);

  /**
   * 受諾可能かどうか（＝「向かいます」ボタンを押せるか）
   * - OPENのタスクのみが対象（ACCEPTED/EN_ROUTE は既に受諾済みのため不可）
   * - 自分に割り当て済み／未割当: 他にアクティブタスクがなければ受諾可
   * - 他者に割り当て済み: 受諾不可
   */
  const canAccept = useMemo(() => {
    if (!selectedTask) {
      return false;
    }
    /** 向かいます対象はOPEN状態のみ（既に受諾済みのタスクは再受諾させない） */
    if (selectedTask.task_status !== PATROL_TASK_STATUSES.OPEN) {
      return false;
    }
    /** 自分が担当者の場合でも他にアクティブタスクがあれば受諾不可 */
    if (selectedTask.assigned_to === user?.id) {
      return !hasAnyActiveTask;
    }
    /** 未割当の場合は種別問わずアクティブタスクがなければ受諾可 */
    if (!selectedTask.assigned_to) {
      return !hasAnyActiveTask;
    }
    /** 他者が担当者の場合は受諾不可 */
    return false;
  }, [selectedTask, user?.id, hasAnyActiveTask]);

  /**
   * 完了可能かどうか（自分担当または未割当のアクティブタスクのみ）
   * 他にアクティブタスクを持っている場合は、選択中タスクがOPEN状態であれば操作不可
   * （ACCEPTED/EN_ROUTE の場合は hasAnyActiveTask がそのタスクを除外するため影響なし）
   */
  const canComplete = useMemo(
    () =>
      selectedTask != null &&
      isMineOrUnassigned &&
      !hasAnyActiveTask &&
      [PATROL_TASK_STATUSES.OPEN, PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(
        selectedTask.task_status
      ),
    [selectedTask, isMineOrUnassigned, hasAnyActiveTask]
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
    const loadPatrolStatus = async () => {
      if (!user?.id) {
        setIsOnPatrol(false);
        return;
      }

      hasTouchedPatrolStatusRef.current = false;
      const { profile, error } = await selectUserProfile(user.id);
      if (error) {
        console.error('巡回中ステータスの取得に失敗:', error);
        return;
      }

      if (!hasTouchedPatrolStatusRef.current) {
        setIsOnPatrol(Boolean(profile?.on_patrol));
      }
    };

    loadPatrolStatus();
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

  /**
   * 最新の selectedTaskId を Ref で保持する
   * Realtime コールバック内から deps を増やさずに参照するため
   */
  const selectedTaskIdRef = useRef(selectedTaskId);
  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  /**
   * patrol_tasks の Realtime 購読
   * INSERT / UPDATE / DELETE が発生した瞬間にタスク一覧を再取得する
   * selectedTaskId が変わってもチャネルを再接続しないよう Ref 経由で参照する
   */
  useEffect(() => {
    if (!user?.id) {
      return () => {};
    }

    const supabase = getSupabaseClient();
    /** 画面単位の購読チャネル名（ユーザーIDで一意化） */
    const channel = supabase.channel(`patrol_tasks_item12_${user.id}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'patrol_tasks' },
      () => {
        /** Ref 経由で最新の selectedTaskId を参照し、選択中タスクを維持しながら再取得 */
        loadTasks(selectedTaskIdRef.current);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  /**
   * 画面フォーカス復帰時・アプリ復帰時にタスク一覧を再取得する
   * Realtime 接続が切れていた間の変更を確実に取り込む
   * こちらも Ref 経由で selectedTaskId を参照し不要な再登録を防ぐ
   */
  useEffect(() => {
    if (!user?.id) {
      return () => {};
    }

    /** フォーカス復帰時の再取得ハンドラ */
    const handleFocus = () => {
      loadTasks(selectedTaskIdRef.current);
    };

    /** ナビゲーションフォーカスイベント */
    const unsubscribeFocus = navigation?.addListener?.('focus', handleFocus) || (() => {});

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      /** Web: タブ/ウィンドウがアクティブに戻ったときに再取得 */
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          loadTasks(selectedTaskIdRef.current);
        }
      };
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        unsubscribeFocus();
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    /** ネイティブ: アプリがフォアグラウンドに戻ったときに再取得 */
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadTasks(selectedTaskIdRef.current);
      }
    });

    return () => {
      unsubscribeFocus();
      appStateSubscription.remove();
    };
  }, [user?.id, navigation]);

  /**
   * フォールバックポーリング（60秒）
   * RLS の設定によっては Realtime が届かない場合があるため、
   * 念のため低頻度で再取得し変更の取り逃しを防ぐ
   */
  useEffect(() => {
    const interval = setInterval(() => {
      loadTasks(selectedTaskIdRef.current);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * 現在のタブに表示するタスクだけが選択されるように補正する
   */
  useEffect(() => {
    if (![PATROL_TAB_TYPES.TASKS, PATROL_TAB_TYPES.EVALUATION].includes(activeTab)) {
      return;
    }

    const visibleTasks =
      activeTab === PATROL_TAB_TYPES.EVALUATION ? evaluationTasks : regularTasks;

    if (visibleTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    if (!visibleTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(visibleTasks[0].id);
    }
  }, [activeTab, evaluationTasks, regularTasks, selectedTaskId]);

  const selectedTaskIdsKey = useMemo(() => selectedTaskIds.join(','), [selectedTaskIds]);

  useEffect(() => {
    loadTaskResults(selectedTask?.id || null, selectedTask?.evaluationTaskIds || []);
  }, [selectedTask?.id, selectedTaskIdsKey]);

  /**
   * 評価タスクを切り替えたら入力状態を対象項目に合わせて初期化する
   */
  useEffect(() => {
    if (!selectedTask || getPatrolTaskDisplayType(selectedTask) !== PATROL_TASK_DISPLAY_TYPES.EVALUATION) {
      setEvaluationInputs({});
      setEvaluationSummaryMemo('');
      return;
    }

    setEvaluationInputs((previousInputs) => {
      const nextInputs = {};
      selectedEvaluationItemNames.forEach((itemName) => {
        nextInputs[itemName] = {
          score: previousInputs[itemName]?.score || '',
          comment: previousInputs[itemName]?.comment || '',
        };
      });
      return nextInputs;
    });
    setEvaluationSummaryMemo('');
  }, [selectedEvaluationItemNames, selectedTask?.id]);

  /**
   * タスク一覧で選んだ項目の詳細まで自動スクロールする
   */
  useEffect(() => {
    if (
      ![PATROL_TAB_TYPES.TASKS, PATROL_TAB_TYPES.EVALUATION].includes(activeTab) ||
      !shouldScrollToTaskDetail ||
      !selectedTask?.id ||
      taskDetailSectionY <= 0
    ) {
      return;
    }

    const timerId = setTimeout(() => {
      patrolScrollViewRef.current?.scrollTo({
        y: Math.max(taskDetailSectionY - 12, 0),
        animated: true,
      });
      setShouldScrollToTaskDetail(false);
    }, 60);

    return () => {
      clearTimeout(timerId);
    };
  }, [activeTab, selectedTask?.id, shouldScrollToTaskDetail, taskDetailSectionY]);

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

  /**
   * AsyncStorage から施錠確認サマリー表示設定を読み込む
   * HQKeyManagementPanel でONにした場合に巡回サポートにもサマリーを表示する
   */
  useEffect(() => {
    const loadLockCheckSetting = async () => {
      try {
        const value = await AsyncStorage.getItem(ASYNC_KEY_SHOW_LOCK_CHECK_IN_PATROL);
        setShowLockCheckInPatrol(value === '1');
      } catch (e) {
        console.warn('施錠確認設定の読み込みに失敗:', e);
      }
    };
    loadLockCheckSetting();
  }, []);

  /**
   * AsyncStorage から未巡回アラート閾値を読み込む
   * 閾値は本部（SupportDeskScreen）が設定し、巡回サポートは読み取り専用として表示のみ行う
   */
  useEffect(() => {
    const loadAlertMinutes = async () => {
      try {
        const value = await AsyncStorage.getItem(ASYNC_KEY_UNVISITED_ALERT_MINUTES);
        const parsed = value ? parseInt(value, 10) : null;
        if (Number.isFinite(parsed) && parsed > 0) {
          setUnvisitedAlertMinutes(parsed);
        }
      } catch (e) {
        console.warn('未巡回アラート閾値の読み込みに失敗:', e);
      }
    };
    loadAlertMinutes();
  }, []);

  /**
   * showLockCheckInPatrol が ON の場合に本日貸出中の鍵一覧を取得する
   */
  useEffect(() => {
    if (!showLockCheckInPatrol) {
      return;
    }
    const loadTodayKeyLoans = async () => {
      const { data } = await listKeyLoans({ status: 'loaned', limit: 200 });
      if (data) {
        /** 本日（当日）の貸出のみを抽出 */
        const todayStr = new Date().toDateString();
        setTodayKeyLoans(
          data.filter(
            (loan) => new Date(loan.loaned_at || loan.created_at).toDateString() === todayStr
          )
        );
      }
    };
    loadTodayKeyLoans();
  }, [showLockCheckInPatrol]);

  /**
   * 本日貸出分の施錠確認進捗（完了本数・合計本数・%）
   */
  const todayLockCheckProgress = useMemo(() => {
    /** 完了済み（locked / confirmed）の件数 */
    const completed = todayKeyLoans.filter((loan) =>
      ['locked', 'confirmed'].includes(loan.lock_check_status)
    );
    const total = todayKeyLoans.length;
    return {
      total,
      completed: completed.length,
      percent: total > 0 ? Math.round((completed.length / total) * 100) : 0,
    };
  }, [todayKeyLoans]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
      <OfflineBanner />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── タブコンテンツ ── */}
        <ScrollView
          ref={patrolScrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        >
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
            <View style={[dashboardStyles.card, { backgroundColor: theme.surface }]}>
              {/* 巡回中トグル */}
              <Pressable
                style={[
                  dashboardStyles.patrolToggle,
                  {
                    backgroundColor: isOnPatrol
                      ? `${theme.success || '#22c55e'}18`
                      : theme.background,
                  },
                ]}
                onPress={handleTogglePatrolStatus}
                disabled={isUpdatingPatrolStatus}
              >
                <View style={dashboardStyles.patrolToggleLeft}>
                  <View
                    style={[
                      dashboardStyles.patrolToggleDot,
                      {
                        backgroundColor: isOnPatrol ? theme.success || '#22c55e' : theme.border,
                      },
                    ]}
                  />
                  <View>
                    <Text
                      style={[
                        dashboardStyles.patrolToggleLabel,
                        { color: isOnPatrol ? theme.success || '#22c55e' : theme.text },
                      ]}
                    >
                      {isOnPatrol ? '巡回中' : '巡回していない'}
                    </Text>
                    <Text style={[dashboardStyles.patrolToggleHint, { color: theme.textSecondary }]}>
                      {isOnPatrol ? '本部ダッシュボードに表示中' : 'タップして巡回開始を通知'}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    dashboardStyles.patrolToggleButton,
                    isOnPatrol
                      ? { backgroundColor: theme.success || '#22c55e', color: '#FFFFFF' }
                      : { backgroundColor: theme.border, color: theme.text },
                  ]}
                >
                  {isUpdatingPatrolStatus ? '...' : isOnPatrol ? 'OFF' : 'ON'}
                </Text>
              </Pressable>

              <View style={dashboardStyles.header}>
                <View style={dashboardStyles.headerTextBlock}>
                  <Text style={[dashboardStyles.title, { color: theme.text }]}>ダッシュボード</Text>
                  <Text style={[dashboardStyles.helpText, { color: theme.textSecondary }]}>
                    {PATROL_TAB_DESCRIPTIONS[PATROL_TAB_TYPES.DASHBOARD]}
                  </Text>
                </View>
                <Pressable
                  style={[dashboardStyles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                  onPress={async () => {
                    await Promise.all([
                      loadTasks(selectedTaskId),
                      refreshPatrolCheckData(),
                      loadMyHistory(),
                    ]);
                  }}
                >
                  <Text style={[dashboardStyles.refreshButtonText, { color: theme.primary }]}>
                    更新
                  </Text>
                </Pressable>
              </View>

              <View style={dashboardStyles.metricGrid}>
                {dashboardMetrics.map((metric) => {
                  /** メトリックカードの背景色（キー別） */
                  const metricBgColors = {
                    open: `${theme.primary}12`,
                    mine: `${theme.primary}1A`,
                    emergency: '#FEF2F2',
                    alert: '#FFFBEA',
                  };
                  /** メトリックカードの値カラー（キー別） */
                  const metricValueColors = {
                    open: theme.primary,
                    mine: theme.primary,
                    emergency: '#D1242F',
                    alert: '#BF6A02',
                  };
                  return (
                    <View
                      key={metric.key}
                      style={[
                        dashboardStyles.metricCard,
                        { backgroundColor: metricBgColors[metric.key] || theme.background },
                      ]}
                    >
                      <Text style={[dashboardStyles.metricValue, { color: metricValueColors[metric.key] || theme.text }]}>
                        {metric.value}
                      </Text>
                      <Text style={[dashboardStyles.metricLabel, { color: theme.text }]}>
                        {metric.label}
                      </Text>
                      <Text style={[dashboardStyles.metricHelper, { color: theme.textSecondary }]}>
                        {metric.helper}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View
                style={[
                  dashboardStyles.focusCard,
                  { borderLeftColor: theme.primary, backgroundColor: `${theme.primary}0D` },
                ]}
              >
                <Text style={[dashboardStyles.sectionLabel, { color: theme.textSecondary }]}>
                  次に見るべきタスク
                </Text>
                <Text style={[dashboardStyles.focusTitle, { color: theme.text }]}>
                  {selectedTask
                    ? selectedTask.event_name || getTaskTypeLabel(selectedTask) || '巡回タスク'
                    : 'タスクを選択してください'}
                </Text>
                <Text style={[dashboardStyles.focusBody, { color: theme.textSecondary }]}>
                  {selectedTask
                    ? `${getTaskTypeLabel(selectedTask)} / ${selectedTaskLocationLabel}`
                    : '下のタブでタスクを開くと、受諾と完了登録に進めます。'}
                </Text>
              </View>

              <View style={dashboardStyles.columnGroup}>
                <View
                  style={[
                    dashboardStyles.sectionCard,
                    { borderColor: theme.border, backgroundColor: theme.surface },
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
                    { borderColor: theme.border, backgroundColor: theme.surface },
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
                          {task.event_name || getTaskTypeLabel(task) || '巡回対応'}
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
              {/* 施錠確認サマリーカード（AsyncStorage 設定 ON のときのみ表示） */}
              {showLockCheckInPatrol && todayLockCheckProgress.total > 0 && (
                <View
                  style={[
                    lockCheckSummaryStyles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={[lockCheckSummaryStyles.title, { color: theme.textSecondary }]}>
                    本日の施錠確認
                  </Text>
                  <Text style={[lockCheckSummaryStyles.percent, { color: theme.text }]}>
                    {todayLockCheckProgress.percent}%
                  </Text>
                  <Text style={[lockCheckSummaryStyles.detail, { color: theme.textSecondary }]}>
                    {todayLockCheckProgress.completed}/{todayLockCheckProgress.total}本 完了
                  </Text>
                </View>
              )}
              <PatrolTaskList
                theme={theme}
                user={user}
                tasks={regularTasks}
                isLoadingTasks={isLoadingTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleSelectTask}
                onRefresh={() => loadTasks(selectedTaskId)}
              />

              {selectedTask && getPatrolTaskDisplayType(selectedTask) !== PATROL_TASK_DISPLAY_TYPES.EVALUATION ? (
                <View onLayout={(event) => setTaskDetailSectionY(event.nativeEvent.layout.y)}>
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
                    hasAnyActiveTask={hasAnyActiveTask}
                    canComplete={canComplete}
                    onAcceptTask={handleAcceptTask}
                    onRejectTask={handleRejectTask}
                    onCompleteTask={handleCompleteTask}
                    onSendMemoOnly={handleSendMemoOnly}
                    taskResults={taskResults}
                    isLoadingTaskResults={isLoadingTaskResults}
                    onRefreshTaskResults={() => loadTaskResults(selectedTask.id, selectedTask.evaluationTaskIds || [])}
                    sourceMessages={sourceMessages}
                    isLoadingSourceMessages={isLoadingSourceMessages}
                    onRefreshSourceMessages={() => loadSourceMessages(selectedTask.source_ticket_id)}
                    evaluationInputs={evaluationInputs}
                    onChangeEvaluationScore={handleChangeEvaluationScore}
                    onChangeEvaluationComment={handleChangeEvaluationComment}
                    evaluationSummaryMemo={evaluationSummaryMemo}
                    onChangeEvaluationSummaryMemo={setEvaluationSummaryMemo}
                  />
                </View>
              ) : null}
            </>
          )}

          {activeTab === PATROL_TAB_TYPES.EVALUATION && (
            <>
              <PatrolTaskList
                theme={theme}
                user={user}
                tasks={evaluationTasks}
                isLoadingTasks={isLoadingTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleSelectTask}
                onRefresh={() => loadTasks(selectedTaskId)}
                title="評価タスク一覧"
                subTitle="評価対象を選んで、そのまま評価入力と登録まで進みます。"
                searchPlaceholder="企画名・場所・評価項目で検索"
                emptyTitle="評価タスクはありません"
                emptyDescription="現在入力待ちの評価タスクはありません"
                defaultHelpText="評価タスクだけをまとめて確認できます。タップすると詳細と評価入力へ進みます。"
              />

              {selectedTask && getPatrolTaskDisplayType(selectedTask) === PATROL_TASK_DISPLAY_TYPES.EVALUATION ? (
                <View onLayout={(event) => setTaskDetailSectionY(event.nativeEvent.layout.y)}>
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
                    hasAnyActiveTask={hasAnyActiveTask}
                    canComplete={canComplete}
                    onAcceptTask={handleAcceptTask}
                    onRejectTask={handleRejectTask}
                    onCompleteTask={handleCompleteTask}
                    onSendMemoOnly={handleSendMemoOnly}
                    taskResults={taskResults}
                    isLoadingTaskResults={isLoadingTaskResults}
                    onRefreshTaskResults={() => loadTaskResults(selectedTask.id, selectedTask.evaluationTaskIds || [])}
                    sourceMessages={sourceMessages}
                    isLoadingSourceMessages={isLoadingSourceMessages}
                    onRefreshSourceMessages={() => loadSourceMessages(selectedTask.source_ticket_id)}
                    evaluationInputs={evaluationInputs}
                    onChangeEvaluationScore={handleChangeEvaluationScore}
                    onChangeEvaluationComment={handleChangeEvaluationComment}
                    evaluationSummaryMemo={evaluationSummaryMemo}
                    onChangeEvaluationSummaryMemo={setEvaluationSummaryMemo}
                  />
                </View>
              ) : null}
            </>
          )}

          {/* チェックタブ */}
          {activeTab === PATROL_TAB_TYPES.CHECK && (
            <>
              {/* チェックタブ内 巡回中トグル（コンパクト版） */}
              <Pressable
                style={[
                  dashboardStyles.patrolToggle,
                  {
                    backgroundColor: isOnPatrol
                      ? `${theme.success || '#22c55e'}18`
                      : theme.surface,
                  },
                ]}
                onPress={handleTogglePatrolStatus}
                disabled={isUpdatingPatrolStatus}
              >
                <View style={dashboardStyles.patrolToggleLeft}>
                  <View
                    style={[
                      dashboardStyles.patrolToggleDot,
                      {
                        backgroundColor: isOnPatrol ? theme.success || '#22c55e' : theme.border,
                      },
                    ]}
                  />
                  <View>
                    <Text
                      style={[
                        dashboardStyles.patrolToggleLabel,
                        { color: isOnPatrol ? theme.success || '#22c55e' : theme.text },
                      ]}
                    >
                      {isOnPatrol ? '巡回中' : '巡回していない'}
                    </Text>
                    <Text style={[dashboardStyles.patrolToggleHint, { color: theme.textSecondary }]}>
                      {isOnPatrol ? '本部ダッシュボードに表示中' : 'タップして巡回開始を通知'}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    dashboardStyles.patrolToggleButton,
                    isOnPatrol
                      ? { backgroundColor: theme.success || '#22c55e', color: '#FFFFFF' }
                      : { backgroundColor: theme.border, color: theme.text },
                  ]}
                >
                  {isUpdatingPatrolStatus ? '...' : isOnPatrol ? 'OFF' : 'ON'}
                </Text>
              </Pressable>

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

              {/* 定常巡回チェック: アラート閾値を超えた場所のみを表示（対応が必要な場所に絞る） */}
              <UnvisitedAlertList
                theme={theme}
                unvisitedLocations={unvisitedLocations.filter((loc) => loc.is_alert)}
                isLoadingUnvisitedLocations={isLoadingUnvisitedLocations}
                unvisitedAlertMinutes={unvisitedAlertMinutes}
                onRefresh={loadUnvisitedAlerts}
              />
            </>
          )}

          {/* 企画一覧タブ */}
        </ScrollView>

        {/* ── トースト通知（タブバーの上に浮かせる） ── */}
        <ToastMessage
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={hideToast}
        />

        {/* ── 下部タブバー（Segmented Control 風） ── */}
        <View style={[styles.bottomArea, isMobile && styles.bottomAreaMobile, { backgroundColor: theme.background }]}>
          <View style={[styles.tabSegment, { backgroundColor: `${theme.border}60` }]}>
            {PATROL_TABS.map((tab) => {
              /** アクティブタブかどうか */
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.tabSegmentItem,
                    isMobile && styles.tabSegmentItemMobile,
                    isActive && [
                      styles.tabSegmentItemActive,
                      { backgroundColor: theme.surface },
                    ],
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabSegmentIcon, isMobile && styles.tabSegmentIconMobile]}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.tabSegmentLabel,
                      isMobile && styles.tabSegmentLabelMobile,
                      { color: isActive ? theme.text : theme.textSecondary, fontWeight: isActive ? '700' : '500' },
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

/** 施錠確認サマリーカードスタイル */
const lockCheckSummaryStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  percent: {
    fontSize: 40,
    fontWeight: '800',
  },
  detail: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
});

/** ダッシュボードタブ専用スタイル */
const dashboardStyles = StyleSheet.create({
  /** ダッシュボード外枠カード */
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** 巡回中トグルカード: shadow で浮かせる */
  patrolToggle: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  patrolToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  /** 状態インジケーター（丸） */
  patrolToggleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  patrolToggleLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  patrolToggleHint: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  /** ON/OFF トグルボタン pill 形 */
  patrolToggleButton: {
    fontSize: 13,
    fontWeight: '700',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
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
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  helpText: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 更新ボタン */
  refreshButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: 'hidden',
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
  /** メトリックカード: Material FilledCard 風 */
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricHelper: {
    fontSize: 11,
    marginTop: 1,
  },
  /** フォーカスカード: 左アクセントボーダー付き */
  focusCard: {
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  focusTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  focusBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  columnGroup: {
    gap: 10,
  },
  /** セクションカード: OutlinedCard 風 */
  sectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  compactItem: {
    gap: 2,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  compactMeta: {
    fontSize: 12,
    lineHeight: 17,
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
  /** スマホ向け: 横余白を減らしてコンテンツを広く使う */
  contentMobile: {
    padding: 8,
    paddingBottom: 24,
    gap: 8,
  },
  /** 下部タブバーエリア */
  bottomArea: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  /** スマホ向けタブバーエリア: 余白を小さく */
  bottomAreaMobile: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 10,
  },
  /** Segmented Control 外枠 */
  tabSegment: {
    borderRadius: 12,
    flexDirection: 'row',
    padding: 4,
    gap: 3,
  },
  /** 各タブアイテム */
  tabSegmentItem: {
    flex: 1,
    borderRadius: 10,
    minHeight: 56,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  /** スマホ向けタブアイテム */
  tabSegmentItemMobile: {
    minHeight: 46,
    paddingVertical: 6,
    gap: 2,
  },
  /** アクティブタブ: 白カード + 影 */
  tabSegmentItemActive: {
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  /** タブアイコン */
  tabSegmentIcon: {
    fontSize: 17,
  },
  /** スマホ向けアイコン */
  tabSegmentIconMobile: {
    fontSize: 15,
  },
  /** タブラベル */
  tabSegmentLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  /** スマホ向けラベル */
  tabSegmentLabelMobile: {
    fontSize: 10,
  },
});

export default Item12Screen;
