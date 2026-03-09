/**
 * item2 ローカルチャットキューフック（native）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import {
  ITEM2_BATCH_RETRY_LIMIT,
  ITEM2_LOCAL_DB_NAME,
  ITEM2_LOCAL_QUEUE_TABLE,
  ITEM2_SYSTEM_MESSAGES,
} from '../constants';

/** データベース初期化 Promise */
let databasePromise = null;

/**
 * SQLite データベースを取得する
 * @returns {Promise<Object>} SQLite データベース
 */
const getDatabase = async () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(ITEM2_LOCAL_DB_NAME);
  }

  /** データベース */
  const database = await databasePromise;

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ${ITEM2_LOCAL_QUEUE_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      temp_id TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      client_created_at TEXT NOT NULL,
      is_system_message INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sync_attempt_count INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, temp_id)
    );
  `);

  return database;
};

/**
 * ローカル行をアプリ向けのメッセージへ変換する
 * @param {Object} row - SQLite 行
 * @returns {Object} メッセージ
 */
const mapLocalRow = (row) => {
  return {
    temp_id: row.temp_id,
    author_id: row.author_id,
    author_name: row.author_name,
    body: row.body,
    client_created_at: row.client_created_at,
    is_system_message: Boolean(row.is_system_message),
    is_deleted: Boolean(row.is_deleted),
    synced_at: row.synced_at,
    sync_attempt_count: row.sync_attempt_count,
  };
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
      /** データベース */
      const database = await getDatabase();
      /** 取得結果 */
      const rows = await database.getAllAsync(
        `SELECT * FROM ${ITEM2_LOCAL_QUEUE_TABLE} WHERE room_id = ? ORDER BY client_created_at ASC`,
        roomId
      );
      setLocalMessages((rows ?? []).map(mapLocalRow));
    } catch (error) {
      console.error('item2 ローカルメッセージ取得失敗:', error);
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
   * @returns {Promise<Object>} 追加したメッセージ
   */
  const addLocalMessage = useCallback(async (message) => {
    if (!roomId) {
      throw new Error('ルームIDが未設定です。');
    }

    /** データベース */
    const database = await getDatabase();
    /** 現在時刻 */
    const nowIsoString = new Date().toISOString();

    await database.runAsync(
      `
        INSERT OR REPLACE INTO ${ITEM2_LOCAL_QUEUE_TABLE}
        (room_id, temp_id, author_id, author_name, body, client_created_at, is_system_message, is_deleted, sync_attempt_count, synced_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        roomId,
        message.temp_id,
        message.author_id ?? null,
        message.author_name,
        message.body,
        message.client_created_at ?? nowIsoString,
        message.is_system_message ? 1 : 0,
        message.is_deleted ? 1 : 0,
        message.sync_attempt_count ?? 0,
        message.synced_at ?? null,
        nowIsoString,
      ]
    );

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

    /** データベース */
    const database = await getDatabase();

    await database.runAsync(
      `
        UPDATE ${ITEM2_LOCAL_QUEUE_TABLE}
        SET body = ?, is_deleted = 1, updated_at = ?
        WHERE room_id = ? AND temp_id = ?
      `,
      [ITEM2_SYSTEM_MESSAGES.DELETED, new Date().toISOString(), roomId, tempId]
    );

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

    /** データベース */
    const database = await getDatabase();
    /** 同期時刻 */
    const syncedAt = new Date().toISOString();

    for (const tempId of tempIds) {
      await database.runAsync(
        `
          UPDATE ${ITEM2_LOCAL_QUEUE_TABLE}
          SET synced_at = ?, updated_at = ?
          WHERE room_id = ? AND temp_id = ?
        `,
        [syncedAt, syncedAt, roomId, tempId]
      );
    }

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

    /** データベース */
    const database = await getDatabase();

    for (const tempId of tempIds) {
      await database.runAsync(
        `
          UPDATE ${ITEM2_LOCAL_QUEUE_TABLE}
          SET sync_attempt_count = sync_attempt_count + 1, updated_at = ?
          WHERE room_id = ? AND temp_id = ?
        `,
        [new Date().toISOString(), roomId, tempId]
      );
    }

    await refreshMessages();
  }, [refreshMessages, roomId]);

  /** 同期対象メッセージ */
  const unsyncedMessages = useMemo(() => {
    return localMessages.filter((message) => {
      return !message.synced_at && message.sync_attempt_count < ITEM2_BATCH_RETRY_LIMIT;
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
