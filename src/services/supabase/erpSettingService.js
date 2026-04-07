/**
 * ERP共有設定サービス
 * 本部サポートで保存した設定を Supabase 上で共有する
 */

import { getSupabaseClient } from './client';

/** ERP共有設定テーブル名 */
export const ERP_SETTING_TABLE_NAME = 'ERP_setting';

/** ERP共有設定キー一覧 */
export const ERP_SETTING_KEYS = {
  EVALUATION_FORM_URL: 'evaluationFormUrl',
};

/** ERP共有設定の説明文一覧 */
const ERP_SETTING_DESCRIPTIONS = {
  [ERP_SETTING_KEYS.EVALUATION_FORM_URL]: '本部サポートで管理する共有評価フォームURL',
};

/**
 * 設定キーを正規化する
 * @param {string|null|undefined} value - 元の設定キー
 * @returns {string} 正規化済み設定キー
 */
const normalizeSettingKey = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * ERP共有設定を1件取得する
 * @param {string} settingKey - 設定キー
 * @returns {Promise<{setting: Object|null, error: Error|null}>} 設定取得結果
 */
export const selectErpSetting = async (settingKey) => {
  /** 正規化済み設定キー */
  const normalizedKey = normalizeSettingKey(settingKey);
  if (!normalizedKey) {
    return {
      setting: null,
      error: new Error('設定キーが指定されていません'),
    };
  }

  try {
    const { data, error } = await getSupabaseClient()
      .from(ERP_SETTING_TABLE_NAME)
      .select('key, value, description, updated_by, created_at, updated_at')
      .eq('key', normalizedKey)
      .maybeSingle();

    if (error) {
      return { setting: null, error };
    }

    return {
      setting: data || null,
      error: null,
    };
  } catch (error) {
    return {
      setting: null,
      error,
    };
  }
};

/**
 * ERP共有設定の値だけを取得する
 * @param {string} settingKey - 設定キー
 * @returns {Promise<{value: *, error: Error|null}>} 設定値取得結果
 */
export const selectErpSettingValue = async (settingKey) => {
  const { setting, error } = await selectErpSetting(settingKey);
  return {
    value: setting?.value ?? null,
    error,
  };
};

/**
 * ERP共有設定を upsert する
 * @param {Object} params - 設定内容
 * @param {string} params.key - 設定キー
 * @param {*} params.value - 保存する設定値
 * @param {string} [params.description=''] - 設定説明
 * @param {string|null} [params.updatedBy=null] - 更新者ユーザーID
 * @returns {Promise<{setting: Object|null, error: Error|null}>} 保存結果
 */
export const upsertErpSetting = async ({
  key,
  value,
  description = '',
  updatedBy = null,
}) => {
  /** 正規化済み設定キー */
  const normalizedKey = normalizeSettingKey(key);
  if (!normalizedKey) {
    return {
      setting: null,
      error: new Error('設定キーが指定されていません'),
    };
  }

  /** 保存対象行 */
  const nextRow = {
    key: normalizedKey,
    value,
    description: description || ERP_SETTING_DESCRIPTIONS[normalizedKey] || null,
    updated_by: updatedBy || null,
  };

  try {
    const { data, error } = await getSupabaseClient()
      .from(ERP_SETTING_TABLE_NAME)
      .upsert(nextRow, { onConflict: 'key' })
      .select('key, value, description, updated_by, created_at, updated_at')
      .single();

    if (error) {
      return { setting: null, error };
    }

    return {
      setting: data || null,
      error: null,
    };
  } catch (error) {
    return {
      setting: null,
      error,
    };
  }
};

/**
 * 共有評価フォームURLを取得する
 * @returns {Promise<{value: string|null, error: Error|null}>} 共有URL取得結果
 */
export const selectEvaluationFormUrlSetting = async () => {
  return selectErpSettingValue(ERP_SETTING_KEYS.EVALUATION_FORM_URL);
};

/**
 * 共有評価フォームURLを保存する
 * @param {string} url - 保存するURL
 * @param {string|null} [updatedBy=null] - 更新者ユーザーID
 * @returns {Promise<{setting: Object|null, error: Error|null}>} 保存結果
 */
export const upsertEvaluationFormUrlSetting = async (url, updatedBy = null) => {
  return upsertErpSetting({
    key: ERP_SETTING_KEYS.EVALUATION_FORM_URL,
    value: url,
    description: ERP_SETTING_DESCRIPTIONS[ERP_SETTING_KEYS.EVALUATION_FORM_URL],
    updatedBy,
  });
};
