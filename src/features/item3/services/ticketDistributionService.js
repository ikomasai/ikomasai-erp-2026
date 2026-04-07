/**
 * 配布率確認システムのデータ取得サービス
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import {
  DISTRIBUTION_TYPES,
  STATUS_LABELS,
} from '../constants';

/**
 * 呼び出し状態のキーを生成する
 * @param {string} eventId - 企画ID
 * @param {string} eventDateId - 開催日ID
 * @returns {string} 連結キー
 */
const createCallStatusKey = (eventId, eventDateId) => {
  /** 呼び出し状態のキー */
  const callStatusKey = `${eventId}_${eventDateId}`;

  return callStatusKey;
};

/**
 * 呼び出し状態をマップに変換する
 * @param {Array<Object>} callStatusList - 呼び出し状態配列
 * @returns {Object} 呼び出し状態マップ
 */
const createCallStatusMap = (callStatusList) => {
  /** 呼び出し状態のマップ */
  const callStatusMap = {};

  callStatusList.forEach((callStatus) => {
    /** 連結キー */
    const callStatusKey = createCallStatusKey(
      callStatus.event_id,
      callStatus.event_date_id
    );

    callStatusMap[callStatusKey] = callStatus;
  });

  return callStatusMap;
};

/**
 * 票券グループ一覧をイベント開催日ごとに集計する
 * @param {Array<Object>} ticketList - 票券一覧
 * @returns {Object} 開催日IDごとのグループ配列
 */
const selectTicketGroupsForCall = (ticketList) => {
  /** グループ集計マップ */
  const ticketGroupMap = {};

  (ticketList || []).forEach((ticket) => {
    /** 開催日ID */
    const eventDateId = ticket.event_date_id;
    /** グループ番号 */
    const groupNumber = ticket.group_number;
    /** 整理番号 */
    const ticketNumber = ticket.ticket_number ?? 0;

    if (!eventDateId || !groupNumber) {
      return;
    }

    /** グループキー */
    const groupKey = `${eventDateId}_${groupNumber}`;

    if (!ticketGroupMap[groupKey]) {
      ticketGroupMap[groupKey] = {
        eventDateId,
        groupNumber,
        minTicket: ticketNumber,
        maxTicket: ticketNumber,
        count: 1,
      };
      return;
    }

    ticketGroupMap[groupKey].minTicket = Math.min(
      ticketGroupMap[groupKey].minTicket,
      ticketNumber
    );
    ticketGroupMap[groupKey].maxTicket = Math.max(
      ticketGroupMap[groupKey].maxTicket,
      ticketNumber
    );
    ticketGroupMap[groupKey].count += 1;
  });

  /** 開催日ごとのグループ一覧 */
  const eventDateGroupMap = {};

  Object.values(ticketGroupMap).forEach((group) => {
    if (!eventDateGroupMap[group.eventDateId]) {
      eventDateGroupMap[group.eventDateId] = [];
    }

    eventDateGroupMap[group.eventDateId].push({
      group_number: group.groupNumber,
      min_ticket: group.minTicket,
      max_ticket: group.maxTicket,
      count: group.count,
    });
  });

  return eventDateGroupMap;
};

/**
 * 推定待ち時間を計算する
 * @param {Object} params - パラメータ
 * @param {Array<Object>} params.ticketGroups - グループ一覧
 * @param {number} params.currentCallNumber - 現在の呼び出し番号
 * @param {number} params.estimatedWaitMinutes - 1グループあたり待ち時間(分)
 * @returns {Object} 待ち時間情報
 */
const calculateEstimatedWaitTime = ({
  ticketGroups,
  currentCallNumber,
  estimatedWaitMinutes,
}) => {
  /** 待ちグループ数 */
  const waitingGroupCount = (ticketGroups || []).filter(
    (group) => group.min_ticket > currentCallNumber
  ).length;

  /** 推定待ち時間 */
  const totalEstimatedWaitMinutes = waitingGroupCount <= 0
    ? 0
    : waitingGroupCount * estimatedWaitMinutes;

  return {
    waitingGroupCount,
    totalEstimatedWaitMinutes,
  };
};

