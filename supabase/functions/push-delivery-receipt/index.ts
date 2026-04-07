import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface UserLogEntry {
  userId: string;
  name: string | null;
  organization: string | null;
}

interface ReceiptPayload {
  notificationId?: string;
  receiptToken?: string;
  traceId?: string | null;
  event?: string;
  sender?: UserLogEntry | null;
  recipients?: UserLogEntry[];
  url?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
  observedAt?: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * JSONレスポンスを返す
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
 * 文字列を trim して返す
 * @param {unknown} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * 重複と空文字を除外する
 * @param {string[]} values - 値一覧
 * @returns {string[]} 一意な値一覧
 */
const uniqueValues = (values: string[]) => {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
};

/**
 * フォールバックのログ用ユーザー一覧を返す
 * @param {string[]} userIds - ユーザーID一覧
 * @returns {UserLogEntry[]} ログ用ユーザー一覧
 */
const createFallbackUsers = (userIds: string[]) => {
  return uniqueValues(userIds).map((userId) => ({
    userId,
    name: null,
    organization: null,
  }));
};

/**
 * ユーザープロフィールをログ用に取得する
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
    console.error('push receipt user profile fetch error:', error);
    return createFallbackUsers(normalizedUserIds);
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

  return normalizedUserIds.map((userId) => ({
    userId,
    name: profileMap.get(userId)?.name ?? null,
    organization: profileMap.get(userId)?.organization ?? null,
  }));
};

/**
 * 通知受信者一覧を取得する
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabaseクライアント
 * @param {string} notificationId - 通知ID
 * @returns {Promise<string[]>} 受信者ユーザーID一覧
 */
const selectRecipientUserIds = async (
  supabase: ReturnType<typeof createServiceClient>,
  notificationId: string
) => {
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('user_id')
    .eq('notification_id', notificationId);

  if (error) {
    console.error('push receipt recipient fetch error:', error);
    return [];
  }

  return uniqueValues((data ?? []).map((row) => row.user_id));
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST') {
      return createJsonResponse({ error: 'Method not allowed' }, 405);
    }

    const payload = (await request.json().catch(() => null)) as ReceiptPayload | null;
    const notificationId = normalizeText(payload?.notificationId);
    const receiptToken = normalizeText(payload?.receiptToken);
    const eventName = normalizeText(payload?.event);

    if (!notificationId || !receiptToken || !eventName) {
      return createJsonResponse({ error: 'notificationId, receiptToken, event is required' }, 400);
    }

    const supabase = createServiceClient();
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('id,sender_user_id,metadata')
      .eq('id', notificationId)
      .single();

    if (notificationError || !notification) {
      console.error('push receipt notification lookup error:', notificationError);
      return createJsonResponse({ error: 'Notification not found' }, 404);
    }

    const metadata =
      notification.metadata && typeof notification.metadata === 'object'
        ? (notification.metadata as Record<string, unknown>)
        : {};
    const expectedReceiptToken = normalizeText(metadata._push_receipt_token);

    if (!expectedReceiptToken || expectedReceiptToken !== receiptToken) {
      return createJsonResponse({ error: 'Invalid receipt token' }, 401);
    }

    const senderUserId = normalizeText(notification.sender_user_id);
    const recipientUserIds = await selectRecipientUserIds(supabase, notificationId);
    const relatedUserIds = uniqueValues([senderUserId, ...recipientUserIds]);
    const userEntries = await selectUserLogEntries(supabase, relatedUserIds);
    const userEntryMap = new Map(userEntries.map((entry) => [entry.userId, entry]));

    const sender =
      payload?.sender ||
      (senderUserId
        ? userEntryMap.get(senderUserId) || {
            userId: senderUserId,
            name: null,
            organization: null,
          }
        : null);

    const recipients = recipientUserIds.map((userId) => userEntryMap.get(userId) || {
      userId,
      name: null,
      organization: null,
    });

    console.info('[push-delivery-receipt] receipt-accepted', {
      traceId: normalizeText(payload?.traceId) || normalizeText(metadata._push_trace_id) || null,
      notificationId,
      event: eventName,
      sender,
      recipients,
      browserRecipients:
        Array.isArray(payload?.recipients) && payload.recipients.length > 0 ? payload.recipients : [],
      url: normalizeText(payload?.url) || null,
      userAgent: normalizeText(payload?.userAgent) || null,
      observedAt: normalizeText(payload?.observedAt) || new Date().toISOString(),
      detail: payload?.detail ?? {},
    });

    return createJsonResponse({ success: true });
  } catch (error) {
    console.error('push-delivery-receipt error:', error);
    return createJsonResponse({ error: 'Unexpected error' }, 500);
  }
});
