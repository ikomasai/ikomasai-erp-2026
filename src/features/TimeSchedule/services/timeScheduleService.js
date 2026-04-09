/**
 * TimeSchedule サービス
 * TimeSchedule 画面向けにエリア・開催スロット・表示タイムラインを取得する
 */

import { getSupabaseClient } from '../../../services/supabase/client';

/** 建物テーブル名 */
const BUILDING_LOCATIONS_TABLE = 'building_locations';
/** エリアテーブル名 */
const AREA_LOCATIONS_TABLE = 'area_locations';
/** 企画運営団体テーブル名 */
const EVENT_ORGANIZATIONS_TABLE = 'event_organizations';
/** 企画カテゴリテーブル名 */
const EVENT_CATEGORIES_TABLE = 'event_categorys';
/** 企画テーブル名 */
const EVENTS_TABLE = 'events';

/** 運用開始時刻（分） */
const OPERATION_START_MINUTES = 9 * 60;
/** 運用終了時刻（分） */
const OPERATION_END_MINUTES = 20 * 60; // 終了時刻を20時までに設定
/** 15分刻み */
const TIME_SLOT_INTERVAL_MINUTES = 15;

/** アイテム種別 */
const ITEM_TYPES = {
  EVENTS: 'EVENTS',
};

/** events 取得時の優先 select 句 */
const EVENT_SELECT_PRIMARY =
  'id,name,name_kana,description,schedule_dates,schedule_start_times,schedule_end_times,schedule_entry_start_times,schedule_entry_labels,schedule_exit_end_times,schedule_exit_labels,image_path,category_id,event_organization_id,location_id,event_locations(name,building_id,building_locations(name,area_id)),event_organizations(name,name_kana)';

/** events 取得時のフォールバック select 句 */
const EVENT_SELECT_FALLBACK =
  'id,name,description,schedule_dates,schedule_start_times,schedule_end_times,schedule_entry_start_times,schedule_entry_labels,schedule_exit_end_times,schedule_exit_labels,start_time,end_time,image_path,category_id,event_organization_id,location_id,event_locations(name,building_id,building_locations(name,area_id)),event_organizations(name,name_kana)';

/** events の最終フォールバック select 句 */
const EVENT_SELECT_LAST_RESORT = 'id,name,description,image_path,category_id,event_organization_id,location_id,schedule_dates,schedule_start_times,schedule_end_times,schedule_entry_start_times,schedule_entry_labels,schedule_exit_end_times,schedule_exit_labels,start_time,end_time';

/** 文字列日付の妥当性パターン */
const SCHEDULE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** 建物名のデフォルト表示順 */
const DEFAULT_BUILDING_NAME_ORDER = [
  '11月ホール',
  '実学ホール',
  '記念会館',
  '人工芝グラウンド',
  'その他',
];

/**
 * 時刻文字列を分に変換する
 * @param {string|null} timeText - HH:mm または HH:mm:ss
 * @returns {number|null} 分（0-1439）
 */
const parseTimeTextToMinutes = (timeText) => {
  /** 元値が空の場合は null */
  if (!timeText) {
    return null;
  }

  /** 時刻パーツ */
  const parts = String(timeText).split(':');
  /** 時 */
  const hour = Number(parts[0]);
  /** 分 */
  const minute = Number(parts[1]);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
};

/**
 * 分を HH:mm へ変換する
 * @param {number} minutes - 分
 * @returns {string} HH:mm
 */
