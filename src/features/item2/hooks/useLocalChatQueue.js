/**
 * item2 ローカルチャットキューフック（web / fallback）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ITEM2_BATCH_RETRY_LIMIT, ITEM2_SYSTEM_MESSAGES } from '../constants';

/** Storage キー接頭辞 */
const STORAGE_PREFIX = 'item2_local_messages:';

/**
 * Storage キーを返す
 * @param {string} roomId - ルームID
 * @returns {string} Storage キー
 */
const buildStorageKey = (roomId) => {
  return `${STORAGE_PREFIX}${roomId}`;
};

/**
 * Storage からメッセージ一覧を読み込む
 * @param {string} roomId - ルームID
 * @returns {Promise<Array<Object>>} メッセージ一覧
 */
const loadMessages = async (roomId) => {
  /** 生データ */
  const rawValue = await AsyncStorage.getItem(buildStorageKey(roomId));
  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.error('item2 web ローカルメッセージ復元失敗:', error);
    return [];
  }
};

/**
 * Storage にメッセージ一覧を保存する
 * @param {string} roomId - ルームID
 * @param {Array<Object>} messages - メッセージ一覧
 * @returns {Promise<void>} 完了 Promise
 */
const saveMessages = async (roomId, messages) => {
  await AsyncStorage.setItem(buildStorageKey(roomId), JSON.stringify(messages));
};

/**
 * item2 ローカルキューを扱うフック
 * @param {string|null} roomId - ルームID
 * @returns {Object} キュー操作関数群
 */
export const useLocalChatQueue = (roomId) => {
  /** ローカルメッセージ一覧 */
  const [localMessages, setLocalMessages] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);

  /**
   * ルームの未同期メッセージを再取得する
   * @returns {Promise<void>} 完了 Promise
   */
  const refreshMessages = useCallback(async () => {
    if (!roomId) {
      setLocalMessages([]);
      return;
    }

    try {
      setIsLoading(true);
      /** 取得結果 */
      const messages = await loadMessages(roomId);
      setLocalMessages(messages);
    } catch (error) {
      console.error('item2 web ローカルメッセージ取得失敗:', error);
      setLocalMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    refreshMessages();
  }, [refreshMessages]);

  /**
   * ローカルキューへメッセージを追加する
   * @param {Object} message - 追加するメッセージ
   * @returns {Promise<Object>} 追加メッセージ
   */
  const addLocalMessage = useCallback(async (message) => {
    if (!roomId) {
      throw new Error('ルームIDが未設定です。');
    }

    /** 現在メッセージ */
    const currentMessages = await loadMessages(roomId);
    /** 一致インデックス */
    const existingIndex = currentMessages.findIndex((item) => item.temp_id === message.temp_id);
    /** 更新後メッセージ一覧 */
    const nextMessages = [...currentMessages];

    if (existingIndex >= 0) {
      nextMessages[existingIndex] = message;
    } else {
      nextMessages.push(message);
    }

    await saveMessages(roomId, nextMessages);
    await refreshMessages();
    return message;
  }, [refreshMessages, roomId]);

  /**
   * ローカルメッセージを削除済みに更新する
   * @param {string} tempId - 一時ID
   * @returns {Promise<void>} 完了 Promise
   */
  const markLocalMessageDeleted = useCallback(async (tempId) => {
    if (!roomId) {
      return;
    }

    /** 現在メッセージ */
    const currentMessages = await loadMessages(roomId);
    /** 更新後メッセージ */
    const nextMessages = currentMessages.map((message) => {
      return message.temp_id === tempId
        ? { ...message, body: ITEM2_SYSTEM_MESSAGES.DELETED, is_deleted: true }
        : message;
    });

    await saveMessages(roomId, nextMessages);
    await refreshMessages();
  }, [refreshMessages, roomId]);

  /**
   * 同期成功済みメッセージを更新する
   * @param {Array<string>} tempIds - 一時ID一覧
   * @returns {Promise<void>} 完了 Promise
   */
  const markMessagesSynced = useCallback(async (tempIds) => {
    if (!roomId || !Array.isArray(tempIds) || tempIds.length === 0) {
      return;
    }

    /** 同期時刻 */
    const syncedAt = new Date().toISOString();
    /** 現在メッセージ */
    const currentMessages = await loadMessages(roomId);
    /** 更新後メッセージ */
    const nextMessages = currentMessages.map((message) => {
      return tempIds.includes(message.temp_id)
        ? { ...message, synced_at: syncedAt }
        : message;
    });

    await saveMessages(roomId, nextMessages);
    await refreshMessages();
  }, [refreshMessages, roomId]);

  /**
   * 同期失敗回数を加算する
   * @param {Array<string>} tempIds - 一時ID一覧
   * @returns {Promise<void>} 完了 Promise
   */
  const incrementSyncAttempts = useCallback(async (tempIds) => {
    if (!roomId || !Array.isArray(tempIds) || tempIds.length === 0) {
      return;
    }

    /** 現在メッセージ */
    const currentMessages = await loadMessages(roomId);
    /** 更新後メッセージ */
    const nextMessages = currentMessages.map((message) => {
      return tempIds.includes(message.temp_id)
        ? { ...message, sync_attempt_count: (message.sync_attempt_count ?? 0) + 1 }
        : message;
    });

    await saveMessages(roomId, nextMessages);
    await refreshMessages();
  }, [refreshMessages, roomId]);

  /** 同期対象メッセージ */
  const unsyncedMessages = useMemo(() => {
    return localMessages.filter((message) => {
      return !message.synced_at && (message.sync_attempt_count ?? 0) < ITEM2_BATCH_RETRY_LIMIT;
    });
  }, [localMessages]);

  return {
    isLoading,
    localMessages,
    unsyncedMessages,
    refreshMessages,
    addLocalMessage,
    markLocalMessageDeleted,
    markMessagesSynced,
    incrementSyncAttempts,
  };
};
