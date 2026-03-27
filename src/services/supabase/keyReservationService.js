/**
 * 鍵予約サービス
 * key_reservations の登録・取得・承認を担当
 */

import { getSupabaseClient } from './client.js';

const KEY_RESERVATIONS_TABLE = 'key_reservations';
const KEYS_TABLE = 'keys';

const KEY_RESERVATION_COLUMNS =
  'id,reservation_no,key_id,key_code,requested_by,org_id,ticket_id,event_name,event_location,requested_at_text,reason,status,decision_note,approved_by,approved_at,metadata,created_at,updated_at';

const normalizeText = (value) => (value || '').trim();

/** 予約状態 */
export const KEY_RESERVATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELED: 'canceled',
};

const VALID_STATUSES = new Set(Object.values(KEY_RESERVATION_STATUSES));

const resolveKeyIdMap = async (keyCodes) => {
  const normalizedCodes = Array.from(
    new Set((keyCodes || []).map((code) => normalizeText(code)).filter(Boolean))
  );

  if (normalizedCodes.length === 0) {
    return new Map();
  }

  const { data, error } = await getSupabaseClient()
    .from(KEYS_TABLE)
    .select('id,key_code')
    .in('key_code', normalizedCodes);

  if (error) {
    console.error('鍵ID解決エラー:', error);
    return new Map();
  }

  const map = new Map();
  (data || []).forEach((row) => {
    const code = normalizeText(row.key_code);
    if (!code) {
      return;
    }
    map.set(code, row.id);
  });
  return map;
};

/**
 * 鍵予約をまとめて作成
 * @param {Object} input - 入力
 * @param {string} input.requestedBy - 申請者ユーザーID
 * @param {string|null} [input.orgId] - 団体ID
 * @param {string|null} [input.ticketId] - 連絡案件ID
 * @param {string} input.eventName - 企画名
 * @param {string} input.eventLocation - 企画場所
 * @param {string} input.requestedAtText - 希望時刻
 * @param {string} input.reason - 理由
 * @param {Array} input.keyTargets - 対象鍵配列
 * @returns {Promise<{data: Array, error: Error|null}>} 登録結果
 */
export const createKeyReservations = async (input) => {
  try {
    const requestedBy = normalizeText(input.requestedBy);
    const orgId = normalizeText(input.orgId) || null;
    const ticketId = normalizeText(input.ticketId) || null;
    const eventName = normalizeText(input.eventName);
    const eventLocation = normalizeText(input.eventLocation);
    const requestedAtText = normalizeText(input.requestedAtText);
    const reason = normalizeText(input.reason);

    if (!requestedBy) {
      throw new Error('requestedBy が未指定です');
    }
    if (!eventName) {
      throw new Error('eventName が未指定です');
    }
    if (!eventLocation) {
      throw new Error('eventLocation が未指定です');
    }
    /** requestedAtText と reason は任意（事前申請フォームから削除済み） */

    const keyTargets = Array.isArray(input.keyTargets) ? input.keyTargets : [];
    if (keyTargets.length === 0) {
      throw new Error('対象の鍵が未指定です');
    }

    const keyCodeMap = await resolveKeyIdMap(keyTargets.map((item) => item?.keyCode || item?.id));

    const payload = keyTargets
      .map((item) => {
        const keyCode = normalizeText(item?.keyCode || item?.id || item?.name);
        if (!keyCode) {
          return null;
        }
        const keyName = normalizeText(item?.name || item?.displayName || keyCode);
        const building = normalizeText(item?.building);
        const location = normalizeText(item?.location);

        return {
          key_id: keyCodeMap.get(keyCode) || null,
          key_code: keyCode,
          requested_by: requestedBy,
          org_id: orgId,
          ticket_id: ticketId,
          event_name: eventName,
          event_location: eventLocation,
          requested_at_text: requestedAtText,
          reason,
          status: KEY_RESERVATION_STATUSES.PENDING,
          metadata: {
            key_name: keyName,
            building,
            location,
          },
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      throw new Error('対象の鍵情報が不正です');
    }

    const { data, error } = await getSupabaseClient()
      .from(KEY_RESERVATIONS_TABLE)
      .insert(payload)
      .select(KEY_RESERVATION_COLUMNS);

    if (error) {
      console.error('鍵予約登録エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
};

/**
 * 鍵予約一覧を取得
 * @param {Object} params - 取得条件
 * @param {string[]} [params.statuses] - 状態フィルタ
 * @param {number} [params.limit=80] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listKeyReservations = async ({ statuses = [], limit = 80 } = {}) => {
  try {
    let query = getSupabaseClient()
      .from(KEY_RESERVATIONS_TABLE)
      .select(`${KEY_RESERVATION_COLUMNS},keys(key_code,display_name,location_text)`)
      .order('created_at', { ascending: false })
      .limit(limit);

    const normalizedStatuses = Array.isArray(statuses)
      ? statuses.map((status) => normalizeText(status)).filter((status) => VALID_STATUSES.has(status))
      : [];

    if (normalizedStatuses.length > 0) {
      query = query.in('status', normalizedStatuses);
    }

    const { data, error } = await query;
    if (error) {
      console.error('鍵予約一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('鍵予約一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 鍵予約の状態を更新
 * @param {Object} input - 更新内容
 * @param {string} input.reservationId - 予約ID
 * @param {'approved'|'rejected'|'canceled'} input.status - 更新後状態
 * @param {string} [input.decisionNote] - 備考
 * @param {string} [input.approvedBy] - 承認者ユーザーID
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const updateKeyReservationStatus = async (input) => {
  try {
    const reservationId = normalizeText(input.reservationId);
    const status = normalizeText(input.status);
    const decisionNote = normalizeText(input.decisionNote) || null;
    const approvedBy = normalizeText(input.approvedBy) || null;

    if (!reservationId) {
      throw new Error('reservationId が未指定です');
    }
    if (!VALID_STATUSES.has(status) || status === KEY_RESERVATION_STATUSES.PENDING) {
      throw new Error('更新対象の status が不正です');
    }

    const payload = {
      status,
      decision_note: decisionNote,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    };

    const { data, error } = await getSupabaseClient()
      .from(KEY_RESERVATIONS_TABLE)
      .update(payload)
      .eq('id', reservationId)
      .select(KEY_RESERVATION_COLUMNS)
      .single();

    if (error) {
      console.error('鍵予約更新エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