const formatMinutesToHm = (minutes) => {
  /** 時 */
  const hour = Math.floor(minutes / 60);
  /** 分 */
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * 日付文字列を YYYY-MM-DD に正規化する
 * @param {string|Date} scheduleDate - 日付
 * @returns {string} YYYY-MM-DD
 */
const normalizeScheduleDate = (scheduleDate) => {
  if (scheduleDate instanceof Date) {
    /** 年 */
    const year = scheduleDate.getFullYear();
    /** 月 */
    const month = String(scheduleDate.getMonth() + 1).padStart(2, '0');
    /** 日 */
    const day = String(scheduleDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** 文字列化した日付 */
  const normalized = String(scheduleDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('scheduleDate は YYYY-MM-DD 形式で指定してください');
  }
  return normalized;
};

/**
 * 参照ID配列を重複なし配列に変換する
 * @param {Array<string>} values - ID配列
 * @returns {Array<string>} 重複なし配列
 */
const uniqStringArray = (values) => {
  /** 正規化したID一覧 */
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(normalizedValues));
};

/**
 * select エラーがスキーマ差分起因か判定する
 * @param {Object|null} error - Supabaseエラー
 * @returns {boolean} フォールバック実行可否
 */
const shouldFallbackSelect = (error) => {
  /** エラーメッセージ */
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('column') ||
    message.includes('relationship') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
};

/**
 * 対象エラーが「列不存在」かを判定する
 * @param {Object|null} error - Supabaseエラー
 * @returns {boolean} 列不存在エラーか
 */
const isMissingColumnError = (error) => {
  /** エラーメッセージ */
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
};

/**
 * 日付配列を昇順に並べる
 * @param {Array<string>} dates - 日付配列
 * @returns {Array<string>} 昇順日付配列
 */
const sortScheduleDates = (dates) => {
  return uniqStringArray(dates).filter((date) => SCHEDULE_DATE_PATTERN.test(date)).sort((left, right) => left.localeCompare(right));
};

/**
 * 要求日付を利用可能日付へ解決する
 * @param {Object} params - パラメータ
 * @param {string} params.requestedDate - 要求日付
 * @param {Array<string>} params.availableDates - 利用可能日付
 * @returns {string} 解決済み日付
 */
const resolveScheduleDate = ({ requestedDate, availableDates }) => {
  /** 正規化した利用可能日付配列 */
  const sortedDates = sortScheduleDates(availableDates);
  if (sortedDates.length === 0) {
    return requestedDate;
  }
  if (sortedDates.includes(requestedDate)) {
    return requestedDate;
  }

  /** 要求日付より小さい日付群 */
  const lowerDates = sortedDates.filter((date) => date < requestedDate);
  if (lowerDates.length > 0) {
    return lowerDates[lowerDates.length - 1];
  }
  return sortedDates[0];
};

/**
 * 複数 select 句を順に試して取得する
 * @param {Object} params - パラメータ
 * @param {string} params.tableName - テーブル名
 * @param {Array<string>} params.selectCandidates - select 句候補
 * @param {(query: Object) => Object} [params.applyFilters] - クエリへ絞り込みを適用する関数
 * @returns {Promise<Array<Object>>} 取得結果
 */
const selectRowsWithCandidates = async ({ tableName, selectCandidates, applyFilters = null }) => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();
  /** 最後のエラー */
  let lastError = null;

  for (const selectText of selectCandidates) {
    /** ベースクエリ */
    let query = supabase.from(tableName).select(selectText);
    if (applyFilters) {
      query = applyFilters(query);
    }

    /** 実行結果 */
    const { data, error } = await query;
    if (!error) {
      return data || [];
    }

    lastError = error;
    if (!shouldFallbackSelect(error)) {
      break;
    }
  }

  throw new Error(`${tableName} の取得に失敗しました: ${lastError?.message || 'unknown error'}`);
};


/**
 * 公開済みデータを複数 select 候補で取得する
 * @param {Object} params - パラメータ
 * @param {string} params.tableName - テーブル名
 * @param {string} params.idColumn - IDカラム名
 * @param {Array<string>} params.ids - 取得対象ID配列
 * @param {Array<string>} params.selectCandidates - select句候補
 * @returns {Promise<Array<Object>>} 取得結果
 */
const selectPublishedRowsByIdsWithCandidates = async ({ tableName, idColumn, ids, selectCandidates }) => {
  try {
    /** is_published 列がある前提で取得 */
    const rows = await selectRowsWithCandidates({
      tableName,
      selectCandidates,
      applyFilters: (query) => query.in(idColumn, ids).eq('is_published', true),
    });
    return rows;
  } catch (error) {
    /**
     * 環境によって is_published 列が存在しない場合があるため、
     * そのケースのみ公開フラグ条件なしで再試行する。
     */
    const missingPublishedColumn =
      isMissingColumnError({ message: error?.message }) &&
      String(error?.message || '').toLowerCase().includes('is_published');

    if (!missingPublishedColumn) {
      throw error;
    }

    const rows = await selectRowsWithCandidates({
      tableName,
      selectCandidates,
      applyFilters: (query) => query.in(idColumn, ids),
    });
    return rows;
  }
};

/**
  * 企画の全開催時間スロットを生成する
  * @param {Object} event - イベント詳細
  * @returns {Array<Object>} スロット配列
  */
 const expandEventToSlots = (event) => {
   if (!event || !Array.isArray(event.schedule_dates)) {
     return [];
   }
 
   return event.schedule_dates.map((date, index) => {
     /** 開始時刻 */
     const startTime = (event.schedule_start_times && event.schedule_start_times[index]) || null;
     /** 終了時刻 */
     const endTime = (event.schedule_end_times && event.schedule_end_times[index]) || null;
 
     if (!date || !startTime || !endTime) {
       return null;
     }
 
     return {
       id: `${event.id}_${index}`,
       source_id: String(event.id),
       schedule_date: date,
       start_time: startTime,
       end_time: endTime,
       // オプション時間
       entry_start_time: (event.schedule_entry_start_times && event.schedule_entry_start_times[index]) || null,
       entry_label: (event.schedule_entry_labels && event.schedule_entry_labels[index]) || null,
       exit_end_time: (event.schedule_exit_end_times && event.schedule_exit_end_times[index]) || null,
       exit_label: (event.schedule_exit_labels && event.schedule_exit_labels[index]) || null,
       source_type: 'event',
       source_detail: event,
     };
   }).filter(Boolean);
 };

/**
 * 運用時間の15分スロットを作成する
 * @returns {Array<{key: string, minutes: number, label: string}>} タイムラインの時刻配列
 */
const buildOperationTimeSlots = () => {
  /** 時刻スロット一覧 */
  const slots = [];
  for (
    let currentMinutes = OPERATION_START_MINUTES;
    currentMinutes <= OPERATION_END_MINUTES;
    currentMinutes += TIME_SLOT_INTERVAL_MINUTES
  ) {
    slots.push({
      key: String(currentMinutes),
      minutes: currentMinutes,
      label: formatMinutesToHm(currentMinutes),
    });
  }
  return slots;
};

/**
 * イベント詳細を取得する
 * @param {Array<string>} eventIds - イベントID配列
 * @returns {Promise<Map<string, Object>>} ID -> イベント詳細
 */
const selectEventDetailsByIds = async (eventIds) => {
  /** 正規化したイベントID配列 */
  const normalizedEventIds = uniqStringArray(eventIds);
  if (normalizedEventIds.length === 0) {
    return new Map();
  }

  /** イベント詳細取得結果 */
  const data = await selectPublishedRowsByIdsWithCandidates({
    tableName: EVENTS_TABLE,
    idColumn: 'id',
    ids: normalizedEventIds,
    selectCandidates: [EVENT_SELECT_PRIMARY, EVENT_SELECT_FALLBACK, EVENT_SELECT_LAST_RESORT],
  });

  /** イベント詳細Map */
  const eventMap = new Map();
  (data || []).forEach((row) => {
    eventMap.set(String(row.id), row);
  });
  return eventMap;
};


/**
 * エリアマスタ一覧を取得する
 * @returns {Promise<Array<Object>>} エリア一覧
 */
const selectAreaLocations = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();

  /** エリア一覧取得（display_order または名前順） */
  const { data, error } = await supabase
    .from(AREA_LOCATIONS_TABLE)
    .select('id,name,name_kana,display_order')
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`area_locations の取得に失敗しました: ${error.message}`);
  }

  /** 正規化済みエリア一覧 */
  const normalizedRows = (data || []).map((row, index) => ({
    area_id: String(row.id || ''),
    area_name: String(row.name || ''),
    area_name_kana: String(row.name_kana || ''),
    display_order: Number.isFinite(Number(row.display_order))
      ? Number(row.display_order)
      : index + 1,
  }));

  return normalizedRows.sort((left, right) => {
    if (left.display_order !== right.display_order) {
      return left.display_order - right.display_order;
    }
    return String(left.area_name || '').localeCompare(String(right.area_name || ''), 'ja', { numeric: true });
  });
};

