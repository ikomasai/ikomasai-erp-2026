/**
 * Push購読再同期フック
 * 各業務画面から閉じたPWA向けのPush購読を再同期する
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  syncWebPushSubscription,
  WEB_PUSH_SYNC_STATES,
} from '../../../services/pushSubscriptionService.js';

/**
 * Push購読再同期フック
 * @param {Object} params - パラメータ
 * @param {Object} params.navigation - React Navigationのnavigation
 * @param {string|null|undefined} params.userId - ユーザーID
 * @param {boolean} [params.enabled=true] - 利用可否
 * @returns {Object} 表示状態と実行関数
 */
export const useManagedPushSubscription = ({ navigation, userId, enabled = true }) => {
  /** 現在のPush状態 */
  const [pushState, setPushState] = useState(WEB_PUSH_SYNC_STATES.UNSUPPORTED);
  /** 画面表示用メッセージ */
  const [pushMessage, setPushMessage] = useState('');
  /** 再同期中フラグ */
  const [isSyncingPush, setIsSyncingPush] = useState(false);

  /**
   * Push購読を再同期する
   * @param {boolean} requestPermission - 権限ダイアログを出すかどうか
   * @returns {Promise<void>} 実行結果
   */
  const refreshPushSubscription = useCallback(
    async (requestPermission) => {
      if (!enabled || Platform.OS !== 'web') {
        setPushState(WEB_PUSH_SYNC_STATES.UNSUPPORTED);
        setPushMessage('');
        return;
      }

      setIsSyncingPush(true);
      /** 再同期結果 */
      const result = await syncWebPushSubscription({
        userId: typeof userId === 'string' ? userId : '',
        requestPermission,
      });
      setIsSyncingPush(false);
      setPushState(result.state);
      setPushMessage(result.message);
    },
    [enabled, userId]
  );

  useEffect(() => {
    refreshPushSubscription(false);
  }, [refreshPushSubscription]);

  useEffect(() => {
    if (!enabled || !navigation?.addListener) {
      return undefined;
    }

    /** 画面復帰時の購読再確認を解除する関数 */
    const unsubscribe = navigation.addListener('focus', () => {
      refreshPushSubscription(false);
    });

    return unsubscribe;
  }, [enabled, navigation, refreshPushSubscription]);

  /**
   * 画面表示用の通知文言と操作を構築する
   */
  const notice = useMemo(() => {
    if (Platform.OS !== 'web' || !enabled) {
      return {
        isVisible: false,
        title: '',
        description: '',
        actionLabel: '',
        onPress: null,
      };
    }

    if (pushState === WEB_PUSH_SYNC_STATES.ENABLED || pushState === WEB_PUSH_SYNC_STATES.UNSUPPORTED) {
      return {
        isVisible: false,
        title: '',
        description: '',
        actionLabel: '',
        onPress: null,
      };
    }

    if (pushState === WEB_PUSH_SYNC_STATES.PERMISSION_REQUIRED) {
      return {
        isVisible: true,
        title: '通知を有効化してください',
        description:
          pushMessage || '閉じたPWAでも通知を受け取るには、ブラウザ通知の許可が必要です。',
        actionLabel: '通知を有効化',
        onPress: () => refreshPushSubscription(true),
      };
    }

    if (pushState === WEB_PUSH_SYNC_STATES.PERMISSION_DENIED) {
      return {
        isVisible: true,
        title: '通知がブラウザでブロックされています',
        description:
          pushMessage || 'ブラウザ設定で通知を許可した後に、再確認を押してください。',
        actionLabel: '再確認',
        onPress: () => refreshPushSubscription(false),
      };
    }

    return {
      isVisible: true,
      title: 'Push購読を再登録してください',
      description: pushMessage || 'Push購読の再同期に失敗しました。再登録を実行してください。',
      actionLabel: '再登録',
      onPress: () => refreshPushSubscription(true),
    };
  }, [enabled, pushMessage, pushState, refreshPushSubscription]);

  return {
    ...notice,
    pushState,
    pushMessage,
    isSyncingPush,
    refreshPushSubscription,
  };
};
