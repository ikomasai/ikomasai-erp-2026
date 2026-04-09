import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type TargetType = 'user' | 'roles' | 'organization';

interface DispatchPayload {
  targetType: TargetType;
  userId?: string;
  roleIds?: string[];
  roleNames?: string[];
  organizationId?: string;
  organizationIds?: string[];
  organizationName?: string;
  organizationNames?: string[];
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
  traceId: string;
  sender: UserLogEntry | null;
  recipients: UserLogEntry[];
  recipientCount: number;
  receiptUrl: string | null;
  receiptToken: string | null;
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

interface UserLogEntry {
  userId: string;
  name: string | null;
  organization: string | null;
}

interface PushDispatchLogContext {
  traceId: string;
  notificationId: string;
  sender: UserLogEntry | null;
  recipients: UserLogEntry[];
  metadata: Record<string, unknown>;
}

const VAPID_PUBLIC_KEY = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');
const INTERNAL_NOTIFY_TOKEN = Deno.env.get('INTERNAL_NOTIFY_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const PUSH_DELIVERY_RECEIPT_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/push-delivery-receipt`
  : null;
const PUSH_NOTIFICATION_ICON = '/icons/icon-192.png';
const PUSH_NOTIFICATION_BADGE = '/icons/icon-192.png';
const PUSH_TTL_SECONDS = 60 * 60 * 24;
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
 * 組織ID一覧を正規化する
 * @param {DispatchPayload} payload - 送信リクエスト
 * @returns {string[]} 正規化済み組織ID一覧
 */
const getNormalizedOrganizationIds = (payload: DispatchPayload) => {
  return uniqueValues([
    ...(payload.organizationIds ?? []),
    normalizeText(payload.organizationId),
  ]);
};

/**
 * 組織名一覧を正規化する
 * @param {DispatchPayload} payload - 送信リクエスト
 * @returns {string[]} 正規化済み組織名一覧
 */
const getNormalizedOrganizationNames = (payload: DispatchPayload) => {
  return uniqueValues([
    ...(payload.organizationNames ?? []),
    normalizeText(payload.organizationName),
  ]);
};

/**
 * IDのみ保持したログ用プロフィールを作る
 * @param {string[]} userIds - 対象ユーザーID一覧
 * @returns {UserLogEntry[]} ログ用プロフィール
 */
const createFallbackUserLogEntries = (userIds: string[]): UserLogEntry[] => {
  return uniqueValues(userIds).map((userId) => ({
    userId,
    name: null,
    organization: null,
  }));
};

/**
 * ログ向けのユーザープロフィール一覧を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[]} userIds - 対象ユーザーID一覧
 * @returns {Promise<UserLogEntry[]>} ログ用プロフィール一覧
 */
const selectUserLogEntries = async (
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<UserLogEntry[]> => {
  const normalizedUserIds = uniqueValues(userIds);
  if (normalizedUserIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id,name,organization')
    .in('user_id', normalizedUserIds);

  if (error) {
    console.error('user profile fetch error:', error);
    return createFallbackUserLogEntries(normalizedUserIds);
  }

  const profileMap = new Map(
    (data ?? []).map((profile) => [
      normalizeText(profile.user_id),
      {
        name: normalizeText(profile.name) || null,
        organization: normalizeText(profile.organization) || null,
      },
    ])
  );

  return normalizedUserIds.map((userId) => {
    const profile = profileMap.get(userId);
    return {
      userId,
      name: profile?.name ?? null,
      organization: profile?.organization ?? null,
    };
  });
};

/**
 * ユーザーIDからログ用プロフィールを解決する
 * @param {Map<string, UserLogEntry>} userEntryMap - ログ用プロフィールMap
 * @param {string | null} userId - ユーザーID
 * @returns {UserLogEntry | null} ログ用プロフィール
 */
const resolveUserLogEntry = (
  userEntryMap: Map<string, UserLogEntry>,
  userId: string | null
): UserLogEntry | null => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return null;
  }

  return (
    userEntryMap.get(normalizedUserId) ?? {
      userId: normalizedUserId,
      name: null,
      organization: null,
    }
  );
};

/**
 * 通知ログを info で出力する
 * @param {string} traceId - 追跡ID
 * @param {string} label - ログ種別
 * @param {Record<string, unknown>} detail - ログ詳細
 * @returns {void}
 */
const logDispatchInfo = (traceId: string, label: string, detail: Record<string, unknown>) => {
  console.info(`[dispatch-notification][${traceId}] ${label}`, detail);
};

/**
 * 通知ログを warn で出力する
 * @param {string} traceId - 追跡ID
 * @param {string} label - ログ種別
 * @param {Record<string, unknown>} detail - ログ詳細
 * @returns {void}
 */
const logDispatchWarning = (traceId: string, label: string, detail: Record<string, unknown>) => {
  console.warn(`[dispatch-notification][${traceId}] ${label}`, detail);
};

/**
 * endpoint から Push provider host を取り出す
 * @param {string} endpoint - Push endpoint
 * @returns {string} provider host
 */
const getEndpointProviderHost = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
};

/**
 * 通知保存用メタデータを組み立てる
 * @param {Record<string, unknown> | undefined} metadata - 元メタデータ
 * @param {Object} params - 補助情報
 * @param {string} params.traceId - 送信追跡ID
 * @param {string} params.receiptToken - 受信確認トークン
 * @param {string | null} params.senderUserId - 送信者ユーザーID
 * @param {string[]} params.recipientUserIds - 受信者ユーザーID一覧
 * @returns {Record<string, unknown>} 保存用メタデータ
 */
const buildStoredNotificationMetadata = (
  metadata: Record<string, unknown> | undefined,
  {
    traceId,
    receiptToken,
    senderUserId,
    recipientUserIds,
  }: {
    traceId: string;
    receiptToken: string;
    senderUserId: string | null;
    recipientUserIds: string[];
  }
) => {
  return {
    ...(metadata ?? {}),
    _push_trace_id: traceId,
    _push_receipt_token: receiptToken,
    _push_sender_user_id: senderUserId,
    _push_recipient_user_ids: recipientUserIds,
  };
};

/**
 * 購読状況をログ用に集計する
 * @param {{ user_id: string; endpoint: string }[]} subscriptions - Push購読一覧
 * @param {UserLogEntry[]} recipients - 受信者プロフィール
 * @returns {{ totalSubscriptions: number; byUser: Array<UserLogEntry & { count: number }>; byProvider: Array<{ provider: string; count: number }> }} 購読集計
 */
const summarizeSubscriptionsForLog = (
  subscriptions: { user_id: string; endpoint: string }[],
  recipients: UserLogEntry[]
) => {
  const recipientMap = new Map(recipients.map((recipient) => [recipient.userId, recipient]));
  const countsByUser = new Map<string, number>();
  const countsByProvider = new Map<string, number>();

  subscriptions.forEach((subscription) => {
    const normalizedUserId = normalizeText(subscription.user_id);
    const provider = getEndpointProviderHost(subscription.endpoint);
    countsByUser.set(normalizedUserId, (countsByUser.get(normalizedUserId) ?? 0) + 1);
    countsByProvider.set(provider, (countsByProvider.get(provider) ?? 0) + 1);
  });

  const byUser = Array.from(countsByUser.entries())
    .map(([userId, count]) => {
      const recipient = recipientMap.get(userId);
      return {
        userId,
        name: recipient?.name ?? null,
        organization: recipient?.organization ?? null,
        count,
      };
    })
    .sort((left, right) => right.count - left.count || left.userId.localeCompare(right.userId));

  const byProvider = Array.from(countsByProvider.entries())
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider));

  return {
    totalSubscriptions: subscriptions.length,
    byUser,
    byProvider,
  };
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
 * リクエストヘッダー付きの認証用 Supabase クライアントを作成する
 * service role client と分離し、Edge Functions 推奨の user-auth 検証経路を使う。
 * @param {Request} request - リクエスト
 * @returns {import('@supabase/supabase-js').SupabaseClient} 認証用クライアント
 */
