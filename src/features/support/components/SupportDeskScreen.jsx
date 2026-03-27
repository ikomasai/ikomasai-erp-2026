/**
 * 対応者向け共通画面
 * 本部/会計/物品の連絡案件対応UI
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { getSupabaseClient } from '../../../services/supabase/client';
import {
  createTicketMessage,
  listTicketMessages,
  listTicketsForRole,
  SUPPORT_DESK_ROLE_TYPES,
  SUPPORT_TICKET_STATUSES,
  updateTicketStatus,
} from '../../../services/supabase/supportTicketService';
import HQKeyManagementPanel from './HQKeyManagementPanel';
import KeyMasterEditPanel from './KeyMasterEditPanel';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';
import OfflineBanner from '../../../shared/components/OfflineBanner';
import { createRadioLog, listRadioLogs } from '../../../services/supabase/radioLogService';
import {
  assignPatrolTask,
  listPatrolTasks,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import {
  EVALUATION_STATUSES,
  listEvaluationChecks,
  reviewEvaluationCheck,
} from '../../../services/supabase/evaluationService';
import { notifySupportTicketCreated } from '../../../shared/services/supportWorkflowNotificationService';
import {
  getRoles,
  getUserProfilesByIds,
  getUsersByRoles,
} from '../../../shared/services/notificationService';
import {
  createAttachmentSignedUrl,
  listTicketAttachments,
} from '../../../services/supabase/ticketAttachmentService';
import { selectOrganizationEvents } from '../../../services/supabase/organizationEventService';
import {
  selectPrizeDistributions,
  updatePrizeDistributionCriteria,
} from '../../../services/supabase/prizeDistributionService';
import { useManagedPushSubscription } from '../../notifications/hooks/useManagedPushSubscription';
import WebPushStatusCard from '../../notifications/components/WebPushStatusCard';
import {
  ALL_ORGANIZATION_EVENT_FILTER,
  buildOrganizationEventOptions,
  matchesOrganizationEventSearchKeyword,
  normalizeOrganizationEventSearchValue,
  ORGANIZATION_EVENT_OPTION_LIMIT,
} from '../../../shared/utils/organizationEventList';

/** ステータス表示名 */
const STATUS_LABELS = {
  [SUPPORT_TICKET_STATUSES.NEW]: '新規',
  [SUPPORT_TICKET_STATUSES.ACKNOWLEDGED]: '受領',
  [SUPPORT_TICKET_STATUSES.IN_PROGRESS]: '対応中',
  [SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL]: '外部待ち',
  [SUPPORT_TICKET_STATUSES.RESOLVED]: '解決済み',
  [SUPPORT_TICKET_STATUSES.CLOSED]: 'クローズ',
};

/** 種別表示名 */
const TICKET_TYPE_LABELS = {
  rule_question: '企画ルール変更',
  layout_change: '配置図変更',
  distribution_change: '商品配布基準変更',
  damage_report: '物品破損報告',
  emergency: '緊急呼び出し',
  key_preapply: '鍵の事前申請',
  start_report: '企画開始報告',
  end_report: '企画終了報告',
};

/** 会計対応向けステータス表示 */
const ACCOUNTING_STATUS_LABELS = {
  todo: '未対応',
  working: '対応中',
  done: '完了',
};

/** 会計対応向け状態フィルタ */
const ACCOUNTING_TICKET_STATUS_FILTERS = [
  { key: 'todo', label: '未対応' },
  { key: 'working', label: '対応中' },
  { key: 'done', label: '完了' },
];

/** 会計対応向けステータス更新候補 */
const ACCOUNTING_STATUS_OPTIONS = [
  { key: 'todo', label: ACCOUNTING_STATUS_LABELS.todo, status: SUPPORT_TICKET_STATUSES.ACKNOWLEDGED },
  { key: 'working', label: ACCOUNTING_STATUS_LABELS.working, status: SUPPORT_TICKET_STATUSES.IN_PROGRESS },
  { key: 'done', label: ACCOUNTING_STATUS_LABELS.done, status: SUPPORT_TICKET_STATUSES.RESOLVED },
];

/** 物品対応向け状態フィルタ */
const PROPERTY_TICKET_STATUS_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'todo', label: '未対応' },
  { key: 'working', label: '対応中' },
  { key: 'done', label: '対応済み' },
];

/** 物品対応向けステータス表示 */
const PROPERTY_STATUS_LABELS = {
  todo: '未対応',
  working: '対応中',
  done: '対応済み',
};

/** 物品対応向けステータス更新候補 */
const PROPERTY_STATUS_OPTIONS = [
  { key: 'todo', label: PROPERTY_STATUS_LABELS.todo, status: SUPPORT_TICKET_STATUSES.ACKNOWLEDGED },
  { key: 'working', label: PROPERTY_STATUS_LABELS.working, status: SUPPORT_TICKET_STATUSES.IN_PROGRESS },
  { key: 'done', label: PROPERTY_STATUS_LABELS.done, status: SUPPORT_TICKET_STATUSES.RESOLVED },
];

/**
 * 部署画面向けのステータス区分を返す
 * @param {string|null|undefined} status - 元ステータス
 * @returns {'todo'|'working'|'done'} 表示用ステータス
 */
const getDepartmentStatusBucket = (status) => {
  if (status === 'todo' || status === 'working' || status === 'done') {
    return status;
  }
  if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(status)) {
    return 'done';
  }
  if (
    [
      SUPPORT_TICKET_STATUSES.IN_PROGRESS,
      SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL,
    ].includes(status)
  ) {
    return 'working';
  }
  return 'todo';
};

/**
 * 画面用のステータス表示名を返す
 * @param {Object} ticket - 連絡案件
 * @param {string} roleType - 役割種別
 * @returns {string} 表示ラベル
 */
const getTicketStatusLabelForRole = (ticket, roleType) => {
  if (roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING) {
    return ACCOUNTING_STATUS_LABELS[getDepartmentStatusBucket(ticket?.ticket_status)] || ACCOUNTING_STATUS_LABELS.todo;
  }
  if (roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY) {
    return PROPERTY_STATUS_LABELS[getDepartmentStatusBucket(ticket?.ticket_status)] || PROPERTY_STATUS_LABELS.todo;
  }
  return STATUS_LABELS[ticket?.ticket_status] || ticket?.ticket_status || '-';
};

/**
 * 画面上の選択値を実際に保存するステータスへ変換する
 * @param {string} roleType - 役割種別
 * @param {string} nextValue - 画面上の選択値
 * @returns {string} 保存用ステータス
 */
const resolveNextTicketStatus = (roleType, nextValue) => {
  if (roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING) {
    const matched = ACCOUNTING_STATUS_OPTIONS.find((option) => option.key === nextValue);
    return matched?.status || nextValue;
  }
  if (roleType !== SUPPORT_DESK_ROLE_TYPES.PROPERTY) {
    return nextValue;
  }
  const matched = PROPERTY_STATUS_OPTIONS.find((option) => option.key === nextValue);
  return matched?.status || nextValue;
};

/**
 * 部署画面の初期ステータスフィルタを返す
 * @param {string} roleType - 役割種別
 * @returns {string} 初期フィルタキー
 */
const getDefaultDepartmentStatusFilter = (roleType) => {
  if (roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING) {
    return ACCOUNTING_TICKET_STATUS_FILTERS[0].key;
  }
  if (roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY) {
    return PROPERTY_TICKET_STATUS_FILTERS[0].key;
  }
  return 'all';
};

/** AsyncStorageキープレフィックス: 最終閲覧時刻の保存に使用 */
const LAST_VIEWED_KEY_PREFIX = 'supportDesk_lastViewedAt_';

/**
 * 最終閲覧時刻を保存するAsyncStorageキーを生成
 * @param {string} roleType - 役割種別
 * @returns {string} AsyncStorageキー
 */
const buildLastViewedKey = (roleType) => `${LAST_VIEWED_KEY_PREFIX}${roleType}`;

/**
 * チケットが未読かどうかを判定
 * @param {Object} ticket - チケットオブジェクト
 * @param {number|null} lastViewedAtMs - 最終閲覧時刻（ミリ秒）
 * @returns {boolean} 未読かどうか
 */
const isTicketUnread = (ticket, lastViewedAtMs) => {
  if (lastViewedAtMs === null) {
    return false;
  }
  const updatedAtMs = new Date(ticket.updated_at).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }
  return updatedAtMs > lastViewedAtMs;
};

const PATROL_TASK_STATUS_LABELS = {
  open: '未対応',
  accepted: '受諾',
  en_route: '移動中',
  done: '完了',
  canceled: '取消',
};

const PATROL_TASK_TYPE_LABELS = {
  confirm_start: '企画開始確認',
  confirm_end: '企画終了確認',
  lock_check: '施錠確認',
  emergency_support: '緊急対応',
  routine_patrol: '定常巡回',
  other: 'その他',
};

const EVALUATION_STATUS_LABELS = {
  [EVALUATION_STATUSES.PENDING]: '承認待ち',
  [EVALUATION_STATUSES.APPROVED]: '承認済み',
  [EVALUATION_STATUSES.REJECTED]: '却下',
  [EVALUATION_STATUSES.REWORK]: '差戻し',
};

const PATROL_ROLE_NAMES = ['企画管理部'];

/** 部署向けステータス変更ボタンの配色 */
const DEPARTMENT_STATUS_TONES = {
  todo: {
    borderColor: '#BF6A02',
    backgroundColor: '#FFF1E5',
  },
  working: {
    borderColor: '#0969DA',
    backgroundColor: '#EAF2FF',
  },
  done: {
    borderColor: '#1A7F37',
    backgroundColor: '#EAF8ED',
  },
};

/** 概況ダッシュボード: 企画報告セクションの種別フィルター */
const OVERVIEW_REPORT_TYPE_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'confirm_start', label: '開始確認' },
  { key: 'confirm_end', label: '終了確認' },
];

/** 概況ダッシュボード: 企画報告セクションのステータスフィルター */
const OVERVIEW_STATUS_FILTERS = [
  { key: 'active', label: '対応中' },
  { key: 'all', label: 'すべて' },
  { key: 'done', label: '完了済み' },
];

/** 概況ダッシュボード: 施錠確認セクションの担当フィルター */
const OVERVIEW_LOCK_ASSIGNEE_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'assigned', label: '担当あり' },
  { key: 'unassigned', label: '担当なし' },
];

/** 概況ダッシュボード: 施錠確認セクションの確認状況フィルター */
const OVERVIEW_LOCK_CONFIRMATION_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'confirmed', label: '確認済み' },
  { key: 'unconfirmed', label: '未確認' },
];

/** 巡回タスクステータス別カラー（バッジ・左ボーダーで使用） */
const PATROL_STATUS_BADGE_COLORS = {
  open: '#57606A',
  accepted: '#0969DA',
  en_route: '#BF6A02',
  done: '#1A7F37',
  canceled: '#8C8C8C',
};

/** 無線ログのカテゴリ選択肢 */
const RADIO_LOG_CATEGORIES = [
  { key: 'emergency', label: '緊急対応' },
  { key: 'patrol', label: '巡回報告' },
  { key: 'lock', label: '施錠確認' },
  { key: 'other', label: 'その他' },
];

/** 景品配布基準: 全団体を表す選択値 */
const ALL_PRIZE_ORGANIZATIONS = '__all__';

/** 景品配布基準: 団体候補の最大表示件数 */
const PRIZE_ORGANIZATION_OPTION_LIMIT = 24;

/** 経過時間アラート閾値（分） */
const ELAPSED_WARNING_MINUTES = 15;
const ELAPSED_DANGER_MINUTES = 30;

/** HQロール向けタブ定義 */
const HQ_TABS = [
  { key: 'overview', label: '📊 概況確認' },
  { key: 'keys', label: '🔑 鍵管理' },
  { key: 'tickets', label: '📋 連絡案件' },
  { key: 'patrol', label: '🚶 巡回・評価' },
  { key: 'radio', label: '📡 無線' },
  { key: 'event_orgs', label: '🏢 企画一覧' },
  { key: 'master', label: '⚙️ 鍵マスタ' },
];

/** HQタブのデフォルト */
const HQ_TAB_DEFAULT = 'keys';

/** 経過時間アラート色 */
const ELAPSED_COLORS = {
  normal: null,
  warning: '#9F6E00',
  danger: '#D1242F',
};

/** メッセージ送信者ロール別色 */
const MESSAGE_ROLE_COLORS = {
  self: '#0969DA',
  hq: '#0969DA',
  exhibitor: '#1A7F37',
  accounting: '#BF6A02',
  property: '#8250DF',
  other: '#57606A',
};

/**
 * 経過時間（分）を表示文字列に変換
 * @param {number} minutes - 経過分数
 * @returns {string} 表示文字列
 */
