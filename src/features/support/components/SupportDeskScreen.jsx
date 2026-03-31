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
import ToastMessage from '../../../shared/components/ToastMessage';
import EmptyState from '../../../shared/components/EmptyState';
import OfflineBanner from '../../../shared/components/OfflineBanner';
import { createRadioLog, listRadioLogs } from '../../../services/supabase/radioLogService';
import {
  assignPatrolTask,
  createCustomPatrolTask,
  createDispatchPatrolTask,
  createEvaluationPatrolTask,
  deletePatrolTask,
  getEvaluationPatrolTaskItemName,
  getEvaluationPatrolTaskItemNames,
  getEvaluationPatrolTaskMeta,
  getPatrolTaskDisplayType,
  listPatrolTasks,
  listPatrolTasksForStats,
  parseEvaluationPatrolTaskResultMemo,
  PATROL_TASK_DISPLAY_TYPES,
  updatePatrolTaskNotes,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import { selectEventsForEvaluation } from '../../../services/supabase/eventService';
import { notifySupportTicketCreated } from '../../../shared/services/supportWorkflowNotificationService';
import {
  getRoles,
  getUserProfilesByIds,
  getUsersByRoles,
} from '../../../shared/services/notificationService';
import { selectPatrollingUsers } from '../../../services/supabase/userService';
import {
  createAttachmentSignedUrl,
  listTicketAttachments,
} from '../../../services/supabase/ticketAttachmentService';
import { selectOrganizationEvents } from '../../../services/supabase/organizationEventService';
import { listPatrolChecksByLocation } from '../../../services/supabase/patrolCheckService';
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

/** 会計画面内タブ種別 */
const ACCOUNTING_TAB_TYPES = {
  TICKETS: 'tickets',
  PRIZES: 'prizes',
};

/** 会計画面内タブ定義 */
const ACCOUNTING_TABS = [
  { key: ACCOUNTING_TAB_TYPES.TICKETS, label: '連絡案件' },
  { key: ACCOUNTING_TAB_TYPES.PRIZES, label: '景品配布基準' },
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
 * HQ向け: ボタン式ステータス変更を行うticket_typeの一覧
 * rule_question / layout_change は会計対応と同様の3段階ボタンUIで対応
 */
const HQ_RESPONDABLE_TICKET_TYPES = ['rule_question', 'layout_change'];

/** HQ連絡案件向けステータス表示（会計対応と同じ3段階） */
const HQ_TICKET_STATUS_LABELS = {
  todo: '未対応',
  working: '対応中',
  done: '完了',
};

/** HQ連絡案件向け状態フィルタ */
const HQ_TICKET_STATUS_FILTERS = [
  { key: 'todo', label: '未対応' },
  { key: 'working', label: '対応中' },
  { key: 'done', label: '完了' },
];

/** HQ連絡案件向けステータス更新候補 */
const HQ_TICKET_STATUS_OPTIONS = [
  { key: 'todo', label: HQ_TICKET_STATUS_LABELS.todo, status: SUPPORT_TICKET_STATUSES.ACKNOWLEDGED },
  { key: 'working', label: HQ_TICKET_STATUS_LABELS.working, status: SUPPORT_TICKET_STATUSES.IN_PROGRESS },
  { key: 'done', label: HQ_TICKET_STATUS_LABELS.done, status: SUPPORT_TICKET_STATUSES.RESOLVED },
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
  /** HQ連絡案件（rule_question/layout_change）は3段階表示 */
  if (
    roleType === SUPPORT_DESK_ROLE_TYPES.HQ &&
    HQ_RESPONDABLE_TICKET_TYPES.includes(ticket?.ticket_type)
  ) {
    return HQ_TICKET_STATUS_LABELS[getDepartmentStatusBucket(ticket?.ticket_status)] || HQ_TICKET_STATUS_LABELS.todo;
  }
  return STATUS_LABELS[ticket?.ticket_status] || ticket?.ticket_status || '-';
};

/**
 * 画面上の選択値を実際に保存するステータスへ変換する
 * @param {string} roleType - 役割種別
 * @param {string} nextValue - 画面上の選択値
 * @param {boolean} [isHQRespondable=false] - HQ連絡案件（rule_question/layout_change）かどうか
 * @returns {string} 保存用ステータス
 */
const resolveNextTicketStatus = (roleType, nextValue, isHQRespondable = false) => {
  if (roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING) {
    const matched = ACCOUNTING_STATUS_OPTIONS.find((option) => option.key === nextValue);
    return matched?.status || nextValue;
  }
  if (roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY) {
    const matched = PROPERTY_STATUS_OPTIONS.find((option) => option.key === nextValue);
    return matched?.status || nextValue;
  }
  /** HQ連絡案件（rule_question/layout_change）はボタン式3段階で変換 */
  if (isHQRespondable) {
    const matched = HQ_TICKET_STATUS_OPTIONS.find((option) => option.key === nextValue);
    return matched?.status || nextValue;
  }
  return nextValue;
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
  /** HQは連絡案件タブで「未対応」から表示開始 */
  if (roleType === SUPPORT_DESK_ROLE_TYPES.HQ) {
    return HQ_TICKET_STATUS_FILTERS[0].key;
  }
  return 'all';
};

/** AsyncStorageキープレフィックス: 最終閲覧時刻の保存に使用 */
const LAST_VIEWED_KEY_PREFIX = 'supportDesk_lastViewedAt_';

/** AsyncStorage: 未巡回アラート閾値（本部が設定し、巡回サポートは読み取り専用） */
const ASYNC_KEY_UNVISITED_ALERT_MINUTES = 'unvisitedAlertMinutes';

/** 未巡回アラート閾値の選択肢（分） */
const UNVISITED_ALERT_MINUTE_OPTIONS = [30, 60, 90, 120];

/** AsyncStorage: 評価項目設定（本部が設定した項目名の配列 JSON） */
const ASYNC_KEY_EVALUATION_ITEMS = 'hqEvaluationItems';

/** 評価項目のデフォルト値 */
const DEFAULT_EVALUATION_ITEMS = ['企画書通りの進行', '安全管理', '来場者対応', '設営・片付け', '全体印象'];

/** 評価スコアの選択肢（1〜5） */
const EVALUATION_SCORE_OPTIONS = [1, 2, 3, 4, 5];

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
  [PATROL_TASK_DISPLAY_TYPES.EVALUATION]: '企画評価',
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
  { key: 'confirm_start', label: '開始報告' },
  { key: 'confirm_end', label: '終了報告' },
];

/** 概況ダッシュボード: 企画報告セクションのステータスフィルター */
const OVERVIEW_STATUS_FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: '対応中' },
  { key: 'done', label: '完了済み' },
];

/** 概況ダッシュボード: 企画報告の状態並び順 */
const OVERVIEW_REPORT_STATUS_ORDER = {
  [SUPPORT_TICKET_STATUSES.NEW]: 0,
  [SUPPORT_TICKET_STATUSES.ACKNOWLEDGED]: 1,
  [SUPPORT_TICKET_STATUSES.IN_PROGRESS]: 2,
  [SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL]: 3,
  [SUPPORT_TICKET_STATUSES.RESOLVED]: 4,
  [SUPPORT_TICKET_STATUSES.CLOSED]: 5,
};

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

/** ダッシュボード上で「巡回対応中」とみなす巡回タスクステータス */
const ACTIVE_PATROL_TASK_STATUSES = [
  PATROL_TASK_STATUSES.OPEN,
  PATROL_TASK_STATUSES.ACCEPTED,
  PATROL_TASK_STATUSES.EN_ROUTE,
];

/**
 * 部署案件ステータスの色を返す
 * @param {string|null|undefined} status - 連絡案件ステータス
 * @returns {string} 表示色
 */
const getDepartmentStatusColor = (status) => {
  if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(status)) {
    return '#1A7F37';
  }
  if ([SUPPORT_TICKET_STATUSES.IN_PROGRESS, SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL].includes(status)) {
    return '#BF6A02';
  }
  return '#57606A';
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
  { key: 'dashboard', label: '🏠 ダッシュボード' },
  { key: 'overview', label: '📊 概況確認' },
  { key: 'tickets', label: '📋 連絡案件' },
  { key: 'keys', label: '🔑 鍵管理' },
  { key: 'patrol', label: '🚶 巡回' },
  { key: 'custom_task', label: '📌 独自タスク' },
  { key: 'evaluation', label: '📝 評価' },
  { key: 'stats', label: '📈 実績' },
  { key: 'radio', label: '📡 無線' },
  { key: 'event_orgs', label: '🏢 企画一覧' },
  { key: 'master', label: '⚙️ 鍵マスタ' },
  { key: 'settings', label: '🛠 設定' },
];

/** HQタブのデフォルト */
const HQ_TAB_DEFAULT = 'dashboard';

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

/**
 * 巡回タスクの進行優先度を返す
 * @param {string|null|undefined} status - 巡回タスクステータス
 * @returns {number} 並び替え用優先度
 */
const getDashboardPatrolTaskPriority = (status) => {
  if (status === PATROL_TASK_STATUSES.EN_ROUTE) {
    return 0;
  }
  if (status === PATROL_TASK_STATUSES.ACCEPTED) {
    return 1;
  }
  if (status === PATROL_TASK_STATUSES.OPEN) {
    return 2;
  }
  return 9;
};

/**
 * ダッシュボード向けの巡回タスク活動ラベルを返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 活動ラベル
 */
const getDashboardPatrolActivityLabel = (task) => {
  if (task?.task_status === PATROL_TASK_STATUSES.EN_ROUTE) {
    return '移動中';
  }
  if (task?.task_status === PATROL_TASK_STATUSES.ACCEPTED) {
    return '向かい中';
  }
  if (task?.task_status === PATROL_TASK_STATUSES.OPEN) {
    return '割当済み';
  }
  return PATROL_TASK_STATUS_LABELS[task?.task_status] || task?.task_status || '対応中';
};

/**
 * ダッシュボード向けの巡回タスク要約文を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 要約文
 */
const getDashboardPatrolTaskSummary = (task) => {
  const sourceTitle = normalizeText(task?.source_ticket?.title);
  if (sourceTitle) {
    return sourceTitle;
  }

  const sourceDescription = normalizeText(task?.source_ticket?.description);
  if (sourceDescription) {
    return sourceDescription;
  }

  return normalizeText(task?.notes);
};

/**
 * ダッシュボード向けの巡回タスク時刻表示を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 時刻表示
 */
const formatDashboardPatrolTaskTime = (task) => {
  /** 月日と時刻を併記する */
  const timeOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  const acceptedAt = task?.accepted_at ? new Date(task.accepted_at).getTime() : NaN;
  if (Number.isFinite(acceptedAt) && ACTIVE_PATROL_TASK_STATUSES.includes(task?.task_status)) {
    return `受諾 ${new Date(task.accepted_at).toLocaleString('ja-JP', timeOptions)}`;
  }

  const createdAt = task?.created_at ? new Date(task.created_at).getTime() : NaN;
  if (Number.isFinite(createdAt)) {
    return `作成 ${new Date(task.created_at).toLocaleString('ja-JP', timeOptions)}`;
  }

  return '時刻未設定';
};

/**
 * 指定ユーザーが担当している未完了巡回タスク一覧を返す
 * @param {Array} tasks - 巡回タスク一覧
 * @param {string|null|undefined} userId - 担当者ユーザーID
 * @param {string|null|undefined} [excludedTaskId] - 除外するタスクID
 * @returns {Array} 未完了巡回タスク一覧
 */
const getAssignedActivePatrolTasks = (tasks, userId, excludedTaskId = null) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedExcludedTaskId = normalizeText(excludedTaskId);

  if (!normalizedUserId) {
    return [];
  }

  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (task.assigned_to !== normalizedUserId) {
      return false;
    }
    if (!ACTIVE_PATROL_TASK_STATUSES.includes(task.task_status)) {
      return false;
    }
    if (normalizedExcludedTaskId && task.id === normalizedExcludedTaskId) {
      return false;
    }
    return true;
  });
};

/**
 * 巡回タスクの種別表示名を返す
 * @param {Object|null|undefined} task - 巡回タスク
 * @returns {string} 表示用種別名
 */
const getPatrolTaskTypeLabel = (task) => {
  /** 表示用種別 */
  const displayType = getPatrolTaskDisplayType(task);
  return PATROL_TASK_TYPE_LABELS[displayType] || task?.task_type || '巡回タスク';
};
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
 * 評価対象企画の検索文字列を正規化
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeEvaluationEventSearchValue = (value) => {
  return normalizeText(value).replace(/[\s\u3000]+/g, '').toLowerCase();
};

/**
 * 団体評価一覧の検索文字列を正規化
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeEvaluationReviewSearchValue = (value) => {
  return normalizeText(value).replace(/[\s\u3000]+/g, '').toLowerCase();
};

/**
 * 団体評価一覧の状態ラベルに応じた色を返す
 * @param {string} statusLabel - 状態ラベル
 * @returns {{backgroundColor: string, textColor: string}} 表示色
 */
