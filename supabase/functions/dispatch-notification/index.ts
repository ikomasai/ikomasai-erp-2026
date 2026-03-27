import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type TargetType = 'user' | 'roles';

interface DispatchPayload {
  targetType: TargetType;
  userId?: string;
  roleIds?: string[];
  roleNames?: string[];
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  url?: string;
  senderUserId?: string | null;
}

interface AuthContext {
  type: 'internal' | 'user';
  senderUserId: string | null;
}

interface PushStats {
  attempted: number;
  succeeded: number;
  failed: number;
  removed: number;
  sampleFailures?: { provider: string; statusCode: number | null; message: string }[];
}

type PushUrgency = 'very-low' | 'low' | 'normal' | 'high';

interface PushMessage {
  title: string;
  body: string;
  url: string;
  notificationId: string;
  navigateTo: { screen: string; tab: string } | null;
  icon: string;
  badge: string;
  image: string | null;
  requireInteraction: boolean;
  vibrate: number[];
  actions: { action: string; title: string }[];
  timestamp: number;
  urgency: PushUrgency;
  ttl: number;
}

const VAPID_PUBLIC_KEY = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');
const INTERNAL_NOTIFY_TOKEN = Deno.env.get('INTERNAL_NOTIFY_TOKEN');
const PUSH_NOTIFICATION_ICON = '/icons/icon-192.png';
const PUSH_NOTIFICATION_BADGE = '/icons/icon-192.png';
const PUSH_TTL_SECONDS = 60 * 60 * 24;
const ADMIN_ROLE_NAMES = ['管理者', 'Admin', 'Administrator', '祭実長', '部長', '事務部', '実長', '渉外部'];
const PATROL_ASSIGN_ROLE_NAMES = [
  '企画管理部',
  '本部',
  'HQ',
  'Headquarters',
  '管理者',
  'Admin',
  'Administrator',
];
const SUPPORT_USER_NOTIFICATION_EVENTS = ['message_created', 'status_changed'];
const SUPPORT_ROLE_NAME_TARGETS = {
  hq: ['企画管理部', '本部', 'HQ', 'Headquarters', '管理者', 'Admin', 'Administrator'],
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
} as const;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-notify-token',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

/**
 * JSONレスポンスを返す
 * dispatch-notification 単体で完結させ、Supabase MCP のバンドル時に sibling import で失敗しないようにする。
 * @param {unknown} body - レスポンスボディ
 * @param {number} status - HTTPステータス
 * @returns {Response} JSONレスポンス
 */
const createJsonResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

/**
 * 文字列をtrimして返す
 * @param {unknown} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * 重複と空文字を除去する
 * @param {string[]} values - 値一覧
 * @returns {string[]} 一意な値一覧
 */
const uniqueValues = (values: string[]) => {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
};

/**
 * 役割名配列が指定候補を含むか判定する
 * @param {string[]} actualRoleNames - ユーザーの役割名一覧
 * @param {string[]} expectedRoleNames - 判定対象の役割名一覧
 * @returns {boolean} 含む場合はtrue
 */
const hasAnyRoleName = (actualRoleNames: string[], expectedRoleNames: string[]) => {
  const actualSet = new Set(uniqueValues(actualRoleNames));
  return uniqueValues(expectedRoleNames).some((roleName) => actualSet.has(roleName));
};

/**
 * 通知認可エラーの調査に必要なメタデータだけを抽出する
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {Record<string, unknown>} ログ用メタデータ
 */
const pickAuthorizationMetadata = (metadata?: Record<string, unknown>) => {
  return {
    source: normalizeText(metadata?.source) || null,
    event: normalizeText(metadata?.event) || null,
    type: normalizeText(metadata?.type) || null,
    ticketId: normalizeText(metadata?.ticket_id) || null,
    taskId: normalizeText(metadata?.task_id) || null,
    notifyTarget: normalizeText(metadata?.notify_target) || null,
    status: normalizeText(metadata?.status) || null,
  };
};

/**
 * 通知認可ログを出力する
 * @param {string} label - ログ識別子
 * @param {Record<string, unknown>} detail - ログ詳細
 * @returns {void}
 */