const createRequestAuthClient = (request: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL または SUPABASE_ANON_KEY が未設定です');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: request.headers.get('authorization') ?? '',
      },
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

/**
 * 組織名一覧から組織ID一覧を解決する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[] | undefined} organizationNames - 組織名一覧
 * @returns {Promise<string[]>} 組織ID一覧
 */
const selectOrganizationIdsByNames = async (
  supabase: ReturnType<typeof createServiceClient>,
  organizationNames?: string[]
): Promise<string[]> => {
  const normalizedOrganizationNames = uniqueValues(organizationNames ?? []);
  if (normalizedOrganizationNames.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,code');

  if (error) {
    console.error('organization fetch error:', error);
    throw new Error('Failed to resolve organizations');
  }

  return uniqueValues(
    (data ?? [])
      .filter((organization) => {
        const organizationName = normalizeText(organization.name);
        const organizationCode = normalizeText(organization.code);
        return (
          normalizedOrganizationNames.includes(organizationName) ||
          normalizedOrganizationNames.includes(organizationCode)
        );
      })
      .map((organization) => organization.id)
  );
};

/**
 * 組織所属でユーザー一覧を絞り込む
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[]} userIds - 候補ユーザーID一覧
 * @param {string[]} organizationIds - 対象組織ID一覧
 * @returns {Promise<string[]>} 組織所属に一致したユーザーID一覧
 */
const filterUserIdsByOrganizationIds = async (
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
  organizationIds: string[]
) => {
  const normalizedUserIds = uniqueValues(userIds);
  const normalizedOrganizationIds = uniqueValues(organizationIds);

  if (normalizedUserIds.length === 0 || normalizedOrganizationIds.length === 0) {
    return normalizedUserIds;
  }

  const { data, error } = await supabase
    .from('user_organizations')
    .select('user_id')
    .in('user_id', normalizedUserIds)
    .in('organization_id', normalizedOrganizationIds);

  if (error) {
    console.error('user organization resolve error:', error);
    throw new Error('Failed to resolve organization users');
  }

  return uniqueValues((data ?? []).map((item) => item.user_id));
};

/**
 * 送信対象の組織ID一覧を解決する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {DispatchPayload} payload - 送信リクエスト
 * @returns {Promise<string[]>} 解決済み組織ID一覧
 */
const resolveOrganizationIdsFromPayload = async (
  supabase: ReturnType<typeof createServiceClient>,
  payload: DispatchPayload
) => {
  /** 組織IDフィルタ一覧 */
  const organizationIds = getNormalizedOrganizationIds(payload);
  /** 組織名フィルタ一覧 */
  const organizationNames = getNormalizedOrganizationNames(payload);

  if (organizationIds.length === 0 && organizationNames.length === 0) {
    return [];
  }

  /** 組織名から解決した組織ID一覧 */
  const resolvedOrganizationIds = await selectOrganizationIdsByNames(supabase, organizationNames);
  return uniqueValues([...organizationIds, ...resolvedOrganizationIds]);
};

/**
 * 組織所属ユーザー一覧を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[]} organizationIds - 対象組織ID一覧
 * @returns {Promise<string[]>} 組織所属ユーザーID一覧
 */
const selectUserIdsByOrganizationIds = async (
  supabase: ReturnType<typeof createServiceClient>,
  organizationIds: string[]
) => {
  const normalizedOrganizationIds = uniqueValues(organizationIds);
  if (normalizedOrganizationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_organizations')
    .select('user_id')
    .in('organization_id', normalizedOrganizationIds);

  if (error) {
    console.error('organization user resolve error:', error);
    throw new Error('Failed to resolve organization users');
  }

  return uniqueValues((data ?? []).map((item) => item.user_id));
};

/**
 * 呼び出し元を認証し送信者情報を返す
 * - targetType=roles / organization: 認証済みユーザー全員に許可
 * - targetType=user: 宛先 userId が指定されていれば常に個人通知を許可
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

  /** リクエスト認証用クライアント */
  const authClient = createRequestAuthClient(request);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    console.error('user token validation error:', userError);
    throw new Error('Invalid user token');
  }

  const normalizedSenderUserId = normalizeText(user.id);

  if (payload.targetType === 'user') {
    const normalizedTargetUserId = normalizeText(payload.userId);
    if (!normalizedTargetUserId) {
      throw new Error('userId is required');
    }
  }

  return {
    type: 'user',
    senderUserId: normalizedSenderUserId,
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

  if (payload.targetType === 'organization') {
    /** 解決済み組織ID一覧 */
    const organizationIds = await resolveOrganizationIdsFromPayload(supabase, payload);
    if (organizationIds.length === 0) {
      throw new Error('organizationId or organizationName is required');
    }

    return selectUserIdsByOrganizationIds(supabase, organizationIds);
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

  /** ロール解決で得た候補ユーザーID一覧 */
  const roleRecipientUserIds = uniqueValues((data ?? []).map((item) => item.user_id));
  /** 組織フィルタ指定の有無 */
  const hasOrganizationFilter =
    getNormalizedOrganizationIds(payload).length > 0 ||
    getNormalizedOrganizationNames(payload).length > 0;
  /** 解決済み組織ID一覧 */
  const organizationIds = await resolveOrganizationIdsFromPayload(supabase, payload);

  if (!hasOrganizationFilter) {
    return roleRecipientUserIds;
  }

  if (organizationIds.length === 0) {
    return [];
  }

  return filterUserIdsByOrganizationIds(supabase, roleRecipientUserIds, organizationIds);
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
    case 'item2_call_created':
    case 'item2_responder_assigned':
      return { screen: 'Item2', tab: 'list' };
    case 'missing_child':
      return { screen: 'Item5', tab: 'manage' };
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
const buildPushMessage = (
  payload: DispatchPayload,
  notificationId: string,
  {
    traceId,
    sender,
    recipients,
    receiptToken,
  }: {
    traceId: string;
    sender: UserLogEntry | null;
    recipients: UserLogEntry[];
    receiptToken: string;
  }
): PushMessage => {
  const metadata = payload.metadata ?? {};
  const type = typeof metadata.type === 'string' ? metadata.type : '';
  const isEmergencyLike =
    type === 'emergency' || type === 'damage_report' || type === 'start_report' || type === 'end_report';
  /** Push payload に載せる受信者要約 */
  const summarizedRecipients = recipients.slice(0, 10);

  return {
    title: payload.title.trim(),
    body: payload.body.trim(),
    url: payload.url || '/notifications',
    notificationId,
    traceId,
    sender,
    recipients: summarizedRecipients,
    recipientCount: recipients.length,
    receiptUrl: PUSH_DELIVERY_RECEIPT_URL,
    receiptToken,
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
  message: PushMessage,
  logContext: PushDispatchLogContext
): Promise<PushStats> => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error('VAPID secrets are not configured');
  }

  if (recipientUserIds.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, removed: 0 };
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', recipientUserIds);

  if (error) {
    console.error('push subscription fetch error:', error);
    throw new Error('Failed to fetch push subscriptions');
  }

  if (!subscriptions || subscriptions.length === 0) {
    logDispatchWarning(logContext.traceId, 'push-subscription-missing', {
      notificationId: logContext.notificationId,
      sender: logContext.sender,
      recipients: logContext.recipients,
      metadata: logContext.metadata,
      push: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        removed: 0,
      },
    });
    return { attempted: 0, succeeded: 0, failed: 0, removed: 0 };
  }

  const subscriptionSummary = summarizeSubscriptionsForLog(subscriptions, logContext.recipients);
  logDispatchInfo(logContext.traceId, 'push-subscription-resolved', {
    notificationId: logContext.notificationId,
    sender: logContext.sender,
    recipients: logContext.recipients,
    metadata: logContext.metadata,
    subscriptions: subscriptionSummary,
  });

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
        const endpointHost = getEndpointProviderHost(subscription.endpoint);
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
          traceId: logContext.traceId,
          notificationId: logContext.notificationId,
          recipientUserId: subscription.user_id,
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
      logDispatchWarning(logContext.traceId, 'push-invalid-endpoint-removed', {
        notificationId: logContext.notificationId,
        removed,
        invalidEndpointCount: uniqueInvalidEndpoints.length,
      });
    }
  }

  const result = {
    attempted: subscriptions.length,
    succeeded,
    failed,
    removed,
    ...(sampleFailures.length > 0 ? { sampleFailures } : {}),
  };

  logDispatchInfo(logContext.traceId, 'push-dispatch-finished', {
    notificationId: logContext.notificationId,
    sender: logContext.sender,
    recipients: logContext.recipients,
    metadata: logContext.metadata,
    subscriptions: subscriptionSummary,
    push: result,
  });

  return result;
};

