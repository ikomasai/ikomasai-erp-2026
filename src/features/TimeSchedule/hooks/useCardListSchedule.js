/**
 * カードリストモード用フック
 * 選択したブックマークに基づいてイベントを取得・フィルタリングする
 */

import { useEffect, useState, useCallback } from 'react';
import { timeScheduleService } from '../services/timeScheduleService';
import { STORAGE_KEYS } from '../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * カードリストモード用フック
 * @param {string} selectedDate - 選択日付（YYYY-MM-DD）
 * @param {Object} allBookmarks - 全ブックマーク（デフォルト+ブックマーク統合）
 * @param {string} activeBookmarkId - アクティブなブックマークID
 * @param {Function} onActiveBookmarkChange - アクティブブックマーク変更時のコールバック
 * @returns {{
 *   events: Array<Object>,
 *   loading: boolean,
 *   error: Error|null,
 *   refetch: Function
 * }} カードリスト表示用データ
 */
export const useCardListSchedule = (
  selectedDate,
  allBookmarks,
  activeBookmarkId,
  onActiveBookmarkChange
) => {
  /** ローカル状態 */
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * アクティブブックマークIDを永続化する
   */
  const saveActiveBookmarkId = useCallback(async (bookmarkId) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.CARD_LIST_ACTIVE_BOOKMARK,
        String(bookmarkId || '')
      );
    } catch (err) {
      // サイレント無視
    }
  }, []);

  /**
   * イベントの評価軸キーを抽出する
   * @param {Object} eventItem - イベント
   * @param {string} axis - 評価軸
   * @returns {string} 評価軸キー
   */
  const extractEventAxisKey = useCallback((eventItem, axis) => {
    if (axis === 'area') {
      return String(eventItem?.areaId || '').trim() || 'UNASSIGNED_AREA';
    }
    if (axis === 'group') {
      return String(eventItem?.groupName || '').trim();
    }
    return String(eventItem?.buildingLocationId || '').trim();
  }, []);

  /**
   * イベントがブックマーク条件に合致するか判定する
   * @param {Object} eventItem - イベント
   * @param {Object} bookmark - ブックマーク
   * @returns {boolean} 合致する場合 true
   */
  const matchesBookmarkCondition = useCallback((eventItem, bookmark) => {
    /** 評価軸 */
    const axis = String(bookmark?.axis || 'building').trim() || 'building';
    /** 判定対象の選択キー一覧 */
    const criteriaKeys = Array.isArray(bookmark?.criteriaKeys)
      ? bookmark.criteriaKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    if (criteriaKeys.length === 0) {
      return false;
    }

    /** イベント側の評価軸キー */
    const eventAxisKey = extractEventAxisKey(eventItem, axis);
    return criteriaKeys.includes(eventAxisKey);
  }, [extractEventAxisKey]);

  /**
   * 時刻文字列を分に変換する
   * @param {string} timeText - 時刻文字列
   * @returns {number} 分
   */
  const parseTimeToMinutes = useCallback((timeText) => {
    /** 分割後パーツ */
    const parts = String(timeText || '').split(':');
    /** 時 */
    const hour = Number(parts[0]);
    /** 分 */
    const minute = Number(parts[1]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return 0;
    }
    return hour * 60 + minute;
  }, []);

  /**
   * イベント一覧を取得・フィルタリング
   */
  const fetchAndFilterEvents = useCallback(async () => {
    if (!selectedDate) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      /** タイムスケジュールデータ */
      const response = await timeScheduleService.selectTimeScheduleTimeline({
        scheduleDate: selectedDate,
        buildingIds: [],
      });

      if (!response || !response.slots) {
        setEvents([]);
        return;
      }

      /** アクティブブックマーク */
      const activeBookmark = (allBookmarks || []).find(
        (bm) => String(bm?.id || '') === String(activeBookmarkId || '')
      );

      if (!activeBookmark) {
        setEvents([]);
        return;
      }

      /** ブックマーク条件に合致するイベント */
      const filteredEvents = response.slots.filter((slot) =>
        matchesBookmarkCondition(slot, activeBookmark)
      );

      /** 時刻順（開始時刻昇順）にソート */
      filteredEvents.sort((a, b) => {
        const aStart = parseTimeToMinutes(a?.startTime || a?.start_time || '');
        const bStart = parseTimeToMinutes(b?.startTime || b?.start_time || '');
        if (aStart !== bStart) return aStart - bStart;

        // 同時刻の場合は名前でソート
          const aName = String(a?.eventName || a?.displayName || a?.name || '').trim();
          const bName = String(b?.eventName || b?.displayName || b?.name || '').trim();
        return aName.localeCompare(bName, 'ja', { numeric: true });
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('[useCardListSchedule] イベント取得エラー:', err);
      setError(err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, activeBookmarkId, allBookmarks, matchesBookmarkCondition, parseTimeToMinutes]);

  /**
   * ブックマークが未選択、または選択値が無効なら先頭を採用する
   */
  useEffect(() => {
    /** ブックマーク一覧 */
    const bookmarks = Array.isArray(allBookmarks) ? allBookmarks : [];
    if (bookmarks.length === 0) {
      return;
    }

    /** 現在選択IDが有効か */
    const hasActiveBookmark = bookmarks.some(
      (bookmark) => String(bookmark?.id || '') === String(activeBookmarkId || '')
    );
    if (!hasActiveBookmark && onActiveBookmarkChange) {
      onActiveBookmarkChange(String(bookmarks[0]?.id || ''));
    }
  }, [activeBookmarkId, allBookmarks, onActiveBookmarkChange]);

  /**
   * アクティブブックマークIDの永続化
   */
  useEffect(() => {
    if (!activeBookmarkId) {
      return;
    }
    saveActiveBookmarkId(activeBookmarkId);
  }, [activeBookmarkId, saveActiveBookmarkId]);

  /**
   * 選択日付またはアクティブブックマークが変更されたときにイベントを再取得
   */
  useEffect(() => {
    fetchAndFilterEvents();
  }, [selectedDate, activeBookmarkId, fetchAndFilterEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchAndFilterEvents,
  };
};
