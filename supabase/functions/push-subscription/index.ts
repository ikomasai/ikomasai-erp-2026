import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-notify-token',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

/**
 * JSONレスポンスを返す
 * push-subscription 単体で完結させ、Supabase MCP のバンドル時に sibling import で失敗しないようにする。
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
 * AuthorizationヘッダーからBearerトークンを取得する
 * @param {Request} request - リクエスト
 * @returns {string | null} トークン
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
 * Push購読の入力値を検証する
 * @param {unknown} subscription - 購読情報
 * @returns {{ endpoint: string; p256dh: string; auth: string } | null} 検証結果
 */
const validateSubscription = (subscription: unknown) => {
  if (!subscription || typeof subscription !== 'object') {
    return null;
  }

  const endpoint = (subscription as { endpoint?: unknown }).endpoint;
  const keys = (subscription as { keys?: unknown }).keys;
  if (!endpoint || typeof endpoint !== 'string' || !keys || typeof keys !== 'object') {
    return null;
  }

  const p256dh = (keys as { p256dh?: unknown }).p256dh;
  const auth = (keys as { auth?: unknown }).auth;

  if (!p256dh || typeof p256dh !== 'string' || !auth || typeof auth !== 'string') {
    return null;
  }

  return { endpoint, p256dh, auth };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST' && request.method !== 'DELETE') {
      return createJsonResponse({ error: 'Method not allowed' }, 405);
    }

    const supabase = createServiceClient();
    const token = getBearerToken(request);
    if (!token) {
      return createJsonResponse({ error: 'Authorization header is required' }, 401);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return createJsonResponse({ error: 'Invalid user token' }, 401);
    }

    const payload = await request.json().catch(() => ({}));

    if (request.method === 'POST') {
      const validated = validateSubscription(payload?.subscription);
      if (!validated) {
        return createJsonResponse({ error: 'Invalid subscription payload' }, 400);
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          [
            {
              user_id: user.id,
              endpoint: validated.endpoint,
              p256dh: validated.p256dh,
              auth: validated.auth,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'endpoint' }
        );

      if (error) {
        console.error('push subscription upsert error:', error);
        return createJsonResponse({ error: 'Failed to save subscription' }, 500);
      }

      return createJsonResponse({ success: true });
    }

    const endpoint = payload?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') {
      return createJsonResponse({ error: 'endpoint is required' }, 400);
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id);

    if (error) {
      console.error('push subscription delete error:', error);
      return createJsonResponse({ error: 'Failed to delete subscription' }, 500);
    }

    return createJsonResponse({ success: true });
  } catch (error) {
    console.error('push-subscription error:', error);
    return createJsonResponse({ error: 'Unexpected error' }, 500);
  }
});