/**
 * 順次案内制の表示データを生成する
 * @param {Object} params - パラメータ
 * @param {Object} params.event - 企画情報
 * @param {Object} params.eventDate - 開催日情報
 * @param {Object} [params.callStatus] - 呼び出し状態
 * @param {Array<Object>} params.ticketGroups - チケットグループ一覧
 * @returns {Object} 表示データ
 */
const createSequentialData = ({ event, eventDate, callStatus, ticketGroups }) => {
  /** 現在の呼び出し番号 */
  const currentCallNumber = callStatus?.current_call_number ?? 0;
  /** 次の整理番号 */
  const nextTicketNumber = eventDate?.next_ticket_number ?? 1;
  /** 最後尾番号 */
  const lastTicketNumber = Math.max(nextTicketNumber - 1, 0);
  /** 1グループあたり待ち時間 */
  const estimatedWaitPerNumber = event?.estimated_wait_minutes ?? 0;
  /** 待ち時間情報 */
  const waitInfo = calculateEstimatedWaitTime({
    ticketGroups,
    currentCallNumber,
    estimatedWaitMinutes: estimatedWaitPerNumber,
  });
  /** 待ちグループ数 */
  const waitingCount = waitInfo.waitingGroupCount;
  /** 推定待ち時間 */
  const estimatedWaitMinutes = waitInfo.totalEstimatedWaitMinutes;

  return {
    currentCallNumber,
    lastTicketNumber,
    waitingCount,
    estimatedWaitMinutes,
    estimatedWaitPerNumber,
  };
};

/**
 * 時間枠定員制の表示データを生成する
 * @param {Object} params - パラメータ
 * @param {Object} params.event - 企画情報
 * @param {Object} params.timeSlot - 時間枠情報
 * @returns {Object} 表示データ
 */
const createTimeSlotData = ({ event, timeSlot }) => {
  /** 定員 */
  const capacityPerSlot = event?.capacity_per_slot ?? 0;
  /** 発券済み数 */
  const currentCount = timeSlot?.current_count ?? 0;
  /** 残り枠数 */
  const remainingCount = Math.max(capacityPerSlot - currentCount, 0);
  /** 受付終了フラグ */
  const isClosed = remainingCount === 0 || timeSlot?.status === 'full';

  return {
    id: timeSlot?.id,
    startTime: timeSlot?.start_time,
    endTime: timeSlot?.end_time,
    status: timeSlot?.status,
    statusLabel: STATUS_LABELS[timeSlot?.status] || '未設定',
    currentCount,
    capacityPerSlot,
    remainingCount,
    isClosed,
  };
};

/**
 * 配布状況一覧を取得する
 * @returns {Promise<Array<Object>>} 配布状況一覧
 */
