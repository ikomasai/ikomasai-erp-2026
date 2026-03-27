/**
 * 管理部統合システム通知サービス
 * shared を編集せず、返信・状態更新・巡回割当の通知を補完する
 */

import {
  getUserProfilesByIds,
  sendNotificationToRoleNames as dispatchNotificationToRoleNames,
  sendNotificationToUser,
} from '../../shared/services/notificationService.js';

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

/** ロール名ベースの通知先 */
const ROLE_NAME_TARGETS = {
  hq: ['企画管理部', '管理者'],
  accounting: ['会計部', '管理者'],
  property: ['物品部', '管理者'],
  patrol: ['警備部', '企画管理部', '管理者'],
};

/** 通知本文に表示する担当部署名 */
const NOTIFY_TARGET_LABELS = {
  hq: '企画管理部',
  accounting: '会計部',
  property: '物品部',
};

/** 連絡案件種別表示名 */
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

/** 連絡案件状態表示名 */
const TICKET_STATUS_LABELS = {
  new: '未対応',
  acknowledged: '未対応',
  in_progress: '対応中',
  waiting_external: '対応中',
  resolved: '完了',
  closed: '完了',
};

/** 巡回タスク種別表示名 */
const PATROL_TASK_TYPE_LABELS = {
  confirm_start: '企画開始確認',
  confirm_end: '企画終了確認',
  lock_check: '施錠確認',
  emergency_support: '緊急対応',
  routine_patrol: '定常巡回',
  other: 'その他',
};

/**
 * 文字列をtrimして返す
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化後文字列
 */
const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * 配列から空値と重複を除去する
 * @param {Array<string>} values - 入力配列
 * @returns {Array<string>} 正規化後配列
 */
const unique = (values) => Array.from(new Set((values || []).filter(Boolean)));

/**
 * ロール名ベースで通知を送る
 * @param {Object} params - 通知パラメータ
 * @param {Array<string>} params.roleNames - 通知先ロール名一覧
 * @param {string} params.title - タイトル
 * @param {string} params.body - 本文
 * @param {Object} [params.metadata={}] - メタデータ
 * @param {string|null} [params.senderUserId=null] - 送信者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
const sendNotificationToRoleNames = async ({
  roleNames,
  title,
  body,
  metadata = {},
  senderUserId = null,
}) => {
  /** 通知送信結果 */
  const result = await dispatchNotificationToRoleNames(roleNames, title, body, metadata, senderUserId);
  if (result.error) {
    return { error: result.error };
  }

  return { error: null, data: result };
};

/**
 * 連絡案件に紐づくロール通知先を返す
 * @param {Object} ticket - 連絡案件
 * @returns {Array<string>} ロール名一覧
 */
