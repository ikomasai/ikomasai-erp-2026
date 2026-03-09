/**
 * item2 チャットサービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import {
  ITEM2_SYSTEM_MESSAGES,
} from '../constants';
import { ensureItem2ChatRoom } from './item2CallService';

/**
 * メッセージレコードを整形する
 * @param {Object} row - メッセージレコード
 * @returns {Object} 整形済みメッセージ
 */
const mapMessageRow = (row) => {
  return {
    ...row,
    is_deleted: Boolean(row?.is_deleted),
    is_system_message: Boolean(row?.is_system_message),
  };
};

/**
 * チャットメッセージ一覧を取得する
 * @param {string} roomId - ルームID
 * @returns {Promise<Object>} メッセージ一覧
 */
export const selectItem2ChatMessages = async (roomId) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 取得結果 */
    const { data, error } = await supabase
      .from('item2_chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      return { messages: [], error };
    }

    return { messages: (data ?? []).map(mapMessageRow), error: null };
  } catch (error) {
    return { messages: [], error };
  }
};

/**
 * ルームの最終メッセージ情報を更新する
 * @param {Object} params - 更新内容
 * @param {string} params.roomId - ルームID
 * @param {string} params.preview - 表示用プレビュー
 * @param {string} params.timestamp - 更新時刻
 * @returns {Promise<Object>} 更新結果
 */
export const updateItem2RoomPreview = async ({ roomId, preview, timestamp }) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 更新結果 */
    const { data, error } = await supabase
      .from('item2_chat_rooms')
      .update({
        last_message_preview: preview,
        last_message_at: timestamp,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .select('*')
      .single();

    if (error) {
      return { room: null, error };
    }

    return { room: data, error: null };
  } catch (error) {
    return { room: null, error };
  }
};

/**
 * システムメッセージを保存する
 * @param {Object} params - 作成内容
 * @returns {Promise<Object>} 作成結果
 */
export const insertItem2SystemMessage = async ({ roomId, authorId, authorName, body }) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 登録結果 */
    const { data, error } = await supabase
      .from('item2_chat_messages')
      .insert({
        room_id: roomId,
        author_id: authorId,
        author_name: authorName,
        body,
        is_system_message: true,
      })
      .select('*')
      .single();

    if (error) {
      return { message: null, error };
    }

    await updateItem2RoomPreview({
      roomId,
      preview: body,
      timestamp: data.created_at,
    });

    return { message: mapMessageRow(data), error: null };
  } catch (error) {
    return { message: null, error };
  }
};

/**
 * ローカルキューをまとめて永続化する
 * @param {Object} params - 同期内容
 * @returns {Promise<Object>} 同期結果
 */
export const syncItem2QueuedMessages = async ({ roomId, messages, actorId }) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 正規化済みメッセージ一覧 */
    const rows = (messages ?? []).map((message) => ({
      room_id: roomId,
      author_id: message.author_id,
      author_name: message.author_name,
      body: message.is_deleted ? ITEM2_SYSTEM_MESSAGES.DELETED : message.body,
      client_temp_id: message.temp_id,
      client_created_at: message.client_created_at,
      is_system_message: Boolean(message.is_system_message),
      is_deleted: Boolean(message.is_deleted),
      deleted_at: message.is_deleted ? new Date().toISOString() : null,
      deleted_by: message.is_deleted ? actorId : null,
    }));

    /** 永続化済みメッセージ */
    let persistedMessages = [];

    if (rows.length > 0) {
      /** upsert 結果 */
      const { data, error } = await supabase
        .from('item2_chat_messages')
        .upsert(rows, { onConflict: 'room_id,client_temp_id' })
        .select('*');

      if (error) {
        return { messages: [], error };
      }

      persistedMessages = data ?? [];
    }

    /** 最終メッセージ */
    const lastMessage = [...persistedMessages].sort((left, right) => {
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }).pop();

    if (lastMessage) {
      await updateItem2RoomPreview({
        roomId,
        preview: lastMessage.is_deleted ? ITEM2_SYSTEM_MESSAGES.DELETED : lastMessage.body,
        timestamp: lastMessage.created_at,
      });
    }

    return {
      messages: persistedMessages.map(mapMessageRow),
      error: null,
    };
  } catch (error) {
    return { messages: [], error };
  }
};

/**
 * メッセージを削除済みへ更新する
 * @param {Object} params - 更新内容
 * @returns {Promise<Object>} 更新結果
 */
