import { getSupabaseClient } from '../../../services/supabase/client';
import { sendNotificationToRoles } from '../../../shared/services/notificationService';
import { ITEM2_CALL_TYPES } from '../constants';

const ITEM2_STAFF_ROLE_NAME = '厚生部';

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
  const urgencyLabel = callData.call_type === ITEM2_CALL_TYPES.EMERGENCY ? '緊急' : '不急';
  const requesterName = callData.requester_name || 'ユーザー';
  const locationText = callData.location_text || '場所未入力';
  return `${requesterName}さんから${urgencyLabel}の呼び出しが作成されました。場所: ${locationText}`;
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
        requester_name: callData.requester_name,
        location_text: callData.location_text,
      },
      senderUserId,
    );
  } catch (error) {
    return { notification: null, recipientsCount: 0, error };
  }
};
