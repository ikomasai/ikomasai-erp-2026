/**
 * item2 チャット画面
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { getSupabaseClient } from '../../../services/supabase/client';
import { ITEM2_CALL_STATUSES, ITEM2_SYSTEM_MESSAGES } from '../constants';
import { useLocalChatQueue } from '../hooks/useLocalChatQueue';
import { useChatRealtime } from '../hooks/useChatRealtime';
import ChatMessageBubble from '../components/ChatMessageBubble';
import AssigneeSettingModal from '../components/AssigneeSettingModal';
import {
  deleteItem2ChatMessage,
  selectItem2ChatMessages,
  syncItem2QueuedMessages,
  updateItem2RoomPreview,
} from '../services/item2ChatService';
import {
  updateItem2CallAssignees,
  updateItem2CallStatus,
  updateItem2ChatAssignees,
} from '../services/item2CallService';
import { sendItem2ChatMessageNotifications } from '../services/item2NotificationService';
import { THEME_MODES } from '../../../shared/utils/themeTokens';

/**
 * message の一意キーを返す
 * @param {Object} message - メッセージ
 * @returns {string} 一意キー
 */
const getMessageKey = (message) => {
  return message.id ?? message.temp_id;
};

/** 救護者自動メッセージ判定用パターン */
const ITEM2_RESPONDER_SYSTEM_MESSAGE_PATTERN = /が向か(?:っています|います)。?$/;

/**
 * item2 チャット画面
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} 画面
 */
