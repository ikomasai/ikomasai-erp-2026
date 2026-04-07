/**
 * 鍵マスタサービス
 * keys テーブルの取得・同期を担当
 */

import { getSupabaseClient } from './client.js';

const KEYS_TABLE = 'keys';

/** 取得するカラム一覧（building/classroom_name は専用カラムから取得） */
const KEY_COLUMNS =
  'id,key_code,display_name,location_id,location_text,building,classroom_name,is_active,metadata,created_at,updated_at';

const normalizeText = (value) => (value || '').trim();

/**
 * カタログアイテムをDBレコード形式に変換
 * @param {Object} item - カタログアイテム
 * @returns {Object} DBレコード
 */
const toCatalogRecord = (item) => {
  const keyCode = normalizeText(item?.keyCode || item?.id);
  const displayName = normalizeText(item?.displayName || item?.name || keyCode);
  const locationText = normalizeText(item?.location || item?.locationText || displayName);
  const building = normalizeText(item?.building);
  const name = normalizeText(item?.name || displayName);

  return {
    key_code: keyCode,
    display_name: displayName,
    location_text: locationText,
    building: building || null,
    classroom_name: null,
    metadata: {
      building,
      name,
      source: 'key_catalog',
    },
    is_active: true,
  };
};

/**
 * 鍵マスタ一覧を取得
 * @param {Object} params - 取得条件
 * @param {boolean} [params.activeOnly=true] - 有効鍵のみ取得
 * @param {number} [params.limit=400] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listKeys = async ({ activeOnly = true, limit = 400 } = {}) => {
  try {
    let query = getSupabaseClient()
      .from(KEYS_TABLE)
      .select(KEY_COLUMNS)
      /** building → display_name の順でソートし、棟ごとに整列する */
      .order('building', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true })
      .limit(limit);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('鍵マスタ取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('鍵マスタ取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 登録されている棟名の一覧を取得する（重複なし）
 * DBの building カラムと metadata.building の両方から抽出する
 * @returns {Promise<{data: string[], error: Error|null}>} 棟名一覧
 */
export const listBuildings = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .select('building,metadata')
      .eq('is_active', true)
      .limit(500);

    if (error) {
      console.error('棟名一覧取得エラー:', error);
      return { data: [], error };
    }

    /** @type {Set<string>} 重複排除用セット */
    const buildingSet = new Set();

    (data || []).forEach((row) => {
      /** building カラムを優先して使用 */
      const col = normalizeText(row.building);
      if (col) {
        buildingSet.add(col);
        return;
      }
      /** フォールバックとして metadata.building を使用 */
      const meta =
        row.metadata && typeof row.metadata === 'object'
          ? normalizeText(row.metadata.building)
          : '';
      if (meta) {
        buildingSet.add(meta);
      }
    });

    /** 棟名をロケール順でソート */
    const sorted = Array.from(buildingSet).sort((a, b) => a.localeCompare(b, 'ja'));
    return { data: sorted, error: null };
  } catch (error) {
    console.error('棟名一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

/**
 * 鍵を新規追加
 * @param {Object} input - 追加データ
 * @param {string} input.keyCode - 鍵コード（一意の識別子）
 * @param {string} input.displayName - 表示名
 * @param {string} [input.building] - 棟名
 * @param {string} [input.classroomName] - 教室名
 * @param {string} [input.locationText] - 場所テキスト
 * @returns {Promise<{data: Object|null, error: Error|null}>} 追加結果
 */
export const insertKey = async (input) => {
  try {
    const keyCode = normalizeText(input.keyCode);
    const displayName = normalizeText(input.displayName);
    if (!keyCode) {
      throw new Error('鍵コードは必須です');
    }
    if (!displayName) {
      throw new Error('表示名は必須です');
    }

    const building = normalizeText(input.building);
    const classroomName = normalizeText(input.classroomName);
    const locationText = normalizeText(input.locationText) || displayName;

    const { data, error } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .insert({
        key_code: keyCode,
        display_name: displayName,
        location_text: locationText,
        building: building || null,
        classroom_name: classroomName || null,
        is_active: true,
        metadata: { building, classroomName, name: displayName, source: 'manual' },
      })
      .select(KEY_COLUMNS)
      .single();

    if (error) {
      console.error('鍵追加エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 鍵情報を更新
 * @param {string} id - 鍵ID
 * @param {Object} input - 更新データ
 * @param {string} input.displayName - 表示名
 * @param {string} [input.building] - 棟名
 * @param {string} [input.classroomName] - 教室名
 * @param {string} [input.locationText] - 場所テキスト
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const updateKey = async (id, input) => {
  try {
    if (!id) {
      throw new Error('id が未指定です');
    }
    const displayName = normalizeText(input.displayName);
    if (!displayName) {
      throw new Error('表示名は必須です');
    }

    const building = normalizeText(input.building);
    const classroomName = normalizeText(input.classroomName);
    const locationText = normalizeText(input.locationText) || displayName;

    const { data, error } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .update({
        display_name: displayName,
        location_text: locationText,
        building: building || null,
        classroom_name: classroomName || null,
        metadata: { building, classroomName, name: displayName, source: 'manual' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(KEY_COLUMNS)
      .single();

    if (error) {
      console.error('鍵更新エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 鍵の有効・無効を切り替える
 * @param {string} id - 鍵ID
 * @param {boolean} isActive - 有効にするか
 * @returns {Promise<{data: Object|null, error: Error|null}>} 更新結果
 */
export const setKeyActive = async (id, isActive) => {
  try {
    if (!id) {
      throw new Error('id が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(KEY_COLUMNS)
      .single();

    if (error) {
      console.error('鍵有効/無効切替エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 既存の鍵が無い場合にカタログを同期
 * @param {Array} catalogItems - カタログ配列
 * @returns {Promise<{data: Array, error: Error|null}>} 同期結果
 */
export const ensureKeysSeededFromCatalog = async (catalogItems = []) => {
  try {
    const { count, error: countError } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .select('id', { count: 'exact', head: true });

    if (countError) {
      return { data: [], error: countError };
    }

    if ((count || 0) > 0) {
      return listKeys({ activeOnly: true, limit: 400 });
    }

    const records = Array.isArray(catalogItems)
      ? catalogItems.map(toCatalogRecord).filter((item) => normalizeText(item.key_code))
      : [];

    if (records.length === 0) {
      return { data: [], error: null };
    }

    const { error: upsertError } = await getSupabaseClient()
      .from(KEYS_TABLE)
      .upsert(records, { onConflict: 'key_code' });

    if (upsertError) {
      console.error('鍵マスタ初期同期エラー:', upsertError);
      return { data: [], error: upsertError };
    }

    return listKeys({ activeOnly: true, limit: 400 });
  } catch (error) {
    console.error('鍵マスタ初期同期処理でエラー:', error);
    return { data: [], error };
  }
};