const getRoleNamesForTicket = (ticket) => {
  /** 連絡案件種別 */
  const ticketType = normalizeText(ticket?.ticket_type);
  /** 通知対象 */
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
 * 通知本文の冒頭プレビューを返す
 * @param {string} value - 元本文
 * @returns {string} プレビュー文字列
 */
const buildPreviewText = (value) => {
  /** 正規化済み本文 */
  const normalizedBody = normalizeText(value);
  if (!normalizedBody) {
    return '詳細なし';
  }

  return normalizedBody.slice(0, 80);
};

/**
 * 連絡案件通知向けメタデータを作成する
 * @param {Object} ticket - 連絡案件
 * @param {Object} extraMetadata - 追加メタデータ
 * @param {Object|null} [context=null] - 通知文脈
 * @returns {Object} メタデータ
 */
const buildTicketMetadata = (ticket, extraMetadata = {}, context = null) => {
  return {
    source: 'support_ticket',
    ticket_id: ticket?.id || null,
    ticket_no: ticket?.ticket_no || null,
    ticket_type: ticket?.ticket_type || null,
    notify_target: ticket?.notify_target || null,
    organization_name: context?.organizationName || ticket?.organizations?.name || null,
    requester_name: context?.requesterName || null,
    actor_name: context?.actorName || null,
    event_name: context?.eventName || ticket?.event_name || null,
    event_location: context?.eventLocation || ticket?.event_location || null,
    ...extraMetadata,
  };
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
 * 通知本文に出す担当部署名を返す
 * @param {Object} ticket - 連絡案件
 * @returns {string} 担当部署名
 */
const buildDepartmentLabel = (ticket) => {
  /** 通知対象 */
  const notifyTarget = normalizeText(ticket?.notify_target) || 'hq';
  return NOTIFY_TARGET_LABELS[notifyTarget] || NOTIFY_TARGET_LABELS.hq;
};

/**
 * 連絡案件通知に必要な文脈情報を解決する
 * @param {Object} ticket - 連絡案件
 * @param {string|null} [actorUserId=null] - 行動者ユーザーID
 * @returns {Promise<Object>} 通知文脈
 */
const resolveTicketContext = async (ticket, actorUserId = null) => {
  /** 依頼者ユーザーID */
  const requesterUserId = normalizeText(ticket?.created_by);
  /** 行動者ユーザーID */
  const normalizedActorUserId = normalizeText(actorUserId);
  /** プロフィールマップ */
  const profileMap = await loadProfileMap([requesterUserId, normalizedActorUserId]);
  /** 依頼者プロフィール */
  const requesterProfile = profileMap[requesterUserId] || null;
  /** 行動者プロフィール */
  const actorProfile = profileMap[normalizedActorUserId] || null;
  /** 団体名 */
  const organizationName =
    normalizeText(ticket?.organizations?.name) ||
    normalizeText(requesterProfile?.organization) ||
    '団体未設定';
  /** 依頼者名 */
  const requesterName = normalizeText(requesterProfile?.name) || '依頼者未設定';
  /** 行動者名 */
  const actorName = normalizeText(actorProfile?.name) || '';
  /** 企画名 */
  const eventName = normalizeText(ticket?.event_name) || '企画名未設定';
  /** 場所 */
  const eventLocation = normalizeText(ticket?.event_location) || '場所未設定';
  /** 件名 */
  const ticketTitle = normalizeText(ticket?.title) || '連絡案件';

  return {
    organizationName,
    requesterName,
    actorName,
    eventName,
    eventLocation,
    ticketTitle,
  };
};

/**
 * 連絡案件通知の見出しを返す
 * @param {Object} context - 通知文脈
 * @returns {string} 見出し
 */
const buildTicketContextHeadline = (context) => {
  return `${context.organizationName} / ${context.eventName}`;
};

/**
 * 連絡案件通知本文の基本行を返す
 * @param {Object} context - 通知文脈
 * @param {string|null} [actorLabel=null] - 行動者ラベル
 * @returns {Array<string>} 基本行一覧
 */
const buildTicketContextLines = (context, actorLabel = null) => {
  /** 基本行一覧 */
  const lines = [
    `団体: ${context.organizationName}`,
    `依頼者: ${context.requesterName}`,
    `企画: ${context.eventName}`,
    `場所: ${context.eventLocation}`,
    `件名: ${context.ticketTitle}`,
  ];

  if (actorLabel && context.actorName) {
    lines.push(`${actorLabel}: ${context.actorName}`);
  }

  return lines;
};

/**
 * 通知本文を改行付きで組み立てる
 * @param {Array<string>} lines - 本文行一覧
 * @returns {string} 通知本文
 */
const buildNotificationBody = (lines) => {
  return (lines || [])
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join('\n');
};

/**
 * 返信投稿時の通知を送信する
 * 出展団体の追記は担当ロールへ、担当側の返信は出展団体本人へ通知する
 * @param {Object} params - 通知パラメータ
 * @param {Object} params.ticket - 対象連絡案件
 * @param {string} params.authorId - 投稿者ユーザーID
 * @param {string} params.body - 投稿本文
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
export const notifySupportTicketMessageCreated = async ({ ticket, authorId, body }) => {
  /** 正規化済み作成者ID */
  const normalizedAuthorId = normalizeText(authorId);
  /** 連絡案件作成者ID */
  const ticketCreatorId = normalizeText(ticket?.created_by);

  if (!ticket?.id || !normalizedAuthorId) {
    return { error: null };
  }

  /** 本文プレビュー */
  const previewText = buildPreviewText(body);
  /** 通知文脈 */
  const context = await resolveTicketContext(ticket, normalizedAuthorId);
  if (normalizedAuthorId === ticketCreatorId) {
    return sendNotificationToRoleNames({
      roleNames: getRoleNamesForTicket(ticket),
      title: `追加連絡: ${buildTicketContextHeadline(context)}`,
      body: buildNotificationBody([
        ...buildTicketContextLines(context),
        `内容: ${previewText}`,
      ]),
      metadata: buildTicketMetadata(ticket, {
        type: ticket?.ticket_type || null,
        event: 'message_created',
      }, context),
      senderUserId: normalizedAuthorId,
    });
  }

  if (!ticketCreatorId) {
    return { error: null };
  }

  /** 通知送信結果 */
  const result = await sendNotificationToUser(
    ticketCreatorId,
    `${buildDepartmentLabel(ticket)}から回答: ${buildTicketContextHeadline(context)}`,
    buildNotificationBody([
      ...buildTicketContextLines(context, '対応者'),
      `内容: ${previewText}`,
    ]),
    buildTicketMetadata(ticket, {
      type: 'support_contact_update',
      event: 'message_created',
    }, context),
    normalizedAuthorId,
  );

  if (result.error) {
    return { error: result.error };
  }

  return { error: null, data: result };
};

/**
 * 連絡案件状態更新時の通知を送信する
 * 担当側が状態を変えた時のみ出展団体本人へ通知する
 * @param {Object} params - 通知パラメータ
 * @param {Object} params.ticket - 更新後連絡案件
 * @param {string} params.nextStatus - 更新後ステータス
 * @param {string|null} [params.actorUserId=null] - 更新者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
export const notifySupportTicketStatusChanged = async ({
  ticket,
  nextStatus,
  actorUserId = null,
}) => {
  /** 連絡案件作成者ID */
  const ticketCreatorId = normalizeText(ticket?.created_by);
  /** 更新者ユーザーID */
  const normalizedActorUserId = normalizeText(actorUserId);
  /** 状態ラベル */
  const statusLabel = TICKET_STATUS_LABELS[normalizeText(nextStatus)] || normalizeText(nextStatus) || '更新';

  if (!ticket?.id || !ticketCreatorId || !normalizedActorUserId) {
    return { error: null };
  }

  if (ticketCreatorId === normalizedActorUserId) {
    return { error: null };
  }

  /** 通知文脈 */
  const context = await resolveTicketContext(ticket, normalizedActorUserId);
  /** 通知送信結果 */
  const result = await sendNotificationToUser(
    ticketCreatorId,
    `${buildDepartmentLabel(ticket)}が状況更新: ${buildTicketContextHeadline(context)}`,
    buildNotificationBody([
      ...buildTicketContextLines(context, '更新者'),
      `状況: ${statusLabel}`,
    ]),
    buildTicketMetadata(ticket, {
      type: 'support_contact_update',
      event: 'status_changed',
      status: normalizeText(nextStatus) || null,
    }, context),
    normalizedActorUserId,
  );

  if (result.error) {
    return { error: result.error };
  }

  return { error: null, data: result };
};