const getEvaluationReviewStatusTone = (statusLabel) => {
  if (statusLabel === '評価完了') {
    return {
      backgroundColor: '#EAF8ED',
      textColor: '#1A7F37',
    };
  }

  if (statusLabel === '一部入力済み') {
    return {
      backgroundColor: '#EAF2FF',
      textColor: '#0969DA',
    };
  }

  return {
    backgroundColor: '#FFF4E5',
    textColor: '#BF6A02',
  };
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
  /** 通知送信前に現在ブラウザの Push 購読を再同期する */
  const syncPushSubscriptionBeforeNotify = useCallback(async () => {
    if (Platform.OS !== 'web' || !user?.id) {
      return null;
    }

    try {
      return await pushNotice.refreshPushSubscription(false);
    } catch (error) {
      console.error('Push購読同期エラー:', error);
      return null;
    }
  }, [pushNotice.refreshPushSubscription, user?.id]);

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
  /** 会計画面内タブ */
  const [accountingActiveTab, setAccountingActiveTab] = useState(ACCOUNTING_TAB_TYPES.TICKETS);
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
  /** 概況ダッシュボード向け施錠確認タスク一覧（完了・取消も含む） */
  const [overviewLockAllTasks, setOverviewLockAllTasks] = useState([]);
  /** 概況ダッシュボード向け施錠確認タスク読み込み中フラグ */
  const [isLoadingOverviewLockTasks, setIsLoadingOverviewLockTasks] = useState(false);
  const [selectedPatrolTaskId, setSelectedPatrolTaskId] = useState(null);
  /** 巡回タスク割当セクションのY座標 */
  const [patrolAssignmentSectionY, setPatrolAssignmentSectionY] = useState(0);
  /** 巡回タスク選択時の自動スクロール要求 */
  const [shouldScrollToPatrolAssignment, setShouldScrollToPatrolAssignment] = useState(false);
  const [patrolAssignees, setPatrolAssignees] = useState([]);
  const [isLoadingPatrolAssignees, setIsLoadingPatrolAssignees] = useState(false);
  const [selectedPatrolAssigneeId, setSelectedPatrolAssigneeId] = useState('');
  const [isAssigningPatrolTask, setIsAssigningPatrolTask] = useState(false);
  const [isDeletingPatrolTask, setIsDeletingPatrolTask] = useState(false);
  /** 評価タスク一括削除中フラグ */
  const [isDeletingEvaluationTasks, setIsDeletingEvaluationTasks] = useState(false);
  /** 巡回タスクメモ編集中テキスト */
  const [patrolTaskNoteDraft, setPatrolTaskNoteDraft] = useState('');
  /** メモ保存中フラグ */
  const [isSavingPatrolTaskNote, setIsSavingPatrolTaskNote] = useState(false);

  const [isRenotifying, setIsRenotifying] = useState(false);

  /** 巡回対応履歴（完了・取消済みタスク） */
  const [patrolHistory, setPatrolHistory] = useState([]);
  /** 巡回履歴読み込み中フラグ */
  const [isLoadingPatrolHistory, setIsLoadingPatrolHistory] = useState(false);
  /** 巡回履歴の担当者名マップ（user_id → name） */
  const [patrolHistoryProfileMap, setPatrolHistoryProfileMap] = useState({});

  /** 振り分けタスク生成モーダル表示フラグ */
  const [isDispatchModalVisible, setIsDispatchModalVisible] = useState(false);
  /** 振り分けタスク生成モーダルの担当者選択（user_id） */
  const [dispatchAssigneeId, setDispatchAssigneeId] = useState('');
  /** 振り分けタスク生成中フラグ */
  const [isCreatingDispatchTask, setIsCreatingDispatchTask] = useState(false);
  /** 振り分けタスク候補（企画管理部ロール保持ユーザー） */
  const [dispatchCandidates, setDispatchCandidates] = useState([]);
  /** 振り分けタスク候補読み込み中フラグ */
  const [isLoadingDispatchCandidates, setIsLoadingDispatchCandidates] = useState(false);

  /** 独自タスクのタスク内容入力 */
  const [customTaskNotes, setCustomTaskNotes] = useState('');
  /** 独自タスクの担当者ユーザーID（空文字＝未割当） */
  const [customTaskAssigneeId, setCustomTaskAssigneeId] = useState('');
  /** 独自タスク作成中フラグ */
  const [isCreatingCustomTask, setIsCreatingCustomTask] = useState(false);

  /** タスク実績データ（担当者別集計元） */
  const [taskStatsData, setTaskStatsData] = useState([]);
  /** タスク実績読み込み中フラグ */
  const [isLoadingTaskStats, setIsLoadingTaskStats] = useState(false);
  /** タスク実績の担当者名マップ（user_id → name） */
  const [taskStatsProfileMap, setTaskStatsProfileMap] = useState({});
  /** タスク実績の並べ替えキー（'total' | 'name'） */
  const [taskStatsSortKey, setTaskStatsSortKey] = useState('total');

  /** 巡回中スタッフ一覧（on_patrol = true のユーザー） */
  const [patrollingUsers, setPatrollingUsers] = useState([]);
  /** 巡回中スタッフ読み込み中フラグ */
  const [isLoadingPatrollingUsers, setIsLoadingPatrollingUsers] = useState(false);

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
  /** 概況ダッシュボード: 選択中の施錠確認タスクID */
  const [selectedOverviewLockTaskId, setSelectedOverviewLockTaskId] = useState(null);

  /** 団体別企画一覧（events ベースの統一企画マスタ）- HQ向け */
  const [hqOrganizationEvents, setHqOrganizationEvents] = useState([]);
  /** 団体別企画一覧読み込み中フラグ */
  const [isLoadingHqOrganizationEvents, setIsLoadingHqOrganizationEvents] = useState(false);
  /** HQ企画一覧の団体候補検索テキスト */
  const [hqOrganizationEventSearch, setHqOrganizationEventSearch] = useState('');
  /** HQ企画一覧で選択中の団体名 */
  const [selectedHqOrganizationEvent, setSelectedHqOrganizationEvent] = useState(ALL_ORGANIZATION_EVENT_FILTER);
  /** HQ企画一覧の団体候補表示フラグ */
  const [isHqOrganizationEventDropdownOpen, setIsHqOrganizationEventDropdownOpen] = useState(false);
  /** 評価タブ向け企画一覧（events, UUIDベース） */
  const [hqEvaluationEvents, setHqEvaluationEvents] = useState([]);
  /** 評価タブ向け企画一覧読み込み中フラグ */
  const [isLoadingHqEvaluationEvents, setIsLoadingHqEvaluationEvents] = useState(false);
  /** 企画ID別の定常巡回チェック履歴マップ（locationId → 配列） */
  const [patrolChecksByLocation, setPatrolChecksByLocation] = useState({});
  /** 企画別巡回チェック読み込み中フラグ */
  const [isLoadingPatrolChecksByLocation, setIsLoadingPatrolChecksByLocation] = useState(false);
  /** 企画一覧タブで展開中の企画ID（巡回チェック詳細表示用） */
  const [expandedCheckLocationId, setExpandedCheckLocationId] = useState(null);

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

  /** トースト表示状態（部署ロール向けステータス更新後の通知） */
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  /** HQロール向けチケット種別フィルター（'all' | ticket_type） */
  const [hqTicketTypeFilter, setHqTicketTypeFilter] = useState('all');
  /** HQロール向け団体フィルター（'all' | org_id） */
  const [hqOrgFilter, setHqOrgFilter] = useState('all');
  /**
   * 未巡回アラート閾値（分）。本部のみ変更可能で AsyncStorage に保存。
   * 巡回サポート（Item12Screen）はここで設定した値を読み取り専用で使用する。
   */
  const [hqUnvisitedAlertMinutes, setHqUnvisitedAlertMinutes] = useState(90);
  /**
   * 評価項目リスト（本部が設定、AsyncStorage に保存）
   * 評価タスク生成時は、この一覧を1件の企画評価タスクへまとめて保存する
   */
  const [evaluationItems, setEvaluationItems] = useState(DEFAULT_EVALUATION_ITEMS);
  /** 評価項目の追加入力欄 */
  const [newEvaluationItemText, setNewEvaluationItemText] = useState('');
  /** 評価タスク生成中フラグ */
  const [isCreatingEvaluationTasks, setIsCreatingEvaluationTasks] = useState(false);
  /** 評価一括生成で選択中の企画IDセット */
  const [selectedEvalEventIds, setSelectedEvalEventIds] = useState(new Set());
  /** 評価対象企画の検索キーワード */
  const [evaluationEventSearch, setEvaluationEventSearch] = useState('');
  /** 評価対象企画で選択中だけ表示するか */
  const [showSelectedEvaluationEventsOnly, setShowSelectedEvaluationEventsOnly] = useState(false);
  /** 団体評価一覧の検索キーワード */
  const [evaluationReviewSearch, setEvaluationReviewSearch] = useState('');
  /** 団体別にまとめた評価結果一覧 */
  const [evaluationReviewGroups, setEvaluationReviewGroups] = useState([]);
  /** 団体評価一覧の読み込み中フラグ */
  const [isLoadingEvaluationReviewGroups, setIsLoadingEvaluationReviewGroups] = useState(false);

  /**
   * メッセージ表示
   * @param {string} title - タイトル
   * @param {string} message - 本文
   * @returns {void}
   */
  /**
   * トースト通知を表示する（部署ロール向け）
   * @param {string} message - 表示メッセージ
   * @param {'success'|'error'|'info'} [type='success'] - トーストの種類
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

  const showMessage = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  /**
   * Push送信結果の表示文言を作る
   * @param {Object|null|undefined} push - Push送信結果
   * @returns {string} 表示文言
   */
  const formatPushStatsMessage = (push) => {
    if (!push) {
      return 'Push送信結果を取得できませんでした';
    }

    /** Push試行件数 */
    const attemptedCount = Number(push.attempted) || 0;
    /** Push成功件数 */
    const succeededCount = Number(push.succeeded) || 0;
    /** Push失敗件数 */
    const failedCount = Number(push.failed) || 0;

    if (attemptedCount === 0) {
      return 'Push: 受信側の購読がないため未送信';
    }

    return `Push: ${succeededCount}/${attemptedCount}件成功（失敗${failedCount}件）`;
  };

  /**
   * 通知結果の表示行を作る
   * @param {string} label - 表示ラベル
   * @param {Object|null|undefined} notificationResult - 通知送信結果
   * @param {Error|null|undefined} notificationError - 通知送信エラー
   * @returns {Array<string>} 表示行
   */
  const buildNotificationOutcomeLines = (label, notificationResult, notificationError) => {
    if (notificationError) {
      return [`${label}: 通知送信に失敗しました（${notificationError.message || '不明なエラー'}）`];
    }

    if (!notificationResult) {
      return [];
    }

    /** 受信者表示 */
    const recipientsText =
      typeof notificationResult.recipientsCount === 'number'
        ? `受信者${notificationResult.recipientsCount}人`
        : '受信者数不明';

    if (notificationResult.push) {
      return [`${label}: ${recipientsText} / ${formatPushStatsMessage(notificationResult.push)}`];
    }

    return [`${label}: ${recipientsText}`];
  };

  const isHQRole = roleType === SUPPORT_DESK_ROLE_TYPES.HQ;
  const isAccountingRole = roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING;
  const isDepartmentRole =
    isAccountingRole || roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY;
  const isPropertyRole = roleType === SUPPORT_DESK_ROLE_TYPES.PROPERTY;
  /** 会計画面で連絡案件タブを表示中かどうか */
  const isAccountingTicketsTab = accountingActiveTab === ACCOUNTING_TAB_TYPES.TICKETS;
  /** 会計画面で景品配布基準タブを表示中かどうか */
  const isAccountingPrizesTab = accountingActiveTab === ACCOUNTING_TAB_TYPES.PRIZES;
  /** 会計画面以外、または会計の連絡案件タブで案件UIを表示する */
  const shouldShowDepartmentTicketSections = !isAccountingRole || isAccountingTicketsTab;
  /** 会計の景品配布基準タブUIを表示する */
  const shouldShowAccountingPrizeSection = isAccountingRole && isAccountingPrizesTab;
  /** 案件詳細の添付表示を出すかどうか（全ロールで表示） */
  const shouldShowTicketAttachments = true;
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
      /** 連絡案件タブ: rule_question / layout_change のみ表示し、ステータスフィルターを適用 */
      if (activeTab === 'tickets') {
        result = result.filter((t) => HQ_RESPONDABLE_TICKET_TYPES.includes(t.ticket_type));
        if (ticketStatusFilter === 'todo') {
          result = result.filter((t) => getDepartmentStatusBucket(t.ticket_status) === 'todo');
        } else if (ticketStatusFilter === 'working') {
          result = result.filter((t) => getDepartmentStatusBucket(t.ticket_status) === 'working');
        } else if (ticketStatusFilter === 'done') {
          result = result.filter((t) => getDepartmentStatusBucket(t.ticket_status) === 'done');
        }
        return result;
      }
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
    activeTab,
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
   * タスク実績: 担当者別集計データ
   * taskStatsData を user_id ごとに集計し、種別ごとの件数と合計を返す
   * source_ticket_id があり task_type === 'other' のものは「振り分けタスク」として分類
   */
  const taskStatsRows = useMemo(() => {
    /** 担当者ID → { total, lock_check, confirm, dispatch, patrol, other } の集計マップ */
    const statsMap = new Map();

    taskStatsData.forEach((task) => {
      /** 担当者ID */
      const userId = task.assigned_to;
      if (!userId) {
        return;
      }
      if (!statsMap.has(userId)) {
        statsMap.set(userId, { total: 0, lock_check: 0, confirm: 0, dispatch: 0, patrol: 0, other: 0 });
      }
      /** 現在の集計エントリ */
      const entry = statsMap.get(userId);
      entry.total += 1;

      if (task.task_type === PATROL_TASK_TYPES.LOCK_CHECK) {
        entry.lock_check += 1;
      } else if (
        task.task_type === PATROL_TASK_TYPES.CONFIRM_START ||
        task.task_type === PATROL_TASK_TYPES.CONFIRM_END
      ) {
        entry.confirm += 1;
      } else if (task.task_type === PATROL_TASK_TYPES.OTHER && task.source_ticket_id) {
        /** source_ticket_id 紐付きの OTHER = 振り分けタスク */
        entry.dispatch += 1;
      } else if (task.task_type === PATROL_TASK_TYPES.ROUTINE_PATROL) {
        entry.patrol += 1;
      } else {
        entry.other += 1;
      }
    });

    /** 集計マップを配列に変換して担当者名を付与 */
    const rows = Array.from(statsMap.entries()).map(([userId, counts]) => ({
      userId,
      name: taskStatsProfileMap[userId] || userId,
      ...counts,
    }));

    /** 並べ替え: total 降順 or 名前順 */
    if (taskStatsSortKey === 'total') {
      rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    return rows;
  }, [taskStatsData, taskStatsProfileMap, taskStatsSortKey]);

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
    /** 概況確認では開始/終了報告も扱うため tickets 全体から選択する */
    if (isHQRole && activeTab === 'overview') {
      return tickets.find((ticket) => ticket.id === selectedTicketId) || null;
    }
    return filteredTickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }, [activeTab, filteredTickets, isHQRole, selectedTicketId, tickets]);

  /**
   * HQ が回答できるticket_type（rule_question / layout_change）の案件を選択中かどうか
   * この場合、会計対応と同様の3段階ボタン式UIでステータス変更する
   */
  const isHQRespondableTicket =
    isHQRole && HQ_RESPONDABLE_TICKET_TYPES.includes(selectedTicket?.ticket_type);

  /** 部署向けステータス変更候補（HQ連絡案件向けも含む） */
  const departmentStatusOptions = isAccountingRole
    ? ACCOUNTING_STATUS_OPTIONS
    : isPropertyRole
      ? PROPERTY_STATUS_OPTIONS
      : isHQRespondableTicket
        ? HQ_TICKET_STATUS_OPTIONS
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

  /** 現在選択中タスクの担当者ID */
  const currentPatrolAssigneeId = useMemo(() => {
    return normalizeText(selectedPatrolTask?.assigned_to);
  }, [selectedPatrolTask?.assigned_to]);

  /** 担当更新内容が現状から変化しているか */
  const hasPatrolAssignmentChanged = useMemo(() => {
    return (normalizeText(selectedPatrolAssigneeId) || '') !== currentPatrolAssigneeId;
  }, [currentPatrolAssigneeId, selectedPatrolAssigneeId]);

  /** 現在未完了の評価タスク一覧 */
  const activeEvaluationTasks = useMemo(() => {
    return hqPatrolTasks.filter((task) => getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION);
  }, [hqPatrolTasks]);

  /** 評価項目一覧を1件のタスク表示用に連結した文字列 */
  const evaluationTaskItemLabel = useMemo(() => {
    return evaluationItems
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(' / ');
  }, [evaluationItems]);

  /** 評価対象企画の検索キーワード */
  const normalizedEvaluationEventSearch = useMemo(() => {
    return normalizeEvaluationEventSearchValue(evaluationEventSearch);
  }, [evaluationEventSearch]);

  /** 検索・表示条件を反映した評価対象企画一覧 */
  const filteredHqEvaluationEvents = useMemo(() => {
    return (hqEvaluationEvents || []).filter((event) => {
      if (showSelectedEvaluationEventsOnly && !selectedEvalEventIds.has(String(event.id))) {
        return false;
      }

      if (!normalizedEvaluationEventSearch) {
        return true;
      }

      const searchSource = [
        event.organizationName,
        event.organization_name,
        event.eventName,
        event.event_name,
        event.name,
        event.locationName,
        event.location_name,
        event.event_location,
        event.label,
      ]
        .map(normalizeEvaluationEventSearchValue)
        .filter(Boolean)
        .join(' ');

      return searchSource.includes(normalizedEvaluationEventSearch);
    });
  }, [
    hqEvaluationEvents,
    normalizedEvaluationEventSearch,
    selectedEvalEventIds,
    showSelectedEvaluationEventsOnly,
  ]);

  /** 団体評価一覧の検索キーワード */
  const normalizedEvaluationReviewSearch = useMemo(() => {
    return normalizeEvaluationReviewSearchValue(evaluationReviewSearch);
  }, [evaluationReviewSearch]);

  /** 検索条件を反映した団体別評価一覧 */
  const filteredEvaluationReviewGroups = useMemo(() => {
    if (!normalizedEvaluationReviewSearch) {
      return evaluationReviewGroups;
    }

    return evaluationReviewGroups
      .map((group) => {
        const filteredEvents = (group.events || []).filter((event) => {
          const searchSource = [
            group.organizationName,
            event.eventName,
            event.eventLocation,
            event.statusLabel,
            ...(event.items || []).flatMap((item) => [item.itemName, item.comment]),
            event.summaryMemo,
          ]
            .map(normalizeEvaluationReviewSearchValue)
            .filter(Boolean)
            .join(' ');

          return searchSource.includes(normalizedEvaluationReviewSearch);
        });

        if (filteredEvents.length === 0) {
          return null;
        }

        return {
          ...group,
          events: filteredEvents,
        };
      })
      .filter(Boolean);
  }, [evaluationReviewGroups, normalizedEvaluationReviewSearch]);

  const dashboardSummary = useMemo(() => {
    const now = Date.now();
    const delayedMinutes = 60;

    const newTickets = tickets.filter((ticket) => ticket.ticket_status === SUPPORT_TICKET_STATUSES.NEW).length;
    /** 遅延案件: 企画管理部対応案件（rule_question/layout_change）で60分以上未解決のもの */
    const delayedTickets = tickets.filter((ticket) => {
      /** HQ対応案件（企画ルール変更・配置図変更）のみが対象 */
      if (!HQ_RESPONDABLE_TICKET_TYPES.includes(ticket.ticket_type)) {
        return false;
      }
      if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(ticket.ticket_status)) {
        return false;
      }
      const createdAt = new Date(ticket.created_at).getTime();
      return Number.isFinite(createdAt) && now - createdAt >= delayedMinutes * 60 * 1000;
    }).length;

    const activePatrolTasks = hqPatrolTasks.filter((task) =>
      ACTIVE_PATROL_TASK_STATUSES.includes(task.task_status)
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
   * ダッシュボード向け: 巡回中スタッフごとの担当タスク情報
   * on_patrol=true のスタッフに対し、未完了タスクを紐付けて表示用に整形する
   */
  const dashboardPatrollingStaffItems = useMemo(() => {
    return (Array.isArray(patrollingUsers) ? patrollingUsers : [])
      .map((patrolUser) => {
        /** このスタッフに割り当てられている未完了タスク一覧 */
        const activeTasks = hqPatrolTasks
          .filter(
            (task) =>
              task.assigned_to === patrolUser.user_id &&
              ACTIVE_PATROL_TASK_STATUSES.includes(task.task_status)
          )
          .sort((left, right) => {
            const priorityDiff =
              getDashboardPatrolTaskPriority(left.task_status) -
              getDashboardPatrolTaskPriority(right.task_status);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            const leftTime = new Date(left.accepted_at || left.created_at || 0).getTime();
            const rightTime = new Date(right.accepted_at || right.created_at || 0).getTime();
            return rightTime - leftTime;
          });

        return {
          ...patrolUser,
          activeTasks,
        };
      })
      .sort((left, right) => {
        if (right.activeTasks.length !== left.activeTasks.length) {
          return right.activeTasks.length - left.activeTasks.length;
        }
        return (left.name || '').localeCompare(right.name || '', 'ja');
      });
  }, [hqPatrolTasks, patrollingUsers]);

  /**
   * 概況ダッシュボード: ステータスフィルター適用後の企画報告案件（開始/終了報告）
   * overviewStatusFilter と overviewReportTypeFilter の両方で絞り込む
   */
  const overviewReportTickets = useMemo(() => {
    /** 開始報告・終了報告案件に限定 */
    const base = tickets.filter((ticket) =>
      ticket.ticket_type === 'start_report' || ticket.ticket_type === 'end_report'
    );
    /** ステータスフィルター */
    const statusFiltered = base.filter((ticket) => {
      if (overviewStatusFilter === 'active') {
        return [
          SUPPORT_TICKET_STATUSES.NEW,
          SUPPORT_TICKET_STATUSES.ACKNOWLEDGED,
          SUPPORT_TICKET_STATUSES.IN_PROGRESS,
          SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL,
        ].includes(ticket.ticket_status);
      }
      if (overviewStatusFilter === 'done') {
        return [
          SUPPORT_TICKET_STATUSES.RESOLVED,
          SUPPORT_TICKET_STATUSES.CLOSED,
        ].includes(ticket.ticket_status);
      }
      return true;
    });
    /** 種別フィルター */
    const reportTypeFiltered =
      overviewReportTypeFilter === 'all'
        ? statusFiltered
        : statusFiltered.filter((ticket) => {
            const reportTicketTypeMap = {
              confirm_start: 'start_report',
              confirm_end: 'end_report',
            };
            return ticket.ticket_type === reportTicketTypeMap[overviewReportTypeFilter];
          });

    return reportTypeFiltered.slice().sort((left, right) => {
      /** 状態順を優先し、同じ状態なら新しい報告を先頭に並べる */
      const leftOrder = OVERVIEW_REPORT_STATUS_ORDER[left.ticket_status] ?? 99;
      const rightOrder = OVERVIEW_REPORT_STATUS_ORDER[right.ticket_status] ?? 99;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
  }, [overviewReportTypeFilter, overviewStatusFilter, tickets]);

  /** 概況確認で選択中の企画報告案件 */
  const selectedOverviewReportTicket = useMemo(() => {
    return overviewReportTickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }, [overviewReportTickets, selectedTicketId]);

  /** 概況確認で選択中の企画報告に紐づく未完了巡回タスク */
  const selectedOverviewReportPatrolTask = useMemo(() => {
    if (!selectedOverviewReportTicket?.id) {
      return null;
    }
    /** 連絡案件種別に応じて対応する巡回タスク種別を決める */
    const expectedTaskType =
      selectedOverviewReportTicket.ticket_type === 'start_report'
        ? PATROL_TASK_TYPES.CONFIRM_START
        : PATROL_TASK_TYPES.CONFIRM_END;

    return (
      hqPatrolTasks.find(
        (task) =>
          task.source_ticket_id === selectedOverviewReportTicket.id &&
          task.task_type === expectedTaskType
      ) || null
    );
  }, [hqPatrolTasks, selectedOverviewReportTicket]);

  /**
   * 概況ダッシュボード: 担当・確認状況フィルター適用後の施錠確認タスク
   */
  const overviewLockTasks = useMemo(() => {
    /** 施錠確認タスクに限定 */
    const base = overviewLockAllTasks.filter((t) => t.task_type === PATROL_TASK_TYPES.LOCK_CHECK);
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
  }, [overviewLockAllTasks, overviewLockAssigneeFilter, overviewLockConfirmationFilter]);

  /** 概況確認で選択中の施錠確認タスク */
  const selectedOverviewLockTask = useMemo(() => {
    return overviewLockTasks.find((task) => task.id === selectedOverviewLockTaskId) || null;
  }, [overviewLockTasks, selectedOverviewLockTaskId]);

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
   * AsyncStorage から未巡回アラート閾値を読み込む（本部のみ）
   * @returns {Promise<void>} 読み込み処理
   */
  const loadHqAlertMinutes = useCallback(async () => {
    if (!isHQRole) {
      return;
    }
    try {
      const stored = await AsyncStorage.getItem(ASYNC_KEY_UNVISITED_ALERT_MINUTES);
      const parsed = stored ? parseInt(stored, 10) : null;
      if (Number.isFinite(parsed) && parsed > 0) {
        setHqUnvisitedAlertMinutes(parsed);
      }
    } catch (error) {
      console.error('未巡回アラート閾値の読み込みに失敗:', error);
    }
  }, [isHQRole]);

  /**
   * 未巡回アラート閾値を変更し AsyncStorage に保存する（本部のみ）
   * @param {number} minutes - 新しい閾値（分）
   * @returns {Promise<void>} 保存処理
   */
  const handleChangeHqAlertMinutes = async (minutes) => {
    setHqUnvisitedAlertMinutes(minutes);
    try {
      await AsyncStorage.setItem(ASYNC_KEY_UNVISITED_ALERT_MINUTES, String(minutes));
    } catch (error) {
      console.error('未巡回アラート閾値の保存に失敗:', error);
    }
  };

  /**
   * AsyncStorage から評価項目を読み込む（本部のみ）
   * @returns {Promise<void>} 読み込み処理
   */
  const loadEvaluationItems = useCallback(async () => {
    if (!isHQRole) {
      return;
    }
    try {
      const stored = await AsyncStorage.getItem(ASYNC_KEY_EVALUATION_ITEMS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEvaluationItems(parsed);
        }
      }
    } catch (error) {
      console.error('評価項目の読み込みに失敗:', error);
    }
  }, [isHQRole]);

  /**
   * 評価項目を更新し AsyncStorage に保存する
   * @param {string[]} items - 新しい評価項目リスト
   * @returns {Promise<void>} 保存処理
   */
  const saveEvaluationItems = async (items) => {
    setEvaluationItems(items);
    try {
      await AsyncStorage.setItem(ASYNC_KEY_EVALUATION_ITEMS, JSON.stringify(items));
    } catch (error) {
      console.error('評価項目の保存に失敗:', error);
    }
  };

  /**
   * 評価項目を1件追加する
   * @returns {void}
   */
  const handleAddEvaluationItem = () => {
    const text = newEvaluationItemText.trim();
    if (!text) {
      return;
    }
    /** すでに同名の項目がある場合は追加しない */
    if (evaluationItems.includes(text)) {
      return;
    }
    saveEvaluationItems([...evaluationItems, text]);
    setNewEvaluationItemText('');
  };

  /**
   * 評価項目を1件削除する
   * @param {number} index - 削除対象のインデックス
   * @returns {void}
   */
  const handleRemoveEvaluationItem = (index) => {
    saveEvaluationItems(evaluationItems.filter((_, i) => i !== index));
  };

  /**
   * 現在選択中の企画に対して評価タスクを生成する
   * 企画ごとに評価項目をまとめた巡回サポート用 patrol_tasks レコードを 1 件作成する
   * @param {string} eventId - 対象企画ID
   * @param {string} eventName - 対象企画名（ログ・表示用）
   * @returns {Promise<void>} 生成処理
   */
  const handleCreateEvaluationTasks = async (eventId, eventName) => {
    if (!user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }
    if (evaluationItems.length === 0) {
      showMessage('エラー', '評価項目が設定されていません');
      return;
    }
    if (!eventId) {
      showMessage('エラー', '評価対象の企画を選択してください');
      return;
    }
    if (activeEvaluationTasks.length > 0) {
      showMessage('生成不可', '未完了の評価タスクが残っているため、新しい評価タスクは生成できません');
      return;
    }
    if (!evaluationTaskItemLabel) {
      showMessage('エラー', '有効な評価項目が設定されていません');
      return;
    }

    /** 選択された企画レコード */
    const targetEvent = (hqEvaluationEvents || []).find((event) => String(event.id) === String(eventId));
    /** 表示・保存用企画名 */
    const targetEventName = targetEvent?.eventName || targetEvent?.event_name || targetEvent?.name || eventName;
    /** 保存用企画場所 */
    const targetEventLocation =
      targetEvent?.locationName || targetEvent?.location_name || targetEvent?.event_location || targetEvent?.location || null;
    /** 保存用団体名 */
    const targetOrganizationName = targetEvent?.organizationName || targetEvent?.organization_name || '';

    setIsCreatingEvaluationTasks(true);
    /** 企画ごとに評価項目をまとめた評価タスクを1件だけ作成する */
    const results = await Promise.all([
      createEvaluationPatrolTask({
        eventId,
        eventName: targetEventName,
        eventLocation: targetEventLocation,
        organizationName: targetOrganizationName,
        evaluationItemNames: evaluationItems,
        creatorUserId: user.id,
      }),
    ]);
    setIsCreatingEvaluationTasks(false);

    /** 失敗した最初のエラー */
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      showMessage('生成エラー', firstError.message || '巡回サポート用の評価タスク作成に失敗しました');
      return;
    }
    showMessage('生成完了', `「${targetEventName}」の評価タスク 1件を巡回サポートへ作成しました`);
    await loadHqPatrolTasks();
  };

  /**
   * 評価企画の選択をトグルする
   * @param {string} eventId - 企画ID
   * @returns {void}
   */
  const handleToggleEvalEventSelection = (eventId) => {
    setSelectedEvalEventIds((prev) => {
      /** 新しいセットを作成してイミュータブルに更新 */
      const next = new Set(prev);
      if (next.has(String(eventId))) {
        next.delete(String(eventId));
      } else {
        next.add(String(eventId));
      }
      return next;
    });
  };

  /**
   * 現在表示中の評価対象企画をまとめて選択する
   * @returns {void}
   */
  const handleSelectVisibleEvaluationEvents = () => {
    setSelectedEvalEventIds((prev) => {
      const next = new Set(prev);
      filteredHqEvaluationEvents.forEach((event) => {
        next.add(String(event.id));
      });
      return next;
    });
  };

  /**
   * 評価対象企画の選択を全解除する
   * @returns {void}
   */
  const handleClearEvaluationEventSelection = () => {
    setSelectedEvalEventIds(new Set());
  };

  /**
   * 選択中の全企画に対して評価タスクを一括生成する
   * @returns {Promise<void>} 生成処理
   */
  const handleBulkCreateEvaluationTasks = async () => {
    if (!user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }
    if (evaluationItems.length === 0) {
      showMessage('エラー', '評価項目が設定されていません');
      return;
    }
    if (selectedEvalEventIds.size === 0) {
      showMessage('エラー', '評価対象の企画を1件以上選択してください');
      return;
    }
    if (activeEvaluationTasks.length > 0) {
      showMessage('生成不可', '未完了の評価タスクが残っているため、新しい評価タスクは生成できません');
      return;
    }
    if (!evaluationTaskItemLabel) {
      showMessage('エラー', '有効な評価項目が設定されていません');
      return;
    }

    /** 選択中の企画レコード一覧 */
    const selectedEvents = (hqEvaluationEvents || []).filter((event) => selectedEvalEventIds.has(String(event.id)));
    if (selectedEvents.length === 0) {
      showMessage('エラー', '評価対象の企画情報を再読み込みしてください');
      return;
    }

    setIsCreatingEvaluationTasks(true);
    /** メッセージ表示用に現在の選択件数を保持 */
    const selectedEventCount = selectedEvents.length;

    /** 選択企画ごとに、評価項目をまとめた巡回評価タスクを1件ずつ作成 */
    const allResults = await Promise.all(
      selectedEvents.map((event) =>
        createEvaluationPatrolTask({
          eventId: event.id,
          eventName: event.eventName || event.event_name || event.name || '企画名未設定',
          eventLocation: event.locationName || event.location_name || event.event_location || event.location || null,
          organizationName: event.organizationName || event.organization_name || '',
          evaluationItemNames: evaluationItems,
          creatorUserId: user.id,
        })
      )
    );

    setIsCreatingEvaluationTasks(false);

    /** 失敗した最初のエラー */
    const firstError = allResults.find((result) => result.error)?.error;
    if (firstError) {
      showMessage('生成エラー', firstError.message || '巡回サポート用の評価タスク作成に失敗しました');
      return;
    }

    /** 生成完了後に選択をリセット */
    setSelectedEvalEventIds(new Set());
    showMessage(
      '生成完了',
      `${selectedEventCount}件の企画に、評価項目をまとめた評価タスクを巡回サポートへ作成しました`
    );
    await loadHqPatrolTasks();
  };

  /**
   * 全評価データをCSV形式でダウンロードする（Web版のみ）
   * Blob + <a> タグで .csv ファイルとしてブラウザに保存させる
   * @returns {Promise<void>} エクスポート処理
   */
  const handleExportEvaluationsToCSV = async () => {
    if (Platform.OS !== 'web') {
      showMessage('非対応', 'エクスポートはWeb版のみ対応しています');
      return;
    }

    showMessage('取得中', '評価データを取得しています...');
    const { data: patrolTasks, error } = await listPatrolTasks({
      taskTypes: [PATROL_TASK_TYPES.OTHER],
      limit: 500,
    });

    if (error) {
      showMessage('取得エラー', '評価データの取得に失敗しました');
      return;
    }

    /** 評価タスクだけを抽出 */
    const evaluationTasks = (patrolTasks || []).filter((task) => getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION);
    if (evaluationTasks.length === 0) {
      showMessage('データなし', '出力できる評価データがありません');
      return;
    }

    /** 評価タスクID一覧 */
    const taskIds = evaluationTasks.map((task) => task.id).filter(Boolean);
    /** タスクIDごとの最新結果マップ */
    const latestResultMap = {};

    if (taskIds.length > 0) {
      const { data: taskResults, error: taskResultsError } = await getSupabaseClient()
        .from('patrol_task_results')
        .select('task_id,result_code,memo,created_at,created_by')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });

      if (taskResultsError) {
        showMessage('取得エラー', '評価タスク結果の取得に失敗しました');
        return;
      }

      (taskResults || []).forEach((result) => {
        if (!latestResultMap[result.task_id]) {
          latestResultMap[result.task_id] = result;
        }
      });
    }

    /** CSVヘッダー行 */
    const headers = ['タスクID', '企画名', '場所', '評価項目', 'タスク状態', '担当者ID', '最新結果', '最新メモ', '結果記録者', '結果記録日時', '作成日時'];

    /**
     * CSV用に値をエスケープする
     * @param {string|number|null|undefined} value - 入力値
     * @returns {string} エスケープ済み文字列
     */
    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      /** ダブルクォート・カンマ・改行を含む場合はダブルクォートで囲む */
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    /** データ行配列 */
    const rows = evaluationTasks.map((task) => {
      /** 最新の結果レコード */
      const latestResult = latestResultMap[task.id] || null;
      return [
        escapeCsvValue(task.id),
        escapeCsvValue(task.event_name || ''),
        escapeCsvValue(task.event_location || task.location_text || ''),
        escapeCsvValue(getEvaluationPatrolTaskItemName(task)),
        escapeCsvValue(PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status || ''),
        escapeCsvValue(task.assigned_to || ''),
        escapeCsvValue(latestResult?.result_code || ''),
        escapeCsvValue(latestResult?.memo || ''),
        escapeCsvValue(latestResult?.created_by || ''),
        escapeCsvValue(latestResult?.created_at ? new Date(latestResult.created_at).toLocaleString('ja-JP') : ''),
        escapeCsvValue(new Date(task.created_at).toLocaleString('ja-JP')),
      ];
    });

    /** BOM付きCSV文字列（Excel日本語対応） */
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsvValue).join(','), ...rows.map((row) => row.join(','))].join('\n');

    /** Blobを作成してダウンロードリンクを生成 */
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evaluation_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showMessage('出力完了', `${evaluationTasks.length}件の評価タスクデータをCSVでダウンロードしました`);
  };

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

    await syncPushSubscriptionBeforeNotify();

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

    /** 返信後の自動ステータス更新結果 */
    let autoStatusUpdateResult = null;
    /** 自動ステータス更新エラー */
    let autoStatusUpdateError = null;

    if (
      selectedTicket.ticket_status === SUPPORT_TICKET_STATUSES.NEW ||
      selectedTicket.ticket_status === SUPPORT_TICKET_STATUSES.ACKNOWLEDGED
    ) {
      autoStatusUpdateResult = await updateTicketStatus({
        ticketId: selectedTicket.id,
        status: SUPPORT_TICKET_STATUSES.IN_PROGRESS,
        notifyActorUserId: user.id,
      });
      autoStatusUpdateError = autoStatusUpdateResult.error || null;
    }

    setReplyBody('');
    await Promise.all([loadMessages(selectedTicket.id), loadTickets(selectedTicket.id)]);

    /** 通知結果表示行 */
    const notificationLines = [
      ...buildNotificationOutcomeLines('返信通知', result.notificationResult, result.notificationError),
      ...buildNotificationOutcomeLines(
        '自動状態更新通知',
        autoStatusUpdateResult?.notificationResult,
        autoStatusUpdateResult?.notificationError
      ),
    ];

    if (autoStatusUpdateError) {
      showMessage(
        '一部完了',
        [
          autoStatusUpdateError.message || '回答は送信しましたが、ステータス更新に失敗しました',
          ...notificationLines,
        ]
          .filter(Boolean)
          .join('\n')
      );
      return;
    }

    showMessage(
      '送信完了',
      ['回答を送信しました', ...notificationLines]
        .filter(Boolean)
        .join('\n')
    );
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

    await syncPushSubscriptionBeforeNotify();

    setIsUpdatingStatus(true);
    const result = await updateTicketStatus({
      ticketId: selectedTicket.id,
      /** 変更前ステータス: 通知タイトルの「前→後」表示に使用 */
      prevStatus: selectedTicket.ticket_status,
      status: resolveNextTicketStatus(roleType, nextStatus, isHQRespondableTicket),
      notifyActorUserId: user?.id || '',
    });
    setIsUpdatingStatus(false);

    if (result.error) {
      showMessage('更新エラー', result.error.message || 'ステータス更新に失敗しました');
      return;
    }

    await loadTickets(selectedTicket.id);

    if (isDepartmentRole || isHQRespondableTicket) {
      /** 部署ロール / HQ連絡案件: ステータスラベルを解決してトーストで表示 */
      const labelMap = isAccountingRole
        ? ACCOUNTING_STATUS_LABELS
        : isPropertyRole
          ? PROPERTY_STATUS_LABELS
          : HQ_TICKET_STATUS_LABELS;
      const statusLabel = labelMap[nextStatus] || nextStatus;
      showToast(`ステータスを「${statusLabel}」に更新しました`);
      if (result.notificationError) {
        showToast(`通知送信に失敗しました: ${result.notificationError.message || ''}`, 'error');
      }
      return;
    }

    /** 通知結果表示行 */
    const notificationLines = buildNotificationOutcomeLines(
      '状態更新通知',
      result.notificationResult,
      result.notificationError
    );

    showMessage(
      '更新完了',
      ['ステータスを更新しました', ...notificationLines]
        .filter(Boolean)
        .join('\n')
    );
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
    const { data, error } = await listPatrolTasks({
      /** 割当操作の対象は進行中タスクのみ。完了・取消済みは除外する */
      statuses: [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
      ],
      limit: 120,
    });
    setIsLoadingHqPatrolTasks(false);

    if (error) {
      console.error('巡回タスク取得に失敗:', error);
      return;
    }

    /** 緊急対応タスクを先頭に表示するため、task_type で優先ソートする */
    const TASK_TYPE_PRIORITY = {
      emergency_support: 0,
      confirm_start: 1,
      confirm_end: 2,
      lock_check: 3,
      routine_patrol: 4,
      other: 5,
    };
    const nextTasks = (data || []).slice().sort((a, b) => {
      /** 優先度の低い種別は後方に、同一種別は受付日時の新しい順 */
      const priorityA = TASK_TYPE_PRIORITY[a.task_type] ?? 99;
      const priorityB = TASK_TYPE_PRIORITY[b.task_type] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
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
   * 概況ダッシュボード向け施錠確認タスク一覧を取得
   * 完了・取消済みも含めて overview 専用に保持する
   * @returns {Promise<void>} 取得処理
   */
  const loadOverviewLockTasks = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingOverviewLockTasks(true);
    const { data, error } = await listPatrolTasks({
      taskTypes: [PATROL_TASK_TYPES.LOCK_CHECK],
      statuses: [
        PATROL_TASK_STATUSES.OPEN,
        PATROL_TASK_STATUSES.ACCEPTED,
        PATROL_TASK_STATUSES.EN_ROUTE,
        PATROL_TASK_STATUSES.DONE,
        PATROL_TASK_STATUSES.CANCELED,
      ],
      limit: 200,
    });
    setIsLoadingOverviewLockTasks(false);

    if (error) {
      console.error('概況施錠確認タスク取得に失敗:', error);
      return;
    }

    setOverviewLockAllTasks(data || []);
  };

  /**
   * 巡回中スタッフ一覧を取得（on_patrol = true のユーザー）
   * @returns {Promise<void>} 取得処理
   */
  const loadPatrollingUsers = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingPatrollingUsers(true);
    const { data, error } = await selectPatrollingUsers();
    setIsLoadingPatrollingUsers(false);

    if (error) {
      console.error('巡回中スタッフ取得に失敗:', error);
      return;
    }

    setPatrollingUsers(data || []);
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
    if (!hasPatrolAssignmentChanged) {
      showMessage('更新不要', '巡回担当は変更されていません');
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
   * 選択中の巡回タスクを削除する
   * @returns {void}
   */
  const handleDeletePatrolTask = () => {
    if (!selectedPatrolTask) {
      showMessage('削除エラー', '巡回タスクを選択してください');
      return;
    }

    /** 削除実行処理 */
    const executeDelete = async () => {
      setIsDeletingPatrolTask(true);
      const { error } = await deletePatrolTask({ taskId: selectedPatrolTask.id });
      setIsDeletingPatrolTask(false);

      if (error) {
        showMessage('削除エラー', error.message || '巡回タスクの削除に失敗しました');
        return;
      }

      await loadHqPatrolTasks();
      await loadTaskStats();
      showMessage('削除完了', '巡回タスクを削除しました');
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm('選択中の巡回タスクを削除しますか？\n関連する結果も削除されます。')) {
        return;
      }
      executeDelete();
      return;
    }

    Alert.alert('巡回タスクを削除しますか？', '関連する結果も削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          executeDelete();
        },
      },
    ]);
  };

  /**
   * 未完了の評価タスクを全件削除する
   * 評価タスク生成のブロックを解除したい場合などに使用する
   * @returns {void}
   */
  const handleDeleteAllEvaluationTasks = () => {
    if (activeEvaluationTasks.length === 0) {
      showMessage('削除対象なし', '未完了の評価タスクはありません');
      return;
    }

    /** 削除実行処理 */
    const executeDelete = async () => {
      setIsDeletingEvaluationTasks(true);

      /** 評価タスクを1件ずつ順番に削除する */
      let failCount = 0;
      for (const task of activeEvaluationTasks) {
        const { error } = await deletePatrolTask({ taskId: task.id });
        if (error) {
          console.error('評価タスク削除エラー:', task.id, error);
          failCount++;
        }
      }

      setIsDeletingEvaluationTasks(false);
      await loadHqPatrolTasks();

      if (failCount > 0) {
        showMessage(
          '削除エラー',
          `${activeEvaluationTasks.length}件中 ${failCount}件の削除に失敗しました。権限が不足している可能性があります。`
        );
      } else {
        showMessage('削除完了', `評価タスクを${activeEvaluationTasks.length}件削除しました`);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (
        !window.confirm(
          `未完了の評価タスク${activeEvaluationTasks.length}件を全て削除しますか？\n関連する結果も削除されます。`
        )
      ) {
        return;
      }
      executeDelete();
      return;
    }

    Alert.alert(
      '評価タスクを全削除しますか？',
      `未完了の評価タスク${activeEvaluationTasks.length}件と関連する結果を全て削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => { executeDelete(); } },
      ]
    );
  };

  /**
   * 巡回タスクを選択し、担当者選択セクションへの移動を予約する
   * @param {string} taskId - 選択したタスクID
   * @returns {void}
   */
  const handleSelectPatrolTask = (taskId) => {
    setSelectedPatrolTaskId(taskId);
    setShouldScrollToPatrolAssignment(true);
  };

  /**
   * 巡回タスクのメモを保存する
   * ドラフトの内容を patrol_tasks.notes に書き込む
   * @returns {Promise<void>} 保存処理
   */
  const handleSavePatrolTaskNote = async () => {
    if (!selectedPatrolTask) {
      showMessage('エラー', 'タスクを選択してください');
      return;
    }

    setIsSavingPatrolTaskNote(true);
    const { error } = await updatePatrolTaskNotes({
      taskId: selectedPatrolTask.id,
      notes: patrolTaskNoteDraft.trim() || null,
    });
    setIsSavingPatrolTaskNote(false);

    if (error) {
      showMessage('保存エラー', error.message || 'メモの保存に失敗しました');
      return;
    }

    await loadHqPatrolTasks();
    showMessage('保存完了', 'タスクメモを保存しました');
  };

  /**
   * 振り分けタスク候補（企画管理部ロール保持ユーザー）を取得する
   * モーダルを開くたびに最新状態を取得する
   * @returns {Promise<void>} 取得処理
   */
  const loadDispatchCandidates = async () => {
    setIsLoadingDispatchCandidates(true);
    setDispatchCandidates([]);

    const { roles, error: rolesError } = await getRoles();
    if (rolesError) {
      setIsLoadingDispatchCandidates(false);
      console.error('ロール一覧取得に失敗:', rolesError);
      return;
    }

    /** 企画管理部ロールのIDを取得 */
    const hqRoleIds = (roles || [])
      .filter((role) => {
        const name = normalizeText(role.name);
        const displayName = normalizeText(role.display_name);
        return name === '企画管理部' || displayName === '企画管理部';
      })
      .map((role) => role.id);

    if (hqRoleIds.length === 0) {
      setIsLoadingDispatchCandidates(false);
      setDispatchCandidates([]);
      return;
    }

    const { users, error: usersError } = await getUsersByRoles(hqRoleIds);
    if (usersError) {
      setIsLoadingDispatchCandidates(false);
      console.error('ロールユーザー取得に失敗:', usersError);
      return;
    }

    const { profiles, error: profileError } = await getUserProfilesByIds(users || []);
    setIsLoadingDispatchCandidates(false);

    if (profileError) {
      console.error('ユーザープロフィール取得に失敗:', profileError);
      return;
    }

    const candidates = (profiles || [])
      .map((profile) => ({
        userId: profile.user_id,
        name: profile.name || profile.user_id,
        organization: profile.organization || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    setDispatchCandidates(candidates);
  };

  /**
   * 振り分けタスクを生成する（連絡案件詳細から「部員が向かいます」ボタン押下時）
   * @returns {Promise<void>} 生成処理
   */
  const handleCreateDispatchTask = async () => {
    if (!selectedTicket) {
      showMessage('エラー', '連絡案件が選択されていません');
      return;
    }
    if (!user?.id) {
      showMessage('エラー', 'ログイン情報が取得できません');
      return;
    }

    setIsCreatingDispatchTask(true);
    /** 連絡案件種別の表示名 */
    const ticketTypeLabel = TICKET_TYPE_LABELS[selectedTicket.ticket_type] || selectedTicket.ticket_type;
    const { error } = await createDispatchPatrolTask({
      ticket: selectedTicket,
      ticketTypeLabel,
      assignedTo: dispatchAssigneeId || null,
      creatorUserId: user.id,
    });
    setIsCreatingDispatchTask(false);

    if (error) {
      showMessage('エラー', error.message || 'タスク生成に失敗しました');
      return;
    }

    /** 完了メッセージ用に割当状態を保存してから state をリセット */
    const wasAssigned = !!dispatchAssigneeId;
    setIsDispatchModalVisible(false);
    setDispatchAssigneeId('');
    await loadHqPatrolTasks();
    showMessage('タスク生成完了', wasAssigned ? '部員への通知を送信しました' : '振り分けタスクを作成しました（担当者未割当）');
  };

  /**
   * 独自タスクを作成して指定した巡回者に割り当てる
   * @returns {Promise<void>} 作成処理
   */
  const handleCreateCustomTask = async () => {
    if (!customTaskNotes.trim()) {
      showMessage('エラー', 'タスク内容を入力してください');
      return;
    }
    if (!user?.id) {
      showMessage('エラー', 'ログイン情報が取得できません');
      return;
    }

    setIsCreatingCustomTask(true);
    const { error } = await createCustomPatrolTask({
      notes: customTaskNotes.trim(),
      assignedTo: customTaskAssigneeId || null,
      creatorUserId: user.id,
    });
    setIsCreatingCustomTask(false);

    if (error) {
      showMessage('エラー', error.message || 'タスク作成に失敗しました');
      return;
    }

    /** 割当状態を保存してからリセット */
    const wasAssigned = !!customTaskAssigneeId;
    setCustomTaskNotes('');
    setCustomTaskAssigneeId('');
    await loadHqPatrolTasks();
    showMessage('タスク作成完了', wasAssigned ? '担当者へ通知を送信しました' : 'タスクを作成しました（担当者未割当）');
  };

  /**
   * タスク実績データを取得して担当者ごとに集計する
   * @returns {Promise<void>} 取得処理
   */
  const loadTaskStats = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingTaskStats(true);
    const { data, error } = await listPatrolTasksForStats({ limit: 500 });
    setIsLoadingTaskStats(false);

    if (error) {
      console.error('タスク実績取得に失敗:', error);
      return;
    }

    setTaskStatsData(data || []);

    /** 担当者IDを収集してプロフィールマップを構築 */
    const assigneeIds = [...new Set((data || []).map((task) => task.assigned_to).filter(Boolean))];
    if (assigneeIds.length === 0) {
      return;
    }
    const { profiles } = await getUserProfilesByIds(assigneeIds);
    const profileMap = (profiles || []).reduce((accumulator, profile) => {
      if (profile.user_id) {
        accumulator[profile.user_id] = profile.name || profile.user_id;
      }
      return accumulator;
    }, {});
    setTaskStatsProfileMap(profileMap);
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
   * 団体別の評価結果一覧を取得する
   * 旧形式の「1項目1タスク」と、新形式の「1企画1タスク」を同じ一覧へまとめる
   * @returns {Promise<void>} 取得処理
   */
  const loadEvaluationReviewGroups = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingEvaluationReviewGroups(true);

    const { data: patrolTasks, error } = await listPatrolTasks({
      taskTypes: [PATROL_TASK_TYPES.OTHER],
      limit: 500,
    });

    if (error) {
      setIsLoadingEvaluationReviewGroups(false);
      console.error('団体別評価取得に失敗:', error);
      return;
    }

    const evaluationTasks = (patrolTasks || []).filter(
      (task) => getPatrolTaskDisplayType(task) === PATROL_TASK_DISPLAY_TYPES.EVALUATION
    );

    if (evaluationTasks.length === 0) {
      setEvaluationReviewGroups([]);
      setIsLoadingEvaluationReviewGroups(false);
      return;
    }

    const evaluationTaskIds = evaluationTasks.map((task) => task.id).filter(Boolean);
    const latestResultMap = {};

    if (evaluationTaskIds.length > 0) {
      const { data: taskResults, error: taskResultsError } = await getSupabaseClient()
        .from('patrol_task_results')
        .select('task_id,result_code,memo,created_at,created_by')
        .in('task_id', evaluationTaskIds)
        .order('created_at', { ascending: false });

      if (taskResultsError) {
        setIsLoadingEvaluationReviewGroups(false);
        console.error('団体別評価の結果取得に失敗:', taskResultsError);
        return;
      }

      (taskResults || []).forEach((result) => {
        if (!latestResultMap[result.task_id]) {
          latestResultMap[result.task_id] = result;
        }
      });
    }

    const eventById = new Map();
    const eventByNameAndLocation = new Map();
    const eventNameBuckets = new Map();

    (hqEvaluationEvents || []).forEach((event) => {
      const eventId = normalizeText(event.id);
      const eventName = normalizeText(event.eventName || event.event_name || event.name);
      const eventLocation = normalizeText(event.locationName || event.location_name || event.event_location);
      const organizationName = normalizeText(event.organizationName || event.organization_name);
      const normalizedEvent = {
        eventId,
        eventName: eventName || '企画名未設定',
        eventLocation,
        organizationName: organizationName || '団体未設定',
      };

      if (eventId) {
        eventById.set(eventId, normalizedEvent);
      }

      if (eventName || eventLocation) {
        eventByNameAndLocation.set(`${eventName}::${eventLocation}`, normalizedEvent);
      }

      if (eventName) {
        const bucket = eventNameBuckets.get(eventName) || [];
        bucket.push(normalizedEvent);
        eventNameBuckets.set(eventName, bucket);
      }
    });

    const buildItemSortWeight = (itemName) => {
      const configuredIndex = evaluationItems.findIndex((configuredItem) => configuredItem === itemName);
      if (configuredIndex !== -1) {
        return configuredIndex;
      }
      return evaluationItems.length + 100;
    };

    const resolveTaskEventMeta = (task) => {
      const taskMeta = getEvaluationPatrolTaskMeta(task);
      if (taskMeta.eventId && eventById.has(taskMeta.eventId)) {
        return eventById.get(taskMeta.eventId);
      }

      const eventName = normalizeText(task.event_name);
      const eventLocation = normalizeText(task.event_location || task.location_text);
      const exactMatch = eventByNameAndLocation.get(`${eventName}::${eventLocation}`);
      if (exactMatch) {
        return exactMatch;
      }

      const sameNameEvents = eventName ? eventNameBuckets.get(eventName) || [] : [];
      if (sameNameEvents.length === 1) {
        return sameNameEvents[0];
      }

      return {
        eventId: taskMeta.eventId || '',
        eventName: task.event_name || '企画名未設定',
        eventLocation: task.event_location || task.location_text || '',
        organizationName: taskMeta.organizationName || '団体未設定',
      };
    };

    const eventEvaluationMap = new Map();

    evaluationTasks.forEach((task) => {
      const resolvedMeta = resolveTaskEventMeta(task);
      const eventGroupKey =
        resolvedMeta.eventId ||
        `${normalizeText(resolvedMeta.organizationName)}::${normalizeText(resolvedMeta.eventName)}::${normalizeText(resolvedMeta.eventLocation)}`;

      if (!eventEvaluationMap.has(eventGroupKey)) {
        eventEvaluationMap.set(eventGroupKey, {
          organizationName: resolvedMeta.organizationName || '団体未設定',
          eventName: resolvedMeta.eventName || '企画名未設定',
          eventLocation: resolvedMeta.eventLocation || '',
          latestUpdatedAt: task.updated_at || task.created_at || '',
          latestSummaryAt: '',
          summaryMemo: '',
          itemMap: new Map(),
          taskStatuses: new Set(),
        });
      }

      const group = eventEvaluationMap.get(eventGroupKey);
      group.taskStatuses.add(task.task_status);

      const taskUpdatedAt = task.updated_at || task.created_at || '';
      if (taskUpdatedAt && (!group.latestUpdatedAt || new Date(taskUpdatedAt) > new Date(group.latestUpdatedAt))) {
        group.latestUpdatedAt = taskUpdatedAt;
      }

      const itemNames = getEvaluationPatrolTaskItemNames(task);
      itemNames.forEach((itemName) => {
        if (!group.itemMap.has(itemName)) {
          group.itemMap.set(itemName, {
            itemName,
            score: null,
            comment: '',
            resultCode: '',
            updatedAt: '',
          });
        }
      });

      const latestResult = latestResultMap[task.id] || null;
      if (!latestResult) {
        return;
      }

      const parsedMemo = parseEvaluationPatrolTaskResultMemo(latestResult.memo);
      const resultUpdatedAt = latestResult.created_at || taskUpdatedAt;

      if (parsedMemo.summaryMemo) {
        if (!group.latestSummaryAt || new Date(resultUpdatedAt) >= new Date(group.latestSummaryAt)) {
          group.latestSummaryAt = resultUpdatedAt;
          group.summaryMemo = parsedMemo.summaryMemo;
        }
      }

      if (parsedMemo.itemResults.length > 0) {
        parsedMemo.itemResults.forEach((itemResult) => {
          const previousItem = group.itemMap.get(itemResult.itemName) || {
            itemName: itemResult.itemName,
            score: null,
            comment: '',
            resultCode: '',
            updatedAt: '',
          };

          if (!previousItem.updatedAt || new Date(resultUpdatedAt) >= new Date(previousItem.updatedAt)) {
            group.itemMap.set(itemResult.itemName, {
              itemName: itemResult.itemName,
              score: Number(itemResult.score || 0) || null,
              comment: itemResult.comment || '',
              resultCode: latestResult.result_code || '',
              updatedAt: resultUpdatedAt,
            });
          }
        });
        return;
      }

      if (itemNames.length === 1) {
        const itemName = itemNames[0];
        const previousItem = group.itemMap.get(itemName) || {
          itemName,
          score: null,
          comment: '',
          resultCode: '',
          updatedAt: '',
        };

        if (!previousItem.updatedAt || new Date(resultUpdatedAt) >= new Date(previousItem.updatedAt)) {
          group.itemMap.set(itemName, {
            itemName,
            score: null,
            comment: latestResult.memo || '',
            resultCode: latestResult.result_code || '',
            updatedAt: resultUpdatedAt,
          });
        }
      }
    });

    const organizationGroups = Array.from(eventEvaluationMap.values())
      .map((group) => {
        const items = Array.from(group.itemMap.values()).sort((left, right) => {
          const leftWeight = buildItemSortWeight(left.itemName);
          const rightWeight = buildItemSortWeight(right.itemName);
          if (leftWeight !== rightWeight) {
            return leftWeight - rightWeight;
          }
          return left.itemName.localeCompare(right.itemName, 'ja');
        });

        const completedItemCount = items.filter((item) => Number.isFinite(item.score) && item.score > 0).length;
        const hasActiveTask = [PATROL_TASK_STATUSES.OPEN, PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].some((status) =>
          group.taskStatuses.has(status)
        );
        const statusLabel =
          completedItemCount === items.length && items.length > 0
            ? '評価完了'
            : completedItemCount > 0
            ? '一部入力済み'
            : hasActiveTask
            ? '入力待ち'
            : '未入力';

        return {
          organizationName: group.organizationName,
          eventName: group.eventName,
          eventLocation: group.eventLocation,
          latestUpdatedAt: group.latestUpdatedAt,
          summaryMemo: group.summaryMemo,
          completedItemCount,
          totalItemCount: items.length,
          statusLabel,
          items,
        };
      })
      .sort((left, right) => {
        const orgCompare = left.organizationName.localeCompare(right.organizationName, 'ja');
        if (orgCompare !== 0) {
          return orgCompare;
        }
        const eventCompare = left.eventName.localeCompare(right.eventName, 'ja');
        if (eventCompare !== 0) {
          return eventCompare;
        }
        return left.eventLocation.localeCompare(right.eventLocation, 'ja');
      })
      .reduce((accumulator, event) => {
        const currentGroup = accumulator.find((group) => group.organizationName === event.organizationName);
        if (currentGroup) {
          currentGroup.events.push(event);
          return accumulator;
        }

        accumulator.push({
          organizationName: event.organizationName,
          events: [event],
        });
        return accumulator;
      }, []);

    setEvaluationReviewGroups(organizationGroups);
    setIsLoadingEvaluationReviewGroups(false);
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
   * 評価タブ向け企画一覧を取得
   * 表示用IDではなく events.id (UUID) ベースで評価対象企画を選べるようにする
   * @returns {Promise<void>} 取得処理
   */
  const loadHqEvaluationEvents = async () => {
    if (!isHQRole) {
      return;
    }

    setIsLoadingHqEvaluationEvents(true);
    const { data, error } = await selectEventsForEvaluation({ limit: 200 });
    setIsLoadingHqEvaluationEvents(false);

    if (error) {
      console.error('評価対象企画取得に失敗:', error);
      return;
    }

    setHqEvaluationEvents(data || []);
  };

  /**
   * 企画別定常巡回チェック履歴を取得（本部：企画一覧タブ用）
   * @returns {Promise<void>} 取得処理
   */
  const loadPatrolChecksByLocation = async () => {
    if (!isHQRole) {
      return;
    }
    setIsLoadingPatrolChecksByLocation(true);
    const { data, error } = await listPatrolChecksByLocation({ limit: 400 });
    setIsLoadingPatrolChecksByLocation(false);

    if (error) {
      console.error('企画別巡回チェック取得に失敗:', error);
      return;
    }

    setPatrolChecksByLocation(data || {});
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
    /** 本部は初回マウント時に閾値設定・評価項目を読み込む */
    loadHqAlertMinutes();
    loadEvaluationItems();
    loadTickets();
    loadRadioLogs();
    loadHqPatrolTasks();
    loadPatrolAssignees();
    loadPatrolHistory();
    loadHqOrganizationEvents();
    loadHqEvaluationEvents();
    loadPatrolChecksByLocation();
    loadPrizeDistributions();
    loadTaskStats();
    loadPatrollingUsers();
  }, [roleType, user?.id]);

  useEffect(() => {
    if (!isHQRole || activeTab !== 'evaluation') {
      return;
    }

    loadEvaluationReviewGroups();
  }, [activeTab, evaluationItems, hqEvaluationEvents, hqPatrolTasks, isHQRole]);

  /**
   * ダッシュボードタブ表示中は30秒ごとに巡回中スタッフを自動更新する
   */
  useEffect(() => {
    if (!isHQRole || activeTab !== 'dashboard') {
      return () => {};
    }

    /** 初回即時ロード */
    loadPatrollingUsers();

    /** 30秒ごとに自動更新するインターバル */
    const intervalId = setInterval(() => {
      loadPatrollingUsers();
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isHQRole, activeTab]);

  useEffect(() => {
    setTicketStatusFilter(getDefaultDepartmentStatusFilter(roleType));
  }, [roleType]);

  /**
   * 会計ロール切り替え時は会計画面内タブを連絡案件に戻す
   */
  useEffect(() => {
    if (!isAccountingRole) {
      setAccountingActiveTab(ACCOUNTING_TAB_TYPES.TICKETS);
    }
  }, [isAccountingRole]);

  /**
   * 独自タスクタブに切り替えたとき、候補が未取得であれば自動読み込みする
   */
  useEffect(() => {
    if (!isHQRole || activeTab !== 'custom_task') {
      return;
    }
    if (dispatchCandidates.length === 0 && !isLoadingDispatchCandidates) {
      loadDispatchCandidates();
    }
  }, [isHQRole, activeTab]);

  /**
   * 概況タブ表示時に施錠確認一覧を取得する
   */
  useEffect(() => {
    if (!isHQRole || activeTab !== 'overview') {
      return;
    }

    loadOverviewLockTasks();
  }, [activeTab, isHQRole]);

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

  /**
   * HQ向け: patrol_tasks の Realtime 購読
   * 巡回員が受諾・完了・割当変更した瞬間に本部の巡回タスク一覧を自動更新する
   * ポーリングを使わずリアルタイム反映する
   */
  useEffect(() => {
    if (!isHQRole || !user?.id) {
      return () => {};
    }

    const supabase = getSupabaseClient();
    /** 画面単位の購読チャネル名（ロールとユーザーIDで一意化） */
    const channel = supabase.channel(`patrol_tasks_hq_${user.id}`);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'patrol_tasks' },
      () => {
        /** patrol_tasks に変更があった瞬間にHQ向け一覧を再取得 */
        loadHqPatrolTasks();
        loadOverviewLockTasks();
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHQRole, user?.id]);

  /**
   * HQ向け: 画面フォーカス復帰時・アプリ復帰時に巡回タスク一覧を再取得する
   * Realtime 接続が切れていた間の変更を確実に取り込む
   */
  useEffect(() => {
    if (!isHQRole || !user?.id) {
      return () => {};
    }

    /** フォーカス復帰時の再取得ハンドラ */
    const handlePatrolFocus = () => {
      loadHqPatrolTasks();
      loadOverviewLockTasks();
    };

    /** ナビゲーションフォーカスイベント */
    const unsubscribeFocus = navigation?.addListener?.('focus', handlePatrolFocus) || (() => {});

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      /** Web: タブ/ウィンドウがアクティブに戻ったときに再取得 */
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          loadHqPatrolTasks();
          loadOverviewLockTasks();
        }
      };
      window.addEventListener('focus', handlePatrolFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        unsubscribeFocus();
        window.removeEventListener('focus', handlePatrolFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    /** ネイティブ: アプリがフォアグラウンドに戻ったときに再取得 */
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadHqPatrolTasks();
        loadOverviewLockTasks();
      }
    });

    return () => {
      unsubscribeFocus();
      appStateSubscription.remove();
    };
  }, [isHQRole, user?.id, navigation]);

  /**
   * HQ向け: フォールバックポーリング（60秒）
   * RLS の設定によっては Realtime が届かない場合があるため、
   * 念のため低頻度で再取得し変更の取り逃しを防ぐ
   */
  useEffect(() => {
    if (!isHQRole) {
      return () => {};
    }
    const interval = setInterval(() => {
      loadHqPatrolTasks();
      loadOverviewLockTasks();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [isHQRole]);

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
      if (!isHQRole || activeTab !== 'overview' || overviewReportTickets.length === 0) {
        setSelectedTicketId(null);
      }
      return;
    }

    /** 概況確認では企画報告カードの選択も維持する */
    if (isHQRole && activeTab === 'overview') {
      const hasFilteredTicket = filteredTickets.some((ticket) => ticket.id === selectedTicketId);
      const hasOverviewReportTicket = overviewReportTickets.some((ticket) => ticket.id === selectedTicketId);
      if (!selectedTicketId || (!hasFilteredTicket && !hasOverviewReportTicket)) {
        setSelectedTicketId(overviewReportTickets[0]?.id || filteredTickets[0].id);
      }
      return;
    }

    if (!selectedTicketId || !filteredTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(filteredTickets[0].id);
    }
  }, [activeTab, filteredTickets, isHQRole, overviewReportTickets, selectedTicketId]);

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
   * 概況確認の企画報告カードを選択する
   * @param {string} ticketId - 企画報告案件ID
   * @returns {void}
   */
  const handleSelectOverviewReportTicket = (ticketId) => {
    if (!ticketId) {
      return;
    }
    setSelectedTicketId(ticketId);
    setIsDepartmentTicketDetailExpanded(true);
  };

  /**
   * 概況確認から巡回タブへ移動し、対象タスクの割当画面を開く
   * @param {string} taskId - 巡回タスクID
   * @returns {void}
   */
  const handleOpenPatrolTaskFromOverview = (taskId) => {
    if (!taskId) {
      return;
    }
    setActiveTab('patrol');
    handleSelectPatrolTask(taskId);
    loadHqPatrolTasks();
    loadPatrolAssignees();
  };

  /**
   * 概況確認の施錠確認カードを選択する
   * @param {string} taskId - 施錠確認タスクID
   * @returns {void}
   */
  const handleSelectOverviewLockTask = (taskId) => {
    if (!taskId) {
      return;
    }
    setSelectedOverviewLockTaskId(taskId);
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

  /**
   * 本部サポートの巡回タブでタスクを選んだら担当者選択まで自動スクロールする
   */
  useEffect(() => {
    if (
      !isHQRole ||
      activeTab !== 'patrol' ||
      !shouldScrollToPatrolAssignment ||
      !selectedPatrolTask?.id ||
      patrolAssignmentSectionY <= 0
    ) {
      return;
    }

    const timerId = setTimeout(() => {
      departmentScrollViewRef.current?.scrollTo({
        y: Math.max(patrolAssignmentSectionY - 12, 0),
        animated: true,
      });
      setShouldScrollToPatrolAssignment(false);
    }, 60);

    return () => {
      clearTimeout(timerId);
    };
  }, [
    activeTab,
    isHQRole,
    patrolAssignmentSectionY,
    selectedPatrolTask?.id,
    shouldScrollToPatrolAssignment,
  ]);

  /**
   * タスク選択が変わったときにメモドラフトを既存の notes で初期化する
   */
  useEffect(() => {
    setPatrolTaskNoteDraft(selectedPatrolTask?.notes || '');
  }, [selectedPatrolTask?.id]);

  useEffect(() => {
    /** 概況ダッシュボードで参照する担当者IDを一意に抽出 */
    const assignedIds = [
      ...new Set([
        ...hqPatrolTasks.filter((t) => t.assigned_to).map((t) => t.assigned_to),
        ...overviewLockAllTasks.filter((t) => t.assigned_to).map((t) => t.assigned_to),
      ]),
    ];
    if (assignedIds.length === 0) {
      setOverviewProfileMap({});
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
  }, [hqPatrolTasks, overviewLockAllTasks]);

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

      {/* HQロール向けタブバー: Segmented Control風 / ScrollView 内に card 型配置 */}
      {isHQRole ? (
        <View style={[styles.tabSegmentBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={Platform.OS !== 'web'}
            contentContainerStyle={[styles.tabSegmentBarContent, { backgroundColor: `${theme.border}55` }]}
          >
            {HQ_TABS.map((tab) => {
              /** タブがアクティブかどうか */
              const isTabActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabSegmentBarItem,
                    isTabActive && [styles.tabSegmentBarItemActive, { backgroundColor: theme.background }],
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabSegmentBarText,
                      { color: isTabActive ? theme.text : theme.textSecondary, fontWeight: isTabActive ? '700' : '500' },
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

      <ScrollView ref={departmentScrollViewRef} contentContainerStyle={styles.content}>
        {/* 説明カード（HQ以外のロールのみ表示） */}
        {!isHQRole && shouldShowDepartmentDescription ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.description, { color: theme.textSecondary }]}>{screenDescription}</Text>
          </View>
        ) : null}

        {isAccountingRole ? (
          <View style={[styles.card, { backgroundColor: theme.surface, paddingVertical: 12 }]}>
            <View style={styles.accountingTabBar}>
              {ACCOUNTING_TABS.map((tab) => {
                /** 選択中タブかどうか */
                const isActive = accountingActiveTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[
                      styles.accountingTabItem,
                      {
                        borderColor: isActive ? theme.primary : theme.border,
                        backgroundColor: isActive ? theme.primary : theme.background,
                      },
                    ]}
                    onPress={() => setAccountingActiveTab(tab.key)}
                  >
                    <Text
                      style={[
                        styles.accountingTabLabel,
                        { color: isActive ? '#FFFFFF' : theme.textSecondary },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ─── ダッシュボードタブ ─── */}
        {isHQRole && activeTab === 'dashboard' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>本部ダッシュボード</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={() => {
                  loadTickets(selectedTicketId);
                  loadHqPatrolTasks();
                  loadRadioLogs();
                  loadPatrollingUsers();
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            {/* 警告カード: 遅延案件（タップで連絡案件タブへ移動） */}
            {dashboardSummary.delayedTickets > 0 ? (
              <TouchableOpacity
                style={[styles.dashboardAlertBanner, { backgroundColor: '#FFF0F0', borderColor: '#D1242F' }]}
                onPress={() => setActiveTab('tickets')}
              >
                <Text style={[styles.dashboardAlertText, { color: '#D1242F' }]}>
                  ⚠️ 対応遅延: {dashboardSummary.delayedTickets}件（60分以上未解決）▶ 詳細
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* 概要カードグリッド: タップで対応するタブへ移動できる Material 3 風カード */}
            <View style={styles.dashboardGrid}>
              {/* 新着連絡: タップで連絡案件タブへ */}
              <TouchableOpacity
                style={[styles.dashboardCard, { backgroundColor: `${theme.primary}15` }]}
                onPress={() => setActiveTab('tickets')}
              >
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>📬 新着連絡</Text>
                <Text style={[styles.dashboardValue, { color: theme.primary }]}>{dashboardSummary.newTickets}</Text>
                <Text style={[styles.dashboardUnit, { color: theme.textSecondary }]}>件</Text>
              </TouchableOpacity>
              {/* 遅延案件: タップで連絡案件タブへ */}
              <TouchableOpacity
                style={[styles.dashboardCard, { backgroundColor: dashboardSummary.delayedTickets > 0 ? '#FEF2F2' : theme.background }]}
                onPress={() => setActiveTab('tickets')}
              >
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>⏰ 遅延案件(60分+)</Text>
                <Text style={[styles.dashboardValue, { color: '#D1242F' }]}>{dashboardSummary.delayedTickets}</Text>
                <Text style={[styles.dashboardUnit, { color: theme.textSecondary }]}>件</Text>
              </TouchableOpacity>
              {/* 巡回対応中: タップで巡回タブへ */}
              <TouchableOpacity
                style={[styles.dashboardCard, { backgroundColor: '#ECFDF5' }]}
                onPress={() => setActiveTab('patrol')}
              >
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>🚶 巡回対応中</Text>
                <Text style={[styles.dashboardValue, { color: '#059669' }]}>{dashboardSummary.activePatrolTasks}</Text>
                <Text style={[styles.dashboardUnit, { color: theme.textSecondary }]}>件</Text>
              </TouchableOpacity>
              {/* 無線ログ: タップで無線タブへ */}
              <TouchableOpacity
                style={[styles.dashboardCard, { backgroundColor: theme.background }]}
                onPress={() => setActiveTab('radio')}
              >
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>📡 無線ログ(1h)</Text>
                <Text style={[styles.dashboardValue, { color: theme.text }]}>{dashboardSummary.recentRadioLogs}</Text>
                <Text style={[styles.dashboardUnit, { color: theme.textSecondary }]}>件</Text>
              </TouchableOpacity>
            </View>

            {/* 最新の未解決連絡案件プレビュー */}
            {tickets.filter((t) => t.ticket_status === SUPPORT_TICKET_STATUSES.NEW).length > 0 ? (
              <View style={[styles.dashboardSection, { borderColor: theme.border }]}>
                <Text style={[styles.dashboardSectionTitle, { color: theme.text }]}>新着連絡案件</Text>
                {tickets
                  .filter((t) => t.ticket_status === SUPPORT_TICKET_STATUSES.NEW)
                  .slice(0, 5)
                  .map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.dashboardTicketRow, { borderColor: theme.border }]}
                      onPress={() => {
                        /** 対象チケットを選択して連絡案件タブへ遷移 */
                        setSelectedTicketId(t.id);
                        setActiveTab('tickets');
                      }}
                    >
                      <View style={[styles.dashboardTicketTypeBadge, { backgroundColor: `${theme.primary}18` }]}>
                        <Text style={[styles.dashboardTicketTypeText, { color: theme.primary }]}>
                          {TICKET_TYPE_LABELS[t.ticket_type] || t.ticket_type}
                        </Text>
                      </View>
                      <View style={styles.dashboardTicketBody}>
                        <Text style={[styles.dashboardTicketTitle, { color: theme.text }]} numberOfLines={1}>
                          {t.title || t.event_name || '（タイトルなし）'}
                        </Text>
                        <Text style={[styles.dashboardTicketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                          {t.event_name || '-'} / {new Date(t.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            ) : (
              <View style={[styles.dashboardSection, { borderColor: theme.border }]}>
                <Text style={[styles.dashboardSectionTitle, { color: theme.text }]}>新着連絡案件</Text>
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>新着の連絡案件はありません</Text>
              </View>
            )}

            {/* 巡回中スタッフ */}
            <View style={[styles.dashboardSection, { borderColor: theme.border }]}>
              <View style={styles.dashboardPatrolHeader}>
                <Text style={[styles.dashboardSectionTitle, { color: theme.text }]}>
                  🚶 巡回中スタッフ
                </Text>
                <View style={[styles.dashboardPatrolCountBadge, {
                  backgroundColor: patrollingUsers.length > 0 ? '#EAF8ED' : `${theme.border}40`,
                  borderColor: patrollingUsers.length > 0 ? '#1A7F37' : theme.border,
                }]}>
                  <Text style={[styles.dashboardPatrolCountText, {
                    color: patrollingUsers.length > 0 ? '#1A7F37' : theme.textSecondary,
                  }]}>
                    {patrollingUsers.length}人
                  </Text>
                </View>
              </View>

              {isLoadingPatrollingUsers ? (
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
              ) : patrollingUsers.length === 0 ? (
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>巡回中のスタッフはいません</Text>
              ) : (
                dashboardPatrollingStaffItems.map((patrolUser) => {
                  /** このスタッフが担当している未完了タスク一覧 */
                  const activeTasks = patrolUser.activeTasks || [];
                  /** タスク件数表示ラベル */
                  const countLabel = activeTasks.length > 0 ? `対応中 ${activeTasks.length}件` : '待機中';

                  return (
                    <View
                      key={patrolUser.user_id}
                      style={[styles.dashboardPatrolRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                    >
                      <View style={styles.dashboardPatrolRowHeader}>
                        <View style={styles.dashboardPatrolUserInfo}>
                          <Text style={[styles.dashboardPatrolName, { color: theme.text }]}>
                            {patrolUser.name || '（名前未設定）'}
                          </Text>
                          {patrolUser.organization ? (
                            <Text style={[styles.dashboardPatrolOrg, { color: theme.textSecondary }]}>
                              {patrolUser.organization}
                            </Text>
                          ) : null}
                        </View>

                        <View
                          style={[
                            styles.dashboardPatrolTaskBadge,
                            {
                              backgroundColor: activeTasks.length > 0 ? '#EAF8ED' : `${theme.border}30`,
                              borderColor: activeTasks.length > 0 ? '#1A7F37' : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dashboardPatrolTaskType,
                              { color: activeTasks.length > 0 ? '#1A7F37' : theme.textSecondary },
                            ]}
                          >
                            {countLabel}
                          </Text>
                        </View>
                      </View>

                      {activeTasks.length > 0 ? (
                        <View style={styles.dashboardPatrolTaskList}>
                          {activeTasks.map((task) => {
                            /** ステータス表示色 */
                            const statusColor = PATROL_STATUS_BADGE_COLORS[task.task_status] || theme.primary;
                            /** 現在の活動内容 */
                            const activityLabel = getDashboardPatrolActivityLabel(task);
                            /** 場所表示 */
                            const locationLabel = [
                              normalizeText(task.event_name),
                              normalizeText(task.event_location || task.location_text),
                            ]
                              .filter(Boolean)
                              .join(' / ') || '場所未設定';
                            /** タスク内容要約 */
                            const summaryText = getDashboardPatrolTaskSummary(task);
                            /** 時刻表示 */
                            const timeLabel = formatDashboardPatrolTaskTime(task);

                            return (
                              <View
                                key={task.id}
                                style={[
                                  styles.dashboardPatrolTaskCard,
                                  {
                                    borderColor: `${statusColor}40`,
                                    backgroundColor: `${statusColor}12`,
                                  },
                                ]}
                              >
                                <View style={styles.dashboardPatrolTaskHeader}>
                                  <View style={[styles.dashboardPatrolTaskStatusBadge, { backgroundColor: statusColor }]}>
                                    <Text style={styles.dashboardPatrolTaskStatusText}>{activityLabel}</Text>
                                  </View>
                                  <Text style={[styles.dashboardPatrolTaskType, { color: theme.text }]} numberOfLines={1}>
                                    {getPatrolTaskTypeLabel(task)}
                                  </Text>
                                </View>

                                <Text style={[styles.dashboardPatrolTaskEvent, { color: theme.textSecondary }]} numberOfLines={1}>
                                  {locationLabel}
                                </Text>

                                {summaryText ? (
                                  <Text style={[styles.dashboardPatrolTaskSummary, { color: theme.text }]} numberOfLines={2}>
                                    {summaryText}
                                  </Text>
                                ) : null}

                                <Text style={[styles.dashboardPatrolTaskMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                                  {timeLabel} / {task.task_no || 'タスク番号なし'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={[styles.dashboardPatrolIdleText, { color: theme.textSecondary }]}>
                          現在は巡回中ですが、未完了タスクはありません。
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        ) : null}

        {/* ─── 概況確認タブ: 企画報告確認 + 施錠確認 ─── */}
        {isHQRole && activeTab === 'overview' ? (
          <>
            {/* ── 企画報告確認セクション（開始確認・終了確認） ── */}
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>企画報告確認</Text>
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={() => loadTickets(selectedTicketId)}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={toggleOverviewReportSection}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
                      {isOverviewReportSectionExpanded ? '折りたたむ' : '開く'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {!isOverviewReportSectionExpanded ? (
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                  {isLoadingTickets
                    ? '読み込み中です。'
                    : `折りたたみ中です。現在 ${overviewReportTickets.length} 件あります。`}
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
                              backgroundColor: isActive ? theme.primary : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewStatusFilter(f.key)}
                        >
                          <Text
                            style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}
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
                          <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
                            {f.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* タスクリスト */}
                  {isLoadingTickets ? (
                    <SkeletonLoader lines={3} baseColor={theme.border} />
                  ) : overviewReportTickets.length === 0 ? (
                    <EmptyState
                      icon={'\u{1F4CB}'}
                      title="該当する報告確認はありません"
                      description="対応中の開始/終了報告はありません。企画者から報告が届くとここに表示されます。"
                      theme={theme}
                    />
                  ) : (
                    overviewReportTickets.map((ticket) => {
                      /** ステータス色 */
                      const statusColor = getDepartmentStatusColor(ticket.ticket_status);
                      /** 企画報告種別ラベル */
                      const typeLabel = ticket.ticket_type === 'start_report' ? '開始報告' : '終了報告';
                      /** 状態ラベル */
                      const statusLabel = STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status;
                      /** 選択中カードかどうか */
                      const isSelected = ticket.id === selectedOverviewReportTicket?.id;
                      return (
                        <Pressable
                          key={ticket.id}
                          style={[
                            styles.overviewTaskCard,
                            {
                              borderColor: isSelected ? theme.primary : theme.border,
                              backgroundColor: isSelected ? `${theme.primary}10` : theme.background,
                              borderLeftColor: statusColor,
                            },
                          ]}
                          onPress={() => handleSelectOverviewReportTicket(ticket.id)}
                        >
                          <View style={styles.overviewTaskHeader}>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                              <Text style={styles.statusBadgeText}>
                                {statusLabel}
                              </Text>
                            </View>
                            <Text style={[styles.overviewTaskType, { color: theme.text }]}>
                              {typeLabel}
                            </Text>
                          </View>
                          <Text style={[styles.overviewTaskLocation, { color: theme.text }]} numberOfLines={1}>
                            {ticket.event_name || '-'} / {ticket.event_location || '-'}
                          </Text>
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            団体: {ticket.organizations?.name || '-'} / {new Date(ticket.created_at).toLocaleString('ja-JP')}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}

                  {selectedOverviewReportTicket ? (
                    <View
                      style={[
                        styles.overviewDetailCard,
                        { borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                    >
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>選択中の企画報告</Text>
                      <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>
                        {selectedOverviewReportTicket.title}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        種別:{' '}
                        {TICKET_TYPE_LABELS[selectedOverviewReportTicket.ticket_type] ||
                          selectedOverviewReportTicket.ticket_type}
                        {' / '}状態: {getTicketStatusLabelForRole(selectedOverviewReportTicket, roleType)}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        企画: {selectedOverviewReportTicket.event_name || '-'}（
                        {selectedOverviewReportTicket.event_location || '-'}）
                      </Text>
                      <Text
                        style={[
                          styles.requestBody,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
                        ]}
                      >
                        {selectedOverviewReportTicket.description}
                      </Text>
                      <View style={styles.overviewActionRow}>
                        {selectedOverviewReportPatrolTask ? (
                          <TouchableOpacity
                            style={[styles.statusButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}14` }]}
                            onPress={() => handleOpenPatrolTaskFromOverview(selectedOverviewReportPatrolTask.id)}
                          >
                            <Text style={[styles.statusButtonText, { color: theme.primary }]}>関連巡回タスクを開く</Text>
                          </TouchableOpacity>
                        ) : (
                          <View
                            style={[
                              styles.overviewInfoPill,
                              { borderColor: theme.border, backgroundColor: theme.surface },
                            ]}
                          >
                            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                              対応中の巡回タスクは見つかりません
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.statusButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                          onPress={() => loadMessages(selectedOverviewReportTicket.id)}
                        >
                          <Text style={[styles.statusButtonText, { color: theme.textSecondary }]}>メッセージ更新</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.label, { color: theme.text }]}>対応メッセージ</Text>
                      {isLoadingMessages ? (
                        <SkeletonLoader lines={3} baseColor={theme.border} />
                      ) : messages.length === 0 ? (
                        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                          まだ対応メッセージはありません。
                        </Text>
                      ) : (
                        <View style={styles.messageList}>
                          {messages.map((message) => {
                            /** 自分のメッセージかどうか */
                            const isMine = message.author_id === user?.id;
                            /** メッセージ左帯の色 */
                            const roleColor = isMine ? MESSAGE_ROLE_COLORS.self : MESSAGE_ROLE_COLORS.other;
                            return (
                              <View
                                key={message.id}
                                style={[
                                  styles.messageItem,
                                  {
                                    borderColor: isMine ? theme.primary : theme.border,
                                    backgroundColor: isMine ? `${theme.primary}14` : theme.surface,
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
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {/* ── 施錠確認セクション ── */}
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>施錠確認</Text>
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={() => {
                      loadHqPatrolTasks();
                      loadOverviewLockTasks();
                    }}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={toggleOverviewLockSection}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
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
                  {isLoadingOverviewLockTasks
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
                              backgroundColor: isActive ? theme.primary : theme.background,
                            },
                          ]}
                          onPress={() => setOverviewLockAssigneeFilter(filter.key)}
                        >
                          <Text
                            style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}
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
                            style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}
                          >
                            {filter.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {isLoadingOverviewLockTasks ? (
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
                      /** 選択中カードかどうか */
                      const isSelected = task.id === selectedOverviewLockTask?.id;
                      return (
                        <Pressable
                          key={task.id}
                          style={[
                            styles.overviewTaskCard,
                            {
                              borderColor: isSelected ? theme.primary : theme.border,
                              backgroundColor: isSelected ? `${theme.primary}10` : theme.background,
                              borderLeftColor: statusColor,
                            },
                          ]}
                          onPress={() => handleSelectOverviewLockTask(task.id)}
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
                          {/* 施錠確認タスクの notes（"鍵返却後の施錠確認: [鍵名]" 形式）を鍵名として表示 */}
                          {task.notes ? (
                            <Text style={[styles.overviewTaskLocation, { color: theme.primary }]} numberOfLines={1}>
                              🔑 {task.notes.includes(':') ? task.notes.split(':').slice(1).join(':').trim() : task.notes}
                            </Text>
                          ) : null}
                          <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                            担当: {assigneeName} / {timeStr}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}

                  {selectedOverviewLockTask ? (
                    <View
                      style={[
                        styles.overviewDetailCard,
                        { borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                    >
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>選択中の施錠確認</Text>
                      <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>
                        {selectedOverviewLockTask.notes || '施錠確認'}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        状態: {PATROL_TASK_STATUS_LABELS[selectedOverviewLockTask.task_status] || selectedOverviewLockTask.task_status}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        企画: {selectedOverviewLockTask.event_name || '-'}（
                        {selectedOverviewLockTask.event_location || selectedOverviewLockTask.location_text || '-'}）
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        担当:{' '}
                        {overviewProfileMap[selectedOverviewLockTask.assigned_to] ||
                          (selectedOverviewLockTask.assigned_to ? '読込中...' : '未割当')}
                      </Text>
                      <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                        受付: {formatOverviewTaskTime(selectedOverviewLockTask)}
                      </Text>
                      <View style={styles.overviewActionRow}>
                        {[PATROL_TASK_STATUSES.OPEN, PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(
                          selectedOverviewLockTask.task_status
                        ) ? (
                          <TouchableOpacity
                            style={[styles.statusButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}14` }]}
                            onPress={() => handleOpenPatrolTaskFromOverview(selectedOverviewLockTask.id)}
                          >
                            <Text style={[styles.statusButtonText, { color: theme.primary }]}>巡回タスク割当を開く</Text>
                          </TouchableOpacity>
                        ) : (
                          <View
                            style={[
                              styles.overviewInfoPill,
                              { borderColor: theme.border, backgroundColor: theme.surface },
                            ]}
                          >
                            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                              この施錠確認は完了または取消済みです
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : null}
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
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>企画一覧</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={loadHqOrganizationEvents}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              評価タブや定常巡回チェックと同じ企画マスタ一覧です。団体を選ぶと対象企画だけ確認できます。
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
                {filteredHqOrganizationEvents.map((item) => {
                  /** この企画に紐づく巡回チェック履歴（location_id = item.id） */
                  const itemChecks = patrolChecksByLocation[String(item.id)] || [];
                  /** 直近の巡回チェック */
                  const latestCheck = itemChecks[0] || null;
                  /** 展開中かどうか */
                  const isExpanded = expandedCheckLocationId === String(item.id);

                  return (
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

                      {/* 直近巡回チェックサマリー */}
                      {latestCheck ? (
                        <TouchableOpacity
                          style={[styles.patrolCheckSummaryRow, { borderColor: theme.border, backgroundColor: `${theme.primary}08` }]}
                          onPress={() => setExpandedCheckLocationId(isExpanded ? null : String(item.id))}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.patrolCheckSummaryLabel, { color: theme.primary }]}>
                              🚶 直近の巡回チェック
                            </Text>
                            <Text style={[styles.patrolCheckSummaryDate, { color: theme.textSecondary }]}>
                              {new Date(latestCheck.checked_at || latestCheck.created_at).toLocaleString('ja-JP')}
                            </Text>
                          </View>
                          <Text style={[styles.patrolCheckSummaryCount, { color: theme.textSecondary }]}>
                            {itemChecks.length}回 {isExpanded ? '▲' : '▼'}
                          </Text>
                        </TouchableOpacity>
                      ) : isLoadingPatrolChecksByLocation ? null : (
                        <Text style={[styles.patrolCheckEmpty, { color: theme.textSecondary }]}>
                          巡回チェック記録なし
                        </Text>
                      )}

                      {/* 展開時: チェック履歴一覧 */}
                      {isExpanded && itemChecks.length > 0 ? (
                        <View style={[styles.patrolCheckHistoryList, { borderColor: theme.border }]}>
                          {itemChecks.slice(0, 8).map((check) => {
                            /** チェック項目配列（JSON配列または空） */
                            const checkItems = Array.isArray(check.check_items) ? check.check_items : [];

                            return (
                              <View
                                key={check.id}
                                style={[styles.patrolCheckHistoryItem, { borderColor: theme.border }]}
                              >
                                <Text style={[styles.patrolCheckHistoryDate, { color: theme.textSecondary }]}>
                                  {new Date(check.checked_at || check.created_at).toLocaleString('ja-JP')}
                                </Text>
                                {checkItems.map((ci, idx) => (
                                  <Text
                                    key={`${check.id}-ci-${idx}`}
                                    style={[styles.patrolCheckHistoryRow, { color: theme.text }]}
                                    numberOfLines={1}
                                  >
                                    {ci.label || ci.key}: {ci.answerLabel || ci.answerKey || (ci.score ? `${ci.score}/5` : '-')}
                                    {ci.memo ? ` （${ci.memo}）` : ''}
                                  </Text>
                                ))}
                                {check.memo ? (
                                  <Text style={[styles.patrolCheckHistoryMemo, { color: theme.textSecondary }]}>
                                    メモ: {check.memo}
                                  </Text>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {/* 企画別巡回チェック 更新ボタン */}
            <TouchableOpacity
              style={[styles.refreshButton, { backgroundColor: `${theme.primary}15`, alignSelf: 'flex-start' }]}
              onPress={() => {
                loadHqOrganizationEvents();
                loadPatrolChecksByLocation();
              }}
            >
              <Text style={[styles.refreshButtonText, { color: theme.primary }]}>巡回チェック更新</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── 無線タブ: 無線ログ ─── */}

        {/* ─── 巡回タブ ─── */}
        {isHQRole && activeTab === 'patrol' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>巡回タスク割当</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={() => {
                  loadHqPatrolTasks();
                  loadPatrolAssignees();
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                  /** このタスク行が選択中かどうか */
                  const isActive = task.id === selectedPatrolTaskId;
                  /** 担当者名（patrolAssigneesから検索） */
                  const assigneeName = patrolAssignees.find((candidate) => candidate.userId === task.assigned_to)?.name;
                  /** 担当者が割り当てられているかどうか */
                  const hasAssignee = !!task.assigned_to;
                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.ticketItem,
                        {
                          borderColor: isActive ? theme.primary : (hasAssignee ? '#1565C0' : theme.border),
                          backgroundColor: isActive ? `${theme.primary}18` : (hasAssignee ? '#E3F2FD' : theme.background),
                          flexDirection: 'row',
                          alignItems: 'center',
                          borderLeftWidth: hasAssignee ? 4 : 1,
                          borderLeftColor: hasAssignee ? '#1565C0' : theme.border,
                        },
                      ]}
                    >
                      <Pressable
                        style={styles.patrolTaskItemContent}
                        onPress={() => handleSelectPatrolTask(task.id)}
                      >
                        <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                          {getPatrolTaskTypeLabel(task)}
                        </Text>
                        <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                          {task.event_name || '-'} / {task.event_location || task.location_text || '-'}
                        </Text>
                        {/* ステータスと担当者を横並びで表示。割当済みは色付きバッジ */}
                        <View style={styles.patrolTaskStatusRow}>
                          <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                            {PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status}
                          </Text>
                          {hasAssignee ? (
                            <View style={styles.assigneeBadge}>
                              <Text style={styles.assigneeBadgeText}>{assigneeName || '担当あり'}</Text>
                            </View>
                          ) : (
                            <View style={styles.unassignedBadge}>
                              <Text style={styles.unassignedBadgeText}>未割当</Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                      {/* 担当者が割り当てられている場合のみ「割当を外す」ボタンを表示 */}
                      {hasAssignee ? (
                        <TouchableOpacity
                          style={[styles.unassignButton, { borderColor: theme.danger || '#E53E3E' }]}
                          onPress={async () => {
                            const { error } = await assignPatrolTask({
                              taskId: task.id,
                              assignedTo: null,
                              actorUserId: user?.id || null,
                            });
                            if (error) {
                              showMessage('エラー', error.message || '割当解除に失敗しました');
                            } else {
                              await loadHqPatrolTasks();
                              showMessage('解除完了', '担当割当を外しました');
                            }
                          }}
                        >
                          <Text style={[styles.unassignButtonText, { color: theme.danger || '#E53E3E' }]}>割当を外す</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ─── 現在対応中タスク ─── */}
            {(() => {
              /** 現在アクティブ（ACCEPTED / EN_ROUTE）な担当済みタスク */
              const inProgressTasks = hqPatrolTasks.filter(
                (task) =>
                  task.assigned_to &&
                  [PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(task.task_status)
              );
              if (inProgressTasks.length === 0) {
                return null;
              }
              /** 担当者IDをキーとしてタスクをグループ化 */
              const groupMap = new Map();
              inProgressTasks.forEach((task) => {
                const key = task.assigned_to;
                if (!groupMap.has(key)) {
                  const name = patrolAssignees.find((c) => c.userId === key)?.name || '（不明）';
                  groupMap.set(key, { name, tasks: [] });
                }
                groupMap.get(key).tasks.push(task);
              });
              const groups = Array.from(groupMap.values());
              return (
                <>
                  <View style={[styles.inProgressDivider, { borderColor: theme.border }]} />
                  <Text style={[styles.inProgressTitle, { color: theme.text }]}>現在対応中</Text>
                  {groups.map((group) => (
                    <View key={group.name} style={styles.inProgressGroup}>
                      <Text style={[styles.inProgressGroupName, { color: theme.primary }]}>
                        {group.name}（{group.tasks.length}件）
                      </Text>
                      {group.tasks.map((task) => {
                        /** タスク種別ラベル */
                        const typeLabel = getPatrolTaskTypeLabel(task);
                        /** ステータスラベル */
                        const statusLabel = PATROL_TASK_STATUS_LABELS[task.task_status] || task.task_status;
                        return (
                          <View
                            key={task.id}
                            style={[styles.inProgressTaskRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                          >
                            <Text style={[styles.inProgressTaskType, { color: theme.text }]} numberOfLines={1}>
                              {typeLabel}
                              {'  '}
                              <Text style={[styles.inProgressTaskStatus, { color: theme.textSecondary }]}>
                                [{statusLabel}]
                              </Text>
                            </Text>
                            <Text style={[styles.inProgressTaskDetail, { color: theme.textSecondary }]} numberOfLines={1}>
                              {task.event_name || '-'} / {task.event_location || task.location_text || '-'}
                            </Text>
                            {task.notes ? (
                              <Text style={[styles.inProgressTaskNotes, { color: theme.textSecondary }]} numberOfLines={1}>
                                メモ: {task.notes}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </>
              );
            })()}

            {selectedPatrolTask ? (
              <View
                onLayout={(event) => {
                  setPatrolAssignmentSectionY(event.nativeEvent.layout.y);
                }}
              >
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
                      const blockingTasks = getAssignedActivePatrolTasks(
                        hqPatrolTasks,
                        candidate.userId,
                        selectedPatrolTask?.id
                      );
                      const hasBlockingTask = blockingTasks.length > 0;
                      const blockingTaskLabel = hasBlockingTask
                        ? PATROL_TASK_TYPE_LABELS[getPatrolTaskDisplayType(blockingTasks[0])] || '担当中'
                        : '';
                      const isDisabled = hasBlockingTask && candidate.userId !== currentPatrolAssigneeId;
                      return (
                        <Pressable
                          key={candidate.userId}
                          style={[
                            styles.filterChip,
                            {
                              borderColor: isDisabled ? '#D1242F' : isActive ? theme.primary : theme.border,
                              backgroundColor: isDisabled
                                ? '#FFF0F0'
                                : isActive
                                  ? theme.primary
                                  : theme.background,
                            },
                          ]}
                          onPress={() => {
                            if (isDisabled) {
                              return;
                            }
                            setSelectedPatrolAssigneeId(candidate.userId);
                          }}
                          disabled={isDisabled}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              { color: isDisabled ? '#D1242F' : isActive ? '#FFFFFF' : theme.textSecondary },
                            ]}
                          >
                            {candidate.name}
                            {hasBlockingTask ? `（担当中: ${blockingTaskLabel}）` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: (isAssigningPatrolTask || !hasPatrolAssignmentChanged) ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleAssignPatrolTask}
                  disabled={isAssigningPatrolTask || !hasPatrolAssignmentChanged}
                >
                  <Text style={styles.sendButtonText}>
                    {isAssigningPatrolTask ? '更新中...' : '巡回担当を更新'}
                  </Text>
                </TouchableOpacity>

                {/* ─── タスクメモ入力 ─── */}
                <View style={[styles.patrolNoteDivider, { borderColor: theme.border }]} />
                <Text style={[styles.label, { color: theme.text }]}>タスクメモ</Text>
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                  担当者への指示や補足情報を入力してください。巡回サポート側のタスク詳細に表示されます。
                </Text>
                <TextInput
                  style={[
                    styles.patrolNoteInput,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                      color: theme.text,
                    },
                  ]}
                  value={patrolTaskNoteDraft}
                  onChangeText={setPatrolTaskNoteDraft}
                  placeholder="例: 3F 倉庫の鍵は赤いタグが目印です"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    { backgroundColor: isSavingPatrolTaskNote ? theme.border : (theme.success || '#22A06B') },
                  ]}
                  onPress={handleSavePatrolTaskNote}
                  disabled={isSavingPatrolTaskNote}
                >
                  <Text style={styles.sendButtonText}>
                    {isSavingPatrolTaskNote ? '保存中...' : 'メモを保存'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: isDeletingPatrolTask ? theme.border : (theme.danger || '#D1242F'),
                      marginTop: 8,
                    },
                  ]}
                  onPress={handleDeletePatrolTask}
                  disabled={isDeletingPatrolTask}
                >
                  <Text style={styles.sendButtonText}>
                    {isDeletingPatrolTask ? '削除中...' : 'この巡回タスクを削除'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ─── 評価タブ: 評価タスク生成 ─── */}
        {isHQRole && activeTab === 'evaluation' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>評価タスク生成</Text>
              {/* 評価項目設定は設定タブに移動 */}
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={() => setActiveTab('settings')}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>⚙️ 評価項目設定</Text>
              </TouchableOpacity>
            </View>
            {evaluationItems.length > 0 ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                評価項目（{evaluationItems.length}件）: {evaluationItems.join(' / ')}
              </Text>
            ) : (
              <Text style={[styles.helpText, { color: '#D1242F' }]}>
                ⚠️ 評価項目が設定されていません。「⚙️ 評価項目設定」から追加してください。
              </Text>
            )}
            {/* 企画を選んで評価タスク一括生成 */}
            <Text style={[styles.label, { color: theme.text, marginTop: 8 }]}>評価対象企画を選択（複数可）</Text>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              チェックを入れた企画ごとに、上記評価項目を1件の企画評価タスクへまとめて生成します。
            </Text>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              生成対象の企画一覧と定常巡回チェックの対象企画は、同じ企画マスタを参照します。
            </Text>
            {evaluationTaskItemLabel ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                1件の評価タスクに入る項目: {evaluationTaskItemLabel}
              </Text>
            ) : null}
            {activeEvaluationTasks.length > 0 ? (
              <View style={[styles.patrolCheckSummaryRow, { borderColor: theme.border, backgroundColor: '#FFF4E5', flexWrap: 'wrap', gap: 8 }]}>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={[styles.patrolCheckSummaryLabel, { color: '#BF6A02' }]}>
                    未完了の評価タスクがあります
                  </Text>
                  <Text style={[styles.patrolCheckSummaryDate, { color: theme.textSecondary }]}>
                    1件でも残っている間は、新しい評価タスクを生成できません。
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.patrolCheckSummaryCount, { color: '#BF6A02' }]}>
                    {activeEvaluationTasks.length}件
                  </Text>
                  {/* 評価タスク一括削除ボタン */}
                  <TouchableOpacity
                    style={[
                      styles.inlineActionButton,
                      {
                        borderColor: isDeletingEvaluationTasks ? theme.border : (theme.danger || '#D1242F'),
                        backgroundColor: isDeletingEvaluationTasks ? theme.border : `${theme.danger || '#D1242F'}18`,
                      },
                    ]}
                    onPress={handleDeleteAllEvaluationTasks}
                    disabled={isDeletingEvaluationTasks}
                  >
                    <Text
                      style={[
                        styles.inlineActionButtonText,
                        { color: isDeletingEvaluationTasks ? theme.textSecondary : (theme.danger || '#D1242F') },
                      ]}
                    >
                      {isDeletingEvaluationTasks ? '削除中...' : '全削除'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <TextInput
              value={evaluationEventSearch}
              onChangeText={setEvaluationEventSearch}
              placeholder="団体名・企画名・場所で検索"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.compactInput,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  color: theme.text,
                  marginTop: 8,
                },
              ]}
            />

            {/* 全選択/全解除ボタン */}
            {!isLoadingHqEvaluationEvents && (hqEvaluationEvents || []).length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.inlineActionButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}12` }]}
                  onPress={handleSelectVisibleEvaluationEvents}
                  disabled={filteredHqEvaluationEvents.length === 0}
                >
                  <Text style={[styles.inlineActionButtonText, { color: theme.primary }]}>
                    表示中を全選択
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inlineActionButton, { borderColor: theme.border }]}
                  onPress={handleClearEvaluationEventSelection}
                >
                  <Text style={[styles.inlineActionButtonText, { color: theme.textSecondary }]}>全解除</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.inlineActionButton,
                    {
                      borderColor: showSelectedEvaluationEventsOnly ? theme.primary : theme.border,
                      backgroundColor: showSelectedEvaluationEventsOnly ? `${theme.primary}12` : theme.background,
                    },
                  ]}
                  onPress={() => setShowSelectedEvaluationEventsOnly((prev) => !prev)}
                >
                  <Text
                    style={[
                      styles.inlineActionButtonText,
                      { color: showSelectedEvaluationEventsOnly ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    選択中だけ表示
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.helpText, { color: theme.textSecondary, alignSelf: 'center' }]}>
                  {selectedEvalEventIds.size}件選択中 / {filteredHqEvaluationEvents.length}件表示
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.evalBulkButton,
                {
                  backgroundColor:
                    selectedEvalEventIds.size === 0 || isCreatingEvaluationTasks || activeEvaluationTasks.length > 0
                      ? theme.border
                      : '#1A7F37',
                  marginTop: 10,
                },
              ]}
              onPress={handleBulkCreateEvaluationTasks}
              disabled={selectedEvalEventIds.size === 0 || isCreatingEvaluationTasks || activeEvaluationTasks.length > 0}
            >
              <Text style={styles.evalBulkButtonText}>
                {isCreatingEvaluationTasks
                  ? '生成中...'
                  : activeEvaluationTasks.length > 0
                  ? '未完了の評価タスクがあります'
                  : selectedEvalEventIds.size === 0
                  ? '企画を選択してください'
                  : `選択した${selectedEvalEventIds.size}件に評価タスクを生成`}
              </Text>
            </TouchableOpacity>

            <View style={styles.evalOrgEventList}>
              {isLoadingHqEvaluationEvents ? (
                <SkeletonLoader lines={3} baseColor={theme.border} />
              ) : filteredHqEvaluationEvents.length === 0 && (hqEvaluationEvents || []).length > 0 ? (
                <EmptyState
                  icon={'\u{1F50D}'}
                  title="表示条件に一致する企画はありません"
                  description="検索条件を変えるか、「選択中だけ表示」を解除してください。"
                  theme={theme}
                />
              ) : (
                filteredHqEvaluationEvents.map((event) => {
                  /** この企画のUUID */
                  const eventId = String(event.id);
                  /** 選択中かどうか */
                  const isChecked = selectedEvalEventIds.has(eventId);

                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={[
                        styles.evalSelectRow,
                        {
                          borderColor: isChecked ? theme.primary : theme.border,
                          backgroundColor: isChecked ? `${theme.primary}0A` : theme.background,
                        },
                      ]}
                      onPress={() => handleToggleEvalEventSelection(eventId)}
                      disabled={isCreatingEvaluationTasks}
                    >
                      <View
                        style={[
                          styles.evalSelectCheckbox,
                          {
                            borderColor: isChecked ? theme.primary : theme.border,
                            backgroundColor: isChecked ? theme.primary : 'transparent',
                          },
                        ]}
                      >
                        {isChecked ? (
                          <Text style={styles.evalSelectCheckboxTick}>✓</Text>
                        ) : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.evalSelectOrg, { color: theme.textSecondary }]} numberOfLines={1}>
                          {event.organizationName || event.organization_name || '-'}
                        </Text>
                        <Text style={[styles.evalSelectName, { color: theme.text }]} numberOfLines={1}>
                          {event.eventName || event.event_name || event.name || '企画名未設定'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              {!isLoadingHqEvaluationEvents && (hqEvaluationEvents || []).length === 0 ? (
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>評価対象企画が読み込まれていません</Text>
              ) : null}
            </View>

            {/* 一括生成ボタン */}
            <TouchableOpacity
              style={[
                styles.evalBulkButton,
                {
                  backgroundColor:
                    selectedEvalEventIds.size === 0 || isCreatingEvaluationTasks || activeEvaluationTasks.length > 0
                      ? theme.border
                      : '#1A7F37',
                },
              ]}
              onPress={handleBulkCreateEvaluationTasks}
              disabled={selectedEvalEventIds.size === 0 || isCreatingEvaluationTasks || activeEvaluationTasks.length > 0}
            >
              <Text style={styles.evalBulkButtonText}>
                {isCreatingEvaluationTasks
                  ? '生成中...'
                  : activeEvaluationTasks.length > 0
                  ? '未完了の評価タスクがあります'
                  : selectedEvalEventIds.size === 0
                  ? '企画を選択してください'
                  : `選択した${selectedEvalEventIds.size}件に評価タスクを生成`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── 評価タブ: CSV出力カード ─── */}
        {isHQRole && activeTab === 'evaluation' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>評価データ出力</Text>
            </View>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              巡回サポート向けに生成した評価タスクと最新結果をCSVファイルでダウンロードします。Excel で開けます（BOM付きUTF-8）。
            </Text>
            <TouchableOpacity
              style={[styles.evalExportButton, { borderColor: theme.primary }]}
              onPress={handleExportEvaluationsToCSV}
            >
              <Text style={[styles.evalExportButtonText, { color: theme.primary }]}>
                📥 評価データをCSVでダウンロード
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {isHQRole && activeTab === 'evaluation' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>団体別評価</Text>
                <Text style={[styles.helpText, { color: theme.textSecondary, marginTop: 2 }]}>
                  団体ごとに、各企画の評価項目・点数・コメントをまとめて確認できます。
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={loadEvaluationReviewGroups}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={evaluationReviewSearch}
              onChangeText={setEvaluationReviewSearch}
              placeholder="団体名・企画名・評価項目で検索"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.compactInput,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  color: theme.text,
                },
              ]}
            />

            {isLoadingEvaluationReviewGroups ? (
              <SkeletonLoader lines={4} baseColor={theme.border} />
            ) : filteredEvaluationReviewGroups.length === 0 ? (
              <EmptyState
                icon={'\u{1F4DD}'}
                title="表示できる団体評価はありません"
                description="評価が完了すると、団体ごとにここで確認できます。"
                theme={theme}
              />
            ) : (
              <View style={styles.evalReviewGroupList}>
                {filteredEvaluationReviewGroups.map((group) => (
                  <View
                    key={group.organizationName}
                    style={[styles.evalReviewGroupCard, { borderColor: theme.border, backgroundColor: theme.background }]}
                  >
                    <View style={styles.evalReviewGroupHeader}>
                      <Text style={[styles.evalReviewGroupTitle, { color: theme.text }]}>{group.organizationName}</Text>
                      <Text style={[styles.evalReviewGroupMeta, { color: theme.textSecondary }]}>
                        {group.events.length}企画
                      </Text>
                    </View>

                    <View style={styles.evalReviewEventList}>
                      {group.events.map((event) => {
                        const statusTone = getEvaluationReviewStatusTone(event.statusLabel);
                        return (
                          <View
                            key={`${group.organizationName}-${event.eventName}-${event.eventLocation}`}
                            style={[styles.evalReviewEventCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
                          >
                            <View style={styles.evalReviewEventHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.evalReviewEventTitle, { color: theme.text }]}>
                                  {event.eventName}
                                </Text>
                                {event.eventLocation ? (
                                  <Text style={[styles.evalReviewEventMeta, { color: theme.textSecondary }]}>
                                    {event.eventLocation}
                                  </Text>
                                ) : null}
                              </View>
                              <View
                                style={[
                                  styles.evalReviewStatusBadge,
                                  { backgroundColor: statusTone.backgroundColor },
                                ]}
                              >
                                <Text style={[styles.evalReviewStatusBadgeText, { color: statusTone.textColor }]}>
                                  {event.statusLabel}
                                </Text>
                              </View>
                            </View>

                            <Text style={[styles.evalReviewProgressText, { color: theme.textSecondary }]}>
                              {event.completedItemCount}/{event.totalItemCount} 項目入力済み
                              {event.latestUpdatedAt
                                ? ` / 最終更新 ${new Date(event.latestUpdatedAt).toLocaleString('ja-JP')}`
                                : ''}
                            </Text>

                            <View style={styles.evalReviewItemList}>
                              {event.items.map((item) => (
                                <View key={`${event.eventName}-${item.itemName}`} style={styles.evalReviewItemCard}>
                                  <View style={styles.evalReviewItemHeader}>
                                    <Text style={[styles.evalReviewItemName, { color: theme.text }]}>
                                      {item.itemName}
                                    </Text>
                                    <View
                                      style={[
                                        styles.evalReviewScoreBadge,
                                        {
                                          backgroundColor: item.score ? `${theme.primary}16` : theme.border,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.evalReviewScoreBadgeText,
                                          { color: item.score ? theme.primary : theme.textSecondary },
                                        ]}
                                      >
                                        {item.score ? `${item.score}点` : '未入力'}
                                      </Text>
                                    </View>
                                  </View>
                                  {item.comment ? (
                                    <Text style={[styles.evalReviewItemComment, { color: theme.textSecondary }]}>
                                      コメント: {item.comment}
                                    </Text>
                                  ) : null}
                                </View>
                              ))}
                            </View>

                            {event.summaryMemo ? (
                              <View
                                style={[
                                  styles.evalReviewSummaryBox,
                                  { borderColor: theme.border, backgroundColor: theme.background },
                                ]}
                              >
                                <Text style={[styles.evalReviewSummaryLabel, { color: theme.text }]}>総評</Text>
                                <Text style={[styles.evalReviewSummaryText, { color: theme.textSecondary }]}>
                                  {event.summaryMemo}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* ─── 巡回対応履歴カード（評価タブ） ─── */}
        {isHQRole && activeTab === 'evaluation' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>巡回対応履歴</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={loadPatrolHistory}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                  const taskLabel = getPatrolTaskTypeLabel(task);
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

        {/* ─── タスク実績カード（担当者別集計）（実績タブ） ─── */}
        {isHQRole && activeTab === 'stats' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>タスク実績</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={loadTaskStats}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
              </TouchableOpacity>
            </View>

            {/* 並べ替えピル */}
            <View style={styles.filterRow}>
              {[
                { key: 'total', label: '件数多い順' },
                { key: 'name', label: '名前順' },
              ].map((sortOption) => {
                /** このオプションが選択中かどうか */
                const isActive = taskStatsSortKey === sortOption.key;
                return (
                  <Pressable
                    key={sortOption.key}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: isActive ? theme.primary : theme.border,
                        backgroundColor: isActive ? theme.primary : theme.background,
                      },
                    ]}
                    onPress={() => setTaskStatsSortKey(sortOption.key)}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
                      {sortOption.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 凡例 */}
            <View style={styles.statsLegendRow}>
              {[
                { label: '施錠', color: '#2E86AB' },
                { label: '開始終了', color: '#22A06B' },
                { label: '振り分け', color: '#9C4DCC' },
                { label: '定常巡回', color: '#9F6E00' },
                { label: 'その他', color: theme.textSecondary },
              ].map((legend) => (
                <View key={legend.label} style={styles.statsLegendItem}>
                  <View style={[styles.statsLegendDot, { backgroundColor: legend.color }]} />
                  <Text style={[styles.statsLegendText, { color: theme.textSecondary }]}>{legend.label}</Text>
                </View>
              ))}
            </View>

            {isLoadingTaskStats ? (
              <SkeletonLoader lines={4} baseColor={theme.border} />
            ) : taskStatsRows.length === 0 ? (
              <EmptyState
                icon={'\u{1F4CA}'}
                title="タスク実績がありません"
                description="担当者が割り当てられたタスクが集計されます。"
                actionLabel="更新する"
                onAction={loadTaskStats}
                theme={theme}
              />
            ) : (
              <View style={styles.statsTable}>
                {/* テーブルヘッダー */}
                <View style={[styles.statsHeaderRow, { borderColor: theme.border, backgroundColor: `${theme.primary}0A` }]}>
                  <Text style={[styles.statsHeaderName, { color: theme.text }]}>担当者</Text>
                  <Text style={[styles.statsHeaderCell, { color: '#2E86AB' }]}>施錠</Text>
                  <Text style={[styles.statsHeaderCell, { color: '#22A06B' }]}>開始終了</Text>
                  <Text style={[styles.statsHeaderCell, { color: '#9C4DCC' }]}>振り分け</Text>
                  <Text style={[styles.statsHeaderCell, { color: '#9F6E00' }]}>定常</Text>
                  <Text style={[styles.statsHeaderTotal, { color: theme.text }]}>合計</Text>
                </View>
                {taskStatsRows.map((row, index) => (
                  <View
                    key={row.userId}
                    style={[
                      styles.statsRow,
                      {
                        borderColor: theme.border,
                        backgroundColor: index % 2 === 0 ? theme.background : theme.surface,
                      },
                    ]}
                  >
                    {/* 担当者名 */}
                    <Text style={[styles.statsRowName, { color: theme.text }]} numberOfLines={1}>
                      {index + 1}. {row.name}
                    </Text>
                    {/* 種別ごとの件数 */}
                    <Text style={[styles.statsRowCell, { color: '#2E86AB' }]}>{row.lock_check || 0}</Text>
                    <Text style={[styles.statsRowCell, { color: '#22A06B' }]}>{row.confirm || 0}</Text>
                    <Text style={[styles.statsRowCell, { color: '#9C4DCC' }]}>{row.dispatch || 0}</Text>
                    <Text style={[styles.statsRowCell, { color: '#9F6E00' }]}>{row.patrol || 0}</Text>
                    {/* 合計 */}
                    <View style={[styles.statsRowTotalCell]}>
                      <Text style={[styles.statsRowTotal, { color: theme.primary }]}>{row.total}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {isHQRole && activeTab === 'radio' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>無線ログ</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={loadRadioLogs}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                        backgroundColor: isActive ? theme.primary : theme.background,
                      },
                    ]}
                    onPress={() => setRadioChannel(cat.key)}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
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

        {/* ─── 連絡案件タブ（HQ）: rule_question / layout_change 対応 ─── */}
        {isHQRole && activeTab === 'tickets' ? (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>連絡案件</Text>
                <TouchableOpacity
                  style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                  onPress={() => loadTickets(selectedTicketId)}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
                </TouchableOpacity>
              </View>

              {/* 対応状況フィルター */}
              <View style={styles.filterRow}>
                {HQ_TICKET_STATUS_FILTERS.map((filter) => {
                  /** フィルターが選択中かどうか */
                  const isActive = filter.key === ticketStatusFilter;
                  return (
                    <Pressable
                      key={filter.key}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? theme.primary : theme.background,
                        },
                      ]}
                      onPress={() => setTicketStatusFilter(filter.key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isActive ? '#FFFFFF' : theme.textSecondary },
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isLoadingTickets ? (
                <SkeletonLoader lines={3} baseColor={theme.border} />
              ) : filteredTickets.length === 0 ? (
                <EmptyState
                  icon={'\u{1F4E8}'}
                  title="この条件に一致する連絡案件はありません"
                  description="新しい連絡案件が届くとここに表示されます。"
                  actionLabel="更新する"
                  onAction={() => loadTickets(selectedTicketId)}
                  theme={theme}
                />
              ) : (
                <View style={styles.messageList}>
                  {filteredTickets.map((ticket) => {
                    /** 選択中かどうか */
                    const isActive = ticket.id === selectedTicketId;
                    /** 経過時間アラート */
                    const alertInfo = getElapsedAlertInfo(ticket.created_at, ticket.ticket_status);
                    /** 経過時間アラートによる左ボーダー色 */
                    const alertBorderColor = alertInfo.color || (isActive ? theme.primary : theme.border);
                    return (
                      <Pressable
                        key={ticket.id}
                        style={[
                          styles.ticketItem,
                          {
                            borderColor: alertBorderColor,
                            backgroundColor: isActive ? `${theme.primary}14` : theme.background,
                            borderLeftWidth: 4,
                            borderLeftColor: alertBorderColor,
                          },
                        ]}
                        onPress={() => setSelectedTicketId(ticket.id)}
                      >
                        <View style={styles.ticketTitleRow}>
                          <Text
                            style={[styles.ticketTitle, { color: theme.text }]}
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
            </View>

            {selectedTicket ? (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>案件詳細</Text>
                  <TouchableOpacity
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={toggleDepartmentTicketDetailSection}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
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

                    <Text style={[styles.label, { color: theme.text }]}>ステータス</Text>
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
                        {HQ_TICKET_STATUS_OPTIONS.map((option) => {
                          /** このオプションが選択中かどうか */
                          const tone = DEPARTMENT_STATUS_TONES[option.key] || {
                            borderColor: theme.primary,
                            backgroundColor: `${theme.primary}14`,
                          };
                          const isActive = getDepartmentStatusBucket(selectedTicket.ticket_status) === option.key;
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

                    <Text style={[styles.label, { color: theme.text }]}>依頼内容</Text>
                    <Text
                      style={[
                        styles.requestBody,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                    >
                      {selectedTicket.description}
                    </Text>

                    {/* 本部向け: rule_question / layout_change のとき「部員が向かいます」タスク生成ボタン */}
                    {isHQRole &&
                      (selectedTicket.ticket_type === 'rule_question' ||
                        selectedTicket.ticket_type === 'layout_change') ? (
                      <View style={[styles.dispatchSection, { borderColor: theme.border, backgroundColor: `${theme.primary}08` }]}>
                        <Text style={[styles.dispatchSectionTitle, { color: theme.text }]}>
                          🚶 現地対応
                        </Text>
                        <Text style={[styles.dispatchSectionDesc, { color: theme.textSecondary }]}>
                          企画管理部の部員を現地に向かわせるタスクを生成します。依頼者にも通知が届きます。
                        </Text>
                        <TouchableOpacity
                          style={[styles.dispatchButton, { backgroundColor: theme.primary }]}
                          onPress={() => {
                            setDispatchAssigneeId('');
                            setIsDispatchModalVisible(true);
                            loadDispatchCandidates();
                          }}
                        >
                          <Text style={styles.dispatchButtonText}>🚶 部員が向かいます</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={styles.sectionHeader}>
                      <Text style={[styles.label, { color: theme.text }]}>対応メッセージ</Text>
                      <TouchableOpacity
                        style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                        onPress={() => loadMessages(selectedTicket.id)}
                      >
                        <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                          /** 自分のメッセージかどうか */
                          const isMine = message.author_id === user?.id;
                          /** ロール別色分け */
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
                      placeholder="回答/対応メモを入力してください"
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

        {/* 連絡案件: 非HQロールのみScrollView内で表示（HQはsplitLayout） */}
        {!isHQRole && shouldShowDepartmentTicketSections ? (
          <>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>対象連絡案件</Text>
            <View style={styles.sectionHeaderActions}>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={async () => {
                  await saveLastViewedAt();
                  loadTickets(selectedTicketId);
                }}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={toggleDepartmentTicketListSection}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
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
                          backgroundColor: isActive ? theme.primary : theme.background,
                        },
                      ]}
                      onPress={() => setHqTicketTypeFilter(isActive ? 'all' : key)}
                    >
                      <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
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
                        <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
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
                          backgroundColor: isActive ? theme.primary : theme.background,
                        },
                      ]}
                      onPress={() => setTicketStatusFilter(filter.key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isActive ? '#FFFFFF' : theme.textSecondary },
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
                      {ticket.organizations?.name || '-'} / 受付 {ticket.ticket_no || '-'}
                    </Text>
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
            style={[styles.card, { backgroundColor: theme.surface }]}
            onLayout={(event) => {
              setDepartmentDetailSectionY(event.nativeEvent.layout.y);
            }}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>案件詳細</Text>
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                onPress={toggleDepartmentTicketDetailSection}
              >
                <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
                  {isDepartmentTicketDetailExpanded ? '折りたたむ' : '開く'}
                </Text>
              </TouchableOpacity>
            </View>

            {isDepartmentTicketDetailExpanded ? (
              <>
                <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>{selectedTicket.title}</Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                  団体: {selectedTicket.organizations?.name || '-'} / 受付番号: {selectedTicket.ticket_no || '-'}
                </Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                  種別: {TICKET_TYPE_LABELS[selectedTicket.ticket_type] || selectedTicket.ticket_type} / 状態:{' '}
                  {getTicketStatusLabelForRole(selectedTicket, roleType)}
                  {selectedTicket.priority ? ` / 優先度: ${selectedTicket.priority === 'high' ? '高' : '中'}` : null}
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
                {isDepartmentRole || isHQRespondableTicket ? (
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
                        style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                        onPress={() => loadTicketAttachedFiles(selectedTicket.id)}
                      >
                        <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                    style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                    onPress={() => loadMessages(selectedTicket.id)}
                  >
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
                  placeholder={isDepartmentRole || isHQRespondableTicket ? '回答/対応メモを入力してください' : '回答内容を入力してください'}
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
        {shouldShowAccountingPrizeSection ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>景品配布基準</Text>
              <View style={styles.sectionHeaderActions}>
                <TouchableOpacity
                  style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                  onPress={loadPrizeDistributions}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                  onPress={togglePrizeDistributionSection}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.primary }]}>
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

        {/* ─── 独自タスクタブ ─── */}
        {isHQRole && activeTab === 'custom_task' ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>独自タスクを作成</Text>
            </View>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              巡回者を選択してタスクを投げることができます。担当者は未割当のままにすることもできます。
            </Text>

            {/* 担当者選択 */}
            <Text style={[styles.label, { color: theme.text }]}>担当者を選択（企画管理部）</Text>
            {isLoadingDispatchCandidates ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
            ) : dispatchCandidates.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                  企画管理部のメンバーが見つかりません
                </Text>
                <TouchableOpacity
                  style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
                  onPress={loadDispatchCandidates}
                >
                  <Text style={[styles.refreshButtonText, { color: theme.primary }]}>読み込む</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={[styles.dispatchAssigneeList, { marginBottom: 12 }]}
                contentContainerStyle={{ gap: 6 }}
              >
                {/* 未割当オプション */}
                <Pressable
                  style={[
                    styles.dispatchAssigneeItem,
                    {
                      borderColor: !customTaskAssigneeId ? theme.primary : theme.border,
                      backgroundColor: !customTaskAssigneeId ? `${theme.primary}14` : theme.background,
                    },
                  ]}
                  onPress={() => setCustomTaskAssigneeId('')}
                >
                  <Text style={[styles.dispatchAssigneeText, { color: !customTaskAssigneeId ? theme.primary : theme.text }]}>
                    未割当のまま作成
                  </Text>
                </Pressable>

                {dispatchCandidates.map((candidate) => {
                  /** 選択中かどうか */
                  const isSelected = customTaskAssigneeId === candidate.userId;
                  /** アクティブタスク（稼働中）を持つかどうか */
                  const activeTasks = getAssignedActivePatrolTasks(hqPatrolTasks, candidate.userId);
                  /** アクティブタスクのラベル */
                  const activeTaskLabel =
                    activeTasks.length > 0
                      ? PATROL_TASK_TYPE_LABELS[getPatrolTaskDisplayType(activeTasks[0])] || '対応中'
                      : '';
                  /** 対応中タスクを持つかどうか */
                  const hasActiveTask = activeTasks.length > 0;
                  return (
                    <Pressable
                      key={candidate.userId}
                      style={[
                        styles.dispatchAssigneeItem,
                        {
                          borderColor: isSelected ? theme.primary : hasActiveTask ? '#D1242F' : theme.border,
                          backgroundColor: isSelected
                            ? `${theme.primary}14`
                            : hasActiveTask
                              ? '#D1242F0A'
                              : theme.background,
                        },
                      ]}
                      onPress={() => {
                        if (hasActiveTask) {
                          return;
                        }
                        setCustomTaskAssigneeId(candidate.userId);
                      }}
                      disabled={hasActiveTask}
                    >
                      <Text
                        style={[
                          styles.dispatchAssigneeText,
                          {
                            color: hasActiveTask
                              ? '#D1242F'
                              : isSelected
                                ? theme.primary
                                : theme.text,
                          },
                        ]}
                      >
                        {candidate.name}
                        {hasActiveTask ? `（対応中: ${activeTaskLabel}）` : ''}
                      </Text>
                      {candidate.organization ? (
                        <Text style={[styles.dispatchAssigneeSub, { color: theme.textSecondary }]}>
                          {candidate.organization}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* タスク内容入力 */}
            <Text style={[styles.label, { color: theme.text }]}>タスク内容 *</Text>
            <TextInput
              value={customTaskNotes}
              onChangeText={setCustomTaskNotes}
              placeholder="例：A棟3Fの出展団体に企画ルール変更を伝えてください"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.textArea,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  color: theme.text,
                  minHeight: 90,
                },
              ]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* 作成ボタン */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    customTaskNotes.trim() && !isCreatingCustomTask ? theme.primary : theme.border,
                  marginTop: 8,
                },
              ]}
              onPress={handleCreateCustomTask}
              disabled={!customTaskNotes.trim() || isCreatingCustomTask}
            >
              <Text style={styles.primaryButtonText}>
                {isCreatingCustomTask
                  ? '作成中...'
                  : customTaskAssigneeId
                    ? '割り当てて作成'
                    : '未割当で作成'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── 設定タブ ─── */}
        {isHQRole && activeTab === 'settings' ? (
          <>
            {/* ── 未巡回アラート閾値設定 ── */}
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>未巡回アラート閾値設定</Text>
                  <Text style={[styles.helpText, { color: theme.textSecondary, marginTop: 2 }]}>
                    巡回サポートの「未巡回アラート」に適用される閾値です。この設定は巡回担当者には変更できません。
                  </Text>
                </View>
              </View>
              <View style={styles.patrolAlertThresholdRow}>
                {UNVISITED_ALERT_MINUTE_OPTIONS.map((minutes) => {
                  /** 選択中かどうか */
                  const isActive = minutes === hqUnvisitedAlertMinutes;
                  return (
                    <Pressable
                      key={String(minutes)}
                      style={[
                        styles.patrolAlertThresholdButton,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? theme.primary : theme.background,
                        },
                      ]}
                      onPress={() => handleChangeHqAlertMinutes(minutes)}
                    >
                      <Text
                        style={[
                          styles.patrolAlertThresholdText,
                          { color: isActive ? '#FFFFFF' : theme.textSecondary },
                        ]}
                      >
                        {minutes}分
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                現在の設定: {hqUnvisitedAlertMinutes}分以上巡回がない場所にアラートを表示
              </Text>
            </View>

            {/* ── 評価項目設定 ── */}
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>評価項目設定</Text>
              </View>
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                評価する項目名を設定します。生成した評価タスクは巡回サポートのタスク一覧へ追加されます。
              </Text>
              {/* 現在の評価項目リスト */}
              <View style={styles.evalItemList}>
                {evaluationItems.map((item, index) => (
                  <View
                    key={`eval-item-${index}`}
                    style={[styles.evalItemRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                  >
                    <Text style={[styles.evalItemLabel, { color: theme.text }]} numberOfLines={1}>
                      {index + 1}. {item}
                    </Text>
                    <TouchableOpacity
                      style={[styles.evalItemRemoveButton, { borderColor: theme.border }]}
                      onPress={() => handleRemoveEvaluationItem(index)}
                    >
                      <Text style={[styles.evalItemRemoveText, { color: theme.textSecondary }]}>削除</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              {/* 項目追加欄 */}
              <View style={styles.evalItemAddRow}>
                <TextInput
                  value={newEvaluationItemText}
                  onChangeText={setNewEvaluationItemText}
                  placeholder="新しい評価項目名を入力"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.evalItemInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
                  returnKeyType="done"
                  onSubmitEditing={handleAddEvaluationItem}
                />
                <TouchableOpacity
                  style={[styles.evalItemAddButton, { backgroundColor: theme.primary }]}
                  onPress={handleAddEvaluationItem}
                >
                  <Text style={styles.evalItemAddButtonText}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}

      </ScrollView>

      {/* 振り分けタスク生成: 担当者選択モーダル（ScrollViewの外に配置してどのタブからでも表示可能） */}
      <Modal
        visible={isDispatchModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDispatchModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsDispatchModalVisible(false)}>
          <Pressable
            style={[styles.dispatchModal, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => {}}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🚶 部員が向かいます</Text>
            <Text style={[styles.helpText, { color: theme.textSecondary, marginBottom: 12 }]}>
              担当者を選択してタスクを生成します。未割当のまま生成することもできます。
            </Text>
            {selectedTicket ? (
              <View style={[styles.dispatchModalTicketPreview, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                  {selectedTicket.title}
                </Text>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {selectedTicket.event_name} / {selectedTicket.event_location}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.label, { color: theme.text }]}>担当者を選択（企画管理部）</Text>
            {isLoadingDispatchCandidates ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
            ) : dispatchCandidates.length === 0 ? (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                企画管理部のメンバーが見つかりません
              </Text>
            ) : (
              <ScrollView style={styles.dispatchAssigneeList} contentContainerStyle={{ gap: 6 }}>
                {/* 未割当オプション */}
                <Pressable
                  style={[
                    styles.dispatchAssigneeItem,
                    {
                      borderColor: !dispatchAssigneeId ? theme.primary : theme.border,
                      backgroundColor: !dispatchAssigneeId ? `${theme.primary}14` : theme.background,
                    },
                  ]}
                  onPress={() => setDispatchAssigneeId('')}
                >
                  <Text style={[styles.dispatchAssigneeText, { color: !dispatchAssigneeId ? theme.primary : theme.text }]}>
                    未割当のまま生成
                  </Text>
                </Pressable>
                {dispatchCandidates.map((candidate) => {
                  /** このメンバーが選択中かどうか */
                  const isSelected = candidate.userId === dispatchAssigneeId;
                  /** 対応中タスク一覧 */
                  const activeTasks = getAssignedActivePatrolTasks(hqPatrolTasks, candidate.userId);
                  /** 対応中タスクがあるかどうか */
                  const hasActiveTask = activeTasks.length > 0;
                  /** 対応中タスク表示ラベル */
                  const activeTaskLabel = hasActiveTask
                    ? PATROL_TASK_TYPE_LABELS[getPatrolTaskDisplayType(activeTasks[0])] || '対応中'
                    : null;
                  return (
                    <Pressable
                      key={candidate.userId}
                      style={[
                        styles.dispatchAssigneeItem,
                        {
                          borderColor: hasActiveTask
                            ? '#D1242F'
                            : isSelected
                              ? theme.primary
                              : theme.border,
                          backgroundColor: hasActiveTask
                            ? '#FFF0F0'
                            : isSelected
                              ? `${theme.primary}14`
                              : theme.background,
                        },
                      ]}
                      onPress={() => {
                        if (hasActiveTask) {
                          return;
                        }
                        setDispatchAssigneeId(candidate.userId);
                      }}
                      disabled={hasActiveTask}
                    >
                      <Text
                        style={[
                          styles.dispatchAssigneeText,
                          {
                            color: hasActiveTask
                              ? '#D1242F'
                              : isSelected
                                ? theme.primary
                                : theme.text,
                          },
                        ]}
                      >
                        {candidate.name}
                        {hasActiveTask ? `（対応中: ${activeTaskLabel}）` : ''}
                      </Text>
                      {candidate.organization ? (
                        <Text style={[styles.dispatchAssigneeSub, { color: theme.textSecondary }]}>
                          {candidate.organization}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.dispatchModalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setIsDispatchModalVisible(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dispatchConfirmButton,
                  {
                    backgroundColor: theme.primary,
                    opacity: (isCreatingDispatchTask || isLoadingDispatchCandidates) ? 0.6 : 1,
                  },
                ]}
                onPress={handleCreateDispatchTask}
                disabled={isCreatingDispatchTask || isLoadingDispatchCandidates}
              >
                <Text style={styles.dispatchConfirmButtonText}>
                  {isCreatingDispatchTask ? '生成中...' : dispatchAssigneeId ? '割り当てて生成' : '未割当で生成'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 部署ロール向けステータス更新トースト */}
      <ToastMessage
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
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
  /** HQロール向けタブバー外枠: ThemedHeader 直下に固定 */
  tabSegmentBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  /** Segmented Control コンテナ: 薄いグレー背景 + 角丸 */
  tabSegmentBarContent: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 12,
  },
  /** 個々のタブアイテム: 非アクティブは透明 */
  tabSegmentBarItem: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  /** アクティブタブ: 白カード + shadow */
  tabSegmentBarItemActive: {
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  /** タブテキスト */
  tabSegmentBarText: {
    fontSize: 14,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  /** カード: borderWidth削除 + shadow */
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
    gap: 10,
    marginBottom: 14,
  },
  /** ダッシュボードカード: borderWidth削除 + shadow */
  dashboardCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dashboardLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  dashboardValue: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  dashboardUnit: {
    fontSize: 12,
    marginTop: 2,
  },
  dashboardAlertBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  dashboardAlertText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dashboardSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
    gap: 8,
  },
  dashboardSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  dashboardTicketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  dashboardTicketTypeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dashboardTicketTypeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dashboardTicketBody: {
    flex: 1,
  },
  dashboardTicketTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  dashboardTicketMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  /** ダッシュボード: 巡回中スタッフセクションのヘッダー行 */
  dashboardPatrolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** ダッシュボード: 巡回中人数バッジ */
  dashboardPatrolCountBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  /** ダッシュボード: 巡回中人数テキスト */
  dashboardPatrolCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  /** ダッシュボード: 巡回中スタッフ行 */
  dashboardPatrolRow: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  /** ダッシュボード: 巡回中スタッフ行ヘッダー */
  dashboardPatrolRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  /** ダッシュボード: 巡回スタッフ名・所属のコンテナ */
  dashboardPatrolUserInfo: {
    flex: 1,
    gap: 2,
  },
  /** ダッシュボード: 巡回スタッフ名 */
  dashboardPatrolName: {
    fontSize: 13,
    fontWeight: '700',
  },
  /** ダッシュボード: 巡回スタッフ所属 */
  dashboardPatrolOrg: {
    fontSize: 11,
  },
  /** ダッシュボード: 担当中タスクバッジ */
  dashboardPatrolTaskBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  /** ダッシュボード: 巡回タスク一覧 */
  dashboardPatrolTaskList: {
    gap: 8,
  },
  /** ダッシュボード: 巡回タスクカード */
  dashboardPatrolTaskCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  /** ダッシュボード: 巡回タスクカード上段 */
  dashboardPatrolTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** ダッシュボード: 巡回タスク活動ステータスバッジ */
  dashboardPatrolTaskStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  /** ダッシュボード: 巡回タスク活動ステータス文字 */
  dashboardPatrolTaskStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  /** ダッシュボード: 担当タスク種別テキスト */
  dashboardPatrolTaskType: {
    fontSize: 11,
    fontWeight: '700',
  },
  /** ダッシュボード: 担当タスクの企画名テキスト */
  dashboardPatrolTaskEvent: {
    fontSize: 11,
  },
  /** ダッシュボード: 巡回タスク内容要約 */
  dashboardPatrolTaskSummary: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** ダッシュボード: 巡回タスク補足メタ */
  dashboardPatrolTaskMeta: {
    fontSize: 10,
  },
  /** ダッシュボード: 巡回中だがタスク未所持の説明 */
  dashboardPatrolIdleText: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 振り分けセクション（案件詳細内） */
  dispatchSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  dispatchSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  dispatchSectionDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  dispatchButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dispatchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  /** 振り分けモーダル */
  dispatchModal: {
    margin: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
    gap: 4,
  },
  dispatchModalTicketPreview: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 4,
  },
  dispatchAssigneeList: {
    maxHeight: 250,
    marginBottom: 12,
  },
  dispatchAssigneeItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  dispatchAssigneeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dispatchAssigneeSub: {
    fontSize: 11,
  },
  dispatchModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dispatchConfirmButton: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dispatchConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  /** タスク実績テーブル */
  statsLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  statsLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statsLegendText: {
    fontSize: 11,
  },
  statsTable: {
    borderRadius: 10,
    overflow: 'hidden',
    gap: 1,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 2,
    gap: 4,
  },
  statsHeaderName: {
    flex: 3,
    fontSize: 11,
    fontWeight: '800',
  },
  statsHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  statsHeaderTotal: {
    width: 42,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 4,
  },
  statsRowName: {
    flex: 3,
    fontSize: 13,
    fontWeight: '600',
  },
  statsRowCell: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  statsRowTotalCell: {
    width: 42,
    alignItems: 'flex-end',
  },
  statsRowTotal: {
    fontSize: 16,
    fontWeight: '800',
  },
  /** タスクメモセクションの区切り線 */
  patrolNoteDivider: {
    borderTopWidth: 1,
    marginVertical: 12,
  },
  /** タスクメモ入力欄 */
  patrolNoteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    marginBottom: 8,
  },
  /** 巡回タスク行コンテンツ（割当ボタンと横並び） */
  patrolTaskItemContent: {
    flex: 1,
  },
  /** ステータスと担当バッジを横並びにする行 */
  patrolTaskStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  /** 割当済みバッジ（青） */
  assigneeBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  assigneeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  /** 未割当バッジ（グレー） */
  unassignedBadge: {
    backgroundColor: '#9E9E9E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unassignedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  /** 割当解除ボタン */
  unassignButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
    marginLeft: 8,
  },
  unassignButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 現在対応中セクション区切り線 */
  inProgressDivider: {
    borderTopWidth: 1,
    marginVertical: 12,
  },
  /** 現在対応中セクションタイトル */
  inProgressTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  /** 担当者グループ */
  inProgressGroup: {
    marginBottom: 10,
  },
  /** 担当者名ヘッダー */
  inProgressGroupName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  /** 対応中タスク行 */
  inProgressTaskRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  /** タスク種別テキスト */
  inProgressTaskType: {
    fontSize: 14,
    fontWeight: '600',
  },
  /** ステータスラベル（インライン） */
  inProgressTaskStatus: {
    fontSize: 13,
    fontWeight: '400',
  },
  /** 企画名・場所 */
  inProgressTaskDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  /** メモ表示 */
  inProgressTaskNotes: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
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
  accountingTabBar: {
    flexDirection: 'row',
    gap: 8,
  },
  accountingTabItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  accountingTabLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  /** フィルターチップ: pill型 / アクティブ時fill */
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
  /** 概況確認カードの詳細表示 */
  overviewDetailCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 8,
  },
  /** 概況確認カード内の導線ボタン行 */
  overviewActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  /** 概況確認カード内の補足表示ピル */
  overviewInfoPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexGrow: 1,
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
  /** 更新ボタン: primary薄め背景 / borderWidth削除 */
  refreshButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
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
  /** 送信ボタン: pill型 (borderRadius 10→24) */
  sendButton: {
    borderRadius: 24,
    paddingVertical: 13,
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
  /** ステータスボタン: borderRadius 10→16 */
  statusButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
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
  /** 評価項目リスト */
  evalItemList: {
    gap: 6,
  },
  /** 評価項目1行 */
  evalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  evalItemLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  evalItemRemoveButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evalItemRemoveText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 評価項目追加欄 */
  evalItemAddRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  evalItemInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  evalItemAddButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  evalItemAddButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  /** 評価対象企画リスト */
  evalOrgEventList: {
    gap: 8,
  },
  evalOrgEventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  evalOrgEventOrg: {
    fontSize: 11,
    fontWeight: '600',
  },
  evalOrgEventName: {
    fontSize: 13,
    fontWeight: '700',
  },
  evalStartButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  evalStartButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  /** 未巡回アラート閾値設定ボタン行 */
  patrolAlertThresholdRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  /** 未巡回アラート閾値選択ボタン */
  patrolAlertThresholdButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  /** 未巡回アラート閾値ボタンのテキスト */
  patrolAlertThresholdText: {
    fontSize: 13,
    fontWeight: '700',
  },
  /** 企画一覧: 直近巡回チェックサマリー行 */
  patrolCheckSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    gap: 8,
  },
  patrolCheckSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  patrolCheckSummaryDate: {
    fontSize: 11,
    marginTop: 2,
  },
  patrolCheckSummaryCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 巡回チェック記録なしテキスト */
  patrolCheckEmpty: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  /** チェック履歴展開リスト */
  patrolCheckHistoryList: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
    overflow: 'hidden',
  },
  patrolCheckHistoryItem: {
    borderBottomWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  patrolCheckHistoryDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  patrolCheckHistoryRow: {
    fontSize: 12,
    lineHeight: 18,
  },
  patrolCheckHistoryMemo: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  /** 評価一括生成: 企画選択チェックボックス行 */
  evalSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  evalSelectCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evalSelectCheckboxTick: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  evalSelectOrg: {
    fontSize: 11,
    fontWeight: '600',
  },
  evalSelectName: {
    fontSize: 14,
    fontWeight: '700',
  },
  /** 評価一括生成ボタン */
  evalBulkButton: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  evalBulkButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  /** 評価Excel出力ボタン */
  evalExportButton: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  evalExportButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  /** 団体別評価一覧 */
  evalReviewGroupList: {
    gap: 12,
    marginTop: 10,
  },
  evalReviewGroupCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  evalReviewGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  evalReviewGroupTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  evalReviewGroupMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  evalReviewEventList: {
    gap: 10,
  },
  evalReviewEventCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  evalReviewEventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  evalReviewEventTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  evalReviewEventMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  evalReviewStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  evalReviewStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  evalReviewProgressText: {
    fontSize: 12,
  },
  evalReviewItemList: {
    gap: 8,
  },
  evalReviewItemCard: {
    gap: 4,
  },
  evalReviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evalReviewItemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  evalReviewScoreBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evalReviewScoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  evalReviewItemComment: {
    fontSize: 12,
    lineHeight: 18,
  },
  evalReviewSummaryBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  evalReviewSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  evalReviewSummaryText: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 独自タスク用: 複数行テキスト入力 */
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  /** 独自タスク用: 確定ボタン */
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 独自タスク用: 確定ボタンテキスト */
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SupportDeskScreen;
