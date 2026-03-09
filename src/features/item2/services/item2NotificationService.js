/**
 * item2 通知サービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import { sendNotificationToUser } from '../../../shared/services/notificationService';
import { selectItem2StaffUsers } from './item2CallService';

/**
 * ユーザーID配列を正規化する
 * @param {Array<string>|null|undefined} value - 入力値
 * @returns {Array<string>} 正規化済みユーザーID配列
 */
const normalizeUserIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item) => typeof item === 'string' && item.length > 0)));
};

/**
 * 通知一覧表示向けに通知レコードを直接作成する
 * @param {Object} params - 作成内容
 * @returns {Promise<Object>} 作成結果
 */
const insertItem2NotificationFallback = async ({
  senderUserId = null,
  title,
  body,
  metadata,
  targetUserIds = [],
}) => {
  try {
    /** Supabase クライアント */
    const supabase = getSupabaseClient();
    /** 正規化済み通知先 */
    const normalizedTargetUserIds = normalizeUserIds(targetUserIds);
    if (normalizedTargetUserIds.length === 0) {
      return { notifiedUserIds: [], error: null };
    }

    /** 通知作成結果 */
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        sender_user_id: senderUserId,
        title,
        body,
        metadata: metadata ?? {},
      })
      .select('id')
      .single();

    if (notificationError || !notification?.id) {
      return { notifiedUserIds: [], error: notificationError ?? new Error('通知作成に失敗しました。') };
    }

    /** 受信者作成結果 */
    const { error: recipientsError } = await supabase
      .from('notification_recipients')
      .insert(
        normalizedTargetUserIds.map((userId) => ({
          notification_id: notification.id,
          user_id: userId,
        }))
      );

    if (recipientsError) {
      return { notifiedUserIds: [], error: recipientsError };
    }

    return { notifiedUserIds: normalizedTargetUserIds, error: null };
  } catch (error) {
    return { notifiedUserIds: [], error };
  }
};

/**
 * item2 チャット通知の送信対象ユーザーID一覧を決定する
 * @param {Object} params - 判定パラメータ
 * @returns {Array<string>} 通知対象ユーザーID一覧
 */
export const resolveItem2NotificationTargetUserIds = ({
  chatAssigneeIds = [],
  responderIds = [],
  staffUserIds = [],
  senderUserId = null,
  openedUserIds = [],
}) => {
  /** 正規化済みチャット担当者 */
  const normalizedChatAssigneeIds = normalizeUserIds(chatAssigneeIds);
  /** 正規化済み救護者 */
  const normalizedResponderIds = normalizeUserIds(responderIds);
  /** 正規化済み厚生部ユーザー */
  const normalizedStaffUserIds = normalizeUserIds(staffUserIds);
  void openedUserIds;

  /** 基本通知対象 */
  const targetUserIds = normalizedChatAssigneeIds.length > 0
    ? [...normalizedChatAssigneeIds, ...normalizedResponderIds]
    : [...normalizedStaffUserIds, ...normalizedResponderIds];

  /** 除外対象 */
  const excludeUserIdSet = new Set([
    ...(senderUserId ? [senderUserId] : []),
  ]);

  return normalizeUserIds(targetUserIds).filter((userId) => !excludeUserIdSet.has(userId));
};

/**
 * item2 チャットメッセージ通知を送信する
 * @param {Object} params - 通知内容
 * @returns {Promise<Object>} 送信結果
 */
export const sendItem2ChatMessageNotifications = async ({
  senderUserId = null,
  senderName = 'ユーザー',
  messageBody = '',
  callData = null,
  staffUsers = [],
  openedUserIds = [],
}) => {
  try {
    /** メッセージ本文 */
    const normalizedMessageBody = typeof messageBody === 'string' ? messageBody.trim() : '';
    if (!normalizedMessageBody) {
      return { notifiedUserIds: [], error: null };
    }

    /** チャット担当者 */
    const chatAssigneeIds = callData?.room?.assigned_to ?? [];
    /** 救護者 */
    const responderIds = callData?.assigned_to ?? [];
    /** 厚生部ユーザー一覧 */
    let staffUserIds = normalizeUserIds((staffUsers ?? []).map((user) => user?.id));

    if (chatAssigneeIds.length === 0 && staffUserIds.length === 0) {
      /** 画面側で厚生部ユーザー一覧を保持していない場合の補完 */
      const staffUsersResult = await selectItem2StaffUsers();
      if (!staffUsersResult.error) {
        staffUserIds = normalizeUserIds((staffUsersResult.users ?? []).map((user) => user?.id));
      }
    }

    /** 通知対象 */
    const targetUserIds = resolveItem2NotificationTargetUserIds({
      chatAssigneeIds,
      responderIds,
      staffUserIds,
      senderUserId,
      openedUserIds,
    });

    if (targetUserIds.length === 0) {
      return { notifiedUserIds: [], error: null };
    }

    /** 通知タイトル */
    const title = '厚生部チャットに新着メッセージがあります';
    /** 通知本文 */
    const body = `${senderName}: ${normalizedMessageBody}`;
    /** 通知メタデータ */
    const metadata = {
      type: 'item2_chat_message',
      call_id: callData?.id ?? null,
      room_id: callData?.room?.id ?? null,
      call_type: callData?.call_type ?? null,
    };

    /** 並列送信結果 */
    const results = await Promise.allSettled(
      targetUserIds.map((userId) => {
        return sendNotificationToUser(userId, title, body, metadata, senderUserId);
      })
    );

    /** 成功ユーザーID一覧 */
    const notifiedUserIds = results
      .map((result, index) => {
        if (result.status !== 'fulfilled' || result.value?.error) {
          return null;
        }
        return targetUserIds[index];
      })
      .filter(Boolean);

    /** 失敗ユーザーID一覧 */
    const failedUserIds = targetUserIds.filter((userId) => !notifiedUserIds.includes(userId));
    if (failedUserIds.length === 0) {
      return { notifiedUserIds, error: null };
    }

    /** フォールバック作成結果 */
    const fallbackResult = await insertItem2NotificationFallback({
      senderUserId,
      title,
      body,
      metadata,
      targetUserIds: failedUserIds,
    });

    if (fallbackResult.error) {
      return { notifiedUserIds, error: fallbackResult.error };
    }

    return {
      notifiedUserIds: normalizeUserIds([...notifiedUserIds, ...(fallbackResult.notifiedUserIds ?? [])]),
      error: null,
    };
  } catch (error) {
    return { notifiedUserIds: [], error };
  }
};