/**
 * 巡回タスク割当通知を送信する
 * 本部が担当者へ個別通知する
 * @param {Object} params - 通知パラメータ
 * @param {Object} params.task - 更新後タスク
 * @param {string|null} [params.senderUserId=null] - 実行者ユーザーID
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
export const notifyPatrolTaskAssigned = async ({ task, senderUserId = null }) => {
  /** 担当者ユーザーID */
  const assignedTo = normalizeText(task?.assigned_to);
  /** タスク種別 */
  const taskType = normalizeText(task?.task_type);
  /** タスク種別ラベル */
  const taskTypeLabel = PATROL_TASK_TYPE_LABELS[taskType] || '巡回タスク';
  /** 企画名 */
  const eventName = normalizeText(task?.event_name) || '企画名未設定';
  /** 場所 */
  const eventLocation = normalizeText(task?.event_location || task?.location_text) || '場所未設定';

  if (!task?.id || !assignedTo) {
    return { error: null };
  }

  /** 通知送信結果 */
  const result = await sendNotificationToUser(
    assignedTo,
    `巡回割当: ${taskTypeLabel}`,
    `${eventName} / ${eventLocation}`,
    {
      source: 'patrol_task',
      type: 'patrol_task_assigned',
      event: 'assigned',
      task_id: task.id,
      task_no: task.task_no || null,
      task_type: task.task_type || null,
      source_ticket_id: task.source_ticket_id || null,
    },
    normalizeText(senderUserId) || null,
  );

  if (result.error) {
    return { error: result.error };
  }

  return { error: null, data: result };
};