/**
 * 送信リクエストのバリデーションを行う
 * @param {DispatchPayload} payload - 送信リクエスト
 */
const validatePayload = (payload: DispatchPayload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  if (payload.targetType !== 'user' && payload.targetType !== 'roles' && payload.targetType !== 'organization') {
    throw new Error('targetType must be user, roles, or organization');
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

  if (
    payload.targetType === 'organization' &&
    getNormalizedOrganizationIds(payload).length === 0 &&
    getNormalizedOrganizationNames(payload).length === 0
  ) {
    throw new Error('organizationId or organizationName is required');
  }
};

Deno.serve(async (request) => {
  const traceId = crypto.randomUUID();

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
    const metadataSummary = pickAuthorizationMetadata(payload.metadata);
    const requestedSenderUserId = normalizeText(payload.senderUserId) || null;

    let authContext: AuthContext;
    try {
      authContext = await authenticateRequester(request, payload, supabase);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      logDispatchWarning(traceId, 'dispatch-auth-rejected', {
        requestedSenderUserId,
        targetType: payload.targetType,
        roleIds: uniqueValues(payload.roleIds ?? []),
        roleNames: uniqueValues(payload.roleNames ?? []),
        organizationIds: getNormalizedOrganizationIds(payload),
        organizationNames: getNormalizedOrganizationNames(payload),
        metadata: metadataSummary,
        error: message,
      });
      return createJsonResponse({ error: message }, 401);
    }

    const recipientUserIds = await resolveRecipients(payload, supabase);
    const relatedUserEntries = await selectUserLogEntries(supabase, [
      ...(authContext.senderUserId ? [authContext.senderUserId] : []),
      ...recipientUserIds,
    ]);
    const userEntryMap = new Map(relatedUserEntries.map((entry) => [entry.userId, entry]));
    const senderEntry = resolveUserLogEntry(userEntryMap, authContext.senderUserId);
    const recipientEntries = recipientUserIds
      .map((userId) => resolveUserLogEntry(userEntryMap, userId))
      .filter((entry): entry is UserLogEntry => Boolean(entry));
    if (recipientUserIds.length === 0) {
      logDispatchWarning(traceId, 'dispatch-recipient-empty', {
        senderUserId: authContext.senderUserId,
        requestedSenderUserId,
        targetType: payload.targetType,
        roleIds: uniqueValues(payload.roleIds ?? []),
        roleNames: uniqueValues(payload.roleNames ?? []),
        organizationIds: getNormalizedOrganizationIds(payload),
        organizationNames: getNormalizedOrganizationNames(payload),
        metadata: metadataSummary,
      });
      return createJsonResponse({ error: '送信先ユーザーが見つかりません' }, 400);
    }

    logDispatchInfo(traceId, 'dispatch-prepared', {
      authType: authContext.type,
      sender: senderEntry,
      requestedSenderUserId,
      targetType: payload.targetType,
      roleIds: uniqueValues(payload.roleIds ?? []),
      roleNames: uniqueValues(payload.roleNames ?? []),
      organizationIds: getNormalizedOrganizationIds(payload),
      organizationNames: getNormalizedOrganizationNames(payload),
      recipients: recipientEntries,
      title: payload.title.trim(),
      metadata: metadataSummary,
      url: payload.url || '/notifications',
    });

    /** 受信確認トークン */
    const receiptToken = crypto.randomUUID();
    /** 保存用通知メタデータ */
    const storedMetadata = buildStoredNotificationMetadata(payload.metadata, {
      traceId,
      receiptToken,
      senderUserId: authContext.senderUserId,
      recipientUserIds,
    });

    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert([
        {
          sender_user_id: authContext.senderUserId,
          title: payload.title.trim(),
          body: payload.body.trim(),
          metadata: storedMetadata,
        },
      ])
      .select('id')
      .single();

    if (notificationError || !notification) {
      console.error('notification insert error:', {
        traceId,
        sender: senderEntry,
        recipients: recipientEntries,
        metadata: metadataSummary,
        error: notificationError,
      });
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
      console.error('notification recipients insert error:', {
        traceId,
        notificationId: notification.id,
        sender: senderEntry,
        recipients: recipientEntries,
        metadata: metadataSummary,
        error: recipientsError,
      });
      return createJsonResponse({ error: '通知受信者の作成に失敗しました' }, 500);
    }

    let push: PushStats = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      removed: 0,
    };

    try {
      push = await sendWebPush(
        supabase,
        recipientUserIds,
        buildPushMessage(payload, notification.id, {
          traceId,
          sender: senderEntry,
          recipients: recipientEntries,
          receiptToken,
        }),
        {
          traceId,
          notificationId: notification.id,
          sender: senderEntry,
          recipients: recipientEntries,
          metadata: metadataSummary,
        }
      );
    } catch (pushError) {
      console.error('web push dispatch error:', {
        traceId,
        notificationId: notification.id,
        sender: senderEntry,
        recipients: recipientEntries,
        metadata: metadataSummary,
        error: pushError,
      });
    }

    logDispatchInfo(traceId, 'dispatch-finished', {
      notificationId: notification.id,
      sender: senderEntry,
      recipients: recipientEntries,
      metadata: metadataSummary,
      push,
    });

    return createJsonResponse({
      notificationId: notification.id,
      traceId,
      sender: senderEntry,
      recipients: recipientEntries,
      recipientsCount: recipientUserIds.length,
      push,
    });
  } catch (error) {
    console.error('dispatch-notification error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return createJsonResponse({ error: message }, 500);
  }
});
