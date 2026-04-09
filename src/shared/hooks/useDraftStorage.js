/**
 * 下書き自動保存フック
 * フォーム入力をAsyncStorageに自動保存し、再訪問時に復元する
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 下書き保存のデバウンス間隔（ミリ秒） */
const DEBOUNCE_MS = 1000;
/** 下書きキーのプレフィックス */
const DRAFT_PREFIX = '@draft:';

/**
 * 下書き自動保存フック
 * @param {string} storageKey - 保存キー（画面・フォームを識別する一意キー）
 * @param {Object} defaultValues - デフォルト値（初回表示時の初期値）
 * @returns {Object} 下書き操作オブジェクト
 * @returns {Object} return.values - 現在のフォーム値
 * @returns {Function} return.setValue - 個別値の更新関数 (key, value) => void
 * @returns {Function} return.setValues - 一括値の更新関数 (obj) => void
 * @returns {Function} return.clearDraft - 下書きの削除関数
 * @returns {boolean} return.hasDraft - 下書きが存在するか
 * @returns {boolean} return.isLoaded - 初期読み込みが完了したか
 */
const useDraftStorage = (storageKey, defaultValues = {}) => {
  /** 完全なストレージキー */
  const fullKey = `${DRAFT_PREFIX}${storageKey}`;
  /** 現在のフォーム値 */
  const [values, setValuesState] = useState(defaultValues);
  /** 下書きが存在するか */
  const [hasDraft, setHasDraft] = useState(false);
  /** 初期読み込みが完了したか */
  const [isLoaded, setIsLoaded] = useState(false);
  /** デバウンス用タイマーRef */
  const debounceRef = useRef(null);
  /** 最新の値を保持するRef（デバウンス保存で使用） */
  const latestValuesRef = useRef(values);

  /**
   * AsyncStorageから下書きを読み込む
   */
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const stored = await AsyncStorage.getItem(fullKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setValuesState({ ...defaultValues, ...parsed });
          setHasDraft(true);
        }
      } catch (error) {
        console.warn('[useDraftStorage] 下書き読み込みエラー:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  /**
   * AsyncStorageに下書きを保存する（デバウンス付き）
   * @param {Object} newValues - 保存する値
   */
  const saveDraft = useCallback(
    (newValues) => {
      latestValuesRef.current = newValues;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(async () => {
        try {
          await AsyncStorage.setItem(fullKey, JSON.stringify(newValues));
          setHasDraft(true);
        } catch (error) {
          console.warn('[useDraftStorage] 下書き保存エラー:', error);
        }
      }, DEBOUNCE_MS);
    },
    [fullKey]
  );

  /**
   * 個別のフォーム値を更新する
   * @param {string} key - フィールド名
   * @param {*} value - 値
   */
  const setValue = useCallback(
    (key, value) => {
      setValuesState((prev) => {
        const next = { ...prev, [key]: value };
        saveDraft(next);
        return next;
      });
    },
    [saveDraft]
  );

  /**
   * 複数のフォーム値を一括更新する
   * @param {Object} newValues - 更新するキーと値のオブジェクト
   */
  const setValues = useCallback(
    (newValues) => {
      setValuesState((prev) => {
        const next = { ...prev, ...newValues };
        saveDraft(next);
        return next;
      });
    },
    [saveDraft]
  );

  /**
   * 下書きを削除する（送信完了時に呼ぶ）
   */
  const clearDraft = useCallback(async () => {
    try {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      await AsyncStorage.removeItem(fullKey);
      setHasDraft(false);
      setValuesState(defaultValues);
    } catch (error) {
      console.warn('[useDraftStorage] 下書き削除エラー:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  /** クリーンアップ：アンマウント時にデバウンスを即保存 */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // アンマウント時に最新値を即保存
        AsyncStorage.setItem(fullKey, JSON.stringify(latestValuesRef.current)).catch(() => {});
      }
    };
  }, [fullKey]);

  return {
    values,
    setValue,
    setValues,
    clearDraft,
    hasDraft,
    isLoaded,
  };
};

export default useDraftStorage;
