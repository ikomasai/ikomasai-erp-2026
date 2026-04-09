/**
 * 管理部統合システム通知サービス
 * shared を編集せず、返信・状態更新・巡回割当の通知を補完する
 */

import {
  getUserProfilesByIds,
  sendNotificationToRoleNames as dispatchNotificationToRoleNames,
  sendNotificationToOrganization,
  sendNotificationToUser,
} from '../../shared/services/notificationService.js';

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

/**
 * ステータス値からラベルを返す
 * @param {string} status - ステータス値
 * @returns {string} ラベル
 */
const resolveStatusLabel = (status) => TICKET_STATUS_LABELS[normalizeText(status)] || normalizeText(status) || '不明';

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
 * 通知先はユーザー要件に基づき ticket_type / notify_target で決定する
 * @param {Object} ticket - 連絡案件
 * @returns {Array<string>} ロール名一覧
 */
const getRoleNamesForTicket = (ticket) => {
  /** 連絡案件種別 */
  const ticketType = normalizeText(ticket?.ticket_type);
  /** 通知対象 */
  const notifyTarget = normalizeText(ticket?.notify_target);

  // 企画開始/終了報告・緊急呼び出し → 企画管理部＋管理者
  if (
    ticketType === 'start_report' ||
    ticketType === 'end_report' ||
    ticketType === 'emergency'
  ) {
    return DEPARTMENT_ROLE_NAME_TARGETS.hq;
  }

  // 鍵の事前申請 → 管理者のみ
  if (ticketType === 'key_preapply') {
    return DEPARTMENT_ROLE_NAME_TARGETS.admin;
  }

  // 会計部向け（商品配布基準変更など）
  if (notifyTarget === 'accounting') {
    return DEPARTMENT_ROLE_NAME_TARGETS.accounting;
  }

  // 物品部向け（物品破損報告など）
  if (notifyTarget === 'property') {
    return DEPARTMENT_ROLE_NAME_TARGETS.property;
  }

  // デフォルト（企画ルール変更・配置図変更など）→ 企画管理部＋管理者
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
 * 組織通知に使う対象情報を返す
 * @param {Object} ticket - 連絡案件
 * @param {Object|null} [context=null] - 通知文脈
 * @returns {{ organizationId: string|null, organizationName: string|null }} 組織通知先
 */
const buildOrganizationTarget = (ticket, context = null) => {
  /** 組織ID */
  const organizationId = normalizeText(ticket?.org_id) || null;
  /** 組織名 */
  const organizationName =
    normalizeText(ticket?.organizations?.name) ||
    normalizeText(context?.organizationName) ||
    null;

  return {
    organizationId,
    organizationName,
  };
};

/**
 * Push が1件以上成功したか判定する
 * @param {Object|null|undefined} notificationResult - 通知送信結果
 * @returns {boolean} Push 成功がある場合 true
 */
const hasDeliveredPush = (notificationResult) => {
  /** Push送信結果 */
  const push = notificationResult?.push || null;
  /** Push成功件数 */
  const succeededCount = Number(push?.succeeded) || 0;
  return succeededCount > 0;
};

/**
 * Push集計を加算する
 * @param {Array<Object>} pushResults - Push結果一覧
 * @returns {{ attempted: number, succeeded: number, failed: number, removed: number }|null} 集計結果
 */
const mergePushStats = (pushResults) => {
  /** 有効なPush結果一覧 */
  const normalizedPushResults = (pushResults || []).filter(Boolean);
  if (normalizedPushResults.length === 0) {
    return null;
  }

  return normalizedPushResults.reduce(
    (accumulator, push) => ({
      attempted: accumulator.attempted + (Number(push.attempted) || 0),
      succeeded: accumulator.succeeded + (Number(push.succeeded) || 0),
      failed: accumulator.failed + (Number(push.failed) || 0),
      removed: accumulator.removed + (Number(push.removed) || 0),
    }),
    {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      removed: 0,
    },
  );
};

/**
 * 複数通知結果をUI表示向けに統合する
 * @param {Array<Object|null|undefined>} results - 通知送信結果一覧
 * @returns {Object|null} 統合結果
 */
const mergeNotificationResults = (results) => {
  /** 有効な通知結果一覧 */
  const normalizedResults = (results || []).filter(Boolean);
  if (normalizedResults.length === 0) {
    return null;
  }

  /** 代表通知 */
  const firstResult = normalizedResults[0];
  /** Push集計 */
  const mergedPush = mergePushStats(normalizedResults.map((result) => result.push));

  return {
    notification: firstResult.notification || null,
    recipientsCount: normalizedResults.reduce(
      (count, result) => count + (Number(result.recipientsCount) || 0),
      0,
    ),
    push: mergedPush,
  };
};

/**
 * 個人通知の Push が届かない場合は組織通知へフォールバックする
 * @param {Object} params - 通知パラメータ
 * @param {Object} params.ticket - 連絡案件
 * @param {string|null} [params.recipientUserId=null] - 個人通知先ユーザーID
 * @param {boolean} [params.allowOrganizationFallback=true] - 組織通知へフォールバックするか
 * @param {string} params.title - タイトル
 * @param {string} params.body - 本文
 * @param {Object} [params.metadata={}] - メタデータ
 * @param {string|null} [params.senderUserId=null] - 送信者ユーザーID
 * @param {Object|null} [params.context=null] - 通知文脈
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
const notifyUserOrOrganization = async ({
  ticket,
  recipientUserId = null,
  allowOrganizationFallback = true,
  title,
  body,
  metadata = {},
  senderUserId = null,
  context = null,
}) => {
  /** 正規化済み個人通知先ユーザーID */
  const normalizedRecipientUserId = normalizeText(recipientUserId);
  /** 組織通知先 */
  const organizationTarget = buildOrganizationTarget(ticket, context);
  /** 通知送信結果一覧 */
  const notificationResults = [];
  /** 送信エラー */
  let notificationError = null;

  if (normalizedRecipientUserId) {
    /** 個人通知結果 */
    const userResult = await sendNotificationToUser(
      normalizedRecipientUserId,
      title,
      body,
      metadata,
      senderUserId,
    );

    if (userResult.error) {
      notificationError = userResult.error;
    } else {
      notificationResults.push(userResult);
    }

    if (!userResult.error && hasDeliveredPush(userResult)) {
      return {
        error: null,
        data: mergeNotificationResults(notificationResults),
      };
    }
  }

  if (!allowOrganizationFallback) {
    return {
      error: notificationError,
      data: mergeNotificationResults(notificationResults),
    };
  }

  if (!organizationTarget.organizationId && !organizationTarget.organizationName) {
    return {
      error: notificationError,
      data: mergeNotificationResults(notificationResults),
    };
  }

  /** 組織通知結果 */
  const organizationResult = await sendNotificationToOrganization({
    organizationId: organizationTarget.organizationId,
    organizationName: organizationTarget.organizationName,
    title,
    body,
    metadata: {
      ...metadata,
      notify_scope: normalizedRecipientUserId ? 'organization_fallback' : 'organization',
    },
    senderUserId,
  });

  if (organizationResult.error) {
    return {
      error: notificationError || organizationResult.error,
      data: mergeNotificationResults(notificationResults),
    };
  }

  notificationResults.push(organizationResult);
  return {
    error: null,
    data: mergeNotificationResults(notificationResults),
  };
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
  /** 正規化済み投稿者ID */
  const normalizedAuthorId = normalizeText(authorId);
  /** 連絡案件作成者ID */
  const ticketCreatorId = normalizeText(ticket?.created_by);

  if (!ticket?.id || !normalizedAuthorId) {
    return { error: null };
  }

  /** 本文プレビュー */
  const previewText = buildPreviewText(body);
  /** 依頼者向け返信プレビュー */
  const replyPreview = normalizeText(body).slice(0, 160);
  /** 依頼者向け返信タイトルプレビュー */
  const replyShortPreview = normalizeText(body).slice(0, 40);
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

  /** 個人通知先ユーザーID */
  const requesterRecipientUserId = ticketCreatorId || null;

  return notifyUserOrOrganization({
    ticket,
    recipientUserId: requesterRecipientUserId,
    allowOrganizationFallback: false,
    title: `${buildDepartmentLabel(ticket)}から回答: ${replyShortPreview}`,
    body: buildNotificationBody([
      replyPreview,
      '─',
      `件名: ${context.ticketTitle}`,
      `団体: ${context.organizationName} / 企画: ${context.eventName}`,
      context.actorName ? `対応者: ${context.actorName}` : '',
    ]),
    metadata: buildTicketMetadata(ticket, {
      type: 'support_contact_update',
      event: 'message_created',
      recipient_user_id: requesterRecipientUserId,
    }, context),
    senderUserId: normalizedAuthorId,
    context,
  });
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
  prevStatus = null,
  nextStatus,
  actorUserId = null,
}) => {
  /** 連絡案件作成者ID */
  const ticketCreatorId = normalizeText(ticket?.created_by);
  /** 更新者ユーザーID */
  const normalizedActorUserId = normalizeText(actorUserId);
  /** 変更前ステータスラベル */
  const prevStatusLabel = prevStatus ? resolveStatusLabel(prevStatus) : null;
  /** 変更後ステータスラベル */
  const nextStatusLabel = resolveStatusLabel(nextStatus);
  /** 通知タイトル用ステータス変化テキスト（変更前が分かる場合は「前→後」形式） */
  const statusChangeText = prevStatusLabel ? `${prevStatusLabel}→${nextStatusLabel}` : nextStatusLabel;

  if (!ticket?.id || !normalizedActorUserId) {
    return { error: null };
  }

  if (ticketCreatorId === normalizedActorUserId) {
    return { error: null };
  }

  /** 通知文脈 */
  const context = await resolveTicketContext(ticket, normalizedActorUserId);
  /** 個人通知先ユーザーID */
  const requesterRecipientUserId = ticketCreatorId || null;
  return notifyUserOrOrganization({
    ticket,
    recipientUserId: requesterRecipientUserId,
    allowOrganizationFallback: false,
    title: `${buildDepartmentLabel(ticket)}がステータス更新 [${statusChangeText}]: ${buildTicketContextHeadline(context)}`,
    body: buildNotificationBody([
      ...buildTicketContextLines(context, '更新者'),
      `変更: ${statusChangeText}`,
    ]),
    metadata: buildTicketMetadata(ticket, {
      type: 'support_contact_update',
      event: 'status_changed',
      status: normalizeText(nextStatus) || null,
      prev_status: normalizeText(prevStatus) || null,
      recipient_user_id: requesterRecipientUserId,
    }, context),
    senderUserId: normalizedActorUserId,
    context,
  });
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
  /** 依頼内容・備考（notes フィールド）*/
  const notes = normalizeText(task?.notes);

  if (!task?.id || !assignedTo) {
    return { error: null };
  }

  /** 通知本文: 企画名・場所・依頼内容を改行で並べる */
  const bodyLines = [
    `企画: ${eventName}`,
    `場所: ${eventLocation}`,
  ];
  if (notes) {
    bodyLines.push(`依頼内容: ${notes}`);
  }
  /** 通知本文 */
  const body = bodyLines.join('\n');

  /** 通知送信結果 */
  const result = await sendNotificationToUser(
    assignedTo,
    `巡回割当 [${taskTypeLabel}]: ${eventName}`,
    body,
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

/**
 * 振り分けタスク生成時に連絡案件作成者へ「部員が向かいます」通知を送る
 * @param {Object} params - 通知パラメータ
 * @param {Object} params.ticket - 元連絡案件
 * @param {Object} params.task - 生成したタスク
 * @param {string|null} [params.senderUserId=null] - 送信者ユーザーID（本部スタッフ）
 * @returns {Promise<{error: Error|null, data?: Object}>} 送信結果
 */
export const notifyDispatchTaskCreated = async ({ ticket, task, senderUserId = null }) => {
  /** 連絡案件作成者ID */
  const ticketCreatorId = normalizeText(ticket?.created_by);
  /** 企画名 */
  const eventName = normalizeText(ticket?.event_name || task?.event_name) || '企画名未設定';
  /** 場所 */
  const eventLocation = normalizeText(ticket?.event_location || task?.event_location || task?.location_text) || '場所未設定';
  /** 連絡案件タイトル */
  const ticketTitle = normalizeText(ticket?.title) || '連絡案件';

  if (!ticketCreatorId) {
    return { error: null };
  }

  /** 通知送信結果 */
  const dispatchResult = await sendNotificationToUser(
    ticketCreatorId,
    `部員が向かいます: ${eventName}`,
    `${ticketTitle}\n場所: ${eventLocation}\nまもなく担当部員が現地に向かいます。`,
    {
      source: 'patrol_task',
      type: 'dispatch_task_created',
      event: 'dispatch_created',
      task_id: task?.id || null,
      task_type: task?.task_type || null,
      source_ticket_id: ticket?.id || null,
      ticket_type: ticket?.ticket_type || null,
    },
    normalizeText(senderUserId) || null,
  );

  if (dispatchResult.error) {
    return { error: dispatchResult.error };
  }

  return { error: null, data: dispatchResult };
};
