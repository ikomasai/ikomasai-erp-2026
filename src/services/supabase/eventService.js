/**
 * 企画マスタサービス
 * 管理部統合システム向けの events 取得を担当
 */

import { getSupabaseClient } from './client.js';

/** 企画マスタテーブル名 */
const EVENTS_TABLE = 'events';
/** 企画取得カラム */
const EVENT_COLUMNS = `
  id,
  name,
  location_id,
  event_organization_id,
  created_at,
  updated_at,
  event_organizations(name),
  event_locations(
    name,
    building_locations(name,display_order)
  )
`;

/**
 * 文字列を前後空白除去して正規化する
 * @param {string|null|undefined} value - 対象文字列
 * @returns {string} 正規化後文字列
 */
const normalizeText = (value) => (typeof value === 'string' ? value : '').trim();

/**
 * 企画の場所表示名を生成する
 * @param {Object} event - 企画レコード
 * @returns {string} 表示用の場所名
 */
const buildEventLocationName = (event) => {
  /** イベント紐付け場所名 */
  const rawLocationName = normalizeText(event?.event_locations?.name);
  /** 建物名 */
  const buildingName = normalizeText(event?.event_locations?.building_locations?.name);

  if (buildingName && rawLocationName && buildingName !== rawLocationName) {
    return `${buildingName} ${rawLocationName}`;
  }

  return buildingName || rawLocationName || '';
};

/**
 * 企画一覧向けの並び順を比較する
 * @param {Object} left - 左側レコード
 * @param {Object} right - 右側レコード
 * @returns {number} 比較結果
 */
export const compareSupportEvents = (left, right) => {
  /** 左側団体名 */
  const leftOrganizationName = normalizeText(left?.organization_name);
  /** 右側団体名 */
  const rightOrganizationName = normalizeText(right?.organization_name);
  /** 団体名比較 */
  const organizationCompare = leftOrganizationName.localeCompare(rightOrganizationName, 'ja');

  if (organizationCompare !== 0) {
    return organizationCompare;
  }

  /** 左側企画名 */
  const leftEventName = normalizeText(left?.event_name || left?.name);
  /** 右側企画名 */
  const rightEventName = normalizeText(right?.event_name || right?.name);
  /** 企画名比較 */
  const eventCompare = leftEventName.localeCompare(rightEventName, 'ja');

  if (eventCompare !== 0) {
    return eventCompare;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''), 'ja');
};

/**
 * 企画レコードを管理部画面表示向けに正規化する
 * @param {Object} event - 企画レコード
 * @returns {Object} 正規化後レコード
 */
const normalizeEventRecord = (event) => {
  /** 企画名 */
  const eventName = normalizeText(event?.name);
  /** 団体名 */
  const organizationName = normalizeText(event?.event_organizations?.name);
  /** 場所表示名 */
  const locationName = buildEventLocationName(event);

  return {
    ...event,
    name: eventName,
    event_name: eventName,
    organization_name: organizationName,
    location_name: locationName,
    event_location: locationName,
    eventName,
    organizationName,
    locationName,
    label: organizationName && eventName ? `${organizationName} / ${eventName}` : organizationName || eventName || '企画未設定',
    sheet_name: '',
  };
};

/**
 * 企画一覧を取得
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=120] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listEvents = async ({ limit = 120 } = {}) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(EVENTS_TABLE)
      .select(EVENT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('企画一覧取得エラー:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(normalizeEventRecord),
      error: null,
    };
  } catch (error) {
    console.error('企画一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 管理部統合システム向けの企画一覧を取得する
 * 本部サポート評価、巡回サポート企画一覧、定常巡回チェックの候補を同じ events から返す
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=200] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const selectSupportEvents = async ({ limit = 200 } = {}) => {
  const { data, error } = await listEvents({ limit });

  if (error) {
    return { data: [], error };
  }

  return {
    data: [...(data || [])]
      .filter((event) => event.organization_name || event.event_name)
      .sort(compareSupportEvents),
    error: null,
  };
};

/**
 * 評価タブ向けの企画一覧を取得
 * 管理部で使う統一企画一覧のうち、events.id (UUID) をそのまま返す
 * @param {Object} params - 取得条件
 * @param {number} [params.limit=200] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const selectEventsForEvaluation = async ({ limit = 200 } = {}) => {
  return selectSupportEvents({ limit });
};
