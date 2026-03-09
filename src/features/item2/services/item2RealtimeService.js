/**
 * item2 Realtime サービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import { ITEM2_REALTIME_CHANNEL_PREFIX } from '../constants';

/**
 * ルーム単位の Realtime チャンネル名を生成する
 * @param {string} roomId - ルームID
 * @returns {string} チャンネル名
 */
const buildRoomChannelName = (roomId) => {
  return `${ITEM2_REALTIME_CHANNEL_PREFIX}-${roomId}`;
};

/**
 * ルーム用チャンネルを取得する
 * Supabase の内部 topic は `realtime:` 接頭辞が付く場合があるため両方許容する。
 * @param {Object} supabase - Supabase クライアント
 * @param {string} roomId - ルームID
 * @returns {Object|null} チャンネル
 */
const findRoomChannel = (supabase, roomId) => {
  /** 想定チャンネル名 */
  const channelName = buildRoomChannelName(roomId);

  return supabase.getChannels().find((item) => {
    const topic = item?.topic ?? '';
    return topic === channelName || topic === `realtime:${channelName}`;
  }) ?? null;
};

/**
 * ルームへブロードキャスト送信する
 * @param {Object} params - 送信内容
 * @param {string} params.roomId - ルームID
 * @param {string} params.event - イベント名
 * @param {Object} params.payload - ペイロード
 * @returns {Promise<string>} 送信結果
 */
const sendRoomBroadcast = async ({ roomId, event, payload }) => {
  /** Supabase クライアント */
  const supabase = getSupabaseClient();
  /** チャンネル */
  const channel = findRoomChannel(supabase, roomId);

  if (!channel) {
    return 'error';
  }

  return channel.send({
    type: 'broadcast',
    event,
    payload,
  });
};

/**
 * ルームの Realtime 購読を開始する
 * @param {Object} params - 購読条件
 * @returns {Object} チャンネルと解除関数
 */
export const subscribeItem2RoomRealtime = ({
  roomId,
  userId,
  userName,
  onPersistedMessage,
  onRoomChanged,
  onCallChanged,
  onBroadcastMessage,
  onBroadcastDelete,
  onBroadcastStateRequest,
  onBroadcastStateSnapshot,
  onPresenceSync,
  onPresenceJoin,
  onPresenceLeave,
}) => {
  /** Supabase クライアント */
  const supabase = getSupabaseClient();
  /** Realtime チャンネル */
  const channel = supabase.channel(buildRoomChannelName(roomId), {
    config: {
      broadcast: { ack: true, self: false },
      presence: { key: userId },
    },
  });

  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'item2_chat_messages',
    filter: `room_id=eq.${roomId}`,
  }, (payload) => {
    onPersistedMessage?.(payload);
  });

  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'item2_chat_rooms',
    filter: `id=eq.${roomId}`,
  }, (payload) => {
    onRoomChanged?.(payload);
  });

  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'item2_calls',
  }, (payload) => {
    onCallChanged?.(payload);
  });

  channel.on('broadcast', { event: 'new-message' }, ({ payload }) => {
    onBroadcastMessage?.(payload);
  });

  channel.on('broadcast', { event: 'delete-message' }, ({ payload }) => {
    onBroadcastDelete?.(payload);
  });

  channel.on('broadcast', { event: 'state-request' }, ({ payload }) => {
    onBroadcastStateRequest?.(payload);
  });

  channel.on('broadcast', { event: 'state-snapshot' }, ({ payload }) => {
    onBroadcastStateSnapshot?.(payload);
  });

  channel.on('presence', { event: 'sync' }, () => {
    onPresenceSync?.(channel.presenceState());
  });

  channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    onPresenceJoin?.({ key, newPresences, state: channel.presenceState() });
  });

  channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    onPresenceLeave?.({ key, leftPresences, state: channel.presenceState() });
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        user_id: userId,
        user_name: userName,
        opened_at: new Date().toISOString(),
      });
    }
  });

  return {
    channel,
    unsubscribe: async () => {
      try {
        await channel.untrack();
      } catch (error) {
        // 無視して removeChannel を優先する
      }
      await supabase.removeChannel(channel);
    },
  };
};

/**
 * 新規メッセージをブロードキャストする
 * @param {Object} params - 送信内容
 * @returns {Promise<string>} 送信結果
 */
export const broadcastItem2Message = async ({ roomId, message }) => {
  return sendRoomBroadcast({
    roomId,
    event: 'new-message',
    payload: { message },
  });
};

/**
 * 削除イベントをブロードキャストする
 * @param {Object} params - 送信内容
 * @returns {Promise<string>} 送信結果
 */
export const broadcastItem2Delete = async ({ roomId, message }) => {
  return sendRoomBroadcast({
    roomId,
    event: 'delete-message',
    payload: { message },
  });
};

/**
 * ルーム状態のスナップショット要求を送る
 * @param {Object} params - 要求内容
 * @returns {Promise<string>} 送信結果
 */
export const broadcastItem2StateRequest = async ({ roomId, requesterId }) => {
  return sendRoomBroadcast({
    roomId,
    event: 'state-request',
    payload: { requesterId, roomId },
  });
};

/**
 * ルーム状態のスナップショットを返す
 * @param {Object} params - 返却内容
 * @returns {Promise<string>} 送信結果
 */
export const broadcastItem2StateSnapshot = async ({ roomId, requesterId, messages }) => {
  return sendRoomBroadcast({
    roomId,
    event: 'state-snapshot',
    payload: { requesterId, roomId, messages },
  });
};

/**
 * 既読状態をブロードキャストする
 * @param {Object} params - 送信内容
 * @returns {Promise<string>} 送信結果
 */
export const broadcastItem2ReadState = async ({ roomId, userId, readAt, readUptoAt }) => {
  return sendRoomBroadcast({
    roomId,
    event: 'read-state',
    payload: {
      roomId,
      userId,
      readAt: readAt ?? null,
      readUptoAt: readUptoAt ?? null,
    },
  });
};