/**
 * 建物マスタ一覧を取得する
 * @returns {Promise<Array<Object>>} 建物一覧
 */
const selectBuildingLocations = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();
  /** 候補クエリ */
  const queryCandidates = [
    () =>
      supabase
        .from(BUILDING_LOCATIONS_TABLE)
        .select('id,name,name_kana,display_order')
        .order('display_order', { ascending: true }),
    () => supabase.from(BUILDING_LOCATIONS_TABLE).select('id,name,name_kana').order('name', { ascending: true }),
    () => supabase.from(BUILDING_LOCATIONS_TABLE).select('id,name').order('name', { ascending: true }),
  ];

  /** 最後のエラー */
  let lastError = null;
  for (const buildQuery of queryCandidates) {
    /** 建物一覧取得結果 */
    const { data, error } = await buildQuery();
    if (!error) {
      /** 正規化済み建物一覧 */
      const normalizedRows = (data || []).map((row, index) => ({
        building_id: String(row.id || ''),
        building_name: String(row.name || ''),
        building_name_kana: String(row.name_kana || ''),
        display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : index + 1,
      }));

      /** 建物名の優先順を取得 */
      const getDefaultOrder = (buildingName) => {
        const orderIndex = DEFAULT_BUILDING_NAME_ORDER.indexOf(String(buildingName || '').trim());
        return orderIndex === -1 ? Number.MAX_SAFE_INTEGER : orderIndex;
      };

      return normalizedRows.sort((left, right) => {
        if (left.display_order !== right.display_order) {
          return left.display_order - right.display_order;
        }

        const leftDefaultOrder = getDefaultOrder(left.building_name);
        const rightDefaultOrder = getDefaultOrder(right.building_name);
        if (leftDefaultOrder !== rightDefaultOrder) {
          return leftDefaultOrder - rightDefaultOrder;
        }

        return left.building_name.localeCompare(right.building_name, 'ja', { numeric: true });
      });
    }

    lastError = error;
    if (!shouldFallbackSelect(error)) {
      break;
    }
  }

  throw new Error(`building_locations の取得に失敗しました: ${lastError?.message || 'unknown error'}`);
};

