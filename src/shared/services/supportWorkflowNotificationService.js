/**
 * 管理部統合システム向け通知ブリッジ
 * item12〜16 の業務イベントを通知サービスへ橋渡しする
 */

import {
  getUserProfilesByIds,
  sendNotificationToRoleNames as dispatchNotificationToRoleNames,
} from './notificationService.js';

const DEPARTMENT_ROLE_NAME_TARGETS = {
  hq: ['管理者', 'Admin', 'Administrator'],
  accounting: ['会計部', '会計', 'Accounting', '管理者', 'Admin', 'Administrator'],
  property: ['物品部', '物品', 'Property', '管理者', 'Admin', 'Administrator'],
  patrol: [
    '警備部',
    '巡回',
    'Patrol',
    '企画管理部',
    '本部',
    'HQ',
    'Headquarters',
    '管理者',
    'Admin',
    'Administrator',
  ],
};

const ROLE_NAME_TARGETS = {
  hq: ['企画管理部', '管理者'],
  accounting: ['会計部', '管理者'],
  property: ['物品部', '管理者'],
  patrol: ['警備部', '企画管理部', '管理者'],
};

const TICKET_TYPE_LABELS = {
  emergency: '緊急連絡',
  rule_question: 'ルール問い合わせ',
  layout_change: '配置図変更',
  distribution_change: '商品配布基準変更',
  damage_report: '物品破損報告',
  key_preapply: '鍵事前申請',
  start_report: '企画開始報告',
  end_report: '企画終了報告',
};

const TASK_TYPE_LABELS = {
  confirm_start: '企画開始確認',
  confirm_end: '企画終了確認',
  lock_check: '施錠確認',
  emergency_support: '緊急対応',
  routine_patrol: '定常巡回',
  other: 'その他',
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const unique = (values) => Array.from(new Set((values || []).filter(Boolean)));

const sendNotificationToRoleNames = async ({
  roleNames,
  title,
  body,
  metadata = {},
  senderUserId = null,
}) => {
  const result = await dispatchNotificationToRoleNames(roleNames, title, body, metadata, senderUserId);
  if (result.error) {
    return { error: result.error };
  }

  return { error: null, data: result };
};

const getRoleNamesForTicket = (ticket) => {
  const ticketType = normalizeText(ticket?.ticket_type);
  const notifyTarget = normalizeText(ticket?.notify_target);

  if (ticketType === 'start_report' || ticketType === 'end_report') {
    return unique([...DEPARTMENT_ROLE_NAME_TARGETS.hq, ...DEPARTMENT_ROLE_NAME_TARGETS.patrol]);
  }

  if (ticketType === 'emergency') {
    return unique([...DEPARTMENT_ROLE_NAME_TARGETS.hq, ...DEPARTMENT_ROLE_NAME_TARGETS.patrol]);
  }

  if (notifyTarget === 'accounting') {
    return DEPARTMENT_ROLE_NAME_TARGETS.accounting;
  }
  if (notifyTarget === 'property') {
    return DEPARTMENT_ROLE_NAME_TARGETS.property;
  }

  return DEPARTMENT_ROLE_NAME_TARGETS.hq;
};

/**
 * ユーザープロフィール配列を user_id キーのマップへ変換する
 * @param {Array<Object>} profiles - プロフィール一覧
 * @returns {Object<string, Object>} user_id -> profile
 */
const buildProfileMap = (profiles) => {
  return (profiles || []).reduce((accumulator, profile) => {
    /** プロフィールのユーザーID */
    const userId = normalizeText(profile?.user_id);
    if (userId) {
      accumulator[userId] = profile;
    }
    return accumulator;
  }, {});
};

/**
 * 指定ユーザーのプロフィールマップを取得する
 * @param {Array<string|null|undefined>} userIds - ユーザーID一覧
 * @returns {Promise<Object<string, Object>>} user_id -> profile
 */
const loadProfileMap = async (userIds) => {
  /** 正規化済みユーザーID一覧 */
  const normalizedUserIds = unique((userIds || []).map(normalizeText));
  if (normalizedUserIds.length === 0) {
    return {};
  }

  /** プロフィール取得結果 */
  const { profiles, error } = await getUserProfilesByIds(normalizedUserIds);
  if (error) {
    return {};
  }

  return buildProfileMap(profiles);
};

/**
 * 連絡案件通知に必要な文脈情報を解決する
 * @param {Object} ticket - 連絡案件
 * @param {string|null} [senderUserId=null] - 送信者ユーザーID
 * @returns {Promise<Object>} 通知文脈
 */
const resolveTicketContext = async (ticket, senderUserId = null) => {
  /** 依頼者ユーザーID */
  const requesterUserId = normalizeText(ticket?.created_by) || normalizeText(senderUserId);
  /** プロフィールマップ */
  const profileMap = await loadProfileMap([requesterUserId]);
  /** 依頼者プロフィール */
  const requesterProfile = profileMap[requesterUserId] || null;
  /** 団体名 */
  const organizationName =
    normalizeText(ticket?.organizations?.name) ||
    normalizeText(requesterProfile?.organization) ||
    '団体未設定';
  /** 依頼者名 */
  const requesterName = normalizeText(requesterProfile?.name) || '依頼者未設定';
  /** 企画名 */
  const eventName = normalizeText(ticket?.event_name) || '企画名未設定';
  /** 場所 */
  const eventLocation = normalizeText(ticket?.event_location) || '場所未設定';
  /** 件名 */
  const ticketTitle = normalizeText(ticket?.title) || '新規連絡';

  return {
    organizationName,
    requesterName,
    eventName,
    eventLocation,
    ticketTitle,
  };
};

/**
 * 新規連絡案件通知のタイトル・本文を返す
 * @param {Object} ticket - 連絡案件
 * @param {string|null} [senderUserId=null] - 送信者ユーザーID
 * @returns {Promise<{title: string, body: string, context: Object}>} 通知内容
 */
const buildTicketNotification = async (ticket, senderUserId = null) => {
  const ticketType = normalizeText(ticket?.ticket_type);
  const ticketTypeLabel = TICKET_TYPE_LABELS[ticketType] || '連絡案件';
  const context = await resolveTicketContext(ticket, senderUserId);
  const description = normalizeText(ticket?.description);
  const descriptionPreview = description ? description.slice(0, 80) : '詳細なし';

  return {
    title: `[${ticketTypeLabel}] ${context.organizationName} / ${context.eventName}`,
    body: [
      `依頼者: ${context.requesterName}`,
      `場所: ${context.eventLocation}`,
      `件名: ${context.ticketTitle}`,
      `内容: ${descriptionPreview || context.ticketTitle}`,
    ].join('\n'),
    context,
  };
};

/**
 * 連絡案件作成通知
 * @param {Object} input
 * @param {Object} input.ticket - 作成済み連絡案件
 * @param {string|null} [input.senderUserId] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifySupportTicketCreated = async ({ ticket, senderUserId = null }) => {
  if (!ticket?.id) {
    return { error: new Error('連絡案件IDが不足しているため通知できません') };
  }

  const roleNames = getRoleNamesForTicket(ticket);
  const { title, body, context } = await buildTicketNotification(ticket, senderUserId);
  const metadata = {
    source: 'support_ticket',
    /** type は通知ナビゲーション（notificationNavigation.js）で遷移先解決に使用する */
    type: ticket.ticket_type || null,
    ticket_id: ticket.id,
    ticket_no: ticket.ticket_no || null,
    ticket_type: ticket.ticket_type || null,
    notify_target: ticket.notify_target || null,
    organization_name: context.organizationName,
    requester_name: context.requesterName,
    event_name: context.eventName,
    event_location: context.eventLocation,
  };

  return sendNotificationToRoleNames({
    roleNames,
    title,
    body,
    metadata,
    senderUserId,
  });
};