const formatElapsedMinutes = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return '-';
  }
  if (minutes < 60) {
    return `${Math.floor(minutes)}分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = Math.floor(minutes % 60);
  return `${hours}時間${remainMinutes}分`;
};

/**
 * 経過時間に応じたアラート色を返す
 * @param {string} createdAt - 作成日時文字列
 * @param {string} ticketStatus - チケットステータス
 * @returns {{color: string|null, elapsedMinutes: number}} アラート色と経過分数
 */
const getElapsedAlertInfo = (createdAt, ticketStatus) => {
  /** 解決済み/クローズ済みはアラートなし */
  if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(ticketStatus)) {
    return { color: null, elapsedMinutes: 0 };
  }
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return { color: null, elapsedMinutes: 0 };
  }
  const elapsedMinutes = (Date.now() - createdAtMs) / (60 * 1000);
  if (elapsedMinutes >= ELAPSED_DANGER_MINUTES) {
    return { color: ELAPSED_COLORS.danger, elapsedMinutes };
  }
  if (elapsedMinutes >= ELAPSED_WARNING_MINUTES) {
    return { color: ELAPSED_COLORS.warning, elapsedMinutes };
  }
  return { color: ELAPSED_COLORS.normal, elapsedMinutes };
};

const normalizeText = (value) => (value || '').trim();
const formatFileSize = (fileSizeBytes) => {
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size < 0) {
    return '-';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

/**
 * Realtimeイベントから連絡案件IDを抽出する
 * support_tickets は id、ticket_messages / ticket_attachments は ticket_id を参照する
 * @param {Object} payload - Realtimeイベントペイロード
 * @returns {string} 連絡案件ID
 */
const extractTicketIdFromRealtimePayload = (payload) => {
  return normalizeText(
    payload?.new?.ticket_id ||
      payload?.new?.id ||
      payload?.old?.ticket_id ||
      payload?.old?.id
  );
};

/**
 * 景品配布基準向けの検索文字列を正規化
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizePrizeSearchValue = (value) => {
  return normalizeText(value).replace(/[\s\u3000]+/g, '').toLowerCase();
};

/**
 * 景品配布基準の検索キーワードに一致するかを判定
 * 部分一致に加えて、略称入力向けに文字の順序一致も許可する
 * @param {string|null|undefined} source - 候補文字列
 * @param {string|null|undefined} keyword - 検索キーワード
 * @returns {boolean} 一致する場合はtrue
 */
const matchesPrizeSearchKeyword = (source, keyword) => {
  /** 正規化済み候補文字列 */
  const normalizedSource = normalizePrizeSearchValue(source);
  /** 正規化済み検索キーワード */
  const normalizedKeyword = normalizePrizeSearchValue(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  if (!normalizedSource) {
    return false;
  }

  if (normalizedSource.includes(normalizedKeyword)) {
    return true;
  }

  /** 候補文字列の探索開始位置 */
  let sourceIndex = 0;

  for (const keywordCharacter of normalizedKeyword) {
    /** 次に一致する文字位置 */
    const nextIndex = normalizedSource.indexOf(keywordCharacter, sourceIndex);

    if (nextIndex === -1) {
      return false;
    }

    sourceIndex = nextIndex + 1;
  }

  return true;
};

/**
 * 対応者向け共通画面コンポーネント
 * @param {Object} props - プロパティ
 * @param {Object} props.navigation - React Navigation navigation
 * @param {string} props.screenName - 画面名
 * @param {string} props.screenDescription - 画面説明
 * @param {'hq'|'accounting'|'property'} props.roleType - 担当種別
 * @param {string|null} [props.initialTab] - 初期表示タブキー（通知タップなど外部からの指定用）
 * @returns {JSX.Element} 対応画面
 */
const SupportDeskScreen = ({
  navigation,
  screenName,
  screenDescription,
  roleType,
  initialTab,
}) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  /** 部署向け画面のスクロール制御 */
  const departmentScrollViewRef = useRef(null);
  /** 画面単位のPush購読状態 */
  const pushNotice = useManagedPushSubscription({
    navigation,
    userId: user?.id,
    enabled: Boolean(user?.id),
  });

  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  /** 案件詳細カードのY座標 */
  const [departmentDetailSectionY, setDepartmentDetailSectionY] = useState(0);
  /** 部署案件選択時の自動スクロール要求 */
  const [shouldScrollToDepartmentDetail, setShouldScrollToDepartmentDetail] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [ticketAttachments, setTicketAttachments] = useState([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState(() => getDefaultDepartmentStatusFilter(roleType));
  /**
   * 最終閲覧時刻（ミリ秒）
   * nullの場合は初回ロード前（未読判定しない）
   */
  const [lastViewedAtMs, setLastViewedAtMs] = useState(null);

  const [radioLogs, setRadioLogs] = useState([]);
  const [isLoadingRadioLogs, setIsLoadingRadioLogs] = useState(false);
  const [isSubmittingRadioLog, setIsSubmittingRadioLog] = useState(false);
  /** 選択中の無線カテゴリキー（'other' をデフォルト） */
  const [radioChannel, setRadioChannel] = useState('other');
  const [radioLocation, setRadioLocation] = useState('');
  const [radioMessage, setRadioMessage] = useState('');
  /** 無線ログの検索キーワード */
  const [radioSearch, setRadioSearch] = useState('');

  const [hqPatrolTasks, setHqPatrolTasks] = useState([]);
  const [isLoadingHqPatrolTasks, setIsLoadingHqPatrolTasks] = useState(false);
  const [selectedPatrolTaskId, setSelectedPatrolTaskId] = useState(null);
  const [patrolAssignees, setPatrolAssignees] = useState([]);
  const [isLoadingPatrolAssignees, setIsLoadingPatrolAssignees] = useState(false);
  const [selectedPatrolAssigneeId, setSelectedPatrolAssigneeId] = useState('');
  const [isAssigningPatrolTask, setIsAssigningPatrolTask] = useState(false);

  const [pendingEvaluations, setPendingEvaluations] = useState([]);
  const [isLoadingPendingEvaluations, setIsLoadingPendingEvaluations] = useState(false);
  const [isReviewingEvaluation, setIsReviewingEvaluation] = useState(false);
  const [isRenotifying, setIsRenotifying] = useState(false);

  /** 巡回対応履歴（完了・取消済みタスク） */
  const [patrolHistory, setPatrolHistory] = useState([]);
  /** 巡回履歴読み込み中フラグ */
  const [isLoadingPatrolHistory, setIsLoadingPatrolHistory] = useState(false);
  /** 巡回履歴の担当者名マップ（user_id → name） */
  const [patrolHistoryProfileMap, setPatrolHistoryProfileMap] = useState({});

  /** 概況ダッシュボード: 担当者プロフィールマップ（user_id → name） */
  const [overviewProfileMap, setOverviewProfileMap] = useState({});
  /** 概況ダッシュボード: 企画報告種別フィルター（'all' | 'confirm_start' | 'confirm_end'） */
  const [overviewReportTypeFilter, setOverviewReportTypeFilter] = useState('all');
  /** 概況ダッシュボード: 企画報告ステータスフィルター（'active' | 'all' | 'done'） */
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('active');
  /** 概況ダッシュボード: 企画報告確認セクションの展開状態 */
  const [isOverviewReportSectionExpanded, setIsOverviewReportSectionExpanded] = useState(true);
  /** 概況ダッシュボード: 施錠確認セクションの展開状態 */
  const [isOverviewLockSectionExpanded, setIsOverviewLockSectionExpanded] = useState(true);
  /** 対象連絡案件セクションの展開状態 */
  const [isDepartmentTicketListExpanded, setIsDepartmentTicketListExpanded] = useState(true);
  /** 案件詳細セクションの展開状態 */
  const [isDepartmentTicketDetailExpanded, setIsDepartmentTicketDetailExpanded] = useState(true);
  /** 景品配布基準セクションの展開状態 */
  const [isPrizeDistributionSectionExpanded, setIsPrizeDistributionSectionExpanded] = useState(true);
  /** 概況ダッシュボード: 施錠確認の担当フィルター */
  const [overviewLockAssigneeFilter, setOverviewLockAssigneeFilter] = useState('all');
  /** 概況ダッシュボード: 施錠確認の確認状況フィルター */
  const [overviewLockConfirmationFilter, setOverviewLockConfirmationFilter] = useState('all');

  /** 団体別企画一覧（organizations_events）- HQ向け */
  const [hqOrganizationEvents, setHqOrganizationEvents] = useState([]);
  /** 団体別企画一覧読み込み中フラグ */
  const [isLoadingHqOrganizationEvents, setIsLoadingHqOrganizationEvents] = useState(false);
  /** HQ企画一覧の団体候補検索テキスト */
  const [hqOrganizationEventSearch, setHqOrganizationEventSearch] = useState('');
  /** HQ企画一覧で選択中の団体名 */
  const [selectedHqOrganizationEvent, setSelectedHqOrganizationEvent] = useState(ALL_ORGANIZATION_EVENT_FILTER);
  /** HQ企画一覧の団体候補表示フラグ */
  const [isHqOrganizationEventDropdownOpen, setIsHqOrganizationEventDropdownOpen] = useState(false);

  /** 景品配布基準一覧（prize_distribution）- 会計向け */
  const [prizeDistributions, setPrizeDistributions] = useState([]);
  /** 景品配布基準読み込み中フラグ */
  const [isLoadingPrizeDist, setIsLoadingPrizeDist] = useState(false);
  /** 景品配布基準の詳細検索テキスト */
  const [prizeSearch, setPrizeSearch] = useState('');
  /** 景品配布基準の団体候補検索テキスト */
  const [prizeOrganizationSearch, setPrizeOrganizationSearch] = useState('');
  /** 景品配布基準で選択中の団体名 */
  const [selectedPrizeOrganization, setSelectedPrizeOrganization] = useState(ALL_PRIZE_ORGANIZATIONS);
  /** 景品配布基準の団体候補表示フラグ */
  const [isPrizeOrganizationDropdownOpen, setIsPrizeOrganizationDropdownOpen] = useState(false);
  /** 編集対象として選択中の景品配布基準ID */
  const [selectedPrizeDistributionId, setSelectedPrizeDistributionId] = useState('');
  /** 景品配布基準の編集内容 */
  const [prizeCriteriaDraft, setPrizeCriteriaDraft] = useState('');
  /** 景品配布基準の編集モーダル表示フラグ */
  const [isPrizeDistributionEditorVisible, setIsPrizeDistributionEditorVisible] = useState(false);
  /** 景品配布基準保存中フラグ */
  const [isSavingPrizeDistribution, setIsSavingPrizeDistribution] = useState(false);

  /** HQロール向けアクティブタブ（初期値: 外部指定がある場合はそれ、なければ鍵管理） */
  const [activeTab, setActiveTab] = useState(initialTab || HQ_TAB_DEFAULT);

  /**
   * 通知タップなど外部からの initialTab 変更に追従する
   * Drawerナビゲーターでは画面がマウントされたまま params が更新されるため useEffect で同期する
   */
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  /** HQロール向けチケット種別フィルター（'all' | ticket_type） */
  const [hqTicketTypeFilter, setHqTicketTypeFilter] = useState('all');
  /** HQロール向け団体フィルター（'all' | org_id） */
  const [hqOrgFilter, setHqOrgFilter] = useState('all');

  /**
   * メッセージ表示
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

  const isHQRole = roleType === SUPPORT_DESK_ROLE_TYPES.HQ;
  const isAccountingRole = roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING;
  const isDepartmentRole =
    isAccountingRole || roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY;
  const isPropertyRole = roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY;
  /** 案件詳細の添付表示を出すかどうか */
  const shouldShowTicketAttachments = !isDepartmentRole;
  /** 部署向け説明カードを表示するかどうか */
  const shouldShowDepartmentDescription = Boolean(screenDescription);
  const departmentTicketStatusFilters = isAccountingRole
    ? ACCOUNTING_TICKET_STATUS_FILTERS
    : isPropertyRole
      ? PROPERTY_TICKET_STATUS_FILTERS
      : [];

  /**
   * フィルター後のチケット一覧
   * HQロール: 種別・団体フィルターを適用
   * 部署ロール: ステータスフィルターを適用
   */
  const filteredTickets = useMemo(() => {
    /** HQロール向けフィルター */
    if (isHQRole) {
      let result = tickets;
      /** 種別フィルターを適用 */
      if (hqTicketTypeFilter !== 'all') {
        result = result.filter((t) => t.ticket_type === hqTicketTypeFilter);
      }
      /** 団体フィルターを適用（org_id がある場合のみ） */
      if (hqOrgFilter !== 'all') {
        result = result.filter((t) => t.org_id === hqOrgFilter);
      }
      return result;
    }

    if (!isDepartmentRole) {
      return tickets;
    }

    /** ステータスフィルターを適用 */
    let result = tickets;
    if (ticketStatusFilter === 'todo') {
      result = result.filter((ticket) =>
        isDepartmentRole
          ? getDepartmentStatusBucket(ticket.ticket_status) === 'todo'
          : [SUPPORT_TICKET_STATUSES.NEW, SUPPORT_TICKET_STATUSES.ACKNOWLEDGED].includes(ticket.ticket_status)
      );
    } else if (ticketStatusFilter === 'working') {
      result = result.filter((ticket) =>
        isDepartmentRole
          ? getDepartmentStatusBucket(ticket.ticket_status) === 'working'
          : [SUPPORT_TICKET_STATUSES.IN_PROGRESS, SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL].includes(
              ticket.ticket_status
            )
      );
    } else if (ticketStatusFilter === 'done') {
      result = result.filter((ticket) =>
        isDepartmentRole
          ? getDepartmentStatusBucket(ticket.ticket_status) === 'done'
          : [SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(ticket.ticket_status)
      );
    }

    return result;
  }, [
    isHQRole,
    isDepartmentRole,
    hqTicketTypeFilter,
    hqOrgFilter,
    ticketStatusFilter,
    tickets,
  ]);

  /**
   * HQフィルター用の団体一覧（ticketsのorganizationsリレーションから動的生成）
   * 別APIコールなしでJOIN済みデータを活用する
   */
  const hqFilterOrganizations = useMemo(() => {
    /** org_id と organizations.name が揃っているチケットから一意の団体を抽出 */
    const seen = new Map();
    tickets.forEach((t) => {
      if (t.org_id && t.organizations?.name && !seen.has(t.org_id)) {
        seen.set(t.org_id, { id: t.org_id, name: t.organizations.name });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [tickets]);

  /**
   * HQ企画一覧で選択できる団体一覧
   * 同名団体をまとめ、団体ごとの企画件数も表示する
   */
  const hqOrganizationEventOptions = useMemo(() => {
    return buildOrganizationEventOptions(hqOrganizationEvents);
  }, [hqOrganizationEvents]);

  /**
   * HQ企画一覧の団体候補検索テキストで絞り込んだ団体一覧
   */
  const filteredHqOrganizationEventOptions = useMemo(() => {
    /** 団体候補の検索キーワード */
    const keyword = normalizeOrganizationEventSearchValue(hqOrganizationEventSearch);
    if (!keyword) {
      return hqOrganizationEventOptions;
    }

    return hqOrganizationEventOptions.filter((option) =>
      matchesOrganizationEventSearchKeyword(option.label, keyword)
    );
  }, [hqOrganizationEventOptions, hqOrganizationEventSearch]);

  /**
   * HQ企画一覧ドロップダウンに表示する団体候補一覧
   */
  const visibleHqOrganizationEventOptions = useMemo(() => {
    return filteredHqOrganizationEventOptions.slice(0, ORGANIZATION_EVENT_OPTION_LIMIT);
  }, [filteredHqOrganizationEventOptions]);

  /**
   * HQ企画一覧で選択中の団体ラベル
   */
  const selectedHqOrganizationEventLabel = useMemo(() => {
    if (selectedHqOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER) {
      return 'すべての団体';
    }

    return selectedHqOrganizationEvent;
  }, [selectedHqOrganizationEvent]);

  /**
   * HQ企画一覧で選択中団体を反映した企画一覧
   */
  const filteredHqOrganizationEvents = useMemo(() => {
    return hqOrganizationEvents.filter((item) => {
      /** 団体選択との一致判定 */
      const matchesOrganization =
        selectedHqOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER ||
        normalizeText(item.organization_name) === selectedHqOrganizationEvent;

      return matchesOrganization;
    });
  }, [hqOrganizationEvents, selectedHqOrganizationEvent]);

  /**
   * 景品配布基準で選択できる団体一覧
   * 同名団体をまとめ、団体ごとの景品件数も表示する
   */
  const prizeOrganizationOptions = useMemo(() => {
    /** 団体名ごとの集計マップ */
    const optionMap = new Map();

    prizeDistributions.forEach((item) => {
      /** 団体名 */
      const organizationName = normalizeText(item.organization_name);
      if (!organizationName) {
        return;
      }

      const current = optionMap.get(organizationName) || {
        value: organizationName,
        label: organizationName,
        count: 0,
      };

      optionMap.set(organizationName, {
        ...current,
        count: current.count + 1,
      });
    });

    return Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [prizeDistributions]);

  /**
   * 団体候補検索テキストで絞り込んだ団体一覧
   */
  const filteredPrizeOrganizationOptions = useMemo(() => {
    /** 団体候補の検索キーワード */
    const keyword = normalizePrizeSearchValue(prizeOrganizationSearch);
    if (!keyword) {
      return prizeOrganizationOptions;
    }

    return prizeOrganizationOptions.filter((option) =>
      matchesPrizeSearchKeyword(option.label, keyword)
    );
  }, [prizeOrganizationOptions, prizeOrganizationSearch]);

  /**
   * ドロップダウンに表示する団体候補一覧
   */
  const visiblePrizeOrganizationOptions = useMemo(() => {
    return filteredPrizeOrganizationOptions.slice(0, PRIZE_ORGANIZATION_OPTION_LIMIT);
  }, [filteredPrizeOrganizationOptions]);

  /**
   * 団体選択と詳細検索を反映した景品配布基準一覧
   */
  const filteredPrizeDistributions = useMemo(() => {
    /** 詳細検索キーワード */
    const keyword = normalizePrizeSearchValue(prizeSearch);

    return prizeDistributions.filter((item) => {
      /** 団体選択との一致判定 */
      const matchesOrganization =
        selectedPrizeOrganization === ALL_PRIZE_ORGANIZATIONS ||
        normalizeText(item.organization_name) === selectedPrizeOrganization;

      if (!matchesOrganization) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      /** 企画名・景品番号・景品名・配布基準で部分一致検索 */
      return [
        item.event_name,
        item.prize_number,
        item.prize_name,
        item.distribution_criteria,
      ].some((value) => normalizePrizeSearchValue(value).includes(keyword));
    });
  }, [prizeDistributions, prizeSearch, selectedPrizeOrganization]);

  /**
   * 画面表示用の選択中団体ラベル
   */
  const selectedPrizeOrganizationLabel = useMemo(() => {
    if (selectedPrizeOrganization === ALL_PRIZE_ORGANIZATIONS) {
      return 'すべての団体';
    }
    return selectedPrizeOrganization;
  }, [selectedPrizeOrganization]);

  /**
   * 編集対象として選択中の景品配布基準
   */
  const selectedPrizeDistribution = useMemo(() => {
    return prizeDistributions.find((item) => item.id === selectedPrizeDistributionId) || null;
  }, [prizeDistributions, selectedPrizeDistributionId]);

  const selectedTicket = useMemo(() => {
    return filteredTickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }, [filteredTickets, selectedTicketId]);

  /** 部署向けステータス変更候補 */
  const departmentStatusOptions = isAccountingRole
    ? ACCOUNTING_STATUS_OPTIONS
    : isPropertyRole
      ? PROPERTY_STATUS_OPTIONS
      : [];

  /** 部署向け表示ステータス */
  const selectedDepartmentStatus = selectedTicket
    ? getDepartmentStatusBucket(selectedTicket.ticket_status)
    : '';

  const isEventStatusTicket =
    selectedTicket?.ticket_type === 'start_report' || selectedTicket?.ticket_type === 'end_report';

  const selectedPatrolTask = useMemo(() => {
    return hqPatrolTasks.find((task) => task.id === selectedPatrolTaskId) || null;
  }, [hqPatrolTasks, selectedPatrolTaskId]);

  const dashboardSummary = useMemo(() => {
    const now = Date.now();
    const delayedMinutes = 60;

    const newTickets = tickets.filter((ticket) => ticket.ticket_status === SUPPORT_TICKET_STATUSES.NEW).length;
    const delayedTickets = tickets.filter((ticket) => {
      if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(ticket.ticket_status)) {
        return false;
      }
      const createdAt = new Date(ticket.created_at).getTime();
      return Number.isFinite(createdAt) && now - createdAt >= delayedMinutes * 60 * 1000;
    }).length;

    const activePatrolTasks = hqPatrolTasks.filter((task) =>
      [PATROL_TASK_STATUSES.OPEN, PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(
        task.task_status
      )
    ).length;

    const recentRadioLogs = radioLogs.filter((log) => {
      const createdAt = new Date(log.created_at).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= 60 * 60 * 1000;
    }).length;

    return {
      newTickets,
      delayedTickets,
      activePatrolTasks,
      recentRadioLogs,
    };
  }, [hqPatrolTasks, radioLogs, tickets]);

  /**
   * 概況ダッシュボード: ステータスフィルター適用後の企画報告タスク（開始/終了確認）
   * overviewStatusFilter と overviewReportTypeFilter の両方で絞り込む
   */
  const overviewReportTasks = useMemo(() => {
    /** 開始確認・終了確認タスクに限定 */
    const base = hqPatrolTasks.filter((t) =>
      t.task_type === PATROL_TASK_TYPES.CONFIRM_START || t.task_type === PATROL_TASK_TYPES.CONFIRM_END
    );
    /** ステータスフィルター */
    const statusFiltered = base.filter((t) => {
      if (overviewStatusFilter === 'active') {
        return t.task_status === 'open' || t.task_status === 'accepted' || t.task_status === 'en_route';
      }
      if (overviewStatusFilter === 'done') {
        return t.task_status === 'done' || t.task_status === 'canceled';
      }
      return true;
    });
    /** 種別フィルター */
    if (overviewReportTypeFilter === 'all') {
      return statusFiltered;
    }
    return statusFiltered.filter((t) => t.task_type === overviewReportTypeFilter);
  }, [hqPatrolTasks, overviewStatusFilter, overviewReportTypeFilter]);

  /**
   * 概況ダッシュボード: 担当・確認状況フィルター適用後の施錠確認タスク
   */
  const overviewLockTasks = useMemo(() => {
    /** 施錠確認タスクに限定 */
    const base = hqPatrolTasks.filter((t) => t.task_type === PATROL_TASK_TYPES.LOCK_CHECK);
    /** 担当フィルターを適用した一覧 */
    const assigneeFiltered = base.filter((t) => {
      /** 担当者が設定されているか */
      const hasAssignee = Boolean(t.assigned_to);
      if (overviewLockAssigneeFilter === 'assigned') {
        return hasAssignee;
      }
      if (overviewLockAssigneeFilter === 'unassigned') {
        return !hasAssignee;
      }
      return true;
    });

    /** 確認状況フィルターを適用した一覧 */
    return assigneeFiltered.filter((t) => {
      /** 完了済みなら確認済みとみなす */
      const isConfirmed = t.task_status === PATROL_TASK_STATUSES.DONE;
      if (overviewLockConfirmationFilter === 'confirmed') {
        return isConfirmed;
      }
      if (overviewLockConfirmationFilter === 'unconfirmed') {
        return !isConfirmed;
      }
      return true;
    });
  }, [hqPatrolTasks, overviewLockAssigneeFilter, overviewLockConfirmationFilter]);

  /**
   * AsyncStorageから最終閲覧時刻を読み込む
   * @returns {Promise<void>} 読み込み処理
   */
  const loadLastViewedAt = useCallback(async () => {
    if (!isDepartmentRole) {
      return;
    }
    try {
      const key = buildLastViewedKey(roleType);
      const stored = await AsyncStorage.getItem(key);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (Number.isFinite(parsed)) {
          setLastViewedAtMs(parsed);
        }
      } else {
        /** 初回: 現在時刻を保存して既読扱いにする */
        const now = Date.now();
        await AsyncStorage.setItem(key, String(now));
        setLastViewedAtMs(now);
      }
    } catch (error) {
      console.error('最終閲覧時刻の読み込みに失敗:', error);
    }
  }, [isDepartmentRole, roleType]);

  /**
   * 現在時刻をAsyncStorageに最終閲覧時刻として保存する
   * チケット一覧を表示・更新したときに呼ぶ
   * @returns {Promise<void>} 保存処理
   */
  const saveLastViewedAt = useCallback(async () => {
    if (!isDepartmentRole) {
      return;
    }
    try {
      const now = Date.now();
      const key = buildLastViewedKey(roleType);
      await AsyncStorage.setItem(key, String(now));
      setLastViewedAtMs(now);
    } catch (error) {
      console.error('最終閲覧時刻の保存に失敗:', error);
    }
  }, [isDepartmentRole, roleType]);

  /**
   * 案件一覧を取得
   * @param {string|null} preferredTicketId - 優先選択する案件ID
   * @returns {Promise<void>} 取得処理
   */
  const loadTickets = async (preferredTicketId = null) => {
    setIsLoadingTickets(true);
    const { data, error } = await listTicketsForRole({ roleType, limit: 80 });
    setIsLoadingTickets(false);

    if (error) {
      console.error('連絡案件取得に失敗:', error);
      return;
    }

    const nextTickets = data || [];
    setTickets(nextTickets);

    if (nextTickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    const candidateId = preferredTicketId || selectedTicketId;
    if (candidateId && nextTickets.some((ticket) => ticket.id === candidateId)) {
      setSelectedTicketId(candidateId);
      return;
    }

    setSelectedTicketId(nextTickets[0].id);
  };

  /**
   * 返信一覧を取得
   * @param {string|null} ticketId - 案件ID
   * @returns {Promise<void>} 取得処理
   */
  const loadMessages = async (ticketId) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    const { data, error } = await listTicketMessages({ ticketId });
    setIsLoadingMessages(false);

    if (error) {
      console.error('返信一覧取得に失敗:', error);
      return;
    }

    setMessages(data || []);
  };

  /**
   * 添付一覧を取得
   * @param {string|null} ticketId - 案件ID
   * @returns {Promise<void>} 取得処理
   */
  const loadTicketAttachedFiles = async (ticketId) => {
    if (!ticketId) {
      setTicketAttachments([]);
      return;
    }

    setIsLoadingAttachments(true);
    const { data, error } = await listTicketAttachments({ ticketId, limit: 12 });
    if (error) {
      setIsLoadingAttachments(false);
      console.error('添付一覧取得に失敗:', error);
      return;
    }

    const rows = data || [];
    const rowsWithSignedUrl = await Promise.all(
      rows.map(async (attachment) => {
        const { data: signedData, error: signedError } = await createAttachmentSignedUrl({
          storageBucket: attachment.storage_bucket,
          storagePath: attachment.storage_path,
          expiresIn: 3600,
        });
        if (signedError) {
          console.warn('添付URL生成に失敗:', signedError);
        }

        return {
          ...attachment,
          signedUrl: signedData?.signedUrl || '',
        };
      })
    );
    setIsLoadingAttachments(false);
    setTicketAttachments(rowsWithSignedUrl);
  };

  /**
   * 添付を開く
   * @param {Object} attachment - 添付情報
   * @returns {Promise<void>} 表示処理
   */
  const openAttachment = async (attachment) => {
    const signedUrl = normalizeText(attachment?.signedUrl);
    if (!signedUrl) {
      showMessage('添付表示エラー', '添付URLが取得できませんでした。再読み込みしてください。');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await Linking.openURL(signedUrl);
    } catch (error) {
      console.error('添付表示に失敗:', error);
      showMessage('添付表示エラー', '添付を開けませんでした。');
    }
  };

  /**
   * 返信送信
   * @returns {Promise<void>} 送信処理
   */
  const handleReplySubmit = async () => {
    if (!selectedTicket) {
      showMessage('送信エラー', '連絡案件を選択してください');
      return;
    }
    if (!user?.id) {
      showMessage('送信エラー', 'ログイン情報が取得できません');
      return;
    }
    if (!replyBody.trim()) {
      showMessage('入力不足', '回答内容を入力してください');
      return;
    }

    setIsSendingReply(true);
    const result = await createTicketMessage({
      ticketId: selectedTicket.id,
      authorId: user.id,
      body: replyBody,
    });
    setIsSendingReply(false);

    if (result.error) {
      showMessage('送信エラー', result.error.message || '回答の送信に失敗しました');
      return;
    }

    /** 自動ステータス更新エラー */
    let autoStatusUpdateError = null;

    if (
      selectedTicket.ticket_status === SUPPORT_TICKET_STATUSES.NEW ||
      selectedTicket.ticket_status === SUPPORT_TICKET_STATUSES.ACKNOWLEDGED
    ) {
      const statusResult = await updateTicketStatus({
        ticketId: selectedTicket.id,
        status: SUPPORT_TICKET_STATUSES.IN_PROGRESS,
        notifyActorUserId: user.id,
      });
      autoStatusUpdateError = statusResult.error || null;
    }

    setReplyBody('');
    await Promise.all([loadMessages(selectedTicket.id), loadTickets(selectedTicket.id)]);

    if (autoStatusUpdateError) {
      showMessage(
        '一部完了',
        autoStatusUpdateError.message || '回答は送信しましたが、ステータス更新に失敗しました'
      );
      return;
    }

    showMessage('送信完了', '回答を送信しました');
  };

  /**
   * ステータス更新
   * @param {string} nextStatus - 更新後ステータス
   * @returns {Promise<void>} 更新処理
   */
  const handleStatusUpdate = async (nextStatus) => {
    if (!selectedTicket) {
      return;
    }

    setIsUpdatingStatus(true);
    const result = await updateTicketStatus({
      ticketId: selectedTicket.id,
      status: resolveNextTicketStatus(roleType, nextStatus),
      notifyActorUserId: user?.id || '',
    });
    setIsUpdatingStatus(false);

    if (result.error) {
      showMessage('更新エラー', result.error.message || 'ステータス更新に失敗しました');
      return;
    }

    await loadTickets(selectedTicket.id);
  };

  /**
   * 無線ログ一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadRadioLogs = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingRadioLogs(true);
    const { data, error } = await listRadioLogs({ limit: 40 });
    setIsLoadingRadioLogs(false);

    if (error) {
      console.error('無線ログ取得に失敗:', error);
      return;
    }
    setRadioLogs(data || []);
  };

  /**
   * 無線ログ送信
   * @returns {Promise<void>} 登録処理
   */
  const handleSubmitRadioLog = async () => {
    if (!user?.id) {
      showMessage('登録エラー', 'ログイン情報が取得できません');
      return;
    }
    if (!radioMessage.trim()) {
      showMessage('入力不足', '無線内容を入力してください');
      return;
    }

    setIsSubmittingRadioLog(true);
    const { error } = await createRadioLog({
      loggedBy: user.id,
      role: roleType,
      channel: radioChannel,
      locationText: radioLocation,
      message: radioMessage,
    });
    setIsSubmittingRadioLog(false);

    if (error) {
      showMessage('登録エラー', error.message || '無線ログの登録に失敗しました');
      return;
    }

    setRadioMessage('');
    await loadRadioLogs();
    showMessage('登録完了', '無線ログを記録しました');
  };

  /**
   * HQ向け巡回タスク一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadHqPatrolTasks = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingHqPatrolTasks(true);
    const { data, error } = await listPatrolTasks({ limit: 120 });
    setIsLoadingHqPatrolTasks(false);

    if (error) {
      console.error('巡回タスク取得に失敗:', error);
      return;
    }

    const nextTasks = data || [];
    setHqPatrolTasks(nextTasks);

    if (nextTasks.length === 0) {
      setSelectedPatrolTaskId(null);
      return;
    }

    if (selectedPatrolTaskId && nextTasks.some((task) => task.id === selectedPatrolTaskId)) {
      return;
    }

    setSelectedPatrolTaskId(nextTasks[0].id);
  };

  /**
   * 巡回割当候補ユーザーを取得
   * @returns {Promise<void>} 取得処理
   */
  const loadPatrolAssignees = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingPatrolAssignees(true);
    const { roles, error: rolesError } = await getRoles();
    if (rolesError) {
      setIsLoadingPatrolAssignees(false);
      console.error('ロール一覧取得に失敗:', rolesError);
      return;
    }

    const roleIds = (roles || [])
      .filter((role) => {
        const name = normalizeText(role.name);
        const displayName = normalizeText(role.display_name);
        return PATROL_ROLE_NAMES.includes(name) || PATROL_ROLE_NAMES.includes(displayName);
      })
      .map((role) => role.id);

    if (roleIds.length === 0) {
      setIsLoadingPatrolAssignees(false);
      setPatrolAssignees([]);
      return;
    }

    const { users, error: usersError } = await getUsersByRoles(roleIds);
    if (usersError) {
      setIsLoadingPatrolAssignees(false);
      console.error('ロールユーザー取得に失敗:', usersError);
      return;
    }

    const { profiles, error: profileError } = await getUserProfilesByIds(users || []);
    setIsLoadingPatrolAssignees(false);

    if (profileError) {
      console.error('ユーザープロフィール取得に失敗:', profileError);
      return;
    }

    const nextAssignees = (profiles || [])
      .map((profile) => ({
        userId: profile.user_id,
        name: profile.name || profile.user_id,
        organization: profile.organization || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    setPatrolAssignees(nextAssignees);
  };

  /**
   * 巡回タスク担当を更新
   * @returns {Promise<void>} 更新処理
   */
  const handleAssignPatrolTask = async () => {
    if (!selectedPatrolTask) {
      showMessage('更新エラー', '巡回タスクを選択してください');
      return;
    }

    setIsAssigningPatrolTask(true);
    const { error } = await assignPatrolTask({
      taskId: selectedPatrolTask.id,
      assignedTo: selectedPatrolAssigneeId || null,
      actorUserId: user?.id || null,
    });
    setIsAssigningPatrolTask(false);

    if (error) {
      showMessage('更新エラー', error.message || '巡回タスク割当の更新に失敗しました');
      return;
    }

    await loadHqPatrolTasks();
    showMessage('更新完了', selectedPatrolAssigneeId ? '巡回担当を更新しました' : '未割当に戻しました');
  };

  /**
   * HQ向け評価承認一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadPendingEvaluations = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingPendingEvaluations(true);
    const { data, error } = await listEvaluationChecks({
      statuses: [EVALUATION_STATUSES.PENDING, EVALUATION_STATUSES.REWORK],
      limit: 60,
    });
    setIsLoadingPendingEvaluations(false);

    if (error) {
      console.error('評価承認一覧取得に失敗:', error);
      return;
    }

    setPendingEvaluations(data || []);
  };

  /**
   * 巡回対応履歴を取得（完了・取消済みタスク + 担当者名解決）
   * @returns {Promise<void>} 取得処理
   */
  const loadPatrolHistory = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingPatrolHistory(true);
    const { data, error } = await listPatrolTasks({
      statuses: [PATROL_TASK_STATUSES.DONE, PATROL_TASK_STATUSES.CANCELED],
      limit: 50,
    });
    setIsLoadingPatrolHistory(false);

    if (error) {
      console.error('巡回履歴取得に失敗:', error);
      return;
    }

    const nextHistory = data || [];
    setPatrolHistory(nextHistory);

    /** 担当者 user_id を一意にまとめてプロフィールを一括取得 */
    const userIds = [...new Set(nextHistory.map((t) => t.assigned_to).filter(Boolean))];
    if (userIds.length === 0) {
      setPatrolHistoryProfileMap({});
      return;
    }

    const { profiles } = await getUserProfilesByIds(userIds);
    const profileMap = {};
    (profiles || []).forEach((p) => {
      profileMap[p.user_id] = p.name || p.user_id;
    });
    setPatrolHistoryProfileMap(profileMap);
  };

  /**
   * 評価承認状態を更新
   * @param {string} evaluationId - 評価ID
   * @param {'approved'|'rejected'|'rework'} nextStatus - 更新状態
   * @returns {Promise<void>} 更新処理
   */
  const handleReviewEvaluation = async (evaluationId, nextStatus) => {
    if (!user?.id) {
      showMessage('更新エラー', 'ログイン情報が取得できません');
      return;
    }

    /** 確認ダイアログを表示 */
    const statusLabel = EVALUATION_STATUS_LABELS[nextStatus] || nextStatus;
    const confirmMessage = `評価を「${statusLabel}」に更新しますか？`;
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMessage)) {
        return;
      }
    } else {
      const confirmed = await new Promise((resolve) => {
        Alert.alert('確認', confirmMessage, [
          { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
          { text: '更新', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) {
        return;
      }
    }

    setIsReviewingEvaluation(true);
    const { error } = await reviewEvaluationCheck({
      evaluationId,
      status: nextStatus,
      reviewedBy: user.id,
    });
    setIsReviewingEvaluation(false);

    if (error) {
      showMessage('更新エラー', error.message || '評価承認の更新に失敗しました');
      return;
    }

    await loadPendingEvaluations();
    showMessage('更新完了', '評価承認状態を更新しました');
  };

  /**
   * 部署へ再通知
   * @returns {Promise<void>} 再通知処理
   */
  const handleRenotifyDepartment = async () => {
    if (!selectedTicket) {
      showMessage('通知エラー', '連絡案件を選択してください');
      return;
    }
    if (!['accounting', 'property'].includes(selectedTicket.notify_target)) {
      showMessage('通知エラー', '再通知対象の部署案件ではありません');
      return;
    }

    setIsRenotifying(true);
    const { error, data } = await notifySupportTicketCreated({
      ticket: selectedTicket,
      senderUserId: user?.id || null,
    });
    setIsRenotifying(false);

    if (error) {
      showMessage('通知エラー', error.message || '再通知に失敗しました');
      return;
    }

    const countText = Number.isFinite(data?.recipientsCount)
      ? `対象 ${data.recipientsCount} 人へ通知しました`
      : '再通知しました';
    showMessage('再通知完了', countText);
  };

  /**
   * HQ向け企画一覧を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadHqOrganizationEvents = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingHqOrganizationEvents(true);
    const { data, error } = await selectOrganizationEvents({ limit: 200 });
    setIsLoadingHqOrganizationEvents(false);

    if (error) {
      console.error('団体別企画一覧取得に失敗:', error);
      return;
    }

    setHqOrganizationEvents(data || []);
  };

  /**
   * 会計向け景品配布基準を取得
   * @returns {Promise<void>} 取得処理
   */
  const loadPrizeDistributions = async () => {
    if (roleType !== SUPPORT_DESK_ROLE_TYPES.ACCOUNTING) {
      return;
    }

    setIsLoadingPrizeDist(true);
    const { data, error } = await selectPrizeDistributions({ limit: 300 });
    setIsLoadingPrizeDist(false);

    if (error) {
      console.error('景品配布基準取得に失敗:', error);
      return;
    }

    setPrizeDistributions(data || []);
  };

  useEffect(() => {
    loadLastViewedAt();
    loadTickets();
    loadRadioLogs();
    loadHqPatrolTasks();
    loadPatrolAssignees();
    loadPendingEvaluations();
    loadPatrolHistory();
    loadHqOrganizationEvents();
    loadPrizeDistributions();
  }, [roleType, user?.id]);

  useEffect(() => {
    setTicketStatusFilter(getDefaultDepartmentStatusFilter(roleType));
  }, [roleType]);

  /**
   * 物品対応画面は通知タップやアプリ復帰時に自動で最新状態を取り直す
   */
  useEffect(() => {
    if (!isPropertyRole) {
      return () => {};
    }

    const refreshPropertyTickets = () => {
      const preferredTicketId = normalizeText(selectedTicketId) || null;
      loadTickets(preferredTicketId);
      if (preferredTicketId) {
        loadMessages(preferredTicketId);
        loadTicketAttachedFiles(preferredTicketId);
      }
    };

    const unsubscribeFocus = navigation?.addListener?.('focus', refreshPropertyTickets) || (() => {});

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleWindowFocus = () => refreshPropertyTickets();
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          refreshPropertyTickets();
        }
      };

      window.addEventListener('focus', handleWindowFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        unsubscribeFocus();
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshPropertyTickets();
      }
    });

    return () => {
      unsubscribeFocus();
      appStateSubscription.remove();
    };
  }, [isPropertyRole, navigation, selectedTicketId, roleType, user?.id]);

  /**
   * 会計/物品画面では手動更新に頼らず連絡案件を自動同期する
   * 案件本体・返信・添付の変更を監視し、一覧と選択中詳細を再取得する
   */
  useEffect(() => {
    if (!isDepartmentRole || !user?.id) {
      return () => {};
    }

    /** Realtime購読用クライアント */
    const supabase = getSupabaseClient();
    /** 画面単位の購読チャネル */
    const channel = supabase.channel(`support_desk_${roleType}_${user.id}`);

    /**
     * 案件一覧を最新化し、選択中案件の維持を試みる
     * @param {Object} payload - Realtimeイベントペイロード
     * @returns {void}
     */
    const refreshTicketsFromRealtime = (payload) => {
      /** 変更があった案件ID */
      const changedTicketId = extractTicketIdFromRealtimePayload(payload);
      /** 選択維持を優先し、未選択時は変更案件を優先表示する */
      const preferredTicketId = normalizeText(selectedTicketId) || changedTicketId || null;
      loadTickets(preferredTicketId);
    };

    /**
     * 選択中案件の返信を最新化する
     * @param {Object} payload - Realtimeイベントペイロード
     * @returns {void}
     */
    const refreshSelectedMessagesFromRealtime = (payload) => {
      /** 変更があった案件ID */
      const changedTicketId = extractTicketIdFromRealtimePayload(payload);
      if (!selectedTicketId || changedTicketId !== selectedTicketId) {
        return;
      }
      loadMessages(selectedTicketId);
    };

    /**
     * 選択中案件の添付を最新化する
     * @param {Object} payload - Realtimeイベントペイロード
     * @returns {void}
     */
    const refreshSelectedAttachmentsFromRealtime = (payload) => {
      /** 変更があった案件ID */
      const changedTicketId = extractTicketIdFromRealtimePayload(payload);
      if (!selectedTicketId || changedTicketId !== selectedTicketId) {
        return;
      }
      loadTicketAttachedFiles(selectedTicketId);
    };

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      },
      refreshTicketsFromRealtime
    );

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ticket_messages',
      },
      (payload) => {
        refreshTicketsFromRealtime(payload);
        refreshSelectedMessagesFromRealtime(payload);
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ticket_attachments',
      },
      (payload) => {
        refreshTicketsFromRealtime(payload);
        refreshSelectedAttachmentsFromRealtime(payload);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isDepartmentRole, roleType, selectedTicketId, user?.id]);

  useEffect(() => {
    if (selectedHqOrganizationEvent === ALL_ORGANIZATION_EVENT_FILTER) {
      return;
    }

    /** 再取得後も選択中団体が存在するか確認 */
    const hasSelectedOrganization = hqOrganizationEventOptions.some(
      (option) => option.value === selectedHqOrganizationEvent
    );

    if (!hasSelectedOrganization) {
      setSelectedHqOrganizationEvent(ALL_ORGANIZATION_EVENT_FILTER);
      setHqOrganizationEventSearch('');
      setIsHqOrganizationEventDropdownOpen(false);
    }
  }, [hqOrganizationEventOptions, selectedHqOrganizationEvent]);

  useEffect(() => {
    if (selectedPrizeOrganization === ALL_PRIZE_ORGANIZATIONS) {
      return;
    }

    /** 再取得後も選択中団体が存在するか確認 */
    const hasSelectedOrganization = prizeOrganizationOptions.some(
      (option) => option.value === selectedPrizeOrganization
    );

    if (!hasSelectedOrganization) {
      setSelectedPrizeOrganization(ALL_PRIZE_ORGANIZATIONS);
      setPrizeOrganizationSearch('');
    }
  }, [prizeOrganizationOptions, selectedPrizeOrganization]);

  useEffect(() => {
    setPrizeCriteriaDraft(selectedPrizeDistribution?.distribution_criteria || '');
  }, [selectedPrizeDistribution?.distribution_criteria, selectedPrizeDistribution?.id]);

  useEffect(() => {
    if (!isDepartmentRole || !selectedTicket?.id) {
      return;
    }
    setIsDepartmentTicketDetailExpanded(true);
  }, [isDepartmentRole, selectedTicket?.id]);

  useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    if (!selectedTicketId || !filteredTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(filteredTickets[0].id);
    }
  }, [filteredTickets, selectedTicketId]);

  /**
   * 企画報告確認セクションの折りたたみ状態を切り替える
   * @returns {void}
   */
  const toggleOverviewReportSection = () => {
    setIsOverviewReportSectionExpanded((currentValue) => !currentValue);
  };

  /**
   * 施錠確認セクションの折りたたみ状態を切り替える
   * @returns {void}
   */
  const toggleOverviewLockSection = () => {
    setIsOverviewLockSectionExpanded((currentValue) => !currentValue);
  };

  /**
   * 対象連絡案件セクションの展開状態を切り替える
   * @returns {void}
   */
  const toggleDepartmentTicketListSection = () => {
    setIsDepartmentTicketListExpanded((currentValue) => !currentValue);
  };

  /**
   * 案件詳細セクションの展開状態を切り替える
   * @returns {void}
   */
  const toggleDepartmentTicketDetailSection = () => {
    setIsDepartmentTicketDetailExpanded((currentValue) => !currentValue);
  };

  /**
   * 部署案件一覧から案件を選択し、詳細へ自動スクロールする
   * @param {string} ticketId - 案件ID
   * @returns {void}
   */
  const handleSelectDepartmentTicket = (ticketId) => {
    if (!ticketId) {
      return;
    }
    setSelectedTicketId(ticketId);
    setIsDepartmentTicketDetailExpanded(true);
    setShouldScrollToDepartmentDetail(true);
  };

  /**
   * 景品配布基準セクションの展開状態を切り替える
   * @returns {void}
   */
  const togglePrizeDistributionSection = () => {
    setIsPrizeDistributionSectionExpanded((currentValue) => !currentValue);
  };

  /**
   * 景品配布基準の編集モーダルを閉じる
   * @returns {void}
   */
  const closePrizeDistributionEditor = () => {
    setIsPrizeDistributionEditorVisible(false);
    setSelectedPrizeDistributionId('');
    setPrizeCriteriaDraft('');
  };

  /**
   * HQ企画一覧の団体候補検索を更新
   * @param {string} value - 入力値
   * @returns {void}
   */
  const handleHqOrganizationEventSearchChange = (value) => {
    setHqOrganizationEventSearch(value);
    setIsHqOrganizationEventDropdownOpen(true);
  };

  /**
   * HQ企画一覧の団体を選択する
   * @param {string} organizationName - 団体名
   * @returns {void}
   */
  const handleHqOrganizationEventSelect = (organizationName) => {
    setSelectedHqOrganizationEvent(organizationName);
    setHqOrganizationEventSearch('');
    setIsHqOrganizationEventDropdownOpen(false);
  };

  /**
   * HQ企画一覧の団体選択を解除して全件表示へ戻す
   * @returns {void}
   */
  const handleHqOrganizationEventReset = () => {
    setSelectedHqOrganizationEvent(ALL_ORGANIZATION_EVENT_FILTER);
    setHqOrganizationEventSearch('');
    setIsHqOrganizationEventDropdownOpen(false);
  };

  /**
   * 景品配布基準の団体候補検索を更新
   * @param {string} value - 入力値
   * @returns {void}
   */
  const handlePrizeOrganizationSearchChange = (value) => {
    setPrizeOrganizationSearch(value);
    setIsPrizeOrganizationDropdownOpen(true);
  };

  /**
   * 景品配布基準の団体を選択
   * @param {string} organizationName - 団体名
   * @returns {void}
   */
  const handlePrizeOrganizationSelect = (organizationName) => {
    setSelectedPrizeOrganization(organizationName);
    setPrizeOrganizationSearch('');
    setPrizeSearch('');
    setIsPrizeOrganizationDropdownOpen(false);
  };

  /**
   * 景品配布基準の団体選択を解除して全件表示へ戻す
   * @returns {void}
   */
  const handlePrizeOrganizationReset = () => {
    setSelectedPrizeOrganization(ALL_PRIZE_ORGANIZATIONS);
    setPrizeOrganizationSearch('');
    setPrizeSearch('');
    setIsPrizeOrganizationDropdownOpen(false);
  };

  /**
   * 景品配布基準の編集対象を選択する
   * @param {Object} prizeDistribution - 景品配布基準
   * @returns {void}
   */
  const handlePrizeDistributionSelect = (prizeDistribution) => {
    /** 選択対象ID */
    const nextSelectedId = prizeDistribution?.id;
    if (nextSelectedId === null || nextSelectedId === undefined || nextSelectedId === '') {
      return;
    }

    setSelectedPrizeDistributionId(nextSelectedId);
    setPrizeCriteriaDraft(prizeDistribution?.distribution_criteria || '');
    setIsPrizeDistributionEditorVisible(true);
  };

  /**
   * 景品配布基準の変更内容を保存する
   * @returns {Promise<void>} 保存処理
   */
  const handlePrizeDistributionSave = async () => {
    if (!selectedPrizeDistribution) {
      showMessage('更新エラー', '編集する景品配布基準を選択してください');
      return;
    }

    /** 入力済み配布基準 */
    const normalizedCriteria = normalizeText(prizeCriteriaDraft);
    if (!normalizedCriteria) {
      showMessage('入力不足', '景品配布基準の内容を入力してください');
      return;
    }

    /** 現在の配布基準 */
    const currentCriteria = normalizeText(selectedPrizeDistribution.distribution_criteria);
    if (normalizedCriteria === currentCriteria) {
      showMessage('変更なし', '景品配布基準の変更内容がありません');
      return;
    }

    setIsSavingPrizeDistribution(true);
    /** 更新結果 */
    const { data, error } = await updatePrizeDistributionCriteria({
      prizeDistributionId: selectedPrizeDistribution.id,
      distributionCriteria: normalizedCriteria,
    });
    setIsSavingPrizeDistribution(false);

    if (error) {
      showMessage('更新エラー', error.message || '景品配布基準の更新に失敗しました');
      return;
    }

    setPrizeDistributions((currentPrizeDistributions) =>
      currentPrizeDistributions.map((item) => (item.id === data?.id ? { ...item, ...data } : item))
    );
    setSelectedPrizeDistributionId('');
    setIsPrizeDistributionEditorVisible(false);
    setPrizeCriteriaDraft('');
    showMessage('更新完了', '景品配布基準を更新しました');
  };

  useEffect(() => {
    loadMessages(selectedTicketId);
    loadTicketAttachedFiles(selectedTicketId);
  }, [selectedTicketId]);

  /**
   * 部署向け画面で一覧から案件を選んだら案件詳細まで自動スクロールする
   */
  useEffect(() => {
    if (
      !isDepartmentRole ||
      !shouldScrollToDepartmentDetail ||
      !selectedTicket?.id ||
      !isDepartmentTicketDetailExpanded ||
      departmentDetailSectionY <= 0
    ) {
      return;
    }

    const timerId = setTimeout(() => {
      departmentScrollViewRef.current?.scrollTo({
        y: Math.max(departmentDetailSectionY - 12, 0),
        animated: true,
      });
      setShouldScrollToDepartmentDetail(false);
    }, 60);

    return () => {
      clearTimeout(timerId);
    };
  }, [
    departmentDetailSectionY,
    isDepartmentRole,
    isDepartmentTicketDetailExpanded,
    selectedTicket?.id,
    shouldScrollToDepartmentDetail,
  ]);

  useEffect(() => {
    if (!selectedPatrolTask) {
      setSelectedPatrolAssigneeId('');
      return;
    }
    setSelectedPatrolAssigneeId(selectedPatrolTask.assigned_to || '');
  }, [selectedPatrolTask?.assigned_to, selectedPatrolTask?.id]);

  useEffect(() => {
    /** 担当者IDを一意に抽出して名前を取得 */
    const assignedIds = [
      ...new Set(hqPatrolTasks.filter((t) => t.assigned_to).map((t) => t.assigned_to)),
    ];
    if (assignedIds.length === 0) {
      return;
    }
    const loadAssigneeProfiles = async () => {
      const { profiles } = await getUserProfilesByIds(assignedIds);
      const map = {};
      (profiles || []).forEach((p) => {
        map[p.user_id] = p.name || '不明';
      });
      setOverviewProfileMap(map);
    };
    loadAssigneeProfiles();
  }, [hqPatrolTasks]);

  /**
   * 概況ダッシュボード用: タスクの状態・時刻を表示文字列に変換
   * done → 完了時刻、accepted/en_route → 受諾時刻、open → 作成時刻
   * @param {Object} task - 巡回タスク
   * @returns {string} 表示用時刻文字列
   */
  const formatOverviewTaskTime = (task) => {
    /** 時刻表示オプション（時:分のみ） */
    const opts = { hour: '2-digit', minute: '2-digit' };
    if (task.task_status === 'done' && task.done_at) {
      return `完了: ${new Date(task.done_at).toLocaleString('ja-JP', opts)}`;
    }
    if (
      (task.task_status === 'accepted' || task.task_status === 'en_route') &&
      task.accepted_at
    ) {
      return `受諾: ${new Date(task.accepted_at).toLocaleString('ja-JP', opts)}`;
    }
    return `作成: ${new Date(task.created_at).toLocaleString('ja-JP', opts)}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={screenName} navigation={navigation} />
      <OfflineBanner />
      {pushNotice.isVisible ? (
        <View style={styles.topNoticeContainer}>
          <WebPushStatusCard
            theme={theme}
            title={pushNotice.title}
            description={pushNotice.description}
            actionLabel={pushNotice.actionLabel}
            isLoading={pushNotice.isSyncingPush}
            onPress={pushNotice.onPress}
          />
        </View>
      ) : null}

      {/* HQロール向けタブバー: ScrollView の外側上部に固定 */}
      {isHQRole ? (
        <View style={[styles.iosTabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.iosTabBarContent}
          >
            {HQ_TABS.map((tab) => {
              /** タブがアクティブかどうか */
              const isTabActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.iosTabItem,
                    {
                      backgroundColor: isTabActive ? theme.primary : 'transparent',
                    },
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text
                    style={[
                      styles.iosTabItemText,
                      { color: isTabActive ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════
          HQ向け連絡案件タブ：左右分割レイアウト（PC最適化）
          タブバー直下の残り高さを全て使い、スクロールなしで操作可能にする
          ══════════════════════════════════════════════════════════════ */}
      {isHQRole && activeTab === 'tickets' ? (
        <View style={styles.hqTicketsLayout}>
          {/* ─── 左パネル: フィルター（固定ヘッダー） + チケットリスト（独立スクロール） ─── */}
          <View style={[styles.leftPanel, { borderRightColor: theme.border, backgroundColor: theme.surface }]}>
            {/* フィルターヘッダー（スクロールしても固定） */}
            <View style={[styles.leftPanelHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>対象連絡案件</Text>
                <TouchableOpacity
                  style={[styles.refreshButton, { borderColor: theme.border }]}
                  onPress={async () => {
                    await saveLastViewedAt();
                    loadTickets(selectedTicketId);
                  }}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                </TouchableOpacity>
              </View>
              {/* 種別フィルター（横スクロール） */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
                style={styles.filterScroll}
              >
                <Pressable
                  style={[
                    styles.filterChip,
                    {
                      borderColor: hqTicketTypeFilter === 'all' ? theme.primary : theme.border,
                      backgroundColor: hqTicketTypeFilter === 'all' ? `${theme.primary}1A` : theme.background,
                    },
                  ]}
                  onPress={() => setHqTicketTypeFilter('all')}
                >
                  <Text style={[styles.filterChipText, { color: hqTicketTypeFilter === 'all' ? theme.primary : theme.textSecondary }]}>
                    すべて
                  </Text>
                </Pressable>
                {Object.entries(TICKET_TYPE_LABELS).map(([key, label]) => {
                  /** 選択中かどうか */
                  const isActive = hqTicketTypeFilter === key;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                        },
                      ]}
                      onPress={() => setHqTicketTypeFilter(isActive ? 'all' : key)}
                    >
                      <Text style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* 団体フィルター（org_idを持つチケットが存在する場合のみ） */}
              {hqFilterOrganizations.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterScrollContent}
                  style={styles.filterScroll}
                >
                  <Pressable
                    style={[
                      styles.filterChip,
                      {
                        borderColor: hqOrgFilter === 'all' ? '#1A7F37' : theme.border,
                        backgroundColor: hqOrgFilter === 'all' ? '#1A7F371A' : theme.background,
                      },
                    ]}
                    onPress={() => setHqOrgFilter('all')}
                  >
                    <Text style={[styles.filterChipText, { color: hqOrgFilter === 'all' ? '#1A7F37' : theme.textSecondary }]}>
                      すべての団体
                    </Text>
                  </Pressable>
                  {hqFilterOrganizations.map((org) => {
                    /** 選択中かどうか */
                    const isActive = hqOrgFilter === org.id;
                    return (
                      <Pressable
                        key={org.id}
                        style={[
                          styles.filterChip,
                          {
                            borderColor: isActive ? '#1A7F37' : theme.border,
                            backgroundColor: isActive ? '#1A7F371A' : theme.background,
                          },
                        ]}
                        onPress={() => setHqOrgFilter(isActive ? 'all' : org.id)}
                      >
                        <Text style={[styles.filterChipText, { color: isActive ? '#1A7F37' : theme.textSecondary }]}>
                          {org.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
            {/* チケットリスト（独立スクロール） */}
            <ScrollView style={styles.leftPanelScroll} contentContainerStyle={styles.leftPanelContent}>
              {isLoadingTickets ? (
                <SkeletonLoader lines={4} baseColor={theme.border} />
              ) : filteredTickets.length === 0 ? (
                <EmptyState
                  icon={'\u{1F4E8}'}
                  title="対象の連絡案件はありません"
                  description="新しい連絡案件が届くとここに表示されます。"
                  actionLabel="更新する"
                  onAction={() => loadTickets(selectedTicketId)}
                  theme={theme}
                />
              ) : (
                filteredTickets.map((ticket) => {
                  /** このチケットが選択中かどうか */
                  const isActive = ticket.id === selectedTicketId;
                  const alertInfo = getElapsedAlertInfo(ticket.created_at, ticket.ticket_status);
                  /** 緊急呼び出しチケットかどうか */
                  const isEmergency = ticket.ticket_type === 'emergency';
                  /** 経過時間アラートによる左ボーダー色（緊急は赤固定） */
                  const alertBorderColor = isEmergency ? '#D1242F' : (alertInfo.color || (isActive ? theme.primary : theme.border));
                  return (
                    <Pressable
                      key={ticket.id}
                      style={[
                        styles.ticketItem,
                        {
                          borderColor: isEmergency ? '#D1242F' : (isActive ? theme.primary : theme.border),
                          borderWidth: isEmergency ? 2 : 1,
                          backgroundColor: isEmergency ? '#D1242F10' : (isActive ? `${theme.primary}18` : theme.background),
                          borderLeftWidth: isEmergency ? 4 : (alertInfo.color ? 4 : 1),
                          borderLeftColor: alertBorderColor,
                          marginBottom: 8,
                        },
                      ]}
                      onPress={() => setSelectedTicketId((prev) => (prev === ticket.id ? null : ticket.id))}
                    >
                      {/* 緊急呼び出しラベル */}
                      {isEmergency ? (
                        <Text style={[styles.ticketTitle, { color: '#D1242F', fontWeight: '700' }]}>
                          🚨 緊急呼び出し
                        </Text>
                      ) : null}
                      {/* 企画名・場所（緊急は大きめフォントで強調） */}
                      <Text
                        style={[
                          styles.ticketMeta,
                          isEmergency
                            ? { color: theme.text, fontSize: 15, fontWeight: '700' }
                            : { color: theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {ticket.event_name} / {ticket.event_location}
                      </Text>
                      {!isEmergency ? (
                        <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                          {ticket.title}
                        </Text>
                      ) : null}
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {TICKET_TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type} /{' '}
                        {STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status} /{' '}
                        {new Date(ticket.created_at).toLocaleString('ja-JP')}
                      </Text>
                      {alertInfo.color && !isEmergency ? (
                        <Text style={[styles.elapsedAlert, { color: alertInfo.color }]}>
                          {formatElapsedMinutes(alertInfo.elapsedMinutes)} 経過
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* ─── 右パネル: チケット詳細（独立スクロール） ─── */}
          <ScrollView
            style={[styles.rightPanel, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.rightPanelContent}
          >
            {selectedTicket ? (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>案件詳細</Text>
                <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>{selectedTicket.title}</Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>受付番号: {selectedTicket.ticket_no || '-'}</Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                  種別: {TICKET_TYPE_LABELS[selectedTicket.ticket_type] || selectedTicket.ticket_type} / 状態:{' '}
                  {getTicketStatusLabelForRole(selectedTicket, roleType)}
                </Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                  企画: {selectedTicket.event_name}（{selectedTicket.event_location}）
                </Text>
                {isEventStatusTicket ? (
                  <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                    巡回の「確認に向かう/確認完了」はこの案件のメッセージに反映されます
                  </Text>
                ) : null}

                <Text style={[styles.label, { color: theme.text }]}>依頼内容</Text>
                <Text
                  style={[
                    styles.requestBody,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  {selectedTicket.description}
                </Text>

                {shouldShowTicketAttachments ? (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.label, { color: theme.text }]}>添付</Text>
                      <TouchableOpacity
                        style={[styles.refreshButton, { borderColor: theme.border }]}
                        onPress={() => loadTicketAttachedFiles(selectedTicket.id)}
                      >
                        <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                      </TouchableOpacity>
                    </View>

                    {isLoadingAttachments ? (
                      <Text style={[styles.helpText, { color: theme.textSecondary }]}>添付を読み込み中...</Text>
                    ) : ticketAttachments.length === 0 ? (
                      <Text style={[styles.helpText, { color: theme.textSecondary }]}>添付はありません</Text>
                    ) : (
                      <View style={styles.attachmentList}>
                        {ticketAttachments.map((attachment) => {
                          const isImage = normalizeText(attachment.mime_type).startsWith('image/');
                          const fileName = normalizeText(attachment.storage_path).split('/').pop() || '添付ファイル';
                          return (
                            <View
                              key={attachment.id}
                              style={[
                                styles.attachmentItem,
                                { borderColor: theme.border, backgroundColor: theme.background },
                              ]}
                            >
                              <Text style={[styles.attachmentName, { color: theme.text }]} numberOfLines={1}>
                                {attachment.caption || fileName}
                              </Text>
                              <Text style={[styles.attachmentMeta, { color: theme.textSecondary }]}>
                                {fileName} / {formatFileSize(attachment.file_size_bytes)} /{' '}
                                {attachment.mime_type || 'application/octet-stream'}
                              </Text>
                              {isImage && attachment.signedUrl ? (
                                <Image
                                  source={{ uri: attachment.signedUrl }}
                                  style={styles.attachmentPreview}
                                  resizeMode="cover"
                                />
                              ) : null}
                              <TouchableOpacity
                                style={[
                                  styles.attachmentOpenButton,
                                  {
                                    borderColor: attachment.signedUrl ? theme.border : '#9CA3AF',
                                    backgroundColor: theme.surface,
                                  },
                                ]}
                                disabled={!attachment.signedUrl}
                                onPress={() => openAttachment(attachment)}
                              >
                                <Text
                                  style={[
                                    styles.attachmentOpenButtonText,
                                    { color: attachment.signedUrl ? theme.textSecondary : '#9CA3AF' },
                                  ]}
                                >
                                  {attachment.signedUrl ? '添付を開く' : 'URL生成失敗'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : null}

                {isHQRole && ['accounting', 'property'].includes(selectedTicket.notify_target) ? (
                  <TouchableOpacity
                    style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                    onPress={handleRenotifyDepartment}
                    disabled={isRenotifying}
                  >
                    <Text style={[styles.statusButtonText, { color: theme.textSecondary }]}>
                      {isRenotifying ? '再通知中...' : '部署へ再通知'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.sectionHeader}>
                  <Text style={[styles.label, { color: theme.text }]}>対応メッセージ</Text>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={() => loadMessages(selectedTicket.id)}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                  </TouchableOpacity>
                </View>

                {isLoadingMessages ? (
                  <SkeletonLoader lines={3} baseColor={theme.border} />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={'\u{1F4AC}'}
                    title="まだ対応メッセージはありません"
                    description="回答を送信するとここに表示されます。"
                    theme={theme}
                  />
                ) : (
                  <View style={styles.messageList}>
                    {messages.map((message) => {
                      const isMine = message.author_id === user?.id;
                      /** ロール別色分け: 自分=青、相手=グレー */
                      const roleColor = isMine ? MESSAGE_ROLE_COLORS.self : MESSAGE_ROLE_COLORS.other;
                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageItem,
                            {
                              borderColor: isMine ? theme.primary : theme.border,
                              backgroundColor: isMine ? `${theme.primary}14` : theme.background,
                              borderLeftWidth: 3,
                              borderLeftColor: roleColor,
                            },
                          ]}
                        >
                          <Text style={[styles.messageAuthor, { color: roleColor }]}>
                            {isMine ? 'あなた' : '相手'}
                          </Text>
                          <Text style={[styles.messageBody, { color: theme.text }]}>{message.body}</Text>
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            {new Date(message.created_at).toLocaleString('ja-JP')}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.label, { color: theme.text }]}>回答入力</Text>
                <TextInput
                  value={replyBody}
                  onChangeText={setReplyBody}
                  multiline
                  placeholder="回答内容を入力してください"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.replyInput,
                    { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
                  ]}
                />

                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: theme.primary }]}
                  onPress={handleReplySubmit}
                  disabled={isSendingReply}
                >
                  <Text style={styles.sendButtonText}>{isSendingReply ? '送信中...' : '回答を送信'}</Text>
                </TouchableOpacity>

                {/* ステータス変更Picker */}
                <View
                  style={[
                    styles.statusPickerContainer,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  <Text style={[styles.statusPickerLabel, { color: theme.textSecondary }]}>
                    {isUpdatingStatus ? 'ステータス更新中...' : 'ステータスを変更'}
                  </Text>
                  <Picker
                    selectedValue={selectedTicket.ticket_status}
                    onValueChange={(value) => {
                      /** 現在のステータスと同じ値が選択された場合は何もしない */
                      if (value === selectedTicket.ticket_status) {
                        return;
                      }
                      handleStatusUpdate(value);
                    }}
                    enabled={!isUpdatingStatus}
                    style={[styles.picker, { color: theme.text, backgroundColor: theme.background }]}
                  >
                    <Picker.Item label={`受領 (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.ACKNOWLEDGED]})`} value={SUPPORT_TICKET_STATUSES.ACKNOWLEDGED} />
                    <Picker.Item label={`対応中 (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.IN_PROGRESS]})`} value={SUPPORT_TICKET_STATUSES.IN_PROGRESS} />
                    {isEventStatusTicket ? (
                      <Picker.Item label={`巡回確認待ち (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL]})`} value={SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL} />
                    ) : null}
                    <Picker.Item label={`解決済み (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.RESOLVED]})`} value={SUPPORT_TICKET_STATUSES.RESOLVED} />
                    <Picker.Item label={`クローズ (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.CLOSED]})`} value={SUPPORT_TICKET_STATUSES.CLOSED} />
                  </Picker>
                </View>
              </View>
            ) : (
              /* チケット未選択時の誘導メッセージ */
              <View style={styles.noSelectionState}>
                <Text style={styles.noSelectionIcon}>📋</Text>
                <Text style={[styles.noSelectionText, { color: theme.textSecondary }]}>
                  左のリストからチケットを選択してください
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}

      {/* その他タブのScrollViewエリア（HQ tickets タブ以外で表示） */}
      {!(isHQRole && activeTab === 'tickets') ? (
      <ScrollView ref={departmentScrollViewRef} contentContainerStyle={styles.content}>
        {/* 説明カード（HQ以外のロールのみ表示） */}
        {!isHQRole && shouldShowDepartmentDescription ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.description, { color: theme.textSecondary }]}>{screenDescription}</Text>
          </View>
        ) : null}

        {/* ─── 概況確認タブ: 企画報告確認 + 施錠確認 ─── */}
        {isHQRole && activeTab === 'overview' ? (
          <>
            {/* ── 企画報告確認セクション（開始確認・終了確認） ── */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>企画報告確認</Text>
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={loadHqPatrolTasks}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={toggleOverviewReportSection}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                      {isOverviewReportSectionExpanded ? '折りたたむ' : '開く'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {!isOverviewReportSectionExpanded ? (
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                  {isLoadingHqPatrolTasks
                    ? '読み込み中です。'
                    : `折りたたみ中です。現在 ${overviewReportTasks.length} 件あります。`}
                </Text>
              ) : (
                <>
                  {/* ステータスフィルター（企画報告セクション専用） */}
                  <Text style={[styles.label, { color: theme.text }]}>状態</Text>
                  <View style={styles.filterRow}>
                    {OVERVIEW_STATUS_FILTERS.map((f) => {
                      /** このフィルターが選択中かどうか */
                      const isActive = overviewStatusFilter === f.key;
                      return (
                        <Pressable
                          key={f.key}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isActive ? theme.primary : theme.border,
                              backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewStatusFilter(f.key)}
                        >
                          <Text
                            style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}
                          >
                            {f.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* 種別フィルター（企画報告セクション専用） */}
                  <Text style={[styles.label, { color: theme.text }]}>種別</Text>
                  <View style={styles.filterRow}>
                    {OVERVIEW_REPORT_TYPE_FILTERS.map((f) => {
                      /** このフィルターが選択中かどうか */
                      const isActive = overviewReportTypeFilter === f.key;
                      return (
                        <Pressable
                          key={f.key}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isActive ? '#0969DA' : theme.border,
                              backgroundColor: isActive ? '#0969DA1A' : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewReportTypeFilter(f.key)}
                        >
                          <Text style={[styles.filterChipText, { color: isActive ? '#0969DA' : theme.textSecondary }]}>
                            {f.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* タスクリスト */}
                  {isLoadingHqPatrolTasks ? (
                    <SkeletonLoader lines={3} baseColor={theme.border} />
                  ) : overviewReportTasks.length === 0 ? (
                    <EmptyState
                      icon={'\u{1F4CB}'}
                      title="該当する報告確認はありません"
                      description="状態フィルターを変更するか、更新ボタンで再取得してください。"
                      theme={theme}
                    />
                  ) : (
                    overviewReportTasks.map((task) => {
                      /** 担当者名（プロフィールマップから取得。未割当の場合は表示） */
                      const assigneeName =
                        overviewProfileMap[task.assigned_to] || (task.assigned_to ? '読込中...' : '未割当');
                      /** ステータス色 */
                      const statusColor = PATROL_STATUS_BADGE_COLORS[task.task_status] || '#57606A';
                      /** 時刻文字列 */
                      const timeStr = formatOverviewTaskTime(task);
                      return (
                        <View
                          key={task.id}
                          style={[
                            styles.overviewTaskCard,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.background,
                              borderLeftColor: statusColor,
                            },
                          ]}
                        >
                          <View style={styles.overviewTaskHeader}>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                              <Text style={styles.statusBadgeText}>
                                {PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status}
                              </Text>
                            </View>
                            <Text style={[styles.overviewTaskType, { color: theme.text }]}>
                              {PATROL_TASK_TYPE_LABELS[task.task_type] || task.task_type}
                            </Text>
                          </View>
                          <Text style={[styles.overviewTaskLocation, { color: theme.text }]} numberOfLines={1}>
                            {task.event_name || '-'} / {task.event_location || task.location_text || '-'}
                          </Text>
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            担当: {assigneeName} / {timeStr}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </View>

            {/* ── 施錠確認セクション ── */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>施錠確認</Text>
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={loadHqPatrolTasks}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={toggleOverviewLockSection}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                      {isOverviewLockSectionExpanded ? '折りたたむ' : '開く'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                担当有無と確認状況で絞り込めます。
              </Text>

              {!isOverviewLockSectionExpanded ? (
                <Text style={[styles.helpText, { color: theme.textSecondary, marginTop: 8 }]}>
                  {isLoadingHqPatrolTasks
                    ? '読み込み中です。'
                    : `折りたたみ中です。現在 ${overviewLockTasks.length} 件あります。`}
                </Text>
              ) : (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>担当</Text>
                  <View style={styles.filterRow}>
                    {OVERVIEW_LOCK_ASSIGNEE_FILTERS.map((filter) => {
                      /** このフィルターが選択中かどうか */
                      const isActive = overviewLockAssigneeFilter === filter.key;
                      return (
                        <Pressable
                          key={filter.key}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isActive ? theme.primary : theme.border,
                              backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewLockAssigneeFilter(filter.key)}
                        >
                          <Text
                            style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}
                          >
                            {filter.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>確認状況</Text>
                  <View style={styles.filterRow}>
                    {OVERVIEW_LOCK_CONFIRMATION_FILTERS.map((filter) => {
                      /** このフィルターが選択中かどうか */
                      const isActive = overviewLockConfirmationFilter === filter.key;
                      return (
                        <Pressable
                          key={filter.key}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isActive ? '#1A7F37' : theme.border,
                              backgroundColor: isActive ? '#1A7F371A' : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewLockConfirmationFilter(filter.key)}
                        >
                          <Text
                            style={[styles.filterChipText, { color: isActive ? '#1A7F37' : theme.textSecondary }]}
                          >
                            {filter.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {isLoadingHqPatrolTasks ? (
                    <SkeletonLoader lines={2} baseColor={theme.border} />
                  ) : overviewLockTasks.length === 0 ? (
                    <EmptyState
                      icon={'\u{1F510}'}
                      title="該当する施錠確認はありません"
                      description="担当か確認状況のフィルターを変更するか、更新ボタンで再取得してください。"
                      theme={theme}
                    />
                  ) : (
                    overviewLockTasks.map((task) => {
                      /** 担当者名（プロフィールマップから取得。未割当の場合は表示） */
                      const assigneeName =
                        overviewProfileMap[task.assigned_to] || (task.assigned_to ? '読込中...' : '未割当');
                      /** ステータス色 */
                      const statusColor = PATROL_STATUS_BADGE_COLORS[task.task_status] || '#57606A';
                      /** 時刻文字列 */
                      const timeStr = formatOverviewTaskTime(task);
                      return (
                        <View
                          key={task.id}
                          style={[
                            styles.overviewTaskCard,
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.background,
                              borderLeftColor: statusColor,
                            },
                          ]}
                        >
                          <View style={styles.overviewTaskHeader}>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                              <Text style={styles.statusBadgeText}>
                                {PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status}
                              </Text>
                            </View>
                            <Text style={[styles.overviewTaskType, { color: theme.text }]}>施錠確認</Text>
                          </View>
                          <Text style={[styles.overviewTaskLocation, { color: theme.text }]} numberOfLines={1}>
                            {task.event_name || task.location_text || '-'} / {task.event_location || '-'}
                          </Text>
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            担当: {assigneeName} / {timeStr}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </View>
          </>
        ) : null}

        {/* ─── 鍵管理タブ ─── */}
        {isHQRole && activeTab === 'keys' ? (
          <HQKeyManagementPanel theme={theme} user={user} />
        ) : null}

        {/* ─── 鍵マスタタブ ─── */}
        {isHQRole && activeTab === 'master' ? (
          <KeyMasterEditPanel theme={theme} />
        ) : null}

        {/* ─── 企画一覧タブ（HQ） ─── */}
        {isHQRole && activeTab === 'event_orgs' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>企画一覧</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={loadHqOrganizationEvents}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              organizations_events の団体別企画一覧です。団体を選ぶと対象企画だけ確認できます。
            </Text>

            {/* 団体候補検索バー */}
            <TextInput
              value={hqOrganizationEventSearch}
              onChangeText={handleHqOrganizationEventSearchChange}
              onFocus={() => setIsHqOrganizationEventDropdownOpen(true)}
              placeholder="団体名を入力して候補を絞り込み..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.compactInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.text, marginBottom: 10 },
              ]}
            />

            <View
              style={[
                styles.selectedSummaryCard,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <View style={styles.selectedSummaryContent}>
                <Text style={[styles.selectedSummaryLabel, { color: theme.textSecondary }]}>
                  選択中の団体
                </Text>
                <Text style={[styles.selectedSummaryValue, { color: theme.text }]}>
                  {selectedHqOrganizationEventLabel}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.inlineActionButton, { borderColor: theme.border }]}
                onPress={handleHqOrganizationEventReset}
              >
                <Text style={[styles.inlineActionButtonText, { color: theme.textSecondary }]}>すべて表示</Text>
              </TouchableOpacity>
            </View>

            {isHqOrganizationEventDropdownOpen ? (
              <View
                style={[
                  styles.dropdownOptionList,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
              >
                {filteredHqOrganizationEventOptions.length === 0 ? (
                  <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                    該当する団体候補がありません
                  </Text>
                ) : (
                  <>
                    {visibleHqOrganizationEventOptions.map((option) => {
                      /** 選択中団体かどうか */
                      const isSelected = option.value === selectedHqOrganizationEvent;

                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handleHqOrganizationEventSelect(option.value)}
                          style={[
                            styles.dropdownOptionItem,
                            {
                              borderColor: theme.border,
                              backgroundColor: isSelected ? theme.primary : theme.surface,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownOptionTitle,
                              { color: isSelected ? '#FFFFFF' : theme.text },
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={[
                              styles.dropdownOptionMeta,
                              { color: isSelected ? 'rgba(255,255,255,0.86)' : theme.textSecondary },
                            ]}
                          >
                            企画 {option.count} 件
                          </Text>
                        </Pressable>
                      );
                    })}

                    {filteredHqOrganizationEventOptions.length > visibleHqOrganizationEventOptions.length ? (
                      <Text style={[styles.dropdownOverflowText, { color: theme.textSecondary }]}>
                        ほか {filteredHqOrganizationEventOptions.length - visibleHqOrganizationEventOptions.length} 件あります。さらに入力すると絞り込めます。
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            {isLoadingHqOrganizationEvents ? (
              <SkeletonLoader lines={4} baseColor={theme.border} />
            ) : hqOrganizationEvents.length === 0 ? (
              <EmptyState
                icon={'\u{1F3E2}'}
                title="団体別企画データがありません"
                description="更新ボタンで再取得してください。"
                theme={theme}
              />
            ) : filteredHqOrganizationEvents.length === 0 ? (
              <Text style={[styles.helpText, { color: theme.textSecondary, textAlign: 'center', paddingVertical: 16 }]}>
                該当する企画がありません
              </Text>
            ) : (
              <View style={styles.ticketList}>
                {filteredHqOrganizationEvents.map((item) => (
                  <View
                    key={`${item.id}-${item.organization_name}-${item.event_name}`}
                    style={[
                      styles.ticketItem,
                      { borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                      {item.organization_name || '団体名未設定'}
                    </Text>
                    <Text style={[styles.ticketTitle, { color: theme.text }]}>
                      {item.event_name || '企画名未設定'}
                    </Text>
                    {item.sheet_name ? (
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        シート: {item.sheet_name}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* ─── 無線タブ: ダッシュボード + 無線ログ ─── */}
        {isHQRole && activeTab === 'radio' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>本部ダッシュボード</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={() => {
                  loadTickets(selectedTicketId);
                  loadHqPatrolTasks();
                  loadRadioLogs();
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dashboardGrid}>
              <View style={[styles.dashboardCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>新着連絡</Text>
                <Text style={[styles.dashboardValue, { color: theme.text }]}>{dashboardSummary.newTickets}</Text>
              </View>
              <View style={[styles.dashboardCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>遅延案件(60分+)</Text>
                <Text style={[styles.dashboardValue, { color: '#D1242F' }]}>{dashboardSummary.delayedTickets}</Text>
              </View>
              <View style={[styles.dashboardCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>巡回対応中</Text>
                <Text style={[styles.dashboardValue, { color: theme.text }]}>{dashboardSummary.activePatrolTasks}</Text>
              </View>
              <View style={[styles.dashboardCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>無線ログ(1h)</Text>
                <Text style={[styles.dashboardValue, { color: theme.text }]}>{dashboardSummary.recentRadioLogs}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ─── 巡回・評価タブ ─── */}
        {isHQRole && activeTab === 'patrol' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>巡回タスク割当</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={() => {
                  loadHqPatrolTasks();
                  loadPatrolAssignees();
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            {isLoadingHqPatrolTasks ? (
              <SkeletonLoader lines={3} baseColor={theme.border} />
            ) : hqPatrolTasks.length === 0 ? (
              <EmptyState
                icon={'\u{1F6B6}'}
                title="巡回タスクはありません"
                description="新しいタスクが作成されると表示されます。"
                actionLabel="更新する"
                onAction={() => loadHqPatrolTasks()}
                theme={theme}
              />
            ) : (
              <View style={styles.ticketList}>
                {hqPatrolTasks.slice(0, 18).map((task) => {
                  const isActive = task.id === selectedPatrolTaskId;
                  const assigneeName = patrolAssignees.find((candidate) => candidate.userId === task.assigned_to)?.name;
                  return (
                    <Pressable
                      key={task.id}
                      style={[
                        styles.ticketItem,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? `${theme.primary}18` : theme.background,
                        },
                      ]}
                      onPress={() => setSelectedPatrolTaskId(task.id)}
                    >
                      <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                        {PATROL_TASK_TYPE_LABELS[task.task_type] || task.task_type}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {task.event_name || '-'} / {task.event_location || task.location_text || '-'}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status} / 担当: {assigneeName || '未割当'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {selectedPatrolTask ? (
              <>
                <Text style={[styles.label, { color: theme.text }]}>担当者選択</Text>
                {isLoadingPatrolAssignees ? (
                  <Text style={[styles.helpText, { color: theme.textSecondary }]}>担当候補を読み込み中...</Text>
                ) : (
                  <View style={styles.filterRow}>
                    <Pressable
                      style={[
                        styles.filterChip,
                        {
                          borderColor: selectedPatrolAssigneeId ? theme.border : theme.primary,
                          backgroundColor: selectedPatrolAssigneeId ? theme.background : `${theme.primary}1A`,
                        },
                      ]}
                      onPress={() => setSelectedPatrolAssigneeId('')}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selectedPatrolAssigneeId ? theme.textSecondary : theme.primary },
                        ]}
                      >
                        未割当
                      </Text>
                    </Pressable>
                    {patrolAssignees.map((candidate) => {
                      const isActive = candidate.userId === selectedPatrolAssigneeId;
                      return (
                        <Pressable
                          key={candidate.userId}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isActive ? theme.primary : theme.border,
                              backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                            },
                          ]}
                          onPress={() => setSelectedPatrolAssigneeId(candidate.userId)}
                        >
                          <Text style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}> 
                            {candidate.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: theme.primary }]}
                  onPress={handleAssignPatrolTask}
                  disabled={isAssigningPatrolTask}
                >
                  <Text style={styles.sendButtonText}>
                    {isAssigningPatrolTask ? '更新中...' : '巡回担当を更新'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : null}

        {isHQRole && activeTab === 'patrol' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>評価承認</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={loadPendingEvaluations}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            {isLoadingPendingEvaluations ? (
              <SkeletonLoader lines={2} baseColor={theme.border} />
            ) : pendingEvaluations.length === 0 ? (
              <EmptyState
                icon={'\u{2705}'}
                title="承認待ちの評価はありません"
                description="巡回担当が評価を登録すると表示されます。"
                theme={theme}
              />
            ) : (
              <View style={styles.messageList}>
                {pendingEvaluations.map((evaluation) => (
                  <View
                    key={evaluation.id}
                    style={[styles.messageItem, { borderColor: theme.border, backgroundColor: theme.background }]}
                  >
                    <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}> 
                      {EVALUATION_STATUS_LABELS[evaluation.evaluation_status] || evaluation.evaluation_status} / {evaluation.score || '-'}点
                    </Text>
                    <Text style={[styles.messageBody, { color: theme.text }]}>{evaluation.comment || 'コメントなし'}</Text>
                    <Text style={[styles.messageDate, { color: theme.textSecondary }]}> 
                      {evaluation.task?.task_no || evaluation.ticket?.ticket_no || evaluation.id}
                    </Text>
                    <View style={styles.statusActions}>
                      <TouchableOpacity
                        style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                        onPress={() => handleReviewEvaluation(evaluation.id, EVALUATION_STATUSES.APPROVED)}
                        disabled={isReviewingEvaluation}
                      >
                        <Text style={[styles.statusButtonText, { color: '#22A06B' }]}>承認</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                        onPress={() => handleReviewEvaluation(evaluation.id, EVALUATION_STATUSES.REWORK)}
                        disabled={isReviewingEvaluation}
                      >
                        <Text style={[styles.statusButtonText, { color: '#9F6E00' }]}>差戻し</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                        onPress={() => handleReviewEvaluation(evaluation.id, EVALUATION_STATUSES.REJECTED)}
                        disabled={isReviewingEvaluation}
                      >
                        <Text style={[styles.statusButtonText, { color: '#D1242F' }]}>却下</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* ─── 巡回対応履歴カード ─── */}
        {isHQRole && activeTab === 'patrol' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>巡回対応履歴</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={loadPatrolHistory}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            {isLoadingPatrolHistory ? (
              <SkeletonLoader lines={3} baseColor={theme.border} />
            ) : patrolHistory.length === 0 ? (
              <EmptyState
                icon={'\u{1F4CB}'}
                title="完了した巡回はありません"
                description="巡回タスクが完了すると誰が対応したかをここで確認できます。"
                theme={theme}
              />
            ) : (
              <View style={styles.messageList}>
                {patrolHistory.map((task) => {
                  /** 担当者名（プロフィールマップから取得、未解決時は不明） */
                  const assigneeName = patrolHistoryProfileMap[task.assigned_to] || '不明';
                  /** タスク種別表示名 */
                  const taskLabel = PATROL_TASK_TYPE_LABELS[task.task_type] || task.task_type;
                  /** ステータス表示名 */
                  const statusLabel = PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status;
                  /** 対応完了日時（done_at がなければ updated_at で代替） */
                  const dateStr = task.done_at
                    ? new Date(task.done_at).toLocaleString('ja-JP')
                    : new Date(task.updated_at || task.created_at).toLocaleString('ja-JP');

                  return (
                    <View
                      key={task.id}
                      style={[styles.messageItem, { borderColor: theme.border, backgroundColor: theme.background }]}
                    >
                      <Text style={[styles.messageAuthor, { color: theme.textSecondary }]} numberOfLines={1}>
                        {taskLabel} / {statusLabel}
                      </Text>
                      <Text style={[styles.messageBody, { color: theme.text }]} numberOfLines={1}>
                        {task.event_name || '-'} / {task.event_location || task.location_text || '-'}
                      </Text>
                      <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                        担当: {assigneeName} / {dateStr}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {isHQRole && activeTab === 'radio' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>無線ログ</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={loadRadioLogs}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              写真なし運用で、無線連絡内容をテキスト記録します。
            </Text>

            {/* 項目（カテゴリ）pill選択 */}
            <Text style={[styles.label, { color: theme.text }]}>項目</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
              style={styles.filterScroll}
            >
              {RADIO_LOG_CATEGORIES.map((cat) => {
                /** このカテゴリが選択中かどうか */
                const isActive = radioChannel === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: isActive ? theme.primary : theme.border,
                        backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                      },
                    ]}
                    onPress={() => setRadioChannel(cat.key)}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={radioLocation}
                onChangeText={setRadioLocation}
                placeholder="場所（任意）"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.compactInput,
                  { borderColor: theme.border, backgroundColor: theme.background, color: theme.text, flex: 1 },
                ]}
              />
            </View>

            <TextInput
              value={radioMessage}
              onChangeText={setRadioMessage}
              multiline
              placeholder="メモを入力"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.replyInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
              ]}
            />

            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: theme.primary }]}
              onPress={handleSubmitRadioLog}
              disabled={isSubmittingRadioLog}
            >
              <Text style={styles.sendButtonText}>{isSubmittingRadioLog ? '送信中...' : '無線ログを送信'}</Text>
            </TouchableOpacity>

            {/* 検索バー */}
            <TextInput
              value={radioSearch}
              onChangeText={setRadioSearch}
              placeholder="ログを検索..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.compactInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.text, marginTop: 12 },
              ]}
            />

            {isLoadingRadioLogs ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
            ) : radioLogs.length === 0 ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>無線ログはまだありません</Text>
            ) : (
              <View style={[styles.messageList, { marginTop: 10 }]}>
                {radioLogs
                  .filter((log) => {
                    /** 検索キーワードがなければ全件表示 */
                    const keyword = radioSearch.trim().toLowerCase();
                    if (!keyword) {
                      return true;
                    }
                    /** message と location_text で部分一致検索 */
                    const inMessage = (log.message || '').toLowerCase().includes(keyword);
                    const inLocation = (log.location_text || '').toLowerCase().includes(keyword);
                    return inMessage || inLocation;
                  })
                  .map((log) => {
                    /** カテゴリラベル（未知のキーはそのまま表示） */
                    const categoryLabel = RADIO_LOG_CATEGORIES.find((c) => c.key === log.channel)?.label || log.channel || '-';
                    return (
                      <View
                        key={log.id}
                        style={[styles.messageItem, { borderColor: theme.border, backgroundColor: theme.background }]}
                      >
                        <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}>
                          {categoryLabel} / {log.location_text || '場所未設定'}
                        </Text>
                        <Text style={[styles.messageBody, { color: theme.text }]}>{log.message}</Text>
                        <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                          {new Date(log.created_at).toLocaleString('ja-JP')}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>
        ) : null}

        {/* 連絡案件: 非HQロールのみScrollView内で表示（HQはsplitLayout） */}
        {!isHQRole ? (
          <>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>対象連絡案件</Text>
            <View style={styles.sectionHeaderActions}>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={async () => {
                  await saveLastViewedAt();
                  loadTickets(selectedTicketId);
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={toggleDepartmentTicketListSection}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                  {isDepartmentTicketListExpanded ? '折りたたむ' : '開く'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {isDepartmentTicketListExpanded ? (
            <>
          {isHQRole ? (
            <>
              {/* HQロール: 種別フィルター */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
                style={styles.filterScroll}
              >
                <Pressable
                  style={[
                    styles.filterChip,
                    {
                      borderColor: hqTicketTypeFilter === 'all' ? theme.primary : theme.border,
                      backgroundColor: hqTicketTypeFilter === 'all' ? `${theme.primary}1A` : theme.background,
                    },
                  ]}
                  onPress={() => setHqTicketTypeFilter('all')}
                >
                  <Text style={[styles.filterChipText, { color: hqTicketTypeFilter === 'all' ? theme.primary : theme.textSecondary }]}>
                    すべて
                  </Text>
                </Pressable>
                {Object.entries(TICKET_TYPE_LABELS).map(([key, label]) => {
                  /** 選択中かどうか */
                  const isActive = hqTicketTypeFilter === key;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                        },
                      ]}
                      onPress={() => setHqTicketTypeFilter(isActive ? 'all' : key)}
                    >
                      <Text style={[styles.filterChipText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* HQロール: 団体フィルター（org_id を持つチケットが存在する場合のみ表示） */}
              {hqFilterOrganizations.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterScrollContent}
                  style={styles.filterScroll}
                >
                  <Pressable
                    style={[
                      styles.filterChip,
                      {
                        borderColor: hqOrgFilter === 'all' ? '#1A7F37' : theme.border,
                        backgroundColor: hqOrgFilter === 'all' ? '#1A7F371A' : theme.background,
                      },
                    ]}
                    onPress={() => setHqOrgFilter('all')}
                  >
                    <Text style={[styles.filterChipText, { color: hqOrgFilter === 'all' ? '#1A7F37' : theme.textSecondary }]}>
                      すべての団体
                    </Text>
                  </Pressable>
                  {hqFilterOrganizations.map((org) => {
                    /** 選択中かどうか */
                    const isActive = hqOrgFilter === org.id;
                    return (
                      <Pressable
                        key={org.id}
                        style={[
                          styles.filterChip,
                          {
                            borderColor: isActive ? '#1A7F37' : theme.border,
                            backgroundColor: isActive ? '#1A7F371A' : theme.background,
                          },
                        ]}
                        onPress={() => setHqOrgFilter(isActive ? 'all' : org.id)}
                      >
                        <Text style={[styles.filterChipText, { color: isActive ? '#1A7F37' : theme.textSecondary }]}>
                          {org.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          ) : null}

          {isDepartmentRole ? (
            <>
              {/* 対応状況フィルター */}
              <View style={styles.filterRow}>
                {departmentTicketStatusFilters.map((filter) => {
                  const isActive = filter.key === ticketStatusFilter;
                  return (
                    <Pressable
                      key={filter.key}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                        },
                      ]}
                      onPress={() => setTicketStatusFilter(filter.key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isActive ? theme.primary : theme.textSecondary },
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {isLoadingTickets ? (
            <SkeletonLoader lines={4} baseColor={theme.border} />
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon={'\u{1F4E8}'}
              title={isDepartmentRole ? 'この条件に一致する連絡案件はありません' : '対象の連絡案件はありません'}
              description="新しい連絡案件が届くとここに表示されます。"
              actionLabel="更新する"
              onAction={() => loadTickets(selectedTicketId)}
              theme={theme}
            />
          ) : (
            <View style={styles.ticketList}>
              {filteredTickets.map((ticket) => {
                const isActive = ticket.id === selectedTicketId;
                const alertInfo = getElapsedAlertInfo(ticket.created_at, ticket.ticket_status);
                /** 未読かどうか（部署ロールのみ判定） */
                const isUnread = isDepartmentRole && isTicketUnread(ticket, lastViewedAtMs);
                /** 経過時間アラートによる左ボーダー色 */
                const alertBorderColor = alertInfo.color || (isActive ? theme.primary : theme.border);
                /** 未読の場合は左ボーダーを青色ドットで強調 */
                const leftBorderColor = isUnread && !alertInfo.color ? '#0969DA' : alertBorderColor;
                return (
                  <Pressable
                    key={ticket.id}
                    style={[
                      styles.ticketItem,
                      {
                        borderColor: isActive ? theme.primary : theme.border,
                        backgroundColor: isActive ? `${theme.primary}18` : theme.background,
                        borderLeftWidth: isUnread || alertInfo.color ? 4 : 1,
                        borderLeftColor: leftBorderColor,
                      },
                    ]}
                    onPress={() => handleSelectDepartmentTicket(ticket.id)}
                  >
                    <View style={styles.ticketTitleRow}>
                      {isUnread ? (
                        <Text style={styles.unreadDot}>●</Text>
                      ) : null}
                      <Text
                        style={[
                          styles.ticketTitle,
                          { color: theme.text },
                          isUnread ? styles.ticketTitleUnread : null,
                        ]}
                        numberOfLines={1}
                      >
                        {ticket.title}
                      </Text>
                    </View>
                    <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                      {ticket.event_name} / {ticket.event_location}
                    </Text>
                    <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                      {TICKET_TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type} /{' '}
                      {getTicketStatusLabelForRole(ticket, roleType)} /{' '}
                      {new Date(ticket.created_at).toLocaleString('ja-JP')}
                    </Text>
                    {alertInfo.color ? (
                      <Text style={[styles.elapsedAlert, { color: alertInfo.color }]}>
                        {formatElapsedMinutes(alertInfo.elapsedMinutes)} 経過
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
            </>
          ) : null}
        </View>

        {selectedTicket ? (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onLayout={(event) => {
              setDepartmentDetailSectionY(event.nativeEvent.layout.y);
            }}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>案件詳細</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={toggleDepartmentTicketDetailSection}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                  {isDepartmentTicketDetailExpanded ? '折りたたむ' : '開く'}
                </Text>
              </TouchableOpacity>
            </View>

            {isDepartmentTicketDetailExpanded ? (
              <>
                <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>{selectedTicket.title}</Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>受付番号: {selectedTicket.ticket_no || '-'}</Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}> 
                  種別: {TICKET_TYPE_LABELS[selectedTicket.ticket_type] || selectedTicket.ticket_type} / 状態:{' '}
                  {getTicketStatusLabelForRole(selectedTicket, roleType)}
                </Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}> 
                  企画: {selectedTicket.event_name}（{selectedTicket.event_location}）
                </Text>
                {isEventStatusTicket ? (
                  <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}> 
                    巡回の「確認に向かう/確認完了」はこの案件のメッセージに反映されます
                  </Text>
                ) : null}

                <Text style={[styles.label, { color: theme.text }]}>ステータス</Text>
                {isDepartmentRole ? (
                  <View
                    style={[
                      styles.departmentStatusPanel,
                      { borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[styles.statusPickerLabel, { color: theme.textSecondary }]}>
                      {isUpdatingStatus ? 'ステータス更新中...' : 'ステータスを変更'}
                    </Text>
                    <View style={styles.departmentStatusActions}>
                      {departmentStatusOptions.map((option) => {
                        const tone = DEPARTMENT_STATUS_TONES[option.key] || {
                          borderColor: theme.primary,
                          backgroundColor: `${theme.primary}14`,
                        };
                        const isActive = selectedDepartmentStatus === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            style={[
                              styles.departmentStatusButton,
                              {
                                borderColor: isActive ? tone.borderColor : theme.border,
                                backgroundColor: isActive ? tone.backgroundColor : theme.surface,
                                opacity: isUpdatingStatus && !isActive ? 0.72 : 1,
                              },
                            ]}
                            onPress={() => {
                              if (isUpdatingStatus || isActive) {
                                return;
                              }
                              handleStatusUpdate(option.key);
                            }}
                            disabled={isUpdatingStatus}
                          >
                            <Text
                              style={[
                                styles.departmentStatusButtonLabel,
                                { color: isActive ? tone.borderColor : theme.text },
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.departmentStatusButtonMeta,
                                { color: isActive ? tone.borderColor : theme.textSecondary },
                              ]}
                            >
                              {isActive ? '選択中' : 'この状態に変更'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.statusPickerContainer,
                      { borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[styles.statusPickerLabel, { color: theme.textSecondary }]}>
                      {isUpdatingStatus ? 'ステータス更新中...' : 'ステータスを変更'}
                    </Text>
                    <Picker
                      selectedValue={selectedTicket.ticket_status}
                      onValueChange={(value) => {
                        if (value === selectedTicket.ticket_status) {
                          return;
                        }
                        handleStatusUpdate(value);
                      }}
                      enabled={!isUpdatingStatus}
                      style={[styles.picker, { color: theme.text, backgroundColor: theme.background }]}
                    >
                      <Picker.Item
                        label={`受領 (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.ACKNOWLEDGED]})`}
                        value={SUPPORT_TICKET_STATUSES.ACKNOWLEDGED}
                      />
                      <Picker.Item
                        label={`対応中 (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.IN_PROGRESS]})`}
                        value={SUPPORT_TICKET_STATUSES.IN_PROGRESS}
                      />
                      {isEventStatusTicket ? (
                        <Picker.Item
                          label={`巡回確認待ち (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL]})`}
                          value={SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL}
                        />
                      ) : null}
                      <Picker.Item
                        label={`解決済み (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.RESOLVED]})`}
                        value={SUPPORT_TICKET_STATUSES.RESOLVED}
                      />
                      <Picker.Item
                        label={`クローズ (${STATUS_LABELS[SUPPORT_TICKET_STATUSES.CLOSED]})`}
                        value={SUPPORT_TICKET_STATUSES.CLOSED}
                      />
                    </Picker>
                  </View>
                )}

                <Text style={[styles.label, { color: theme.text }]}>依頼内容</Text>
                <Text
                  style={[
                    styles.requestBody,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  {selectedTicket.description}
                </Text>

                {shouldShowTicketAttachments ? (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.label, { color: theme.text }]}>添付</Text>
                      <TouchableOpacity
                        style={[styles.refreshButton, { borderColor: theme.border }]}
                        onPress={() => loadTicketAttachedFiles(selectedTicket.id)}
                      >
                        <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                      </TouchableOpacity>
                    </View>

                    {isLoadingAttachments ? (
                      <Text style={[styles.helpText, { color: theme.textSecondary }]}>添付を読み込み中...</Text>
                    ) : ticketAttachments.length === 0 ? (
                      <Text style={[styles.helpText, { color: theme.textSecondary }]}>添付はありません</Text>
                    ) : (
                      <View style={styles.attachmentList}>
                        {ticketAttachments.map((attachment) => {
                          const isImage = normalizeText(attachment.mime_type).startsWith('image/');
                          const fileName = normalizeText(attachment.storage_path).split('/').pop() || '添付ファイル';
                          return (
                            <View
                              key={attachment.id}
                              style={[
                                styles.attachmentItem,
                                { borderColor: theme.border, backgroundColor: theme.background },
                              ]}
                            >
                              <Text style={[styles.attachmentName, { color: theme.text }]} numberOfLines={1}>
                                {attachment.caption || fileName}
                              </Text>
                              <Text style={[styles.attachmentMeta, { color: theme.textSecondary }]}>
                                {fileName} / {formatFileSize(attachment.file_size_bytes)} /{' '}
                                {attachment.mime_type || 'application/octet-stream'}
                              </Text>
                              {isImage && attachment.signedUrl ? (
                                <Image
                                  source={{ uri: attachment.signedUrl }}
                                  style={styles.attachmentPreview}
                                  resizeMode="cover"
                                />
                              ) : null}
                              <TouchableOpacity
                                style={[
                                  styles.attachmentOpenButton,
                                  {
                                    borderColor: attachment.signedUrl ? theme.border : '#9CA3AF',
                                    backgroundColor: theme.surface,
                                  },
                                ]}
                                disabled={!attachment.signedUrl}
                                onPress={() => openAttachment(attachment)}
                              >
                                <Text
                                  style={[
                                    styles.attachmentOpenButtonText,
                                    { color: attachment.signedUrl ? theme.textSecondary : '#9CA3AF' },
                                  ]}
                                >
                                  {attachment.signedUrl ? '添付を開く' : 'URL生成失敗'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : null}

                {isHQRole && ['accounting', 'property'].includes(selectedTicket.notify_target) ? (
                  <TouchableOpacity
                    style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                    onPress={handleRenotifyDepartment}
                    disabled={isRenotifying}
                  >
                    <Text style={[styles.statusButtonText, { color: theme.textSecondary }]}> 
                      {isRenotifying ? '再通知中...' : '部署へ再通知'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.sectionHeader}>
                  <Text style={[styles.label, { color: theme.text }]}>対応メッセージ</Text>
                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.border }]}
                    onPress={() => loadMessages(selectedTicket.id)}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                  </TouchableOpacity>
                </View>

                {isLoadingMessages ? (
                  <SkeletonLoader lines={3} baseColor={theme.border} />
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={'\u{1F4AC}'}
                    title="まだ対応メッセージはありません"
                    description="回答を送信するとここに表示されます。"
                    theme={theme}
                  />
                ) : (
                  <View style={styles.messageList}>
                    {messages.map((message) => {
                      const isMine = message.author_id === user?.id;
                      /** ロール別色分け: 自分=青、相手=グレー */
                      const roleColor = isMine ? MESSAGE_ROLE_COLORS.self : MESSAGE_ROLE_COLORS.other;
                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageItem,
                            {
                              borderColor: isMine ? theme.primary : theme.border,
                              backgroundColor: isMine ? `${theme.primary}14` : theme.background,
                              borderLeftWidth: 3,
                              borderLeftColor: roleColor,
                            },
                          ]}
                        >
                          <Text style={[styles.messageAuthor, { color: roleColor }]}>
                            {isMine ? 'あなた' : '相手'}
                          </Text>
                          <Text style={[styles.messageBody, { color: theme.text }]}>{message.body}</Text>
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            {new Date(message.created_at).toLocaleString('ja-JP')}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.label, { color: theme.text }]}>回答入力</Text>
                <TextInput
                  value={replyBody}
                  onChangeText={setReplyBody}
                  multiline
                  placeholder={isDepartmentRole ? '回答/対応メモを入力してください' : '回答内容を入力してください'}
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.replyInput,
                    { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
                  ]}
                />

                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: theme.primary }]}
                  onPress={handleReplySubmit}
                  disabled={isSendingReply}
                >
                  <Text style={styles.sendButtonText}>{isSendingReply ? '送信中...' : '回答を送信'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : null}
          </>
        ) : null}

        {/* ─── 景品配布基準カード（会計ロールのみ） ─── */}
        {roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>景品配布基準</Text>
              <View style={styles.sectionHeaderActions}>
                <TouchableOpacity
                  style={[styles.refreshButton, { borderColor: theme.border }]}
                  onPress={loadPrizeDistributions}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.refreshButton, { borderColor: theme.border }]}
                  onPress={togglePrizeDistributionSection}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                    {isPrizeDistributionSectionExpanded ? '折りたたむ' : '開く'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {isPrizeDistributionSectionExpanded ? (
              <>
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                  団体で絞り込んだあと、変更したい景品配布基準をタップするとポップアップで編集できます。
                </Text>

                <Text style={[styles.label, { color: theme.text }]}>団体を選択</Text>
                <TextInput
                  value={prizeOrganizationSearch}
                  onChangeText={handlePrizeOrganizationSearchChange}
                  onFocus={() => setIsPrizeOrganizationDropdownOpen(true)}
                  placeholder="団体名を入力して候補を絞り込み..."
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.compactInput,
                    { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
                  ]}
                />

                <View
                  style={[
                    styles.selectedSummaryCard,
                    { borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  <View style={styles.selectedSummaryContent}>
                    <Text style={[styles.selectedSummaryLabel, { color: theme.textSecondary }]}>
                      選択中の団体
                    </Text>
                    <Text style={[styles.selectedSummaryValue, { color: theme.text }]}>
                      {selectedPrizeOrganizationLabel}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.inlineActionButton, { borderColor: theme.border }]}
                    onPress={handlePrizeOrganizationReset}
                  >
                    <Text style={[styles.inlineActionButtonText, { color: theme.textSecondary }]}>すべて表示</Text>
                  </TouchableOpacity>
                </View>

                {isPrizeOrganizationDropdownOpen ? (
                  <View
                    style={[
                      styles.dropdownOptionList,
                      { borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                  >
                    {filteredPrizeOrganizationOptions.length === 0 ? (
                      <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                        該当する団体候補がありません
                      </Text>
                    ) : (
                      <>
                        {visiblePrizeOrganizationOptions.map((option) => {
                          /** 選択中団体かどうか */
                          const isSelected = option.value === selectedPrizeOrganization;

                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => handlePrizeOrganizationSelect(option.value)}
                              style={[
                                styles.dropdownOptionItem,
                                {
                                  borderColor: theme.border,
                                  backgroundColor: isSelected ? theme.primary : theme.surface,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dropdownOptionTitle,
                                  { color: isSelected ? '#FFFFFF' : theme.text },
                                ]}
                              >
                                {option.label}
                              </Text>
                              <Text
                                style={[
                                  styles.dropdownOptionMeta,
                                  { color: isSelected ? 'rgba(255,255,255,0.86)' : theme.textSecondary },
                                ]}
                              >
                                景品 {option.count} 件
                              </Text>
                            </Pressable>
                          );
                        })}

                        {filteredPrizeOrganizationOptions.length > visiblePrizeOrganizationOptions.length ? (
                          <Text style={[styles.dropdownOverflowText, { color: theme.textSecondary }]}>
                            ほか {filteredPrizeOrganizationOptions.length - visiblePrizeOrganizationOptions.length} 件あります。さらに入力すると絞り込めます。
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}

                <Text style={[styles.label, { color: theme.text }]}>選択中団体内を検索</Text>
                <TextInput
                  value={prizeSearch}
                  onChangeText={setPrizeSearch}
                  placeholder="企画名・景品名・景品番号・配布基準で検索..."
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.compactInput,
                    { borderColor: theme.border, backgroundColor: theme.background, color: theme.text, marginBottom: 10 },
                  ]}
                />

                {isLoadingPrizeDist ? (
                  <SkeletonLoader lines={4} baseColor={theme.border} />
                ) : prizeDistributions.length === 0 ? (
                  <EmptyState
                    icon={'\u{1F381}'}
                    title="景品配布基準データがありません"
                    description="更新ボタンで再取得してください。"
                    theme={theme}
                  />
                ) : (
                  (() => {
                    if (filteredPrizeDistributions.length === 0) {
                      return (
                        <Text
                          style={[
                            styles.helpText,
                            { color: theme.textSecondary, textAlign: 'center', paddingVertical: 16 },
                          ]}
                        >
                          該当する景品配布基準がありません
                        </Text>
                      );
                    }

                    return (
                      <View style={styles.messageList}>
                        {filteredPrizeDistributions.map((item) => {
                          /** 編集中の景品配布基準かどうか */
                          const isEditing =
                            isPrizeDistributionEditorVisible && item.id === selectedPrizeDistributionId;

                          return (
                            <Pressable
                              key={item.id}
                              style={[
                                styles.messageItem,
                                {
                                  borderColor: isEditing ? theme.primary : theme.border,
                                  backgroundColor: isEditing ? `${theme.primary}12` : theme.background,
                                  borderLeftWidth: isEditing ? 4 : 1,
                                  borderLeftColor: isEditing ? theme.primary : theme.border,
                                },
                              ]}
                              onPress={() => handlePrizeDistributionSelect(item)}
                            >
                              <Text style={[styles.messageAuthor, { color: theme.textSecondary }]} numberOfLines={1}>
                                {item.organization_name || '-'} / {item.event_name || '-'}
                              </Text>
                              <Text style={[styles.messageBody, { color: theme.text, fontWeight: '700' }]}>
                                {item.prize_number ? `[${item.prize_number}] ` : ''}
                                {item.prize_name || '-'}
                                {item.prize_count ? `  （${item.prize_count}）` : ''}
                              </Text>
                              {item.distribution_criteria ? (
                                <Text style={[styles.messageBody, { color: theme.text, marginTop: 4 }]}>
                                  {item.distribution_criteria}
                                </Text>
                              ) : null}
                              <Text
                                style={[
                                  styles.messageDate,
                                  { color: isEditing ? theme.primary : theme.textSecondary },
                                ]}
                              >
                                {isEditing ? '編集中' : 'タップしてポップアップ編集'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })()
                )}

                <Modal
                  visible={isPrizeDistributionEditorVisible}
                  transparent={true}
                  animationType="fade"
                  onRequestClose={closePrizeDistributionEditor}
                >
                  <Pressable style={styles.modalOverlay} onPress={closePrizeDistributionEditor}>
                    <Pressable
                      style={[
                        styles.prizeEditorModal,
                        { borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                      onPress={() => {}}
                    >
                      <View style={styles.prizeEditorHeader}>
                        <View style={styles.prizeEditorHeaderContent}>
                          <Text style={[styles.sectionTitle, { color: theme.text }]}>景品配布基準を編集</Text>
                          <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                            一覧は閉じずに、そのままこのポップアップで更新できます。
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.inlineActionButton, { borderColor: theme.border }]}
                          onPress={closePrizeDistributionEditor}
                        >
                          <Text style={[styles.inlineActionButtonText, { color: theme.textSecondary }]}>閉じる</Text>
                        </TouchableOpacity>
                      </View>

                      {selectedPrizeDistribution ? (
                        <>
                          <View
                            style={[
                              styles.selectedSummaryCard,
                              { borderColor: theme.border, backgroundColor: theme.background, marginBottom: 12 },
                            ]}
                          >
                            <View style={styles.selectedSummaryContent}>
                              <Text style={[styles.selectedSummaryLabel, { color: theme.textSecondary }]}>
                                編集対象
                              </Text>
                              <Text style={[styles.selectedSummaryValue, { color: theme.text }]}>
                                {selectedPrizeDistribution.organization_name || '-'} / {selectedPrizeDistribution.event_name || '-'}
                              </Text>
                              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                                {selectedPrizeDistribution.prize_number ? `[${selectedPrizeDistribution.prize_number}] ` : ''}
                                {selectedPrizeDistribution.prize_name || '-'}
                                {selectedPrizeDistribution.prize_count ? ` （${selectedPrizeDistribution.prize_count}）` : ''}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.label, { color: theme.text, marginTop: 0 }]}>配布基準</Text>
                          <TextInput
                            value={prizeCriteriaDraft}
                            onChangeText={setPrizeCriteriaDraft}
                            multiline
                            placeholder="景品配布基準の内容を入力してください"
                            placeholderTextColor={theme.textSecondary}
                            style={[
                              styles.replyInput,
                              styles.prizeEditorInput,
                              { borderColor: theme.border, backgroundColor: theme.background, color: theme.text },
                            ]}
                          />

                          <View style={styles.prizeEditorActions}>
                            <TouchableOpacity
                              style={[
                                styles.prizeEditorSecondaryButton,
                                { borderColor: theme.border, backgroundColor: theme.background },
                              ]}
                              onPress={closePrizeDistributionEditor}
                              disabled={isSavingPrizeDistribution}
                            >
                              <Text style={[styles.prizeEditorSecondaryButtonText, { color: theme.textSecondary }]}>
                                キャンセル
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.prizeEditorPrimaryButton, { backgroundColor: theme.primary }]}
                              onPress={handlePrizeDistributionSave}
                              disabled={isSavingPrizeDistribution}
                            >
                              <Text style={styles.prizeEditorPrimaryButtonText}>
                                {isSavingPrizeDistribution ? '更新中...' : 'この内容で更新'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : null}
                    </Pressable>
                  </Pressable>
                </Modal>
              </>
            ) : null}
          </View>
        ) : null}

      </ScrollView>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topNoticeContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  /** HQロール向けタブバー: ThemedHeader 直下に固定 */
  iosTabBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  /** タブバーの横スクロールコンテンツ */
  iosTabBarContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  /** 個々のタブアイテム */
  iosTabItem: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  /** タブアイテムのテキスト */
  iosTabItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  roleHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashboardCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  dashboardLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  dashboardValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  /** HQフィルター横スクロール */
  filterScroll: {
    marginBottom: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  compactInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  selectedSummaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 10,
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
    borderRadius: 10,
    padding: 8,
    gap: 8,
    marginBottom: 10,
  },
  dropdownOptionItem: {
    borderWidth: 1,
    borderRadius: 10,
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
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 概況確認タスクカード: 左ボーダーで状態色を表現 */
  overviewTaskCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  /** 概況タスクカード上段: タスク種別・ステータスバッジを横並び */
  overviewTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  /** タスク種別テキスト */
  overviewTaskType: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  /** 場所テキスト */
  overviewTaskLocation: {
    fontSize: 14,
    marginBottom: 4,
  },
  /** ステータスバッジ背景 */
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  /** ステータスバッジ文字 */
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
  ticketList: {
    gap: 8,
  },
  ticketItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  /** チケットタイトル行: 未読ドットとタイトルを横並びで表示 */
  ticketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  /** 未読ドット（●）: 青色で左端に表示 */
  unreadDot: {
    fontSize: 10,
    color: '#0969DA',
    lineHeight: 14,
  },
  ticketTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  /** 未読チケットのタイトルを太字・濃いテキストで強調 */
  ticketTitleUnread: {
    fontWeight: '800',
  },
  ticketMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  ticketDetailTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  requestBody: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  attachmentList: {
    gap: 8,
    marginBottom: 10,
  },
  attachmentItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '600',
  },
  attachmentMeta: {
    fontSize: 11,
  },
  attachmentPreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
  },
  attachmentOpenButton: {
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  attachmentOpenButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageList: {
    gap: 8,
    marginBottom: 10,
  },
  messageItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageAuthor: {
    fontSize: 11,
    marginBottom: 2,
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageDate: {
    fontSize: 11,
    marginTop: 4,
  },
  replyInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  prizeEditorModal: {
    width: '100%',
    maxWidth: 640,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  prizeEditorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  prizeEditorHeaderContent: {
    flex: 1,
    gap: 4,
  },
  prizeEditorInput: {
    minHeight: 160,
    marginTop: 0,
  },
  prizeEditorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  prizeEditorSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  prizeEditorSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  prizeEditorPrimaryButton: {
    flex: 1.3,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  prizeEditorPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sendButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statusActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  statusButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /** ステータス変更Pickerのコンテナ */
  statusPickerContainer: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 10,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  /** ステータス変更Pickerのラベル */
  statusPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  /** 部署向けステータス変更カード */
  departmentStatusPanel: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  /** 部署向けステータス変更ボタン群 */
  departmentStatusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  /** 部署向けステータス変更ボタン */
  departmentStatusButton: {
    flexGrow: 1,
    flexBasis: 96,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  /** 部署向けステータス変更ボタンの見出し */
  departmentStatusButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  /** 部署向けステータス変更ボタンの補足 */
  departmentStatusButtonMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  /** ステータス変更Picker本体 */
  picker: {
    width: '100%',
  },
  elapsedAlert: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  /**
   * HQ連絡案件タブの左右分割コンテナ
   * SafeAreaView - Header - TabBar の残り高さを全て占有する
   */
  hqTicketsLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  /**
   * 左パネル（チケットリスト）
   * 幅固定でPCの左1/3程度を占有する
   */
  leftPanel: {
    width: 340,
    borderRightWidth: 1,
  },
  /**
   * 左パネルのフィルターヘッダー（固定表示）
   * チケットリストをスクロールしてもここは動かない
   */
  leftPanelHeader: {
    padding: 12,
    borderBottomWidth: 1,
  },
  /** 左パネルのチケットリスト（独立スクロール） */
  leftPanelScroll: {
    flex: 1,
  },
  /** 左パネルのScrollView内padding */
  leftPanelContent: {
    padding: 12,
  },
  /** 右パネル（チケット詳細、残り幅を全て占有） */
  rightPanel: {
    flex: 1,
  },
  /** 右パネルのScrollView内padding */
  rightPanelContent: {
    padding: 16,
  },
  /** チケット未選択時の誘導メッセージコンテナ */
  noSelectionState: {
    paddingTop: 80,
    alignItems: 'center',
  },
  /** チケット未選択時のアイコン */
  noSelectionIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  /** チケット未選択時のテキスト */
  noSelectionText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default SupportDeskScreen;
