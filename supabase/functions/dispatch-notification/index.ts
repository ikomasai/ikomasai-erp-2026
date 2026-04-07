import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, createJsonResponse } from '../_shared/cors.ts';

type TargetType = 'user' | 'roles';

interface DispatchPayload {
  targetType: TargetType;
  userId?: string;
  roleIds?: string[];
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
}

const VAPID_PUBLIC_KEY = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');
const INTERNAL_NOTIFY_TOKEN = Deno.env.get('INTERNAL_NOTIFY_TOKEN');

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
 * 通知送信権限を持つロールかどうかを判定する
 * 管理者・祭実長・部長・事務部 のいずれかを持つユーザーが送信可能
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 送信権限がある場合true
 */
const isAuthorizedSender = async (supabase: ReturnType<typeof createServiceClient>, userId: string) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('roles!inner(name)')
    .eq('user_id', userId)
    .in('roles.name', ['管理者', '祭実長', '部長', '事務部'])
    .limit(1);

  if (error) {
    console.error('auth check error:', error);
    throw new Error('Failed to check authorized role');
  }

  return Array.isArray(data) && data.length > 0;
};

/**
 * 呼び出し元を認証し送信者情報を返す
 * @param {Request} request - リクエスト
 * @param {DispatchPayload} payload - リクエストボディ
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @returns {Promise<AuthContext>} 認証コンテキスト
 */
const authenticateRequester = async (
  request: Request,
  payload: DispatchPayload,
  supabase: ReturnType<typeof createServiceClient>
) => {
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

  const authorized = await isAuthorizedSender(supabase, user.id);
  if (!authorized) {
    throw new Error('Forbidden');
  }

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

  if (!Array.isArray(payload.roleIds) || payload.roleIds.length === 0) {
    throw new Error('roleIds is required');
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role_id', payload.roleIds);

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
    default:
      return null;
  }
};

/**
 * Push通知を送信する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string[]} recipientUserIds - 受信者ユーザーID一覧
 * @param {{title:string;body:string;url:string;notificationId:string;navigateTo:{screen:string;tab:string}|null}} message - 通知データ
 * @returns {Promise<PushStats>} 送信統計
 */
const sendWebPush = async (
  supabase: ReturnType<typeof createServiceClient>,
  recipientUserIds: string[],
  message: {
    title: string;
    body: string;
    url: string;
    notificationId: string;
    navigateTo: { screen: string; tab: string } | null;
  }
) => {
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
        await webpush.sendNotification(target, payload);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const statusCodeRaw = (error as { statusCode?: number | string })?.statusCode;
        const statusCode = Number(statusCodeRaw);
        if ([400, 403, 404, 410].includes(statusCode)) {
          invalidEndpoints.push(subscription.endpoint);
        }
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
      push = await sendWebPush(supabase, recipientUserIds, {
        title: payload.title.trim(),
        body: payload.body.trim(),
        url: payload.url || '/notifications',
        notificationId: notification.id,
        navigateTo: getNavigateTo(payload.metadata),
      });
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
