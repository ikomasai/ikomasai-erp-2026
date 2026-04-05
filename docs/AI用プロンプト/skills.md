# プロジェクト固有スキル

このファイルは、AI エージェントがこのプロジェクトで効率的に開発するためのパターン集です。

---

## 1. 新規画面の追加

### 手順

```
1. src/features/{機能名}/screens/{ScreenName}Screen.jsx を作成
2. src/navigation/DrawerNavigator.jsx でインポート + createWrappedScreen() + Drawer.Screen 追加
3. src/navigation/components/CustomDrawerContent.jsx にメニュー項目追加
```

### テンプレート

```jsx
/**
 * {画面名}画面
 * {画面の説明}
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/hooks/useTheme';

/**
 * {画面名}画面コンポーネント
 * @returns {JSX.Element} {画面名}画面
 */
const {ScreenName}Screen = () => {
  /** テーマ */
  const { theme } = useTheme();
  /** 認証情報 */
  const { userInfo } = useAuth();
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : (
        <ScrollView>{/* 画面内容 */}</ScrollView>
      )}
    </View>
  );
};

/** スタイル定義 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default {ScreenName}Screen;
```

---

## 2. Supabase サービスの追加

### 手順

```
1. src/services/supabase/{tableName}Service.js を作成
2. 関数名は select/insert/update/delete + テーブル名
```

### テンプレート

```javascript
/**
 * {テーブル名}サービス
 * {テーブルの説明}に関するSupabase操作
 */
import { supabase } from './client';

/**
 * {テーブル名}の一覧を取得する
 * @returns {Promise<{data: Array|null, error: Error|null}>} 取得結果
 */
export const select{TableName}s = async () => {
  try {
    const { data, error } = await supabase
      .from('{table_name}')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('select{TableName}s error:', error);
    return { data: null, error };
  }
};

/**
 * {テーブル名}を1件取得する
 * @param {string} id - ID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 取得結果
 */
export const select{TableName}ById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('{table_name}')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('select{TableName}ById error:', error);
    return { data: null, error };
  }
};

/**
 * {テーブル名}を作成する
 * @param {Object} record - 作成データ
 * @returns {Promise<{data: Object|null, error: Error|null}>} 作成結果
 */
export const insert{TableName} = async (record) => {
  try {
    const { data, error } = await supabase
      .from('{table_name}')
      .insert(record)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('insert{TableName} error:', error);
    return { data: null, error };
  }
};
```

---

## 3. カスタムフックの追加

### テンプレート

```javascript
/**
 * {フック名}
 * {フックの説明}
 */
import { useState, useEffect, useCallback } from 'react';

/**
 * {フック名}
 * @param {Object} options - オプション
 * @returns {Object} フックの戻り値
 */
export const use{HookName} = (options = {}) => {
  /** データ */
  const [data, setData] = useState(null);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラー */
  const [error, setError] = useState(null);

  /**
   * データを取得する
   */
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // データ取得ロジック
    } catch (err) {
      console.error('use{HookName} fetchData error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
};
```

---

## 4. Edge Function の追加

### 手順

```
1. supabase/functions/{name}/index.ts を作成
2. supabase/functions/_shared/cors.ts の共通設定を利用
3. 認証要件を実装（Bearer / x-internal-notify-token）
4. デプロイ: supabase functions deploy {name}
```

### テンプレート

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // CORS プリフライト
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Bearer トークン検証
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "認証が必要です" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // ユーザー検証
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "無効なトークン" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // メイン処理
    const body = await req.json();
    // ...

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## 5. DB マイグレーション

### 手順

```
1. docs/AI用プロンプト/supabaseスキーマ参照.md で現状確認
2. supabase MCP の execute_sql でマイグレーション実行
3. RLS ポリシーを設定
4. 関連サービスファイルを更新
5. スキーマ参照ドキュメントを更新
```

### RLS ポリシーテンプレート

```sql
-- テーブル作成
CREATE TABLE IF NOT EXISTS public.{table_name} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS 有効化
ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーの読み取り許可
CREATE POLICY "authenticated_select" ON public.{table_name}
  FOR SELECT TO authenticated USING (true);

-- 認証済みユーザーの書き込み許可
CREATE POLICY "authenticated_insert" ON public.{table_name}
  FOR INSERT TO authenticated WITH CHECK (true);
```

---

## 6. 通知送信パターン

```javascript
import { insertNotificationWithRecipients } from '../services/supabase/supportNotificationService';

/**
 * 通知を送信する
 * @param {Object} params - 通知パラメータ
 * @param {string} params.title - 通知タイトル
 * @param {string} params.body - 通知本文
 * @param {string[]} params.recipientIds - 受信者ID配列
 */
const sendNotification = async ({ title, body, recipientIds }) => {
  const { error } = await insertNotificationWithRecipients({
    title,
    body,
    type: 'system',
    recipient_ids: recipientIds,
  });

  if (error) {
    console.error('通知送信エラー:', error);
  }
};
```

---

## 7. テーマ対応パターン

```jsx
import { useTheme } from '../../shared/hooks/useTheme';

const MyComponent = () => {
  /** テーマ */
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>タイトル</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>サブタイトル</Text>
    </View>
  );
};
```

---

## 8. 権限チェックパターン

```javascript
import { canAccessScreen } from '../../services/supabase/permissionService';

// ロール配列からアクセス権を判定
const isAccessible = canAccessScreen(userInfo?.roles || [], 'item12');
```