const logAuthorizationDebug = (label: string, detail: Record<string, unknown>) => {
  console.warn(`[dispatch-notification] ${label}`, detail);
};

/**
 * 連絡案件に紐づく許可ロール名一覧を返す
 * @param {string} ticketType - 連絡案件種別
 * @param {string} notifyTarget - 通知先種別
 * @returns {string[]} 許可ロール名一覧
 */
const getRoleNamesForTicket = (ticketType: string, notifyTarget: string) => {
  if (ticketType === 'start_report' || ticketType === 'end_report' || ticketType === 'emergency') {
    return uniqueValues([
      ...SUPPORT_ROLE_NAME_TARGETS.hq,
      ...SUPPORT_ROLE_NAME_TARGETS.patrol,
    ]);
  }
  if (notifyTarget === 'accounting') {
    return SUPPORT_ROLE_NAME_TARGETS.accounting;
  }
  if (notifyTarget === 'property') {
    return SUPPORT_ROLE_NAME_TARGETS.property;
  }
  return SUPPORT_ROLE_NAME_TARGETS.hq;
};

/**
 * Supabaseサービスロールクライアントを作成する
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabaseクライアント
 */
const createServiceClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * AuthorizationヘッダーからBearerトークンを取得する
 * @param {Request} request - リクエスト
 * @returns {string | null} Bearerトークン
 */
const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  const token = rest.join(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
};

/**
 * 管理者系ロールを持つか判定する
 * targetType=user の通知（個人宛て）はこのロールのみ送信可能
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 送信権限がある場合true
 */
const isAdminSender = async (supabase: ReturnType<typeof createServiceClient>, userId: string) => {
  const senderRoleNames = await selectUserRoleNames(supabase, userId);
  return hasAnyRoleName(senderRoleNames, ADMIN_ROLE_NAMES);
};

/**
 * 指定ユーザーの役割名一覧を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} userId - ユーザーID
 * @returns {Promise<string[]>} 役割名一覧
 */
const selectUserRoleNames = async (
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<string[]> => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('roles!inner(name,display_name)')
    .eq('user_id', normalizedUserId);

  if (error) {
    console.error('user role fetch error:', error);
    throw new Error('Failed to resolve user roles');
  }

  const roleNames = (data ?? []).flatMap((row) => {
    const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : [];
    return roles.flatMap((role) => [normalizeText(role.name), normalizeText(role.display_name)]);
  });

  return uniqueValues(roleNames);
};

/**
 * 連絡案件の権限判定に必要な最小情報を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} ticketId - 連絡案件ID
 * @returns {Promise<{id: string; created_by: string | null; ticket_type: string | null; notify_target: string | null} | null>} 連絡案件
 */
/**
 * ロール名一覧からロールID一覧を解決する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[] | undefined} roleNames - ロール名一覧
 * @returns {Promise<string[]>} ロールID一覧
 */