/**
 * 巡回タスク受諾通知（管理部全員）
 * @param {Object} input
 * @param {Object} input.task - 受諾後タスク
 * @param {string|null} [input.senderUserId] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifyPatrolTaskAccepted = async ({ task, senderUserId = null }) => {
  if (!task?.id) {
    return { error: new Error('タスクIDが不足しているため通知できません') };
  }

  const taskType = normalizeText(task.task_type);
  const taskLabel = TASK_TYPE_LABELS[taskType] || '巡回タスク';
  const eventName = normalizeText(task.event_name) || '企画名未設定';
  const eventLocation = normalizeText(task.event_location || task.location_text) || '場所未設定';

  /** 管理部全員（警備部 + 企画管理部 + 管理者）へ通知 */
  return sendNotificationToRoleNames({
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.patrol,
    title: `巡回受諾: ${taskLabel}`,
    body: `${eventName} / ${eventLocation}`,
    metadata: {
      source: 'patrol_task',
      event: 'accepted',
      task_id: task.id,
      task_no: task.task_no || null,
      task_type: task.task_type || null,
      source_ticket_id: task.source_ticket_id || null,
    },
    senderUserId,
  });
};

/**
 * 巡回タスク完了通知（本部向け）
 * @param {Object} input
 * @param {Object} input.task - 完了後タスク
 * @param {string} input.resultCode - 結果コード
 * @param {string|null} [input.senderUserId] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifyPatrolTaskCompleted = async ({ task, resultCode, senderUserId = null }) => {
  if (!task?.id) {
    return { error: new Error('タスクIDが不足しているため通知できません') };
  }

  const taskType = normalizeText(task.task_type);
  const taskLabel = TASK_TYPE_LABELS[taskType] || '巡回タスク';
  const eventName = normalizeText(task.event_name) || '企画名未設定';
  const eventLocation = normalizeText(task.event_location || task.location_text) || '場所未設定';

  return sendNotificationToRoleNames({
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.hq,
    title: `巡回完了: ${taskLabel}`,
    body: `${eventName} / ${eventLocation}\n結果: ${normalizeText(resultCode) || '未設定'}`,
    metadata: {
      source: 'patrol_task',
      event: 'completed',
      task_id: task.id,
      task_no: task.task_no || null,
      task_type: task.task_type || null,
      result_code: normalizeText(resultCode) || null,
      source_ticket_id: task.source_ticket_id || null,
      source_key_loan_id: task.source_key_loan_id || null,
    },
    senderUserId,
  });
};

/**
 * 施錠確認タスク作成通知（巡回向け）
 * @param {Object} input
 * @param {Object|null} input.task - 作成タスク
 * @param {Object|null} [input.loan] - 元鍵貸出情報
 * @param {string|null} [input.senderUserId] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifyLockCheckTaskCreated = async ({ task, loan = null, senderUserId = null }) => {
  if (!task?.id) {
    return { error: null };
  }

  const keyLabel = normalizeText(task?.event_location || task?.location_text || loan?.key_label) || '鍵不明';
  const eventName = normalizeText(task?.event_name || loan?.event_name) || '企画名未設定';

  return sendNotificationToRoleNames({
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.patrol,
    title: '施錠確認タスクが作成されました',
    body: `${eventName} / ${keyLabel}`,
    metadata: {
      source: 'key_loan',
      event: 'lock_task_created',
      task_id: task.id,
      task_no: task.task_no || null,
      loan_id: loan?.id || task.source_key_loan_id || null,
    },
    senderUserId,
  });
};

