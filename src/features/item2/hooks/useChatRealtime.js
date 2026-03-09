/**
 * item2 チャット Realtime フック
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  broadcastItem2Delete,
  broadcastItem2Message,
  broadcastItem2StateRequest,
  broadcastItem2StateSnapshot,
  subscribeItem2RoomRealtime,
} from '../services/item2RealtimeService';

/**
 * Realtime チャットを扱うフック
 * @param {Object} params - フック引数
 * @returns {Object} Realtime 状態
 */
export const useChatRealtime = ({
  roomId,
  userId,
  userName,
  queuedMessages,
  onPersistedMessage,
  onRoomChanged,
  onCallChanged,
}) => {
  /** 一時受信メッセージ一覧 */
  const [broadcastMessages, setBroadcastMessages] = useState([]);
  /** presence 一覧 */
  const [presenceUsers, setPresenceUsers] = useState({});
  /** 購読参照 */
  const subscriptionRef = useRef(null);
  /** 最新ローカルキュー参照 */
  const queuedMessagesRef = useRef(queuedMessages);
  /** 最新コールバック参照 */
  const callbacksRef = useRef({
    onPersistedMessage,
    onRoomChanged,
    onCallChanged,
  });

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    callbacksRef.current = {
      onPersistedMessage,
      onRoomChanged,
      onCallChanged,
    };
  }, [onCallChanged, onPersistedMessage, onRoomChanged]);

  /**
   * 受信済みブロードキャストメッセージをマージする
   * @param {Object} message - 受信メッセージ
   */
  const upsertBroadcastMessage = (message) => {
    setBroadcastMessages((previousMessages) => {
      /** 同一 temp_id の既存メッセージ */
      const existingMessage = previousMessages.find((item) => item.temp_id === message.temp_id);
      if (existingMessage) {
        return previousMessages.map((item) => {
          return item.temp_id === message.temp_id ? { ...item, ...message } : item;
        });
      }
      return [...previousMessages, message].sort((left, right) => {
        return new Date(left.client_created_at).getTime() - new Date(right.client_created_at).getTime();
      });
    });
  };

  useEffect(() => {
    setBroadcastMessages([]);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !userId) {
      return () => {};
    }

    /** 購読結果 */
    const subscription = subscribeItem2RoomRealtime({
      roomId,
      userId,
      userName,
      onPersistedMessage: (payload) => {
        callbacksRef.current.onPersistedMessage?.(payload);
      },
      onRoomChanged: (payload) => {
        callbacksRef.current.onRoomChanged?.(payload);
      },
      onCallChanged: (payload) => {
        callbacksRef.current.onCallChanged?.(payload);
      },
      onBroadcastMessage: ({ message }) => {
        upsertBroadcastMessage(message);
      },
      onBroadcastDelete: ({ message }) => {
        upsertBroadcastMessage(message);
      },
      onBroadcastStateRequest: async ({ requesterId }) => {
        if (requesterId === userId) {
          return;
        }
        await broadcastItem2StateSnapshot({ roomId, requesterId, messages: queuedMessagesRef.current });
      },
      onBroadcastStateSnapshot: ({ requesterId, messages }) => {
        if (requesterId !== userId) {
          return;
        }
        (messages ?? []).forEach((message) => {
          upsertBroadcastMessage(message);
        });
      },
      onPresenceSync: (state) => {
        setPresenceUsers(state);
      },
      onPresenceJoin: ({ state }) => {
        setPresenceUsers(state);
      },
      onPresenceLeave: ({ state }) => {
        setPresenceUsers(state);
      },
    });

    subscriptionRef.current = subscription;

    broadcastItem2StateRequest({ roomId, requesterId: userId });

    return () => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [roomId, userId, userName]);

  /**
   * Realtime でメッセージを配信する
   * @param {Object} message - 配信メッセージ
   * @returns {Promise<void>} 完了 Promise
   */
  const sendRealtimeMessage = async (message) => {
    upsertBroadcastMessage(message);
    await broadcastItem2Message({ roomId, message });
  };

  /**
   * Realtime で削除イベントを配信する
   * @param {Object} message - 配信メッセージ
   * @returns {Promise<void>} 完了 Promise
   */
  const sendRealtimeDelete = async (message) => {
    upsertBroadcastMessage(message);
    await broadcastItem2Delete({ roomId, message });
  };

  /**
   * presence から開いているユーザーID一覧を返す
   */
  const openedUserIds = useMemo(() => {
    return Object.keys(presenceUsers ?? {});
  }, [presenceUsers]);

  return {
    broadcastMessages,
    openedUserIds,
    sendRealtimeMessage,
    sendRealtimeDelete,
  };
};
