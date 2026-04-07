import { getSupabaseClient } from '../../../services/supabase/client';
import {
  emitNotificationUpdate,
  sendNotificationToRoles,
  sendNotificationToUser,
} from '../../../shared/services/notificationService';

const ITEM2_STAFF_ROLE_NAME = '厚生部';

const isItem2StaffUser = async (userId) => {
  if (!userId) {
    return false;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('roles!inner(name, display_name)')
    .eq('user_id', userId);

  if (error) {
    return false;
  }

  return Array.isArray(data)
    && data.some((row) => {
      const roleName = row?.roles?.name ?? '';
      const roleDisplayName = row?.roles?.display_name ?? '';
      return [roleName, roleDisplayName].includes(ITEM2_STAFF_ROLE_NAME);
    });
};

const selectItem2StaffRoleIds = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, display_name')
    .or(`name.eq.${ITEM2_STAFF_ROLE_NAME},display_name.eq.${ITEM2_STAFF_ROLE_NAME}`);

  if (error) {
    return { roleIds: [], error };
  }

  return {
    roleIds: Array.from(new Set((data ?? []).map((role) => role.id).filter(Boolean))),
    error: null,
  };
};

const buildItem2NotificationBody = (callData) => {
  const requesterName = callData.requester_name || 'ユーザー';
  const locationText = callData.location_text || '場所未入力';
  const suppliesNeeded = callData?.assessment_answers?.suppliesNeeded || '特になし';
  return `${requesterName}さんから呼び出しが作成されました。場所: ${locationText}。必要なもの: ${suppliesNeeded}`;
};

const buildItem2ResponderAssignedBody = ({ callData, responderNames }) => {
  const locationText = callData.location_text || '場所未入力';
  const responderText = responderNames.length > 0 ? responderNames.join('、') : '未設定';
  return `対応者が決まりました。救護者: ${responderText}。場所: ${locationText}`;
};

const createDirectUserNotification = async ({ userId, title, body, metadata, senderUserId }) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_notification_with_recipient', {
    p_user_id: userId,
    p_title: title,
    p_body: body,
    p_metadata: metadata,
    p_sender_user_id: senderUserId,
  });

  if (error) {
    return { notification: null, recipientsCount: 0, error };
  }

  emitNotificationUpdate();
  return { notification: { id: data ?? null }, recipientsCount: 1, error: null };
};

export const notifyItem2CallCreated = async ({ callData, senderUserId = null }) => {
  try {
    if (!callData?.id) {
      return { notification: null, recipientsCount: 0, error: new Error('呼び出しデータが不正です') };
    }

    const { roleIds, error: roleError } = await selectItem2StaffRoleIds();
    if (roleError) {
      return { notification: null, recipientsCount: 0, error: roleError };
    }

    if (roleIds.length === 0) {
      return { notification: null, recipientsCount: 0, error: null };
    }

    return sendNotificationToRoles(
      roleIds,
      '厚生部呼び出し',
      buildItem2NotificationBody(callData),
      {
        type: 'item2_call_created',
        call_id: callData.id,
        call_type: callData.call_type,
        status: callData.status,
        detail_status: callData.detail_status,
        requester_name: callData.requester_name,
        location_text: callData.location_text,
        supplies_needed: callData?.assessment_answers?.suppliesNeeded || null,
      },
      senderUserId,
    );
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};

export const notifyItem2ResponderAssigned = async ({
  callData,
  responderNames = [],
  senderUserId = null,
}) => {
  try {
    if (!callData?.id || !callData?.requester_user_id) {
      return { notification: null, recipientsCount: 0, error: new Error('呼び出しデータが不正です') };
    }

    const requesterIsItem2Staff = await isItem2StaffUser(callData.requester_user_id);
    if (requesterIsItem2Staff) {
      return { notification: null, recipientsCount: 0, error: null };
    }

    const notificationResult = await sendNotificationToUser(
      callData.requester_user_id,
      '厚生部呼び出し',
      buildItem2ResponderAssignedBody({ callData, responderNames }),
      {
        type: 'item2_responder_assigned',
        call_id: callData.id,
        call_type: callData.call_type,
        status: callData.status,
        requester_name: callData.requester_name,
        location_text: callData.location_text,
        assigned_to: Array.isArray(callData.assigned_to) ? callData.assigned_to : [],
        responder_names: responderNames,
      },
      senderUserId,
    );

    if (!notificationResult.error) {
      return notificationResult;
    }

    const fallbackResult = await createDirectUserNotification({
      userId: callData.requester_user_id,
      title: '厚生部呼び出し',
      body: buildItem2ResponderAssignedBody({ callData, responderNames }),
      metadata: {
        type: 'item2_responder_assigned',
        call_id: callData.id,
        call_type: callData.call_type,
        status: callData.status,
        requester_name: callData.requester_name,
        location_text: callData.location_text,
        assigned_to: Array.isArray(callData.assigned_to) ? callData.assigned_to : [],
        responder_names: responderNames,
      },
      senderUserId,
    });

    if (fallbackResult.error) {
      console.error('厚生部呼び出しの対応者通知の直接保存に失敗しました:', fallbackResult.error);
      return notificationResult;
    }

    return fallbackResult;
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};