const selectRoleIdsByNames = async (
  supabase: ReturnType<typeof createServiceClient>,
  roleNames?: string[]
): Promise<string[]> => {
  const normalizedRoleNames = uniqueValues(roleNames ?? []);
  if (normalizedRoleNames.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('roles')
    .select('id,name,display_name');

  if (error) {
    console.error('role fetch error:', error);
    throw new Error('Failed to resolve roles');
  }

  return uniqueValues(
    (data ?? [])
      .filter((role) => {
        const roleName = normalizeText(role.name);
        const roleDisplayName = normalizeText(role.display_name);
        return normalizedRoleNames.includes(roleName) || normalizedRoleNames.includes(roleDisplayName);
      })
      .map((role) => role.id)
  );
};

const selectSupportTicketForAuthorization = async (
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string
) => {
  const normalizedTicketId = normalizeText(ticketId);
  if (!normalizedTicketId) {
    return null;
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id,created_by,ticket_type,notify_target')
    .eq('id', normalizedTicketId)
    .single();

  if (error) {
    console.error('support ticket auth lookup error:', error);
    throw new Error('Failed to resolve support ticket');
  }

  return data;
};

/**
 * 巡回タスクの権限判定に必要な最小情報を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} taskId - 巡回タスクID
 * @returns {Promise<{id: string; assigned_to: string | null} | null>} 巡回タスク
 */
const selectPatrolTaskForAuthorization = async (
  supabase: ReturnType<typeof createServiceClient>,
  taskId: string
) => {
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) {
    return null;
  }

  const { data, error } = await supabase
    .from('patrol_tasks')
    .select('id,assigned_to')
    .eq('id', normalizedTaskId)
    .single();

  if (error) {
    console.error('patrol task auth lookup error:', error);
    throw new Error('Failed to resolve patrol task');
  }

  return data;
};

/**
 * 連絡案件由来の個人宛て通知を許可できるか判定する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} senderUserId - 送信者ユーザーID
 * @param {string} targetUserId - 宛先ユーザーID
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {Promise<boolean>} 許可できる場合true
 */
const canSendSupportUserNotification = async (
  supabase: ReturnType<typeof createServiceClient>,
  senderUserId: string,
  targetUserId: string,
  metadata?: Record<string, unknown>
) => {
  if (normalizeText(metadata?.source) !== 'support_ticket') {
    return false;
  }

  const event = normalizeText(metadata?.event);
  if (!SUPPORT_USER_NOTIFICATION_EVENTS.includes(event)) {
    return false;
  }

  const ticket = await selectSupportTicketForAuthorization(
    supabase,
    normalizeText(metadata?.ticket_id)
  );
  if (!ticket) {
    return false;
  }

  const ticketCreatorId = normalizeText(ticket.created_by);
  const relatedRoleNames = getRoleNamesForTicket(
    normalizeText(ticket.ticket_type),
    normalizeText(ticket.notify_target)
  );
  const [senderRoleNames, targetRoleNames] = await Promise.all([
    selectUserRoleNames(supabase, senderUserId),
    selectUserRoleNames(supabase, targetUserId),
  ]);

  const senderAllowed =
    normalizeText(senderUserId) === ticketCreatorId || hasAnyRoleName(senderRoleNames, relatedRoleNames);
  const targetAllowed =
    normalizeText(targetUserId) === ticketCreatorId || hasAnyRoleName(targetRoleNames, relatedRoleNames);

  if (!senderAllowed || !targetAllowed) {
    logAuthorizationDebug('support-user-notification-denied', {
      senderUserId: normalizeText(senderUserId) || null,
      targetUserId: normalizeText(targetUserId) || null,
      ticketCreatorId: ticketCreatorId || null,
      senderRoleNames,
      targetRoleNames,
      relatedRoleNames,
      metadata: pickAuthorizationMetadata(metadata),
    });
  }

  return senderAllowed && targetAllowed;
};

/**
 * 巡回割当の個人宛て通知を許可できるか判定する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} senderUserId - 送信者ユーザーID
 * @param {string} targetUserId - 宛先ユーザーID
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {Promise<boolean>} 許可できる場合true
 */
const canSendPatrolAssignmentNotification = async (
  supabase: ReturnType<typeof createServiceClient>,
  senderUserId: string,
  targetUserId: string,
  metadata?: Record<string, unknown>
) => {
  if (normalizeText(metadata?.source) !== 'patrol_task' || normalizeText(metadata?.event) !== 'assigned') {
    return false;
  }

  const task = await selectPatrolTaskForAuthorization(supabase, normalizeText(metadata?.task_id));
  if (!task || normalizeText(task.assigned_to) !== normalizeText(targetUserId)) {
    return false;
  }

  const senderRoleNames = await selectUserRoleNames(supabase, senderUserId);
  const senderAllowed = hasAnyRoleName(senderRoleNames, PATROL_ASSIGN_ROLE_NAMES);

  if (!senderAllowed) {
    logAuthorizationDebug('patrol-assignment-notification-denied', {
      senderUserId: normalizeText(senderUserId) || null,
      targetUserId: normalizeText(targetUserId) || null,
      senderRoleNames,
      requiredRoleNames: PATROL_ASSIGN_ROLE_NAMES,
      metadata: pickAuthorizationMetadata(metadata),
    });
  }

  return senderAllowed;
};

/**
 * 管理部統合システムの業務イベントで許可される個人宛て通知か判定する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} senderUserId - 送信者ユーザーID
 * @param {string} targetUserId - 宛先ユーザーID
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {Promise<boolean>} 許可できる場合true
 */
const isWorkflowUserNotificationAllowed = async (
  supabase: ReturnType<typeof createServiceClient>,
  senderUserId: string,
  targetUserId: string,
  metadata?: Record<string, unknown>
) => {
  if (
    await canSendSupportUserNotification(supabase, senderUserId, targetUserId, metadata)
  ) {
    return true;
  }

  return canSendPatrolAssignmentNotification(supabase, senderUserId, targetUserId, metadata);
};

/**
 * 呼び出し元を認証し送信者情報を返す
 * - targetType=roles: 認証済みユーザー全員に許可（企画者からの連絡案件通知に対応）
 * - targetType=user: 管理者ロール、または管理部統合システムの許可済み業務イベントのみ許可
 * @param {Request} request - リクエスト
 * @param {DispatchPayload} payload - リクエストボディ
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @returns {Promise<AuthContext>} 認証コンテキスト
 */
const authenticateRequester = async (
  request: Request,
  payload: DispatchPayload,
  supabase: ReturnType<typeof createServiceClient>
): Promise<AuthContext> => {
  const internalToken = request.headers.get('x-internal-notify-token');
  if (internalToken && INTERNAL_NOTIFY_TOKEN && internalToken === INTERNAL_NOTIFY_TOKEN) {
    return {
      type: 'internal',
      senderUserId: payload.senderUserId ?? null,
    };
  }

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    if (internalToken) {
      throw new Error('Invalid internal token');
    }
    throw new Error('Authorization header or internal token is required');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(bearerToken);

  if (userError || !user) {
    console.error('user token validation error:', userError);
    throw new Error('Invalid user token');
  }

  // targetType=roles（ロール宛て）は認証済みユーザー全員に許可（企画者からの通知に対応）
  // targetType=user（個人宛て）は管理者ロール、または許可済み業務イベントのみ許可
  return {
    type: 'user',
    senderUserId: user.id,
  };
};

/**
 * 送信先ユーザーID一覧を解決する
 * @param {DispatchPayload} payload - 送信リクエスト
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @returns {Promise<string[]>} ユーザーID一覧
 */
const resolveRecipients = async (
  payload: DispatchPayload,
  supabase: ReturnType<typeof createServiceClient>
) => {
  if (payload.targetType === 'user') {
    if (!payload.userId) {
      throw new Error('userId is required');
    }
    return [payload.userId];
  }

  const roleIds = uniqueValues(payload.roleIds ?? []);
  if (roleIds.length === 0) {
    roleIds.push(...(await selectRoleIdsByNames(supabase, payload.roleNames)));
  }

  if (roleIds.length === 0) {
    throw new Error('roleIds or roleNames is required');
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role_id', roleIds);

  if (error) {
    console.error('role resolve error:', error);
    throw new Error('Failed to resolve role users');
  }

  const recipients = new Set((data ?? []).map((item) => item.user_id));
  return Array.from(recipients);
};

/**
 * 通知メタデータのタイプからアプリ内遷移先情報を導出する
 * service-worker.js の SW_NAVIGATE_TYPE と対応している
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {{ screen: string; tab: string } | null} 遷移先情報
 */
const getNavigateTo = (
  metadata?: Record<string, unknown>
): { screen: string; tab: string } | null => {
  const type = metadata?.type as string | undefined;
  const source = metadata?.source as string | undefined;
  switch (type) {
    case 'shift_change_request':
    case 'shift_rescue_request':
      return { screen: 'JimuShift', tab: 'jimuRequests' };
    case 'shift_change_completed':
    case 'shift_change_rejected':
      return { screen: 'JimuShift', tab: 'requestHistory' };
    case 'shift_reminder':
      return { screen: 'JimuShift', tab: 'myShift' };
<<<<<<< 59-erp-実長用迷子通知検索機能
    case 'missing_child':
      return { screen: 'Item5', tab: 'manage' };
=======
    case 'rule_question':
    case 'layout_change':
    case 'key_preapply':
      return { screen: 'Item13', tab: 'tickets' };
    case 'distribution_change':
      return { screen: 'Item14', tab: 'tickets' };
    case 'damage_report':
      return { screen: 'Item15', tab: 'tickets' };
    case 'support_contact_update':
      return { screen: 'Item16', tab: 'question' };
    case 'patrol_task_assigned':
      return { screen: 'Item12', tab: 'tasks' };
>>>>>>> develop
    default:
      if (source === 'support_ticket' && normalizeText(metadata?.event) === 'status_changed') {
        return { screen: 'Item16', tab: 'question' };
      }
      return null;
  }
};

/**
 * Push通知の優先度を決める
 * アプリが閉じていても届きやすいよう、管理部統合システムの主要通知は high とする
 * @param {Record<string, unknown> | undefined} metadata - 通知メタデータ
 * @returns {PushUrgency} 通知優先度
 */
const getPushUrgency = (metadata?: Record<string, unknown>): PushUrgency => {
  const type = typeof metadata?.type === 'string' ? metadata.type : '';
  const event = typeof metadata?.event === 'string' ? metadata.event : '';

  if (
    [
      'emergency',
      'distribution_change',
      'damage_report',
      'start_report',
      'end_report',
    ].includes(type) ||
    ['accepted', 'completed'].includes(event)
  ) {
    return 'high';
  }

  return 'high';
};

/**
 * Push通知メッセージを組み立てる
 * @param {DispatchPayload} payload - 元の送信リクエスト
 * @param {string} notificationId - 通知ID
 * @returns {PushMessage} Push通知メッセージ
 */
const buildPushMessage = (payload: DispatchPayload, notificationId: string): PushMessage => {
  const metadata = payload.metadata ?? {};
  const type = typeof metadata.type === 'string' ? metadata.type : '';
  const isEmergencyLike =
    type === 'emergency' || type === 'damage_report' || type === 'start_report' || type === 'end_report';

  return {
    title: payload.title.trim(),
    body: payload.body.trim(),
    url: payload.url || '/notifications',
    notificationId,
    navigateTo: getNavigateTo(metadata),
    icon: PUSH_NOTIFICATION_ICON,
    badge: PUSH_NOTIFICATION_BADGE,
    image: null,
    requireInteraction: true,
    vibrate: isEmergencyLike ? [220, 120, 220, 120, 220] : [160, 80, 160],
    actions: [
      { action: 'open', title: '開く' },
      { action: 'close', title: '閉じる' },
    ],
    timestamp: Date.now(),
    urgency: getPushUrgency(metadata),
    ttl: PUSH_TTL_SECONDS,
  };
};

/**
 * Push通知を送信する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[]} recipientUserIds - 受信者ユーザーID一覧
 * @param {PushMessage} message - 通知データ
 * @returns {Promise<PushStats>} 送信統計
 */
const sendWebPush = async (
  supabase: ReturnType<typeof createServiceClient>,
  recipientUserIds: string[],
  message: PushMessage
): Promise<PushStats> => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error('VAPID secrets are not configured');
  }

  if (recipientUserIds.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, removed: 0 };
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', recipientUserIds);

  if (error) {
    console.error('push subscription fetch error:', error);
    throw new Error('Failed to fetch push subscriptions');
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, removed: 0 };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const payload = JSON.stringify(message);
  const invalidEndpoints: string[] = [];
  const sampleFailures: { provider: string; statusCode: number | null; message: string }[] = [];
  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const target = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      try {
        // Topic ヘッダーは RFC 8030 で 32 文字以下の URL-safe 値に制限される。
        // notification.id（UUID, 36 文字）をそのまま入れるとプロバイダ側で拒否されるため使わない。
        await webpush.sendNotification(target, payload, {
          TTL: message.ttl,
          urgency: message.urgency,
        });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const statusCodeRaw = (error as { statusCode?: number | string })?.statusCode;
        const statusCode = Number(statusCodeRaw);
        const endpointHost = (() => {
          try {
            return new URL(subscription.endpoint).host;
          } catch {
            return 'unknown';
          }
        })();
        const errorMessage =
          typeof (error as { message?: unknown })?.message === 'string'
            ? (error as { message: string }).message
            : 'web push send error';
        if (sampleFailures.length < 3) {
          sampleFailures.push({
            provider: endpointHost,
            statusCode: Number.isFinite(statusCode) ? statusCode : null,
            message: errorMessage,
          });
        }
        if ([400, 403, 404, 410].includes(statusCode)) {
          invalidEndpoints.push(subscription.endpoint);
        }
        console.error('web push send error:', {
          endpoint: subscription.endpoint,
          statusCode: Number.isFinite(statusCode) ? statusCode : null,
          error,
        });
      }
    })
  );

  let removed = 0;
  if (invalidEndpoints.length > 0) {
    const uniqueInvalidEndpoints = Array.from(new Set(invalidEndpoints));
    const { error: deleteError, count } = await supabase
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .in('endpoint', uniqueInvalidEndpoints);

    if (deleteError) {
      console.error('invalid endpoint delete error:', deleteError);
    } else {
      removed = count ?? uniqueInvalidEndpoints.length;
    }
  }

  return {
    attempted: subscriptions.length,
    succeeded,
    failed,
    removed,
    ...(sampleFailures.length > 0 ? { sampleFailures } : {}),
  };
};