/**
 * 企画運営団体マスタ一覧を取得する
 * @returns {Promise<Array<Object>>} 団体一覧
 */
const selectEventOrganizations = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();
  /** 候補クエリ */
  const queryCandidates = [
    () =>
      supabase
        .from(EVENT_ORGANIZATIONS_TABLE)
        .select('id,name,name_kana')
        .order('name', { ascending: true }),
    () => supabase.from(EVENT_ORGANIZATIONS_TABLE).select('id,name').order('name', { ascending: true }),
  ];

  /** 最後のエラー */
  let lastError = null;
  for (const buildQuery of queryCandidates) {
    /** 団体一覧取得結果 */
    const { data, error } = await buildQuery();
    if (!error) {
      /** 正規化済み団体一覧 */
      const normalizedRows = (data || [])
        .map((row, index) => ({
          group_id: String(row.id || '').trim(),
          group_name: String(row.name || '').trim(),
          group_name_kana: String(row.name_kana || '').trim(),
          display_order: index + 1,
        }))
        .filter((row) => Boolean(row.group_id) && Boolean(row.group_name));

      return normalizedRows.sort((left, right) => {
        /** 左かな名 */
        const leftKana = String(left.group_name_kana || '').trim();
        /** 右かな名 */
        const rightKana = String(right.group_name_kana || '').trim();
        if (leftKana && rightKana) {
          const kanaCompareResult = leftKana.localeCompare(rightKana, 'ja', { numeric: true });
          if (kanaCompareResult !== 0) {
            return kanaCompareResult;
          }
        } else if (leftKana || rightKana) {
          return leftKana ? -1 : 1;
        }

        return String(left.group_name || '').localeCompare(String(right.group_name || ''), 'ja', { numeric: true });
      });
    }

    lastError = error;
    if (!shouldFallbackSelect(error)) {
      break;
    }
  }

  throw new Error(`event_organizations の取得に失敗しました: ${lastError?.message || 'unknown error'}`);
};

/**
 * 利用可能な開催日一覧を企画テーブルから取得する
 * @returns {Promise<Array<string>>} 開催日一覧（YYYY-MM-DD）
 */
const selectAvailableScheduleDates = async () => {
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();

  /** 全企画の開催日配列を取得 */
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select('schedule_dates')
    .eq('is_published', true)
    .not('schedule_dates', 'is', null);

  if (error) {
    throw new Error(`利用可能な開催日の取得に失敗しました: ${error.message}`);
  }

  /** フラット化してユニークな日付リストを作成 */
  const allDates = (data || []).flatMap((row) => row.schedule_dates || []);
  return sortScheduleDates([...new Set(allDates)]);
};

/**
 * 日付条件で開催スロットを取得する (eventsテーブルから展開)
 * @param {Object} params - パラメータ
 * @param {string|Date} params.scheduleDate - 取得対象日
 * @returns {Promise<Array<Object>>} スロット一覧
 */
