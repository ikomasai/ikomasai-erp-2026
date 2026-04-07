/**
 * item2 呼び出し一覧フック
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../services/supabase/client';
import { selectItem2Calls } from '../services/item2CallService';

/**
 * 呼び出し一覧を扱うフック
 * @returns {Object} 呼び出し一覧状態
 */
export const useCalls = () => {
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCalls = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await selectItem2Calls();
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
  }, []);

  useEffect(() => {
    refreshCalls();
  }, [refreshCalls]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase.channel('item2-calls');

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'item2_calls' }, () => {
      refreshCalls();
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshCalls]);

  return {
    calls,
    isLoading,
    error,
    refreshCalls,
    setCalls,
  };
};