export const deleteItem2ChatMessage = async ({ messageId, actorId }) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 更新結果 */
    const { data, error } = await supabase
      .from('item2_chat_messages')
      .update({
        body: ITEM2_SYSTEM_MESSAGES.DELETED,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select('*')
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: mapMessageRow(data), error: null };
  } catch (error) {
    return { message: null, error };
  }
};

/**
 * 既読状態を更新する
 * @param {Object} params - 更新内容
 * @returns {Promise<Object>} 更新結果
 */
export const upsertItem2ReadState = async ({ roomId, userId, messageId = null }) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 更新結果 */
    const { data, error } = await supabase
      .from('item2_chat_read_states')
      .upsert({
        room_id: roomId,
        user_id: userId,
        last_read_message_id: messageId,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'room_id,user_id' })
      .select('*')
      .single();

    if (error) {
      return { readState: null, error };
    }

    return { readState: data, error: null };
  } catch (error) {
    return { readState: null, error };
  }
};

/**
 * 指定ユーザーのルーム既読状態を取得する
 * @param {Object} params - 取得条件
 * @param {string} params.userId - ユーザーID
 * @param {Array<string>} params.roomIds - ルームID一覧
 * @returns {Promise<Object>} 既読状態マップ
 */
export const selectItem2ReadStatesByUser = async ({ userId, roomIds }) => {
  try {
    /** 正規化済みルームID一覧 */
    const normalizedRoomIds = Array.isArray(roomIds)
      ? Array.from(new Set(roomIds.filter((roomId) => typeof roomId === 'string' && roomId.length > 0)))
      : [];

    if (!userId || normalizedRoomIds.length === 0) {
      return { readStateMap: {}, error: null };
    }

    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 取得結果 */
    const { data, error } = await supabase
      .from('item2_chat_read_states')
      .select('room_id, last_read_at')
      .eq('user_id', userId)
      .in('room_id', normalizedRoomIds);

    if (error) {
      return { readStateMap: {}, error };
    }

    /** 既読状態マップ */
    const readStateMap = (data ?? []).reduce((map, item) => {
      if (item?.room_id) {
        map[item.room_id] = item.last_read_at ?? null;
      }
      return map;
    }, {});

    return { readStateMap, error: null };
  } catch (error) {
    return { readStateMap: {}, error };
  }
};

/**
 * 指定ルームの既読状態一覧を取得する
 * @param {string} roomId - ルームID
 * @returns {Promise<Object>} 既読状態一覧
 */
export const selectItem2ReadStatesByRoom = async (roomId) => {
  try {
    if (!roomId) {
      return { readStates: [], error: null };
    }

    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 取得結果 */
    const { data, error } = await supabase
      .from('item2_chat_read_states')
      .select('user_id, last_read_at')
      .eq('room_id', roomId);

    if (error) {
      return { readStates: [], error };
    }

    return { readStates: data ?? [], error: null };
  } catch (error) {
    return { readStates: [], error };
  }
};

/**
 * 呼び出し作成直後の初期チャットルームを作成する
 * @param {Object} params - 初期化内容
 * @returns {Promise<Object>} 初期化結果
 */
export const bootstrapItem2Chat = async ({
  callId,
  authorId,
  authorName,
  shouldInsertOtherPurposeMessage,
  shouldInsertEmergencyPromptMessage,
}) => {
  /** ルーム作成結果 */
  const roomResult = await ensureItem2ChatRoom(callId);

  if (roomResult.error || !roomResult.room) {
    return { room: null, systemMessage: null, error: roomResult.error ?? new Error('チャットルームの作成に失敗しました。') };
  }

  if (!shouldInsertOtherPurposeMessage && !shouldInsertEmergencyPromptMessage) {
    return { room: roomResult.room, systemMessage: null, error: null };
  }

  /** システムメッセージ本文 */
  const systemMessageBody = shouldInsertEmergencyPromptMessage
    ? ITEM2_SYSTEM_MESSAGES.EMERGENCY_DESCRIPTION
    : ITEM2_SYSTEM_MESSAGES.OTHER_PURPOSE;

  /** システムメッセージ登録結果 */
  const systemResult = await insertItem2SystemMessage({
    roomId: roomResult.room.id,
    authorId,
    authorName,
    body: systemMessageBody,
  });

  return {
    room: roomResult.room,
    systemMessage: systemResult.message,
    error: systemResult.error,
  };
};