const selectEventScheduleSlots = async ({ scheduleDate }) => {
  /** 正規化した日付 */
  const normalizedDate = normalizeScheduleDate(scheduleDate);
  /** Supabaseクライアント */
  const supabase = getSupabaseClient();

  /** 対象日付が含まれる企画を取得 */
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select(EVENT_SELECT_PRIMARY)
    .eq('is_published', true)
    .contains('schedule_dates', [normalizedDate]);

  if (error) {
    throw new Error(`スロット情報の取得に失敗しました: ${error.message}`);
  }

  /** 各企画から対象日のスロットを展開 */
  const slots = (data || []).flatMap((event) => {
    return expandEventToSlots(event).filter((s) => s.schedule_date === normalizedDate);
  });

  return slots.sort((left, right) => {
    const leftMin = parseTimeTextToMinutes(left.start_time) || 0;
    const rightMin = parseTimeTextToMinutes(right.start_time) || 0;
    return leftMin - rightMin;
  });
};

/**
 * スロットにイベント詳細を結合する
 * @param {Array<Object>} slots - スロット一覧
 * @param {Array<Object>} areaLocations - エリア一覧
 * @returns {Promise<Array<Object>>} 詳細付きスロット
 */
const attachSourceDetailsToSlots = async (slots, areaLocations = []) => {
  /** event ソースID一覧 */
  const eventIds = uniqStringArray(
    (slots || []).filter((slot) => slot.source_type === 'event').map((slot) => slot.source_id)
  );

  /** イベント詳細Map */
  let eventMap = new Map();
  /** 企画カテゴリ名Map（category_id -> category_name） */
  let eventCategoryNameMap = new Map();
  /** イベント取得エラー */
  let eventError = null;

  try {
    eventMap = await selectEventDetailsByIds(eventIds);
  } catch (error) {
    eventError = error;
    console.warn('[TimeSchedule] events詳細取得に失敗:', error?.message || error);
  }

  if (eventError) {
    throw new Error(`events の詳細取得に失敗しました: ${eventError?.message || 'unknown'}`);
  }

  /** 取得対象カテゴリID一覧 */
  const categoryIds = uniqStringArray(
    Array.from(eventMap.values()).map((eventDetail) => String(eventDetail?.category_id || '').trim())
  );
  if (categoryIds.length > 0) {
    /** Supabaseクライアント */
    const supabase = getSupabaseClient();
    /** カテゴリ取得 */
    const { data: categoryData } = await supabase.from(EVENT_CATEGORIES_TABLE).select('id,name');
    if (categoryData) {
      eventCategoryNameMap = new Map(
        categoryData.map((row) => [String(row.id).trim(), String(row.name).trim()])
      );
    }
  }

  return (slots || [])
    .map((slot) => {
      /** 参照元タイプ */
      const sourceType = slot.source_type || 'event';
      if (sourceType !== 'event') {
        return null;
      }
      const sourceId = slot.source_id;
      const sourceDetail = eventMap.get(sourceId) || {};
      const startMinutes = parseTimeTextToMinutes(slot.start_time) || 0;
      const endMinutes = parseTimeTextToMinutes(slot.end_time) || 0;
      const entryStartMinutes = parseTimeTextToMinutes(slot.entry_start_time);
      const exitEndMinutes = parseTimeTextToMinutes(slot.exit_end_time);

      /** 詳細付きスロットオブジェクトを生成 */
      return {
        ...slot,
        source_type: sourceType,
        source_id: sourceId,
        source_detail: sourceDetail,
        itemType: ITEM_TYPES.EVENTS,
        displayName: sourceDetail.name || '',
        startMinutes,
        endMinutes,
        entryStartMinutes,
        exitEndMinutes,
        schedule_date: slot.schedule_date || null,
        schedule_dates: sourceDetail.schedule_dates || [],
        schedule_start_times: sourceDetail.schedule_start_times || [],
        schedule_end_times: sourceDetail.schedule_end_times || [],
        schedule_entry_labels: sourceDetail.schedule_entry_labels || [],
        schedule_entry_start_times: sourceDetail.schedule_entry_start_times || [],
        schedule_exit_labels: sourceDetail.schedule_exit_labels || [],
        schedule_exit_end_times: sourceDetail.schedule_exit_end_times || [],
        groupName: sourceDetail.event_organizations?.name || '',
        groupNameKana: sourceDetail.event_organizations?.name_kana || '',
        categoryId: String(sourceDetail.category_id || '').trim(),
        categoryName:
          eventCategoryNameMap.get(String(sourceDetail.category_id || '').trim()) ||
          String(sourceDetail.category_id || '').trim() ||
          '未設定',
        locationName: sourceDetail.event_locations?.name || '',
        buildingLocationId: String(sourceDetail.event_locations?.building_id || ''),
        buildingLocationName: sourceDetail.event_locations?.building_locations?.name || '',
        areaId:
          slot.area_id ||
          sourceDetail.event_locations?.building_locations?.area_id ||
          '',
        description: sourceDetail.description || '',
      };
    })
    .filter(Boolean);
};