/**
 * 送信リクエストのバリデーションを行う
 * @param {DispatchPayload} payload - 送信リクエスト
 */
const validatePayload = (payload: DispatchPayload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  if (payload.targetType !== 'user' && payload.targetType !== 'roles') {
    throw new Error('targetType must be user or roles');
  }

  if (!payload.title || typeof payload.title !== 'string') {
    throw new Error('title is required');
  }

  if (typeof payload.body !== 'string') {
    throw new Error('body must be a string');
  }

  if (
    payload.targetType === 'roles' &&
    uniqueValues(payload.roleIds ?? []).length === 0 &&
    uniqueValues(payload.roleNames ?? []).length === 0
  ) {
    throw new Error('roleIds or roleNames is required');
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST') {
      return createJsonResponse({ error: 'Method not allowed' }, 405);
    }

    const payload = (await request.json().catch(() => null)) as DispatchPayload | null;
    if (!payload) {
      return createJsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    validatePayload(payload);

    const supabase = createServiceClient();

    let authContext: AuthContext;
    try {
      authContext = await authenticateRequester(request, payload, supabase);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      if (message === 'Forbidden') {
        return createJsonResponse({ error: message }, 403);
      }
      return createJsonResponse({ error: message }, 401);
    }

    const recipientUserIds = await resolveRecipients(payload, supabase);
    if (recipientUserIds.length === 0) {
      return createJsonResponse({ error: '送信先ユーザーが見つかりません' }, 400);
    }

    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert([
        {
          sender_user_id: authContext.senderUserId,
          title: payload.title.trim(),
          body: payload.body.trim(),
          metadata: payload.metadata ?? {},
        },
      ])
      .select('id')
      .single();

    if (notificationError || !notification) {
      console.error('notification insert error:', notificationError);
      return createJsonResponse({ error: '通知の作成に失敗しました' }, 500);
    }

    const recipients = recipientUserIds.map((userId) => ({
      notification_id: notification.id,
      user_id: userId,
    }));

    const { error: recipientsError } = await supabase
      .from('notification_recipients')
      .insert(recipients);

    if (recipientsError) {
      console.error('notification recipients insert error:', recipientsError);
      return createJsonResponse({ error: '通知受信者の作成に失敗しました' }, 500);
    }

    let push: PushStats = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      removed: 0,
    };

    try {
      push = await sendWebPush(supabase, recipientUserIds, buildPushMessage(payload, notification.id));
    } catch (pushError) {
      console.error('web push dispatch error:', pushError);
    }

    return createJsonResponse({
      notificationId: notification.id,
      recipientsCount: recipientUserIds.length,
      push,
    });
  } catch (error) {
    console.error('dispatch-notification error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return createJsonResponse({ error: message }, 500);
  }
});
