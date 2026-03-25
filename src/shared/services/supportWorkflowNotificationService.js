/**
 * 管理部統合システム向け通知ブリッジ
 * item12〜16 の業務イベントを通知サービスへ橋渡しする
 */

import {
  getUserProfilesByIds,
  sendNotificationToRoleNames as dispatchNotificationToRoleNames,
  sendNotificationToUser as dispatchNotificationToUser,
} from './notificationService.js';

/** DB roles テーブルの実在ロール名のみ使用する */
const DEPARTMENT_ROLE_NAME_TARGETS = {
  /** 管理者のみ（鍵事前申請など管理者限定通知向け） */
  admin: ['管理者'],
  /** 企画管理部＋管理者（通常の本部宛て通知） */
  hq: ['企画管理部', '管理者'],
  /** 会計部＋管理者 */
  accounting: ['会計部', '管理者'],
  /** 物品部＋管理者 */
  property: ['物品部', '管理者'],
  /** 警備部＋企画管理部＋管理者 */
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

/**
 * 個人ユーザーへ通知を送る内部ヘルパー
 * @param {Object} params
 * @param {string} params.userId - 送信先ユーザーID
 * @param {string} params.title - 通知タイトル
 * @param {string} params.body - 通知本文
 * @param {Object} [params.metadata={}] - メタデータ
 * @param {string|null} [params.senderUserId=null] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
const sendNotificationToUser = async ({
  userId,
  title,
  body,
  metadata = {},
  senderUserId = null,
}) => {
  const result = await dispatchNotificationToUser(userId, title, body, metadata, senderUserId);
  if (result.error) {
    return { error: result.error };
  }
  return { error: null, data: result };
};

const getRoleNamesForTicket = (ticket) => {
  const ticketType = normalizeText(ticket?.ticket_type);
  const notifyTarget = normalizeText(ticket?.notify_target);

  /** 企画開始/終了報告・緊急呼び出しは企画管理部＋管理者へ */
  if (ticketType === 'start_report' || ticketType === 'end_report' || ticketType === 'emergency') {
    return DEPARTMENT_ROLE_NAME_TARGETS.hq;
  }

  /** 鍵事前申請は管理者のみ */
  if (ticketType === 'key_preapply') {
    return DEPARTMENT_ROLE_NAME_TARGETS.admin;
  }

  if (notifyTarget === 'accounting') {
    return DEPARTMENT_ROLE_NAME_TARGETS.accounting;
  }
  if (notifyTarget === 'property') {
    return DEPARTMENT_ROLE_NAME_TARGETS.property;
  }

  /** デフォルト: 企画管理部＋管理者（rule_question, layout_change 等） */
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
  /** 担当者名を取得してタイトルに含める */
  const assigneeId = normalizeText(task.assigned_to || senderUserId);
  const profileMap = assigneeId ? await loadProfileMap([assigneeId]) : {};
  const assigneeName = profileMap[assigneeId]?.name || '担当者';

  /** 管理部全員（警備部 + 企画管理部 + 管理者）へ通知 */
  return sendNotificationToRoleNames({
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.patrol,
    title: `${assigneeName} が巡回タスクを受諾 [${taskLabel}]`,
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

/** 結果コードの表示ラベル */
const RESULT_CODE_LABELS = {
  OK: '問題なし',
  NOT_STARTED: '開始していない',
  NOT_ENDED: '終了していない',
  NEED_SUPPORT: '別対応必要',
  LOCKED: '施錠済',
  UNLOCKED: '未施錠',
  CANNOT_CONFIRM: '確認不可',
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
  /** 結果ラベルを解決 */
  const normalizedCode = normalizeText(resultCode).toUpperCase();
  const resultLabel = RESULT_CODE_LABELS[normalizedCode] || normalizedCode || '未設定';
  /** 担当者名を取得してタイトルに含める */
  const assigneeId = normalizeText(task.assigned_to || senderUserId);
  const profileMap = assigneeId ? await loadProfileMap([assigneeId]) : {};
  const assigneeName = profileMap[assigneeId]?.name || '担当者';

  return sendNotificationToRoleNames({
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.hq,
    title: `${assigneeName} が巡回タスクを完了 [${taskLabel}]`,
    body: `${eventName} / ${eventLocation}\n結果: ${resultLabel}`,
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

  /** 鍵ラベルは loan.key_label を優先し、なければタスクの location_text を使用 */
  const keyLabel = normalizeText(loan?.key_label || task?.location_text) || '鍵不明';
  const eventName = normalizeText(task?.event_name || loan?.event_name) || '企画名未設定';
  const eventLocation = normalizeText(task?.event_location || loan?.event_location) || eventName;

  return sendNotificationToRoleNames({
    /** 施錠確認タスクは企画管理部＋管理者へ通知 */
    roleNames: DEPARTMENT_ROLE_NAME_TARGETS.hq,
    title: `[${eventName}] 鍵「${keyLabel}」の施錠確認タスクが作成されました`,
    body: `場所: ${eventLocation}`,
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

/**
 * 企画開始/終了報告の確認完了通知（企画者個人へ）
 * 巡回担当者が confirm_start / confirm_end タスクを「問題なし」で完了したとき、
 * 報告を送った企画者本人に結果を通知する
 * @param {Object} input
 * @param {Object} input.ticket - 元の連絡案件（start_report / end_report）
 * @param {string|null} [input.patrolUserId] - 完了した巡回担当者のユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifyStartEndReportConfirmed = async ({ ticket, patrolUserId = null }) => {
  /** 報告者IDが取得できない場合は通知しない */
  const reporterUserId = normalizeText(ticket?.created_by);
  if (!reporterUserId) {
    return { error: null };
  }

  const ticketType = normalizeText(ticket?.ticket_type);
  /** 種別ラベル（start_report / end_report） */
  const typeLabel = ticketType === 'start_report' ? '企画開始報告' : '企画終了報告';
  const eventName = normalizeText(ticket?.event_name) || '企画名未設定';

  return sendNotificationToUser({
    userId: reporterUserId,
    title: `${typeLabel}が確認されました`,
    body: `${eventName} の${typeLabel}を確認しました`,
    metadata: {
      type: 'support_contact_update',
      notify_target: 'hq',
      ticket_id: ticket.id || null,
      ticket_type: ticketType || null,
    },
    senderUserId: patrolUserId,
  });
};

/**
 * 鍵の事前申請が用意済みになったことを予約者に通知する
 * @param {Object} input
 * @param {Object} input.reservation - 鍵予約レコード
 * @param {string|null} [input.staffUserId] - 操作した担当者のユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>}
 */
export const notifyKeyReservationReady = async ({ reservation, staffUserId = null }) => {
  /** 予約者IDが取得できない場合は通知しない */
  const reserverUserId = normalizeText(reservation?.created_by || reservation?.user_id);
  if (!reserverUserId) {
    return { error: null };
  }

  /** 鍵名（key_label または key_code） */
  const keyLabel = normalizeText(reservation?.key_label || reservation?.key_code) || '鍵';
  const eventName = normalizeText(reservation?.event_name) || '企画名未設定';

  return sendNotificationToUser({
    userId: reserverUserId,
    title: '鍵が用意できました',
    body: `鍵「${keyLabel}」の準備が完了しました\n企画: ${eventName}`,
    metadata: {
      type: 'key_reservation_ready',
      reservation_id: reservation.id || null,
    },
    senderUserId: staffUserId,
  });
};