const ChatScreen = ({
  callData,
  currentUser,
  currentUserInfo,
  staffUsers = [],
  canResolveCall = false,
  onBack,
  onResolved,
  onCallUpdated,
}) => {
  /** テーマ */
  const { theme, themeMode } = useTheme();
  /** ルーム情報 */
  const room = callData?.room;
  /** 対応終了操作の背景色 */
  const resolveActionBackgroundColor = themeMode === THEME_MODES.NEON ? '#2e7d32' : theme.success;
  /** 対応終了操作の文字色 */
  const resolveActionTextColor = themeMode === THEME_MODES.NEON ? '#f5fff5' : '#ffffff';
  /** 入力文字列 */
  const [messageText, setMessageText] = useState('');
  /** 永続化済みメッセージ */
  const [persistedMessages, setPersistedMessages] = useState([]);
  /** メッセージ読込中 */
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  /** 送信/同期中 */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 画面エラー */
  const [screenError, setScreenError] = useState('');
  /** 削除確認モーダル表示状態 */
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  /** 削除対象メッセージ */
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null);
  /** メッセージ削除中状態 */
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  /** 対応終了確認モーダル表示状態 */
  const [isResolveConfirmVisible, setIsResolveConfirmVisible] = useState(false);
  /** 対応終了前の担当者設定モーダル表示状態 */
  const [isResolveAssigneeModalVisible, setIsResolveAssigneeModalVisible] = useState(false);
  /** 対応終了前フローの担当者設定かどうか */
  const [isResolveAssigneeSettingFlow, setIsResolveAssigneeSettingFlow] = useState(false);
  /** 対応終了前の担当者設定保存中状態 */
  const [isSavingResolveAssignees, setIsSavingResolveAssignees] = useState(false);
  /** 対応終了前に担当者設定確認済みかどうか */
  const [hasConfirmedResolveAssignees, setHasConfirmedResolveAssignees] = useState(false);
  /** メッセージ同期中状態参照 */
  const isSyncingMessagesRef = useRef(false);
  /** ローカルキュー */
  const {
    unsyncedMessages,
    addLocalMessage,
    markLocalMessageDeleted,
    markMessagesSynced,
    incrementSyncAttempts,
  } = useLocalChatQueue(room?.id ?? null);

  /**
   * 永続化済みメッセージを読み込む
   * @returns {Promise<void>} 完了 Promise
   */
  const loadPersistedMessages = async () => {
    if (!room?.id) {
      setPersistedMessages([]);
      return;
    }

    try {
      setIsLoadingMessages(true);
      setScreenError('');
      /** 取得結果 */
      const result = await selectItem2ChatMessages(room.id);
      if (result.error) {
        setScreenError(result.error.message ?? 'メッセージ取得に失敗しました。');
        setPersistedMessages([]);
        return;
      }
      setPersistedMessages(result.messages);
    } catch (error) {
      setScreenError(error.message ?? 'メッセージ取得に失敗しました。');
      setPersistedMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadPersistedMessages();
  }, [room?.id]);

  useEffect(() => {
    setHasConfirmedResolveAssignees(false);
  }, [callData?.id]);

  /** Realtime 状態 */
  const {
    broadcastMessages,
    openedUserIds,
    sendRealtimeDelete,
    sendRealtimeMessage,
  } = useChatRealtime({
    roomId: room?.id,
    userId: currentUser?.id,
    userName: currentUserInfo?.name ?? currentUser?.email ?? 'ユーザー',
    queuedMessages: unsyncedMessages,
    onPersistedMessage: (payload) => {
      if (payload.eventType === 'INSERT') {
        setPersistedMessages((previousMessages) => {
          return [...previousMessages, payload.new].sort((left, right) => {
            return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
          });
        });
      }
      if (payload.eventType === 'UPDATE') {
        setPersistedMessages((previousMessages) => {
          return previousMessages.map((message) => {
            return message.id === payload.new.id ? payload.new : message;
          });
        });
      }
    },
    onRoomChanged: (payload) => {
      if (payload.new) {
        onCallUpdated?.({
          ...callData,
          room: {
            ...callData.room,
            ...payload.new,
          },
        });
      }
    },
    onCallChanged: (payload) => {
      if (payload.new && payload.new.id === callData.id) {
        onCallUpdated?.({
          ...callData,
          ...payload.new,
        });
      }
    },
  });

  /**
   * ローカルキューを Supabase へ同期する
   * @param {Array<Object>|null|undefined} messagesToSync - 同期対象（未指定時は現在の未同期メッセージ）
   * @param {Object} options - オプション
   * @param {boolean} options.silent - エラー文言を画面表示しないかどうか
   * @returns {Promise<Object>} 同期結果
   */
  const syncQueuedMessages = useCallback(async (messagesToSync = null, { silent = true } = {}) => {
    if (!room?.id || !currentUser?.id) {
      return { success: false, error: new Error('チャットルーム情報を確認できません。') };
    }

    /** 同期対象メッセージ */
    const targetMessages = (messagesToSync ?? unsyncedMessages).filter((message) => {
      return typeof message?.temp_id === 'string' && message.temp_id.length > 0;
    });

    if (targetMessages.length === 0) {
      return { success: true, error: null };
    }

    if (isSyncingMessagesRef.current) {
      return { success: false, error: new Error('同期処理を実行中です。') };
    }

    isSyncingMessagesRef.current = true;
    /** 同期対象 temp_id 一覧 */
    const targetTempIds = targetMessages.map((message) => message.temp_id);

    try {
      /** 同期結果 */
      const result = await syncItem2QueuedMessages({
        roomId: room.id,
        messages: targetMessages,
        actorId: currentUser.id,
      });

      if (result.error) {
        await incrementSyncAttempts(targetTempIds);
        if (!silent) {
          setScreenError(result.error.message ?? 'メッセージ同期に失敗しました。');
        }
        return { success: false, error: result.error };
      }

      await markMessagesSynced(targetTempIds);
      if (Array.isArray(result.messages) && result.messages.length > 0) {
        setPersistedMessages((previousMessages) => {
          /** 統合マップ */
          const messageMap = new Map();
          [...previousMessages, ...result.messages].forEach((message) => {
            messageMap.set(getMessageKey(message), message);
          });

          return Array.from(messageMap.values()).sort((left, right) => {
            const leftTime = new Date(left.created_at ?? left.client_created_at).getTime();
            const rightTime = new Date(right.created_at ?? right.client_created_at).getTime();
            return leftTime - rightTime;
          });
        });
      }

      return { success: true, error: null };
    } catch (error) {
      await incrementSyncAttempts(targetTempIds);
      if (!silent) {
        setScreenError(error.message ?? 'メッセージ同期に失敗しました。');
      }
      return { success: false, error };
    } finally {
      isSyncingMessagesRef.current = false;
    }
  }, [
    currentUser?.id,
    incrementSyncAttempts,
    markMessagesSynced,
    room?.id,
    unsyncedMessages,
  ]);

  useEffect(() => {
    if (!room?.id || !currentUser?.id || unsyncedMessages.length === 0) {
      return () => {};
    }

    syncQueuedMessages(null, { silent: true });

    const intervalId = setInterval(() => {
      syncQueuedMessages(null, { silent: true });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentUser?.id, room?.id, syncQueuedMessages, unsyncedMessages.length]);

  /**
   * 画面に表示する統合メッセージ一覧
   */
  const messages = useMemo(() => {
    /** 統合マップ */
    const messageMap = new Map();
    [...persistedMessages, ...unsyncedMessages, ...broadcastMessages].forEach((message) => {
      messageMap.set(getMessageKey(message), message);
    });

    return Array.from(messageMap.values()).sort((left, right) => {
      const leftTime = new Date(left.created_at ?? left.client_created_at).getTime();
      const rightTime = new Date(right.created_at ?? right.client_created_at).getTime();
      return leftTime - rightTime;
    });
  }, [broadcastMessages, persistedMessages, unsyncedMessages]);

  /**
   * メッセージを送信する
   * @returns {Promise<void>} 完了 Promise
   */
  const handleSendMessage = async () => {
    if (!messageText.trim() || !room?.id || !currentUser?.id) {
      return;
    }

    try {
      setIsSubmitting(true);
      setScreenError('');
      /** 一時ID */
      const tempId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      /** 現在時刻 */
      const nowIsoString = new Date().toISOString();
      /** 送信メッセージ */
      const nextMessage = {
        temp_id: tempId,
        author_id: currentUser.id,
        author_name: currentUserInfo?.name ?? currentUser.email ?? 'ユーザー',
        body: messageText.trim(),
        client_created_at: nowIsoString,
        is_system_message: false,
        is_deleted: false,
      };

      await addLocalMessage(nextMessage);
      await sendRealtimeMessage(nextMessage);
      await updateItem2RoomPreview({ roomId: room.id, preview: nextMessage.body, timestamp: nowIsoString });
      await syncQueuedMessages([nextMessage], { silent: true });

      sendItem2ChatMessageNotifications({
        senderUserId: currentUser.id,
        senderName: currentUserInfo?.name ?? currentUser.email ?? 'ユーザー',
        messageBody: nextMessage.body,
        callData,
        staffUsers,
        openedUserIds,
      }).catch((error) => {
        console.error('item2 メッセージ通知送信失敗:', error);
      });

      if (callData.status === ITEM2_CALL_STATUSES.UNHANDLED) {
        const result = await updateItem2CallStatus({ callId: callData.id, status: ITEM2_CALL_STATUSES.IN_PROGRESS });
        if (!result.error && result.call) {
          onCallUpdated?.({ ...callData, ...result.call });
        }
      }

      setMessageText('');
    } catch (error) {
      setScreenError(error.message ?? 'メッセージ送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * メッセージ削除を実行する
   * @param {Object} message - 対象メッセージ
   * @returns {Promise<void>} 完了 Promise
   */
  const handleDeleteMessage = async (message) => {
    if (!canDeleteMessage(message)) {
      return;
    }
    setPendingDeleteMessage(message);
    setIsDeleteConfirmVisible(true);
  };

  /**
   * メッセージ削除を確定する
   * @returns {Promise<void>} 完了 Promise
   */
  const confirmDeleteMessage = async () => {
    if (!pendingDeleteMessage) {
      setIsDeleteConfirmVisible(false);
      return;
    }

    if (!canDeleteMessage(pendingDeleteMessage)) {
      setIsDeleteConfirmVisible(false);
      setPendingDeleteMessage(null);
      return;
    }

    try {
      setIsDeletingMessage(true);
      setScreenError('');

      if (pendingDeleteMessage.id) {
        /** 削除結果 */
        const result = await deleteItem2ChatMessage({ messageId: pendingDeleteMessage.id, actorId: currentUser.id });
        if (result.error) {
          setScreenError(result.error.message ?? 'メッセージ削除に失敗しました。');
          return;
        }

        if (result.message) {
          setPersistedMessages((previousMessages) => {
            return previousMessages.map((item) => {
              return item.id === result.message.id ? result.message : item;
            });
          });
        }

        await sendRealtimeDelete({
          ...pendingDeleteMessage,
          body: ITEM2_SYSTEM_MESSAGES.DELETED,
          is_deleted: true,
        });
      } else if (pendingDeleteMessage.temp_id) {
        await markLocalMessageDeleted(pendingDeleteMessage.temp_id);
        await sendRealtimeDelete({
          ...pendingDeleteMessage,
          body: ITEM2_SYSTEM_MESSAGES.DELETED,
          is_deleted: true,
        });
      }

      setIsDeleteConfirmVisible(false);
      setPendingDeleteMessage(null);
    } catch (error) {
      setScreenError(error.message ?? 'メッセージ削除に失敗しました。');
    } finally {
      setIsDeletingMessage(false);
    }
  };

  /**
   * メッセージ一覧を再読み込みする
   * @returns {Promise<void>} 完了 Promise
   */
  const handleRefreshMessages = async () => {
    await syncQueuedMessages(null, { silent: true });
    await loadPersistedMessages();
  };

  /**
   * メッセージ削除可否を判定する
   * @param {Object} message - 判定対象
   * @returns {boolean} 判定結果
   */
  function canDeleteMessage(message) {
    if (!message) {
      return false;
    }

    if (message.is_deleted) {
      return false;
    }

    if (!message.is_system_message) {
      return message.author_id === currentUser?.id;
    }

    /** 判定用本文 */
    const bodyText = (message.body ?? '').trim();
    if (bodyText === ITEM2_SYSTEM_MESSAGES.EMERGENCY_DESCRIPTION) {
      return false;
    }

    if (ITEM2_RESPONDER_SYSTEM_MESSAGE_PATTERN.test(bodyText)) {
      return Boolean(canResolveCall);
    }

    return false;
  }

  /**
   * 対応終了を実行する
   * @returns {Promise<void>} 完了 Promise
   */
  const handleResolve = async () => {
    if (!room?.id || !currentUser?.id) {
      setScreenError('チャットルーム情報を確認できません。');
      return;
    }

    if (!canResolveCall) {
      setScreenError('対応終了は厚生部側のみ実行できます。');
      return;
    }

    /** 救護者が設定済みか */
    const hasResponder = Array.isArray(callData?.assigned_to) && callData.assigned_to.length > 0;
    /** チャット担当者が設定済みか */
    const hasChatAssigneeSelected = Array.isArray(callData?.room?.assigned_to) && callData.room.assigned_to.length > 0;
    /** 担当者未設定かどうか */
    const needsAssigneeSetting = !hasResponder || !hasChatAssigneeSelected;

    if (needsAssigneeSetting && !hasConfirmedResolveAssignees) {
      setIsResolveAssigneeSettingFlow(true);
      setIsResolveAssigneeModalVisible(true);
      return;
    }

    setIsResolveConfirmVisible(true);
  };

  /**
   * 対応終了前の担当者設定を保存する
   * @param {Object} params - 保存内容
   * @returns {Promise<void>} 完了 Promise
   */
  const saveResolveAssignees = async ({ responderIds, chatAssigneeIds }) => {
    if (!callData?.id || !room?.id) {
      setScreenError('呼び出し情報を確認できません。');
      return;
    }

    if (!Array.isArray(chatAssigneeIds) || chatAssigneeIds.length === 0) {
      setScreenError('チャット担当者を1人以上選択してください。');
      return;
    }

    try {
      setIsSavingResolveAssignees(true);
      setScreenError('');

      /** チャット担当者更新結果 */
      const chatAssigneeResult = await updateItem2ChatAssignees(room.id, chatAssigneeIds);
      if (chatAssigneeResult.error) {
        setScreenError(chatAssigneeResult.error.message ?? 'チャット担当者の更新に失敗しました。');
        return;
      }

      /** 救護者更新結果 */
      const responderResult = await updateItem2CallAssignees({
        callId: callData.id,
        assignedTo: responderIds,
        actorId: currentUser?.id ?? null,
      });
      if (responderResult.error) {
        setScreenError(responderResult.error.message ?? '救護者の更新に失敗しました。');
        return;
      }

      onCallUpdated?.({
        ...callData,
        ...(responderResult.call ?? {}),
        room: chatAssigneeResult.room ?? callData.room,
      });

      if (isResolveAssigneeSettingFlow) {
        setHasConfirmedResolveAssignees(true);
        setIsResolveAssigneeModalVisible(false);
        setIsResolveConfirmVisible(true);
        return;
      }

      setIsResolveAssigneeModalVisible(false);
    } catch (error) {
      setScreenError(error.message ?? '担当者設定の保存に失敗しました。');
    } finally {
      setIsSavingResolveAssignees(false);
    }
  };

  /**
   * 対応終了を確定する
   * @returns {Promise<void>} 完了 Promise
   */
  const confirmResolve = async () => {
    try {
      setIsSubmitting(true);
      setScreenError('');
      /** 同期失敗時メッセージ */
      let syncErrorMessage = '';
      /** 同期結果 */
      const syncResult = await syncQueuedMessages(unsyncedMessages, { silent: true });
      if (!syncResult.success) {
        syncErrorMessage = syncResult.error?.message ?? 'チャットログ保存に失敗しました。';
      }

      /** 明示的なステータス更新結果 */
      const resolveResult = await updateItem2CallStatus({
        callId: callData.id,
        status: ITEM2_CALL_STATUSES.RESOLVED,
        resolvedBy: currentUser.id,
      });

      if (resolveResult.error || !resolveResult.call) {
        setScreenError(resolveResult.error?.message ?? '対応終了の更新に失敗しました。');
        return;
      }

      onResolved?.(resolveResult.call ?? {
        ...callData,
        status: ITEM2_CALL_STATUSES.RESOLVED,
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser.id,
      });

      if (syncErrorMessage) {
        setScreenError(`${syncErrorMessage}（対応終了ステータスは更新済みです）`);
      }
    } catch (error) {
      setScreenError(error.message ?? '対応終了に失敗しました。');
    } finally {
      setIsSubmitting(false);
      setIsResolveConfirmVisible(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}> 
      <AssigneeSettingModal
        visible={isResolveAssigneeModalVisible}
        title={isResolveAssigneeSettingFlow ? '担当者を設定してください' : '担当者設定'}
        users={staffUsers}
        initialResponderIds={callData?.assigned_to ?? []}
        initialChatAssigneeIds={callData?.room?.assigned_to ?? []}
        allowNoResponderOption
        onClose={() => {
          setIsResolveAssigneeModalVisible(false);
          setIsResolveAssigneeSettingFlow(false);
        }}
        onConfirm={saveResolveAssignees}
        isSubmitting={isSavingResolveAssignees}
      />

      <Modal
        visible={isDeleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (isDeletingMessage) {
            return;
          }
          setIsDeleteConfirmVisible(false);
          setPendingDeleteMessage(null);
        }}
      >
        <View style={styles.resolveModalOverlay}>
          <View style={[styles.resolveModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.resolveModalTitle, { color: theme.text }]}>メッセージの送信を取り消しますか？</Text>
            <View style={styles.resolveModalButtonRow}>
              <TouchableOpacity
                style={[styles.resolveModalButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => {
                  setIsDeleteConfirmVisible(false);
                  setPendingDeleteMessage(null);
                }}
                disabled={isDeletingMessage}
              >
                <Text style={[styles.resolveModalButtonText, { color: theme.textSecondary }]}>いいえ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolveModalButton, styles.resolveModalConfirmButton, { backgroundColor: theme.error }]}
                onPress={confirmDeleteMessage}
                disabled={isDeletingMessage}
              >
                <Text style={[styles.resolveModalConfirmButtonText, { color: '#ffffff' }]}>
                  {isDeletingMessage ? '処理中...' : 'はい'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isResolveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsResolveConfirmVisible(false)}
      >
        <View style={styles.resolveModalOverlay}>
          <View style={[styles.resolveModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.resolveModalTitle, { color: theme.text }]}>対応を終了しますか？</Text>
            <View style={styles.resolveModalButtonRow}>
              <TouchableOpacity
                style={[styles.resolveModalButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => setIsResolveConfirmVisible(false)}
                disabled={isSubmitting}
              >
                <Text style={[styles.resolveModalButtonText, { color: theme.textSecondary }]}>いいえ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolveModalButton, styles.resolveModalConfirmButton, { backgroundColor: resolveActionBackgroundColor }]}
                onPress={confirmResolve}
                disabled={isSubmitting}
              >
                <Text style={[styles.resolveModalConfirmButtonText, { color: resolveActionTextColor }]}>
                  {isSubmitting ? '処理中...' : 'はい'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}> 
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={[styles.backButtonText, { color: theme.primaryVariant }]}>← 戻る</Text>
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{callData.location_text}</Text>
            <Text style={[styles.headerSubTitle, { color: theme.textSecondary }]}>{callData.requester_name}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {canResolveCall ? (
            <TouchableOpacity
              style={[styles.smallActionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => {
                setIsResolveAssigneeSettingFlow(false);
                setIsResolveAssigneeModalVisible(true);
              }}
            >
              <Text style={[styles.smallActionButtonText, { color: theme.primaryVariant }]}>担当者設定</Text>
            </TouchableOpacity>
          ) : null}
          {canResolveCall ? (
            <TouchableOpacity
              style={[
                styles.smallActionButton,
                styles.resolveButton,
                { backgroundColor: resolveActionBackgroundColor },
                (isSubmitting || callData.status === ITEM2_CALL_STATUSES.RESOLVED) ? styles.resolveButtonDisabled : null,
              ]}
              onPress={handleResolve}
              disabled={isSubmitting || callData.status === ITEM2_CALL_STATUSES.RESOLVED}
            >
              <Text style={[styles.resolveButtonText, { color: resolveActionTextColor }]}>対応終了</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {screenError ? <Text style={[styles.errorText, { color: theme.error }]}>{screenError}</Text> : null}
        <Text style={[styles.presenceText, { color: theme.textSecondary }]}>閲覧中: {openedUserIds.length}人</Text>

        <FlatList
          style={styles.messageList}
          data={messages}
          keyExtractor={(item) => getMessageKey(item)}
          onRefresh={handleRefreshMessages}
          refreshing={isLoadingMessages}
          contentContainerStyle={styles.messageListContent}
          renderItem={({ item }) => (
            <ChatMessageBubble
              message={item}
              isOwnMessage={item.author_id === currentUser?.id && !item.is_system_message}
              canDelete={canDeleteMessage(item)}
              onDelete={handleDeleteMessage}
            />
          )}
        />

        <View style={[styles.inputRow, { borderTopColor: theme.border }]}> 
          <TextInput
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
            placeholder={callData.status === ITEM2_CALL_STATUSES.RESOLVED ? '対応終了済みです' : 'メッセージを入力'}
            placeholderTextColor={theme.textSecondary}
            value={messageText}
            onChangeText={setMessageText}
            editable={!isSubmitting && callData.status !== ITEM2_CALL_STATUSES.RESOLVED}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (isSubmitting || callData.status === ITEM2_CALL_STATUSES.RESOLVED) ? styles.sendButtonDisabled : null]}
            onPress={handleSendMessage}
            disabled={isSubmitting || callData.status === ITEM2_CALL_STATUSES.RESOLVED}
          >
            <Text style={styles.sendButtonText}>送信</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#1565c0',
    fontWeight: '700',
  },
  headerTextBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubTitle: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  smallActionButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallActionButtonText: {
    color: '#1565c0',
    fontWeight: '700',
    fontSize: 12,
  },
  resolveButton: {
    backgroundColor: '#2e7d32',
  },
  resolveButtonDisabled: {
    backgroundColor: '#9e9e9e',
  },
  resolveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  resolveModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resolveModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  resolveModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  resolveModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  resolveModalButton: {
    minWidth: 88,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  resolveModalButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resolveModalConfirmButton: {
    borderWidth: 0,
  },
  resolveModalConfirmButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#c62828',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  presenceText: {
    color: '#616161',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 32,
  },
  inputRow: {
    borderTopWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  sendButton: {
    backgroundColor: '#1565c0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonDisabled: {
    backgroundColor: '#b0bec5',
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default ChatScreen;