export const selectTicketDistributions = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();

  /** 企画一覧取得結果 */
  const { data: eventList, error: eventError } = await supabase
    .from('events_numbered_ticket')
    .select(
      `
      id,
      name,
      location,
      type,
      capacity_per_slot,
      estimated_wait_minutes
    `
    )
    .order('name', { ascending: true });

  if (eventError) {
    throw eventError;
  }

  /** 企画ID一覧 */
  const eventIdList = (eventList || [])
    .map((event) => event.id)
    .filter(Boolean);

  /** 開催日一覧 */
  const { data: eventDateList, error: eventDateError } = eventIdList.length
    ? await supabase
        .from('event_dates')
        .select(
          `
          id,
          event_id,
          date,
          status,
          next_ticket_number,
          updated_at
        `
        )
        .in('event_id', eventIdList)
    : { data: [], error: null };

  if (eventDateError) {
    throw eventDateError;
  }

  /** 開催日マップ */
  const eventDateMap = {};

  (eventDateList || []).forEach((eventDate) => {
    if (!eventDateMap[eventDate.event_id]) {
      eventDateMap[eventDate.event_id] = [];
    }

    eventDateMap[eventDate.event_id].push(eventDate);
  });

  /** 開催日ID一覧 */
  const eventDateIdList = (eventDateList || [])
    .map((eventDate) => eventDate.id)
    .filter(Boolean);

  /** 時間枠一覧 */
  const { data: timeSlotList, error: timeSlotError } = eventDateIdList.length
    ? await supabase
        .from('time_slots')
        .select(
          `
          id,
          event_date_id,
          start_time,
          end_time,
          status,
          current_count,
          updated_at
        `
        )
        .in('event_date_id', eventDateIdList)
    : { data: [], error: null };

  if (timeSlotError) {
    throw timeSlotError;
  }

  /** 時間枠マップ */
  const timeSlotMap = {};

  (timeSlotList || []).forEach((timeSlot) => {
    if (!timeSlotMap[timeSlot.event_date_id]) {
      timeSlotMap[timeSlot.event_date_id] = [];
    }

    timeSlotMap[timeSlot.event_date_id].push(timeSlot);
  });

  /** 呼び出し状態一覧 */
  const { data: callStatusList, error: callStatusError } = eventDateIdList.length
    ? await supabase
        .from('call_status')
        .select(
          `
          event_id,
          event_date_id,
          current_call_number,
          updated_at
        `
        )
        .in('event_date_id', eventDateIdList)
    : { data: [], error: null };

  if (callStatusError) {
    throw callStatusError;
  }

  /** 呼び出し状態マップ */
  const callStatusMap = createCallStatusMap(callStatusList || []);

  /** チケット一覧 */
  const { data: ticketList, error: ticketError } = eventDateIdList.length
    ? await supabase
        .from('tickets')
        .select(
          `
          event_date_id,
          group_number,
          ticket_number
        `
        )
        .in('event_date_id', eventDateIdList)
        .gt('group_number', 0)
    : { data: [], error: null };

  if (ticketError) {
    throw ticketError;
  }

  /** 開催日ごとのチケットグループマップ */
  const ticketGroupMap = selectTicketGroupsForCall(ticketList || []);

  /** 配布状況一覧 */
  const distributionList = (eventList || []).flatMap((event) => {
    /** 開催日一覧 */
    const eventDateList = (eventDateMap[event.id] || [])
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return eventDateList.map((eventDate) => {
      /** 呼び出し状態キー */
      const callStatusKey = createCallStatusKey(event.id, eventDate.id);
      /** 呼び出し状態 */
      const callStatus = callStatusMap[callStatusKey];
      /** 共通情報 */
      const baseInfo = {
        eventId: event.id,
        eventName: event.name,
        location: event.location,
        type: event.type,
        eventDateId: eventDate.id,
        date: eventDate.date,
        status: eventDate.status,
        statusLabel: STATUS_LABELS[eventDate.status] || '未設定',
        updatedAt: eventDate.updated_at,
      };

      if (event.type === DISTRIBUTION_TYPES.SEQUENTIAL) {
        /** チケットグループ一覧 */
        const ticketGroups = ticketGroupMap[eventDate.id] || [];
        /** 順次案内制情報 */
        const sequentialData = createSequentialData({
          event,
          eventDate,
          callStatus,
          ticketGroups,
        });

        return {
          ...baseInfo,
          sequential: sequentialData,
          timeSlots: [],
        };
      }

      /** 時間枠一覧 */
      const timeSlotList = (timeSlotMap[eventDate.id] || [])
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        .map((timeSlot) => createTimeSlotData({ event, timeSlot }));

      return {
        ...baseInfo,
        sequential: null,
        timeSlots: timeSlotList,
      };
    });
  });

  return distributionList;
};
