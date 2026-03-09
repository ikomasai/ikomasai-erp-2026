/**
 * item2 呼び出し一覧フック
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../services/supabase/client';
import { selectItem2Calls } from '../services/item2CallService';

/**
 * 呼び出し一覧を扱うフック
 * @param {Object} options - オプション
 * @returns {Object} 呼び出し一覧状態
 */
export const useCalls = ({ emergencyOnly = false } = {}) => {
  /** 呼び出し一覧 */
  const [calls, setCalls] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラー */
  const [error, setError] = useState(null);

  /**
   * 呼び出し一覧を再取得する
   * @returns {Promise<void>} 完了 Promise
   */
  const refreshCalls = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      /** 取得結果 */
      const result = await selectItem2Calls({ emergencyOnly });
      if (result.error) {
        setError(result.error);
        setCalls([]);
        return;
      }
      setCalls(result.calls);
    } catch (caughtError) {
      setError(caughtError);
      setCalls([]);
    } finally {
      setIsLoading(false);
    }
  }, [emergencyOnly]);

  useEffect(() => {
    refreshCalls();
  }, [refreshCalls]);

  useEffect(() => {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** チャンネル */
    const channel = supabase.channel(`item2-calls-${emergencyOnly ? 'emergency' : 'all'}`);

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'item2_calls' }, () => {
      refreshCalls();
    });

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'item2_chat_rooms' }, () => {
      refreshCalls();
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [emergencyOnly, refreshCalls]);

  return {
    calls,
    isLoading,
    error,
    refreshCalls,
    setCalls,
  };
};
