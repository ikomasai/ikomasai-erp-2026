/**
 * 配布率確認システム用データ取得フック
 */

import { useCallback, useEffect, useState } from 'react';
import { selectTicketDistributions } from '../services/ticketDistributionService';

/**
 * 配布率確認用のデータ取得フック
 * @returns {Object} 取得結果
 */
const useTicketDistributionData = () => {
  /** 配布状況一覧 */
  const [distributionList, setDistributionList] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** 最終更新時刻 */
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);


  /**
   * データを再取得する
   * @returns {Promise<void>} 処理結果
   */
  const fetchDistributions = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      /** 配布状況一覧 */
      const dataList = await selectTicketDistributions();

      setDistributionList(dataList);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('配布状況取得エラー:', error);
      setErrorMessage('データを取得できませんでした');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (isMounted) {
      fetchDistributions();
    }

    return () => {
      isMounted = false;
    };
  }, [fetchDistributions]);

  return {
    distributionList,
    isLoading,
    errorMessage,
    lastUpdatedAt,
    refresh: fetchDistributions,
  };
};

export default useTicketDistributionData;