/**
 * 詳細付きスロットを15分タイムラインへ投影する
 * @param {Array<Object>} detailedSlots - 詳細付きスロット
 * @param {Array<string>} selectedBuildingIds - 選択中建物ID
 * @returns {Array<Object>} タイムライン行一覧
 */
const buildTimeScheduleTimeline = (detailedSlots, selectedBuildingIds = []) => {
  /** 運用時間の時刻スロット */
  const operationSlots = buildOperationTimeSlots();
  /** 正規化した建物ID */
  const normalizedSelectedBuildingIds = uniqStringArray(selectedBuildingIds);
  /** 表示対象スロット */
  const visibleSlots = (detailedSlots || []).filter((slot) => {
    if (normalizedSelectedBuildingIds.length === 0) {
      return true;
    }
    return normalizedSelectedBuildingIds.includes(String(slot.buildingLocationId || ''));
  });

  return operationSlots.map((timeSlot) => {
    /** 該当時刻に開催中のスロット一覧 */
    const runningItems = visibleSlots
      .filter((slot) => slot.startMinutes <= timeSlot.minutes && timeSlot.minutes < slot.endMinutes)
      .sort((a, b) => {
        if (a.startMinutes !== b.startMinutes) {
          return a.startMinutes - b.startMinutes;
        }
        return (a.displayName || '').localeCompare(b.displayName || '', 'ja', { numeric: true });
      })
      .map((slot) => {
        /** 次のスロット時刻 */
        const nextMinutes = timeSlot.minutes + TIME_SLOT_INTERVAL_MINUTES;
        return {
          ...slot,
          segmentKey: `${slot.source_type}-${slot.source_id}-${slot.startMinutes}-${slot.endMinutes}`,
          isContinuedFromPreviousSlot: slot.startMinutes < timeSlot.minutes,
          isContinuedToNextSlot: nextMinutes < slot.endMinutes,
        };
      });

    return {
      key: timeSlot.key,
      time: timeSlot.label,
      minutes: timeSlot.minutes,
      items: runningItems,
    };
  });
};

/**
 * TimeSchedule 表示に必要なデータ一式を取得する
 * @param {Object} params - パラメータ
 * @param {string|Date} params.scheduleDate - 取得対象日
 * @param {Array<string>} [params.buildingIds] - 建物ID絞り込み
 * @returns {Promise<{areas:Array<Object>, areaLocations:Array<Object>, eventOrganizations:Array<Object>, slots:Array<Object>, timeline:Array<Object>, availableDates:Array<string>, resolvedScheduleDate:string}>} 表示データ
 */
const selectTimeScheduleTimeline = async ({ scheduleDate, buildingIds = [] }) => {
  /** 利用可能な開催日 */
  const availableDates = await selectAvailableScheduleDates();
  /** 要求日付 */
  const requestedDate = normalizeScheduleDate(scheduleDate);
  /** 実際に取得する日付 */
  const resolvedScheduleDate = resolveScheduleDate({ requestedDate, availableDates });

  /** 建物一覧 */
  const areas = await selectBuildingLocations();
  /** エリア一覧 */
  const areaLocations = await selectAreaLocations();
  /** 団体一覧 */
  const eventOrganizations = await selectEventOrganizations();
  /** スロット一覧 */
  const slots = await selectEventScheduleSlots({ scheduleDate: resolvedScheduleDate });
  /** 詳細付きスロット */
  const detailedSlots = await attachSourceDetailsToSlots(slots, areaLocations);
  /** タイムライン */
  const timeline = buildTimeScheduleTimeline(detailedSlots, buildingIds);

  return {
    areas,
    areaLocations,
    eventOrganizations,
    slots: detailedSlots,
    timeline,
    availableDates,
    resolvedScheduleDate,
  };
};

export const timeScheduleService = {
  selectAreaLocations,
  selectBuildingLocations,
  selectEventOrganizations,
  selectAvailableScheduleDates,
  selectEventScheduleSlots,
  selectTimeScheduleTimeline,
};
