/**
 * TimeSchedule 画面
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { Ionicons } from '../../../shared/components/icons';
import DetailModal from '../../01_Events&Stalls_list/components/DetailModal';
import {
  OPERATION_END_TIME,
  OPERATION_START_TIME,
  SCREEN_DESCRIPTION,
  SCREEN_NAME,
  STORAGE_KEYS,
} from '../constants';
import { timeScheduleService } from '../services/timeScheduleService';

/** 日付フォーマット（YYYY-MM-DD） */
const DATE_FORMAT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** 15分スロット（分） */
const TIME_SLOT_INTERVAL_MINUTES = 15;
/** 1スロットの高さ */
const TIMELINE_ROW_HEIGHT = 45;
/** 並び替えドラッグの1行換算高さ(px) */
const REORDER_DRAG_ROW_HEIGHT_PX = 62;
/** ブックマーク行間(px) */
const BOOKMARK_LIST_ROW_GAP_PX = 8;
/** カード幅 */
const TIMELINE_CARD_WIDTH = 220;
/** カード間隔 */
const TIMELINE_CARD_GAP = 12;
/** タイムカラム幅 */
const TIMELINE_TIME_COLUMN_WIDTH = 72;
/** 場所ヘッダー高さ */
const LOCATION_HEADER_HEIGHT = 40;
/** 初期表示する建物フィルタ名 */
const DEFAULT_VISIBLE_BUILDING_NAMES = [
  '11月ホール',
  '実学ホール',
  '記念会館',
  '人工芝グラウンド',
  'その他',
];
/** 表示順固定ルール */
const FIXED_LOCATION_ORDER = ['11月ホール', '実学ホール', '記念会館', '人工芝', 'その他'];
/** 表示設定のユーザー別保存キープレフィックス */
const DISPLAY_BOOKMARKS_STORAGE_PREFIX = 'time_schedule_display_bookmarks_';
/** 表示設定のアクティブブックマーク保存キープレフィックス */
const ACTIVE_BOOKMARK_STORAGE_PREFIX = 'time_schedule_active_bookmark_';
/** 表示設定の非表示ブックマーク保存キープレフィックス */
const HIDDEN_BOOKMARKS_STORAGE_PREFIX = 'time_schedule_hidden_bookmarks_';
/** 表示設定の並び順保存キープレフィックス */
const BOOKMARK_ORDER_STORAGE_PREFIX = 'time_schedule_bookmark_order_';
/** 既定ブックマーク色保存キープレフィックス */
const DEFAULT_BOOKMARK_COLORS_STORAGE_PREFIX = 'time_schedule_default_bookmark_colors_';
/** 既定ブックマークID接頭辞 */
const DEFAULT_BOOKMARK_ID_PREFIX = 'default_building_';
/** ブックマークで選択できる淡色テーマカラー一覧 */
const BOOKMARK_THEME_COLORS = [
  '#EAF4FF',
  '#EAFBF2',
  '#FFF8E8',
  '#FFEFF3',
  '#F2EEFF',
  '#EAF8F8',
  '#FFF3EA',
  '#F4F6FA',
];
/** ブックマークの既定テーマカラー */
const DEFAULT_BOOKMARK_THEME_COLOR = BOOKMARK_THEME_COLORS[0];

/** オブジェクトの own プロパティ判定ショートハンド */
const HAS_OWN = Object.prototype.hasOwnProperty;
/** ブックマーク背景と文字色の最小コントラスト比 */
const MIN_BOOKMARK_CONTRAST_RATIO = 4.5;
/** ここより暗い背景ではブックマーク色を段階補正する背景輝度しきい値 */
const DARK_THEME_BACKGROUND_LUMINANCE_THRESHOLD = 0.62;
/** ここより明るい背景はライト寄りテーマとして扱う背景輝度しきい値 */
const LIGHT_THEME_BACKGROUND_LUMINANCE_THRESHOLD = 0.72;
/** 暗色テーマ向けの最大明度低下量 */
const MAX_BOOKMARK_LIGHTNESS_REDUCTION = 0.34;
/** 暗色テーマ向けの彩度上乗せ上限（ビビッド化を抑制） */
const MAX_BOOKMARK_SATURATION_BOOST = 0.06;
/** ライト寄りテーマ向けの最小明度低下量 */
const MIN_LIGHT_THEME_LIGHTNESS_REDUCTION = 0.03;
/** ライト寄りテーマ向けの最大明度低下量 */
const MAX_LIGHT_THEME_LIGHTNESS_REDUCTION = 0.08;
/** 軸タイプ定義 */
const BOOKMARK_AXES = {
  BUILDING: 'building',
  AREA: 'area',
  GROUP: 'group',
};

/** 軸表示名 */
const BOOKMARK_AXIS_LABELS = {
  [BOOKMARK_AXES.BUILDING]: '建物',
  [BOOKMARK_AXES.AREA]: 'エリア',
  [BOOKMARK_AXES.GROUP]: '団体',
};

/** ブックマーク一覧モーダルのタブ種別 */
const BOOKMARK_LIST_TABS = {
  DEFAULT: 'default',
  MY_LIST: 'my_list',
};
/** モバイルUIへ切り替える画面幅しきい値 */
const MOBILE_LAYOUT_BREAKPOINT = 768;

/** カタカナをひらがなへ変換する */
const katakanaToHiragana = (value) => {
  return String(value || '').replace(/[\u30A1-\u30F6]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
};

/** 企画一覧準拠の検索文字列正規化 */
const normalizeSearchText = (value) => {
  return katakanaToHiragana(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

/** 候補検索で部分一致を優先するためのスコアを計算する */
const calculateCandidatePrefixPriorityScore = (candidate, queryTokens) => {
  /** 検索対象フィールド */
  const searchFields = ['label', 'labelKana'];
  /** フィールド重み */
  const fieldWeights = {
    label: 50,
    labelKana: 46,
  };

  return (queryTokens || []).reduce((totalScore, token) => {
    /** トークンごとの最大スコア */
    const tokenScore = searchFields.reduce((maxFieldScore, field) => {
      /** 正規化済みフィールド値 */
      const fieldValue = String(candidate?._search?.[field] || '');
      if (!fieldValue.includes(token)) {
        return maxFieldScore;
      }

      /** ベース重み */
      const baseWeight = fieldWeights[field] || 0;
      if (fieldValue.startsWith(token)) {
        return Math.max(maxFieldScore, baseWeight + 20);
      }
      return Math.max(maxFieldScore, baseWeight);
    }, 0);

    return totalScore + tokenScore;
  }, 0);
};

/**
 * 並び順判定用に場所名を正規化する
 * @param {string} locationName - 場所名
 * @returns {string} 正規化後の場所名
 */
const normalizeLocationOrderName = (locationName) => {
  /** 変換前後の表記ゆれ吸収マップ */
  const aliasMap = {
    人工芝グラウンド: '人工芝',
  };
  /** 正規化前の文字列 */
  const baseName = String(locationName || '').trim();
  return aliasMap[baseName] || baseName;
};

/**
 * 場所名の固定順序で比較する
 * @param {string} left - 比較対象左
 * @param {string} right - 比較対象右
 * @returns {number} 比較結果
 */
const compareByFixedLocationOrder = (left, right) => {
  /** 正規化後左 */
  const normalizedLeft = normalizeLocationOrderName(left);
  /** 正規化後右 */
  const normalizedRight = normalizeLocationOrderName(right);
  /** 左の固定順インデックス */
  const fixedLeftIndex = FIXED_LOCATION_ORDER.indexOf(normalizedLeft);
  /** 右の固定順インデックス */
  const fixedRightIndex = FIXED_LOCATION_ORDER.indexOf(normalizedRight);
  /** 左が固定順対象か */
  const hasLeftFixedOrder = fixedLeftIndex !== -1;
  /** 右が固定順対象か */
  const hasRightFixedOrder = fixedRightIndex !== -1;

  if (hasLeftFixedOrder && hasRightFixedOrder) {
    return fixedLeftIndex - fixedRightIndex;
  }
  if (hasLeftFixedOrder) {
    return -1;
  }
  if (hasRightFixedOrder) {
    return 1;
  }

  return String(left || '').localeCompare(String(right || ''), 'ja', { numeric: true });
};

/**
 * 表示設定の保存キーをユーザー別に生成する
 * @param {string} userId - ユーザーID
 * @returns {{bookmarksKey: string, activeKey: string, hiddenKey: string, orderKey: string, defaultColorsKey: string}} 保存キー
 */
const buildDisplayStorageKeys = (userId) => {
  /** 正規化したユーザーID */
  const normalizedUserId = String(userId || 'anonymous').trim() || 'anonymous';
  return {
    bookmarksKey: `${DISPLAY_BOOKMARKS_STORAGE_PREFIX}${normalizedUserId}`,
    activeKey: `${ACTIVE_BOOKMARK_STORAGE_PREFIX}${normalizedUserId}`,
    hiddenKey: `${HIDDEN_BOOKMARKS_STORAGE_PREFIX}${normalizedUserId}`,
    orderKey: `${BOOKMARK_ORDER_STORAGE_PREFIX}${normalizedUserId}`,
    defaultColorsKey: `${DEFAULT_BOOKMARK_COLORS_STORAGE_PREFIX}${normalizedUserId}`,
  };
};

/**
 * 文字列配列が同一内容か判定する
 * @param {Array<string>} left - 左配列
 * @param {Array<string>} right - 右配列
 * @returns {boolean} 判定結果
 */
const isSameStringArray = (left, right) => {
  /** 左配列 */
  const normalizedLeft = Array.isArray(left) ? left : [];
  /** 右配列 */
  const normalizedRight = Array.isArray(right) ? right : [];
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => String(value) === String(normalizedRight[index]));
};

/**
 * 指定IDを配列内の任意位置へ移動する
 * @param {Array<string>} sourceIds - 元ID配列
 * @param {string} targetId - 移動対象ID
 * @param {number} nextIndex - 移動先インデックス
 * @returns {Array<string>} 移動後ID配列
 */
const moveIdToIndex = (sourceIds, targetId, nextIndex) => {
  /** 元配列 */
  const currentIds = Array.isArray(sourceIds) ? [...sourceIds] : [];
  /** 対象IDの現在位置 */
  const currentIndex = currentIds.findIndex((id) => String(id || '') === String(targetId || ''));
  if (currentIndex === -1) {
    return currentIds;
  }

  /** 正規化した移動先インデックス */
  const normalizedNextIndex = Math.max(0, Math.min(nextIndex, currentIds.length - 1));
  if (currentIndex === normalizedNextIndex) {
    return currentIds;
  }

  /** 対象ID */
  const movedId = currentIds[currentIndex];
  currentIds.splice(currentIndex, 1);
  currentIds.splice(normalizedNextIndex, 0, movedId);
  return currentIds;
};

/**
 * 全並び順IDの中で、部分集合IDのみを並び替える
 * @param {Array<string>} fullOrderIds - 全並び順ID
 * @param {Array<string>} subsetIds - 並び替え対象の部分集合ID
 * @param {string} targetId - 移動対象ID
 * @param {number} nextSubsetIndex - 部分集合内での移動先インデックス
 * @returns {Array<string>} 並び替え後の全並び順ID
 */
const moveSubsetIdInFullOrder = (fullOrderIds, subsetIds, targetId, nextSubsetIndex) => {
  /** 正規化した全ID */
  const normalizedFullIds = Array.isArray(fullOrderIds)
    ? fullOrderIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  /** 並び替え対象IDのSet */
  const subsetIdSet = new Set(
    (Array.isArray(subsetIds) ? subsetIds : []).map((id) => String(id || '').trim()).filter(Boolean)
  );
  if (subsetIdSet.size === 0) {
    return normalizedFullIds;
  }

  /** 現在の全並び順に沿った対象部分集合 */
  const currentSubsetOrderIds = normalizedFullIds.filter((id) => subsetIdSet.has(id));
  /** 対象部分集合末尾インデックス */
  const subsetLastIndex = Math.max(currentSubsetOrderIds.length - 1, 0);
  /** 正規化した移動先 */
  const normalizedNextSubsetIndex = Math.max(0, Math.min(Number(nextSubsetIndex || 0), subsetLastIndex));
  /** 並び替え後の対象部分集合 */
  const reorderedSubsetIds = moveIdToIndex(currentSubsetOrderIds, targetId, normalizedNextSubsetIndex);
  /** 対象部分集合の読み取り位置 */
  let subsetCursor = 0;

  return normalizedFullIds.map((id) => {
    if (!subsetIdSet.has(id)) {
      return id;
    }
    /** 置換後ID */
    const replacedId = reorderedSubsetIds[subsetCursor] || id;
    subsetCursor += 1;
    return replacedId;
  });
};

/**
 * 評価軸ごとの値をスケジュールアイテムから抽出する
 * @param {Object} item - スケジュールアイテム
 * @param {string} axis - 評価軸
 * @param {Object} areaLabelMap - areaIdごとの表示名Map
 * @returns {{key: string, label: string}} 抽出結果
 */
const extractAxisValue = (item, axis, areaLabelMap = {}) => {
  /** 建物ID */
  const buildingId = String(item?.buildingLocationId || '').trim();
  /** 建物表示名 */
  const buildingLabel =
    String(item?.buildingLocationName || item?.locationName || '場所未設定').trim() || '場所未設定';
  /** 団体名 */
  const groupLabel = String(item?.groupName || '団体未設定').trim() || '団体未設定';
  /** エリアID */
  const areaId = String(item?.areaId || '').trim();

  if (axis === BOOKMARK_AXES.GROUP) {
    return {
      key: groupLabel,
      label: groupLabel,
    };
  }

  if (axis === BOOKMARK_AXES.AREA) {
    /** エリア表示名 */
    const areaLabel = areaLabelMap[areaId] || (areaId ? `エリア ${areaId}` : 'エリア未設定');
    return {
      key: areaId || 'UNASSIGNED_AREA',
      label: areaLabel,
    };
  }

  return {
    key: buildingId || buildingLabel,
    label: buildingLabel,
  };
};

/**
 * HH:mm を分へ変換する
 * @param {string} timeText - HH:mm
 * @returns {number} 分
 */
const parseHmToMinutes = (timeText) => {
  /** 分割した時刻文字列 */
  const [hourText, minuteText] = String(timeText || '').split(':');
  /** 時 */
  const hour = Number(hourText);
  /** 分 */
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return 0;
  }
  return hour * 60 + minute;
};

/**
 * 時刻文字列を分単位（HH:mm）で整形する
 * @param {string} timeText - 元時刻文字列
 * @returns {string} 分単位時刻
 */
const formatTimeToMinuteLabel = (timeText) => {
  /** 分割した時刻文字列 */
  const [hourText = '', minuteText = ''] = String(timeText || '').split(':');
  if (!hourText || !minuteText) {
    return '';
  }
  return `${hourText}:${minuteText}`;
};

/**
 * 開始/終了時刻をカード表示用に整形する
 * @param {string} startTime - 開始時刻
 * @param {string} endTime - 終了時刻
 * @returns {string} 表示用時間レンジ
 */
const buildCardTimeRangeLabel = (startTime, endTime) => {
  /** 分単位の開始時刻 */
  const startText = formatTimeToMinuteLabel(startTime);
  /** 分単位の終了時刻 */
  const endText = formatTimeToMinuteLabel(endTime);

  if (startText && endText) {
    return `${startText} - ${endText}`;
  }

  return startText || endText || '時間未設定';
};

/**
 * 場所表示を「建物 + 場所」で生成する
 * @param {string} buildingName - 建物名
 * @param {string} locationName - 場所名
 * @returns {string} 表示用場所名
 */
const buildBuildingLocationLabel = (buildingName, locationName) => {
  /** 建物表示名 */
  const buildingLabel = String(buildingName || '').trim();
  /** 場所表示名 */
  const locationLabel = String(locationName || '').trim();
  return [buildingLabel, locationLabel].filter(Boolean).join(' ');
};

/** 運用開始分 */
const OPERATION_START_MINUTES = parseHmToMinutes(OPERATION_START_TIME);
/** 運用終了分 */
const OPERATION_END_MINUTES = parseHmToMinutes(OPERATION_END_TIME);

/**
 * Date を YYYY-MM-DD 形式へ変換する
 * @param {Date} date - 変換対象日付
 * @returns {string} YYYY-MM-DD
 */
const formatDateToYmd = (date) => {
  /** 年 */
  const year = date.getFullYear();
  /** 月 */
  const month = String(date.getMonth() + 1).padStart(2, '0');
  /** 日 */
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * YYYY-MM-DD 形式の文字列を Date に変換する
 * @param {string} ymd - YYYY-MM-DD
 * @returns {Date} 変換後 Date
 */
const parseYmdToDate = (ymd) => {
  /** 分割した日付文字列 */
  const [yearText, monthText, dayText] = String(ymd).split('-');
  /** 年 */
  const year = Number(yearText);
  /** 月 */
  const month = Number(monthText);
  /** 日 */
  const day = Number(dayText);
  return new Date(year, month - 1, day);
};

/**
 * 初期表示日を決定する
 * @returns {string} YYYY-MM-DD
 */
const getInitialScheduleDate = () => {
  /** 祭開始日（環境変数） */
  const festivalStartDate = String(process.env.EXPO_PUBLIC_FESTIVAL_START_DATE || '').trim();
  if (DATE_FORMAT_PATTERN.test(festivalStartDate)) {
    return festivalStartDate;
  }
  return formatDateToYmd(new Date());
};

/**
 * 日付を表示用に整形する
 * @param {string} ymd - YYYY-MM-DD
 * @returns {string} 表示文字列
 */
const formatDisplayDate = (ymd) => {
  /** 日付オブジェクト */
  const date = parseYmdToDate(ymd);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
};

/**
 * 色文字列へ透過率を適用する
 * @param {string} colorText - 元の色文字列
 * @param {number} alpha - 透過率（0〜1）
 * @returns {string} 透過適用後の色文字列
 */
const toAlphaColor = (colorText, alpha) => {
  /** 正規化した色文字列 */
  const normalizedColor = String(colorText || '').trim();
  /** 正規化した透過率 */
  const normalizedAlpha = Math.max(0, Math.min(1, Number(alpha)));

  if (/^#([0-9a-fA-F]{6})$/.test(normalizedColor)) {
    /** 16進アルファ */
    const alphaHex = Math.round(normalizedAlpha * 255)
      .toString(16)
      .padStart(2, '0');
    return `${normalizedColor}${alphaHex}`;
  }

  if (/^#([0-9a-fA-F]{3})$/.test(normalizedColor)) {
    /** 3桁HEXを6桁HEXへ展開 */
    const hex = normalizedColor.replace('#', '');
    /** 展開後6桁HEX */
    const expandedHex = `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    /** 16進アルファ */
    const alphaHex = Math.round(normalizedAlpha * 255)
      .toString(16)
      .padStart(2, '0');
    return `${expandedHex}${alphaHex}`;
  }

  /** rgb() 形式か */
  const rgbMatch = normalizedColor.match(/^rgb\(([^)]+)\)$/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${normalizedAlpha})`;
  }

  /** rgba() 形式か */
  const rgbaMatch = normalizedColor.match(/^rgba\(([^)]+)\)$/i);
  if (rgbaMatch) {
    /** RGBAの要素配列 */
    const rgbaParts = rgbaMatch[1].split(',').map((value) => value.trim());
    if (rgbaParts.length >= 3) {
      return `rgba(${rgbaParts[0]}, ${rgbaParts[1]}, ${rgbaParts[2]}, ${normalizedAlpha})`;
    }
  }

  return normalizedColor;
};

/**
 * ブックマークカラーを許可パレットで正規化する
 * @param {string} colorText - 元カラー文字列
 * @returns {string} 正規化後カラー
 */
const normalizeBookmarkThemeColor = (colorText) => {
  /** 正規化した候補色 */
  const normalizedColor = String(colorText || '').trim().toUpperCase();
  /** 許可色Map */
  const allowedColorMap = BOOKMARK_THEME_COLORS.reduce((result, color) => {
    result[String(color || '').toUpperCase()] = color;
    return result;
  }, {});
  return allowedColorMap[normalizedColor] || DEFAULT_BOOKMARK_THEME_COLOR;
};

/**
 * 色上書きMapから指定IDの色を取得する（未設定時は空文字）
 * @param {Object} colorMap - 色上書きMap
 * @param {string} bookmarkId - ブックマークID
 * @returns {string} 正規化済み色（未設定時は空文字）
 */
const pickBookmarkOverrideColor = (colorMap, bookmarkId) => {
  /** 正規化したID */
  const normalizedBookmarkId = String(bookmarkId || '').trim();
  if (!normalizedBookmarkId) {
    return '';
  }

  /** Mapとして扱える値 */
  const normalizedColorMap = colorMap && typeof colorMap === 'object' ? colorMap : {};
  if (!HAS_OWN.call(normalizedColorMap, normalizedBookmarkId)) {
    return '';
  }

  return normalizeBookmarkThemeColor(normalizedColorMap[normalizedBookmarkId]);
};

/**
 * HEXカラー文字列をRGBへ変換する
 * @param {string} hexColor - HEXカラー
 * @returns {{r:number,g:number,b:number}|null} RGB値
 */
const parseHexColorToRgb = (hexColor) => {
  /** 正規化したHEX */
  const normalizedHex = String(hexColor || '').trim();
  if (/^#([0-9a-fA-F]{6})$/.test(normalizedHex)) {
    return {
      r: parseInt(normalizedHex.slice(1, 3), 16),
      g: parseInt(normalizedHex.slice(3, 5), 16),
      b: parseInt(normalizedHex.slice(5, 7), 16),
    };
  }
  if (/^#([0-9a-fA-F]{3})$/.test(normalizedHex)) {
    /** 3桁HEX */
    const shortHex = normalizedHex.slice(1);
    return {
      r: parseInt(`${shortHex[0]}${shortHex[0]}`, 16),
      g: parseInt(`${shortHex[1]}${shortHex[1]}`, 16),
      b: parseInt(`${shortHex[2]}${shortHex[2]}`, 16),
    };
  }
  return null;
};

/**
 * rgb/rgba 文字列をRGBへ変換する
 * @param {string} rgbColor - rgb/rgbaカラー
 * @returns {{r:number,g:number,b:number}|null} RGB値
 */
const parseRgbStringToRgb = (rgbColor) => {
  /** 正規化カラー */
  const normalizedColor = String(rgbColor || '').trim();
  /** RGB/ RGBA マッチ結果 */
  const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) {
    return null;
  }
  /** RGB要素配列 */
  const parts = rgbMatch[1].split(',').map((value) => Number(String(value || '').trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) {
    return null;
  }
  return {
    r: Math.max(0, Math.min(255, Math.round(parts[0]))),
    g: Math.max(0, Math.min(255, Math.round(parts[1]))),
    b: Math.max(0, Math.min(255, Math.round(parts[2]))),
  };
};

/**
 * カラー文字列をRGBへ変換する
 * @param {string} colorText - カラー文字列
 * @returns {{r:number,g:number,b:number}|null} RGB値
 */
const parseColorToRgb = (colorText) => {
  return parseHexColorToRgb(colorText) || parseRgbStringToRgb(colorText);
};

/**
 * sRGB値を線形値へ変換する
 * @param {number} channel - 0〜255 のチャンネル値
 * @returns {number} 線形化チャンネル値
 */
const convertSrgbToLinear = (channel) => {
  /** 0〜1へ正規化した値 */
  const normalizedChannel = Math.max(0, Math.min(255, Number(channel || 0))) / 255;
  if (normalizedChannel <= 0.04045) {
    return normalizedChannel / 12.92;
  }
  return ((normalizedChannel + 0.055) / 1.055) ** 2.4;
};

/**
 * RGBの相対輝度を計算する
 * @param {{r:number,g:number,b:number}} rgb - RGB値
 * @returns {number} 相対輝度
 */
const calculateRelativeLuminance = (rgb) => {
  /** 線形化した赤 */
  const linearR = convertSrgbToLinear(rgb?.r);
  /** 線形化した緑 */
  const linearG = convertSrgbToLinear(rgb?.g);
  /** 線形化した青 */
  const linearB = convertSrgbToLinear(rgb?.b);
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
};

/**
 * 2色間のコントラスト比を計算する
 * @param {{r:number,g:number,b:number}} firstRgb - 色1
 * @param {{r:number,g:number,b:number}} secondRgb - 色2
 * @returns {number} コントラスト比
 */
const calculateContrastRatio = (firstRgb, secondRgb) => {
  /** 色1の相対輝度 */
  const luminanceFirst = calculateRelativeLuminance(firstRgb);
  /** 色2の相対輝度 */
  const luminanceSecond = calculateRelativeLuminance(secondRgb);
  /** 明るい側の輝度 */
  const lighter = Math.max(luminanceFirst, luminanceSecond);
  /** 暗い側の輝度 */
  const darker = Math.min(luminanceFirst, luminanceSecond);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * RGBをHSLへ変換する
 * @param {{r:number,g:number,b:number}} rgb - RGB値
 * @returns {{h:number,s:number,l:number}} HSL値
 */
const convertRgbToHsl = (rgb) => {
  /** 正規化赤 */
  const red = Math.max(0, Math.min(255, Number(rgb?.r || 0))) / 255;
  /** 正規化緑 */
  const green = Math.max(0, Math.min(255, Number(rgb?.g || 0))) / 255;
  /** 正規化青 */
  const blue = Math.max(0, Math.min(255, Number(rgb?.b || 0))) / 255;
  /** 最大値 */
  const maxValue = Math.max(red, green, blue);
  /** 最小値 */
  const minValue = Math.min(red, green, blue);
  /** 差分 */
  const delta = maxValue - minValue;
  /** 明度 */
  const lightness = (maxValue + minValue) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  /** 彩度 */
  const saturation =
    lightness > 0.5
      ? delta / (2 - maxValue - minValue)
      : delta / (maxValue + minValue);

  /** 色相 */
  let hue = 0;
  if (maxValue === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (maxValue === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  hue /= 6;

  return {
    h: hue,
    s: saturation,
    l: lightness,
  };
};

/**
 * HSLをRGBへ変換する
 * @param {{h:number,s:number,l:number}} hsl - HSL値
 * @returns {{r:number,g:number,b:number}} RGB値
 */
const convertHslToRgb = (hsl) => {
  /** 色相 */
  const hue = Math.max(0, Math.min(1, Number(hsl?.h || 0)));
  /** 彩度 */
  const saturation = Math.max(0, Math.min(1, Number(hsl?.s || 0)));
  /** 明度 */
  const lightness = Math.max(0, Math.min(1, Number(hsl?.l || 0)));

  if (saturation === 0) {
    /** グレースケール値 */
    const grayValue = Math.round(lightness * 255);
    return {
      r: grayValue,
      g: grayValue,
      b: grayValue,
    };
  }

  /** hue補間関数 */
  const hueToChannel = (p, q, t) => {
    /** 循環させた色相 */
    let normalizedT = t;
    if (normalizedT < 0) {
      normalizedT += 1;
    }
    if (normalizedT > 1) {
      normalizedT -= 1;
    }
    if (normalizedT < 1 / 6) {
      return p + (q - p) * 6 * normalizedT;
    }
    if (normalizedT < 1 / 2) {
      return q;
    }
    if (normalizedT < 2 / 3) {
      return p + (q - p) * (2 / 3 - normalizedT) * 6;
    }
    return p;
  };

  /** 補間計算のq */
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  /** 補間計算のp */
  const p = 2 * lightness - q;

  return {
    r: Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hue) * 255),
    b: Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
  };
};

/**
 * RGBをHEX文字列へ変換する
 * @param {{r:number,g:number,b:number}} rgb - RGB値
 * @returns {string} HEXカラー
 */
const convertRgbToHex = (rgb) => {
  /** HEXの赤 */
  const hexR = Math.max(0, Math.min(255, Number(rgb?.r || 0))).toString(16).padStart(2, '0');
  /** HEXの緑 */
  const hexG = Math.max(0, Math.min(255, Number(rgb?.g || 0))).toString(16).padStart(2, '0');
  /** HEXの青 */
  const hexB = Math.max(0, Math.min(255, Number(rgb?.b || 0))).toString(16).padStart(2, '0');
  return `#${hexR}${hexG}${hexB}`.toUpperCase();
};

/**
 * 現在テーマで可読性が高いブックマーク背景色へ変換する
 * @param {string} bookmarkColor - ブックマーク基準色
 * @param {Object} theme - 現在テーマ
 * @returns {string} テーマ適応後カラー
 */
const resolveReadableBookmarkThemeColor = (bookmarkColor, theme) => {
  /** パレット正規化済み基準色 */
  const normalizedBaseColor = normalizeBookmarkThemeColor(bookmarkColor);
  /** 基準色RGB */
  const baseRgb = parseColorToRgb(normalizedBaseColor);
  /** 文字色RGB */
  const textRgb = parseColorToRgb(theme?.text || '#111111');
  /** 背景色RGB */
  const backgroundRgb = parseColorToRgb(theme?.background || '#FFFFFF');
  if (!baseRgb || !textRgb || !backgroundRgb) {
    return normalizedBaseColor;
  }

  /** 背景の相対輝度 */
  const backgroundLuminance = calculateRelativeLuminance(backgroundRgb);
  if (backgroundLuminance >= LIGHT_THEME_BACKGROUND_LUMINANCE_THRESHOLD) {
    /** ライト寄り背景の明るさ強度（0〜1） */
    const lightThemeIntensity =
      (backgroundLuminance - LIGHT_THEME_BACKGROUND_LUMINANCE_THRESHOLD) /
      (1 - LIGHT_THEME_BACKGROUND_LUMINANCE_THRESHOLD);
    /** 正規化したライト強度 */
    const normalizedLightThemeIntensity = Math.max(0, Math.min(1, lightThemeIntensity));
    /** 基準色HSL */
    const baseHsl = convertRgbToHsl(baseRgb);
    /** ライト寄りテーマ向け明度低下量 */
    const lightThemeReduction =
      MIN_LIGHT_THEME_LIGHTNESS_REDUCTION +
      (MAX_LIGHT_THEME_LIGHTNESS_REDUCTION - MIN_LIGHT_THEME_LIGHTNESS_REDUCTION) *
        normalizedLightThemeIntensity;
    /** ライト寄りテーマ向け補正RGB */
    const lightAdjustedRgb = convertHslToRgb({
      h: baseHsl.h,
      s: baseHsl.s,
      l: Math.max(0.18, baseHsl.l - lightThemeReduction),
    });
    return convertRgbToHex(lightAdjustedRgb);
  }

  if (backgroundLuminance >= DARK_THEME_BACKGROUND_LUMINANCE_THRESHOLD) {
    return normalizedBaseColor;
  }

  /** 暗色テーマの深さ（0〜1） */
  const darkThemeIntensity =
    (DARK_THEME_BACKGROUND_LUMINANCE_THRESHOLD - backgroundLuminance) /
    DARK_THEME_BACKGROUND_LUMINANCE_THRESHOLD;
  /** 正規化した暗色強度 */
  const normalizedDarkThemeIntensity = Math.max(0, Math.min(1, darkThemeIntensity));
  /** 基準色HSL */
  const baseHsl = convertRgbToHsl(baseRgb);
  /** 明度の低下量 */
  const lightnessReduction =
    0.12 + MAX_BOOKMARK_LIGHTNESS_REDUCTION * normalizedDarkThemeIntensity;
  /** 彩度の上乗せ量（ビビッド化防止のため小さく抑える） */
  const saturationBoost = MAX_BOOKMARK_SATURATION_BOOST * normalizedDarkThemeIntensity;
  /** 補正後の明度 */
  let nextLightness = Math.max(0.18, baseHsl.l - lightnessReduction);
  /** 補正後の彩度 */
  const nextSaturation = Math.min(0.78, baseHsl.s + saturationBoost);

  /** 初期補正後RGB */
  let candidateRgb = convertHslToRgb({
    h: baseHsl.h,
    s: nextSaturation,
    l: nextLightness,
  });
  /** 初期補正後コントラスト比 */
  let candidateContrastRatio = calculateContrastRatio(candidateRgb, textRgb);

  if (candidateContrastRatio >= MIN_BOOKMARK_CONTRAST_RATIO) {
    return convertRgbToHex(candidateRgb);
  }

  for (let step = 0; step < 6; step += 1) {
    nextLightness = Math.max(0.16, nextLightness - 0.04);
    candidateRgb = convertHslToRgb({
      h: baseHsl.h,
      s: nextSaturation,
      l: nextLightness,
    });
    candidateContrastRatio = calculateContrastRatio(candidateRgb, textRgb);
    if (candidateContrastRatio >= MIN_BOOKMARK_CONTRAST_RATIO) {
      return convertRgbToHex(candidateRgb);
    }
  }

  return convertRgbToHex(candidateRgb);
};

/**
 * TimeSchedule のメイン画面を表示する
 * @param {Object} props - コンポーネント引数
 * @param {Object} props.navigation - React Navigation の navigation
 * @returns {JSX.Element} TimeSchedule 画面
 */
const TimeScheduleScreen = ({ navigation }) => {
  /** テーマ情報 */
  const { theme } = useTheme();
  /** 現在の画面幅 */
  const { width: windowWidth } = useWindowDimensions();
  /** モバイルレイアウトか */
  const isMobileLayout = windowWidth < MOBILE_LAYOUT_BREAKPOINT;
  /** 認証ユーザー情報 */
  const { user } = useAuth();
  /** 選択中日付 */
  const [selectedDate, setSelectedDate] = useState(getInitialScheduleDate());
  /** ユーザー保存済みブックマーク一覧 */
  const [displayBookmarks, setDisplayBookmarks] = useState([]);
  /** ブックマーク一覧モーダル編集中のブックマーク一覧 */
  const [draftDisplayBookmarks, setDraftDisplayBookmarks] = useState([]);
  /** 非表示にしたブックマークID一覧 */
  const [hiddenBookmarkIds, setHiddenBookmarkIds] = useState([]);
  /** ブックマーク並び順ID一覧 */
  const [bookmarkOrderIds, setBookmarkOrderIds] = useState([]);
  /** 並び替え中のブックマークID */
  const [draggingBookmarkId, setDraggingBookmarkId] = useState('');
  /** ドラッグ中のY移動量 */
  const [draggingOffsetY, setDraggingOffsetY] = useState(0);
  /** ブックマーク行の実測高さ(px) */
  const [bookmarkRowHeight, setBookmarkRowHeight] = useState(REORDER_DRAG_ROW_HEIGHT_PX);
  /** 現在適用中のブックマークID */
  const [activeBookmarkId, setActiveBookmarkId] = useState('');
  /** DBに存在する開催日 */
  const [availableDates, setAvailableDates] = useState([]);
  /** 読み込み状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** エリア一覧 */
  const [areas, setAreas] = useState([]);
  /** area_locations由来のエリアマスタ一覧 */
  const [areaLocations, setAreaLocations] = useState([]);
  /** event_organizations 由来の団体マスタ一覧 */
  const [eventOrganizations, setEventOrganizations] = useState([]);
  /** タイムライン表示行 */
  const [timelineRows, setTimelineRows] = useState([]);
  /** 選択日付の表示対象スケジュール一覧 */
  const [scheduleItems, setScheduleItems] = useState([]);
  /** タイムライン表示領域幅 */
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  /** 横スクロール位置 */
  const [timelineScrollX, setTimelineScrollX] = useState(0);
  /** 表示項目設定モーダル表示状態 */
  const [isDisplaySettingsModalVisible, setIsDisplaySettingsModalVisible] = useState(false);
  /** ブックマーク一覧モーダル表示状態 */
  const [isBookmarkListModalVisible, setIsBookmarkListModalVisible] = useState(false);
  /** ブックマーク一覧モーダルで選択中のタブ */
  const [activeBookmarkListTab, setActiveBookmarkListTab] = useState(BOOKMARK_LIST_TABS.DEFAULT);
  /** タイムライン表示で選択中のブックマークタブ */
  const [activeTimelineBookmarkTab, setActiveTimelineBookmarkTab] = useState(BOOKMARK_LIST_TABS.DEFAULT);
  /** ブックマーク一覧モーダル編集中の非表示ID一覧 */
  const [draftHiddenBookmarkIds, setDraftHiddenBookmarkIds] = useState([]);
  /** ブックマーク一覧モーダル編集中の並び順ID一覧 */
  const [draftBookmarkOrderIds, setDraftBookmarkOrderIds] = useState([]);
  /** 既定ブックマーク色の上書きMap（bookmarkId -> color） */
  const [defaultBookmarkColorMap, setDefaultBookmarkColorMap] = useState({});
  /** ブックマーク一覧モーダル編集中の既定ブックマーク色Map */
  const [draftDefaultBookmarkColorMap, setDraftDefaultBookmarkColorMap] = useState({});
  /** 既定ブックマーク色編集モーダル表示状態 */
  const [isDefaultBookmarkColorModalVisible, setIsDefaultBookmarkColorModalVisible] = useState(false);
  /** 色編集対象の既定ブックマークID */
  const [editingDefaultBookmarkId, setEditingDefaultBookmarkId] = useState('');
  /** 色編集対象の既定ブックマーク名 */
  const [editingDefaultBookmarkName, setEditingDefaultBookmarkName] = useState('');
  /** 既定ブックマーク色編集モーダルのドラフトカラー */
  const [draftDefaultBookmarkColor, setDraftDefaultBookmarkColor] = useState(DEFAULT_BOOKMARK_THEME_COLOR);
  /** ブックマーク削除確認モーダル表示状態 */
  const [isDeleteConfirmModalVisible, setIsDeleteConfirmModalVisible] = useState(false);
  /** 削除確認中のブックマーク */
  const [pendingDeleteBookmark, setPendingDeleteBookmark] = useState(null);
  /** 設定中の評価軸 */
  const [draftAxis, setDraftAxis] = useState(BOOKMARK_AXES.BUILDING);
  /** 設定中の検索語 */
  const [draftSearchText, setDraftSearchText] = useState('');
  /** 設定中の選択キー一覧 */
  const [draftSelectedCriteriaKeys, setDraftSelectedCriteriaKeys] = useState([]);
  /** 設定中のブックマーク名 */
  const [draftBookmarkName, setDraftBookmarkName] = useState('');
  /** 設定中のブックマークテーマカラー */
  const [draftBookmarkColor, setDraftBookmarkColor] = useState(DEFAULT_BOOKMARK_THEME_COLOR);
  /** 編集対象ブックマークID（新規時は空） */
  const [editingBookmarkId, setEditingBookmarkId] = useState('');
  /** 設定モーダル内のエラー文言 */
  const [settingsErrorMessage, setSettingsErrorMessage] = useState('');
  /** 追加モーダル終了後に一覧へ戻すか */
  const [shouldReturnToBookmarkList, setShouldReturnToBookmarkList] = useState(false);
  /** 選択中詳細アイテム */
  const [selectedItem, setSelectedItem] = useState(null);
  /** 詳細モーダル表示状態 */
  const [isModalVisible, setIsModalVisible] = useState(false);
  /** 並び替えドラッグの内部状態 */
  const reorderDragStateRef = useRef({
    activeBookmarkId: '',
    startIndex: -1,
    currentIndex: -1,
    startPageY: 0,
  });
  /** ドラッグオフセット更新用の最新値参照 */
  const latestDraggingOffsetRef = useRef(0);
  /** requestAnimationFrame ID */
  const dragOffsetAnimationFrameRef = useRef(null);
  /** Webマウスドラッグのイベントハンドラー参照 */
  const webMouseDragListenersRef = useRef({
    move: null,
    up: null,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  /**
   * ローカル保存済みの表示設定を復元する
   * @returns {Promise<void>} 復元処理
   */
  const restoreSelections = useCallback(async () => {
    /** 保存キー */
    const storageKeys = buildDisplayStorageKeys(user?.id);
    try {
      /** 取得した保存値 */
      const savedRows = await AsyncStorage.multiGet([
        STORAGE_KEYS.SELECTED_DATE,
        storageKeys.bookmarksKey,
        storageKeys.activeKey,
        storageKeys.hiddenKey,
        storageKeys.orderKey,
        storageKeys.defaultColorsKey,
      ]);
      /** 保存済み日付 */
      const savedDate = savedRows.find(([key]) => key === STORAGE_KEYS.SELECTED_DATE)?.[1] || '';
      /** 保存済みブックマーク一覧 */
      const savedBookmarks = savedRows.find(([key]) => key === storageKeys.bookmarksKey)?.[1] || '';
      /** 保存済みアクティブブックマークID */
      const savedActiveBookmarkId =
        savedRows.find(([key]) => key === storageKeys.activeKey)?.[1] || '';
      /** 保存済み非表示ブックマークID */
      const savedHiddenBookmarkIds = savedRows.find(([key]) => key === storageKeys.hiddenKey)?.[1] || '[]';
      /** 保存済み並び順ブックマークID */
      const savedBookmarkOrderIds = savedRows.find(([key]) => key === storageKeys.orderKey)?.[1] || '[]';
      /** 保存済み既定ブックマーク色Map */
      const savedDefaultBookmarkColors =
        savedRows.find(([key]) => key === storageKeys.defaultColorsKey)?.[1] || '{}';

      if (DATE_FORMAT_PATTERN.test(savedDate)) {
        setSelectedDate(savedDate);
      }

      if (savedBookmarks) {
        /** 復元したブックマーク一覧 */
        const parsedBookmarks = JSON.parse(savedBookmarks);
        if (Array.isArray(parsedBookmarks)) {
          /** カラー正規化後のブックマーク一覧 */
          const normalizedBookmarks = parsedBookmarks
            .map((bookmark) => {
              /** 正規化したID */
              const normalizedId = String(bookmark?.id || '').trim();
              /** 正規化した軸 */
              const normalizedAxis = String(bookmark?.axis || BOOKMARK_AXES.BUILDING).trim() || BOOKMARK_AXES.BUILDING;
              /** 正規化した基準キー */
              const normalizedCriteriaKeys = Array.isArray(bookmark?.criteriaKeys)
                ? bookmark.criteriaKeys.map((key) => String(key || '').trim()).filter(Boolean)
                : [];
              if (!normalizedId || normalizedCriteriaKeys.length === 0) {
                return null;
              }
              return {
                ...bookmark,
                id: normalizedId,
                axis: normalizedAxis,
                criteriaKeys: normalizedCriteriaKeys,
                color: normalizeBookmarkThemeColor(bookmark?.color),
              };
            })
            .filter(Boolean);
          setDisplayBookmarks(normalizedBookmarks);
        }
      }

      /** 復元した非表示ID配列 */
      const parsedHiddenBookmarkIds = JSON.parse(savedHiddenBookmarkIds);
      if (Array.isArray(parsedHiddenBookmarkIds)) {
        setHiddenBookmarkIds(
          parsedHiddenBookmarkIds.map((id) => String(id || '').trim()).filter(Boolean)
        );
      }

      /** 復元した並び順ID配列 */
      const parsedBookmarkOrderIds = JSON.parse(savedBookmarkOrderIds);
      if (Array.isArray(parsedBookmarkOrderIds)) {
        setBookmarkOrderIds(parsedBookmarkOrderIds.map((id) => String(id || '').trim()).filter(Boolean));
      }

      /** 復元した既定ブックマーク色Map */
      const parsedDefaultBookmarkColors = JSON.parse(savedDefaultBookmarkColors);
      if (parsedDefaultBookmarkColors && typeof parsedDefaultBookmarkColors === 'object') {
        /** 正規化後の既定ブックマーク色Map */
        const normalizedDefaultColorMap = Object.entries(parsedDefaultBookmarkColors).reduce(
          (result, [bookmarkId, bookmarkColor]) => {
            /** 正規化したブックマークID */
            const normalizedBookmarkId = String(bookmarkId || '').trim();
            if (!normalizedBookmarkId) {
              return result;
            }
            result[normalizedBookmarkId] = normalizeBookmarkThemeColor(bookmarkColor);
            return result;
          },
          {}
        );
        setDefaultBookmarkColorMap(normalizedDefaultColorMap);
      }

      setActiveBookmarkId(String(savedActiveBookmarkId || ''));
    } catch (error) {
      // 復元失敗時は既定値を使用
    }
  }, [user?.id]);

  /**
   * 表示設定をローカル保存する
   * @param {string} nextDate - 保存日付
   * @param {Array<Object>} nextBookmarks - 保存するブックマーク配列
  * @param {string} nextActiveBookmarkId - 保存するアクティブブックマークID
  * @param {Array<string>} nextHiddenBookmarkIds - 保存する非表示ブックマークID配列
   * @param {Array<string>} nextBookmarkOrderIds - 保存する並び順ブックマークID配列
   * @param {Object} nextDefaultBookmarkColorMap - 保存する既定ブックマーク色Map
   * @returns {Promise<void>} 保存処理
   */
  const persistSelections = useCallback(async (
    nextDate,
    nextBookmarks,
    nextActiveBookmarkId,
    nextHiddenBookmarkIds,
    nextBookmarkOrderIds,
    nextDefaultBookmarkColorMap
  ) => {
    /** 保存キー */
    const storageKeys = buildDisplayStorageKeys(user?.id);
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.SELECTED_DATE, String(nextDate)],
        [storageKeys.bookmarksKey, JSON.stringify(nextBookmarks || [])],
        [storageKeys.activeKey, String(nextActiveBookmarkId || '')],
        [storageKeys.hiddenKey, JSON.stringify(nextHiddenBookmarkIds || [])],
        [storageKeys.orderKey, JSON.stringify(nextBookmarkOrderIds || [])],
        [storageKeys.defaultColorsKey, JSON.stringify(nextDefaultBookmarkColorMap || {})],
      ]);
    } catch (error) {
      // 保存失敗時は表示処理を継続
    }
  }, [user?.id]);

  /** エリアIDごとの表示名Map */
  const areaLabelMap = useMemo(() => {
    /** 表示名Map */
    const labelMap = {};

    (areaLocations || []).forEach((area) => {
      /** エリアID */
      const areaId = String(area.area_id || '').trim();
      /** エリア名 */
      const areaName = String(area.area_name || '').trim();
      if (!areaId) {
        return;
      }
      labelMap[areaId] = areaName || `エリア ${areaId}`;
    });

    return labelMap;
  }, [areaLocations]);

  /** 初期表示対象の建物ID一覧 */
  const defaultVisibleBuildingIds = useMemo(() => {
    return DEFAULT_VISIBLE_BUILDING_NAMES
      .map((buildingName) =>
        (areas || []).find((building) => String(building.building_name || '') === buildingName)
      )
      .filter(Boolean)
      .map((building) => String(building.building_id || ''));
  }, [areas]);

  /** 既定のブックマーク一覧（建物ごとに個別） */
  const defaultBookmarks = useMemo(() => {
    return defaultVisibleBuildingIds.map((buildingId, index) => {
      /** 建物情報 */
      const building = (areas || []).find(
        (currentBuilding) => String(currentBuilding.building_id || '') === String(buildingId || '')
      );
      /** 建物名 */
      const buildingName = String(building?.building_name || '既定項目').trim() || '既定項目';
      /** 既定ブックマークカラー */
      const defaultBookmarkColor =
        BOOKMARK_THEME_COLORS[index % BOOKMARK_THEME_COLORS.length] || DEFAULT_BOOKMARK_THEME_COLOR;
      /** 保存済み上書きカラー */
      const overriddenBookmarkColor = pickBookmarkOverrideColor(
        defaultBookmarkColorMap,
        `${DEFAULT_BOOKMARK_ID_PREFIX}${buildingId}`
      );
      return {
        id: `${DEFAULT_BOOKMARK_ID_PREFIX}${buildingId}`,
        name: buildingName,
        axis: BOOKMARK_AXES.BUILDING,
        criteriaKeys: [String(buildingId || '')],
        color: overriddenBookmarkColor || defaultBookmarkColor,
        isSystem: true,
      };
    });
  }, [areas, defaultBookmarkColorMap, defaultVisibleBuildingIds]);

  /** モーダルで扱う既定ブックマーク色Map（表示中は下書きを優先） */
  const effectiveDefaultBookmarkColorMapForModal = useMemo(() => {
    return isBookmarkListModalVisible
      ? (draftDefaultBookmarkColorMap || {})
      : (defaultBookmarkColorMap || {});
  }, [defaultBookmarkColorMap, draftDefaultBookmarkColorMap, isBookmarkListModalVisible]);

  /** ブックマーク一覧モーダル向け既定ブックマーク一覧 */
  const defaultBookmarksForModalSource = useMemo(() => {
    return defaultVisibleBuildingIds.map((buildingId, index) => {
      /** 建物情報 */
      const building = (areas || []).find(
        (currentBuilding) => String(currentBuilding.building_id || '') === String(buildingId || '')
      );
      /** 建物名 */
      const buildingName = String(building?.building_name || '既定項目').trim() || '既定項目';
      /** 既定ブックマークカラー */
      const defaultBookmarkColor =
        BOOKMARK_THEME_COLORS[index % BOOKMARK_THEME_COLORS.length] || DEFAULT_BOOKMARK_THEME_COLOR;
      /** 保存済み上書きカラー（モーダル表示中は下書き色を参照） */
      const overriddenBookmarkColor = pickBookmarkOverrideColor(
        effectiveDefaultBookmarkColorMapForModal,
        `${DEFAULT_BOOKMARK_ID_PREFIX}${buildingId}`
      );
      return {
        id: `${DEFAULT_BOOKMARK_ID_PREFIX}${buildingId}`,
        name: buildingName,
        axis: BOOKMARK_AXES.BUILDING,
        criteriaKeys: [String(buildingId || '')],
        color: overriddenBookmarkColor || defaultBookmarkColor,
        isSystem: true,
      };
    });
  }, [areas, defaultVisibleBuildingIds, effectiveDefaultBookmarkColorMapForModal]);

  /** 画面で利用可能なブックマーク一覧 */
  const mergedBookmarks = useMemo(() => {
    /** ユーザー作成分 */
    const userBookmarks = (displayBookmarks || []).filter(
      (bookmark) => !String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
    return [...defaultBookmarks, ...userBookmarks];
  }, [defaultBookmarks, displayBookmarks]);

  /** ブックマーク一覧モーダルで扱う下書き込みブックマーク一覧 */
  const mergedBookmarksForModal = useMemo(() => {
    /** モーダル表示中は下書き、非表示時は本体状態を参照 */
    const sourceBookmarks = isBookmarkListModalVisible ? draftDisplayBookmarks : displayBookmarks;
    /** ユーザー作成分 */
    const userBookmarks = (sourceBookmarks || []).filter(
      (bookmark) => !String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
    return [...defaultBookmarksForModalSource, ...userBookmarks];
  }, [
    defaultBookmarksForModalSource,
    displayBookmarks,
    draftDisplayBookmarks,
    isBookmarkListModalVisible,
  ]);

  /** 並び順を適用したブックマーク一覧 */
  const orderedMergedBookmarks = useMemo(() => {
    /** 並び順ID -> index のMap */
    const orderMap = {};
    (bookmarkOrderIds || []).forEach((bookmarkId, index) => {
      orderMap[String(bookmarkId || '')] = index;
    });

    return [...(mergedBookmarks || [])].sort((left, right) => {
      /** 左ID */
      const leftId = String(left?.id || '');
      /** 右ID */
      const rightId = String(right?.id || '');
      /** 左並び順 */
      const leftOrder = Number.isInteger(orderMap[leftId]) ? orderMap[leftId] : Number.MAX_SAFE_INTEGER;
      /** 右並び順 */
      const rightOrder = Number.isInteger(orderMap[rightId]) ? orderMap[rightId] : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left.name || '').localeCompare(String(right.name || ''), 'ja', { numeric: true });
    });
  }, [bookmarkOrderIds, mergedBookmarks]);

  /** タイムライン表示で使うデフォルトタブ一覧 */
  const defaultBookmarksForTimeline = useMemo(() => {
    return (orderedMergedBookmarks || []).filter((bookmark) =>
      String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
  }, [orderedMergedBookmarks]);

  /** タイムライン表示で使うマイリストタブ一覧 */
  const myListBookmarksForTimeline = useMemo(() => {
    return (orderedMergedBookmarks || []).filter(
      (bookmark) => !String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
  }, [orderedMergedBookmarks]);

  /** 表示対象（非表示除外）のブックマーク一覧 */
  const visibleBookmarks = useMemo(() => {
    /** タブ選択に応じた対象一覧 */
    const selectedBookmarks =
      activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.DEFAULT
        ? defaultBookmarksForTimeline
        : myListBookmarksForTimeline;

    return selectedBookmarks.filter(
      (bookmark) => !hiddenBookmarkIds.includes(String(bookmark.id || ''))
    );
  }, [
    activeTimelineBookmarkTab,
    defaultBookmarksForTimeline,
    hiddenBookmarkIds,
    myListBookmarksForTimeline,
  ]);

  /** ブックマーク一覧モーダルで現在編集中の非表示ID一覧 */
  const effectiveHiddenBookmarkIdsForModal = useMemo(() => {
    if (!isBookmarkListModalVisible) {
      return hiddenBookmarkIds;
    }
    return draftHiddenBookmarkIds;
  }, [draftHiddenBookmarkIds, hiddenBookmarkIds, isBookmarkListModalVisible]);

  /** ブックマーク一覧モーダルで現在編集中の並び順ID一覧 */
  const effectiveBookmarkOrderIdsForModal = useMemo(() => {
    if (!isBookmarkListModalVisible) {
      return bookmarkOrderIds;
    }
    return draftBookmarkOrderIds;
  }, [bookmarkOrderIds, draftBookmarkOrderIds, isBookmarkListModalVisible]);

  /** ブックマーク一覧モーダルで表示する並び順適用済み一覧 */
  const orderedMergedBookmarksForModal = useMemo(() => {
    /** 並び順ID -> index のMap */
    const orderMap = {};
    (effectiveBookmarkOrderIdsForModal || []).forEach((bookmarkId, index) => {
      orderMap[String(bookmarkId || '')] = index;
    });

    return [...(mergedBookmarksForModal || [])].sort((left, right) => {
      /** 左ID */
      const leftId = String(left?.id || '');
      /** 右ID */
      const rightId = String(right?.id || '');
      /** 左並び順 */
      const leftOrder = Number.isInteger(orderMap[leftId]) ? orderMap[leftId] : Number.MAX_SAFE_INTEGER;
      /** 右並び順 */
      const rightOrder = Number.isInteger(orderMap[rightId]) ? orderMap[rightId] : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left.name || '').localeCompare(String(right.name || ''), 'ja', { numeric: true });
    });
  }, [effectiveBookmarkOrderIdsForModal, mergedBookmarksForModal]);

  /** ブックマーク一覧モーダルのデフォルトタブ一覧 */
  const defaultBookmarksForModal = useMemo(() => {
    return (orderedMergedBookmarksForModal || []).filter((bookmark) =>
      String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
  }, [orderedMergedBookmarksForModal]);

  /** ブックマーク一覧モーダルのマイリストタブ一覧 */
  const myListBookmarksForModal = useMemo(() => {
    return (orderedMergedBookmarksForModal || []).filter(
      (bookmark) => !String(bookmark?.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)
    );
  }, [orderedMergedBookmarksForModal]);

  /** マイリストタブの並び順ID一覧 */
  const myListBookmarkIdsForModal = useMemo(() => {
    return (myListBookmarksForModal || []).map((bookmark) => String(bookmark?.id || '').trim()).filter(Boolean);
  }, [myListBookmarksForModal]);

  /** 設定モーダルに表示する建物一覧（固定順） */
  const orderedSettingsBuildings = useMemo(() => {
    return [...(areas || [])].sort((left, right) => {
      return compareByFixedLocationOrder(left.building_name, right.building_name);
    });
  }, [areas]);

  /** 軸ごとの選択候補一覧 */
  const axisCandidatesMap = useMemo(() => {
    /** 建物軸候補 */
    const buildingCandidates = orderedSettingsBuildings.map((building) => ({
      key: String(building.building_id || ''),
      label: String(building.building_name || ''),
      labelKana: String(building.building_name_kana || ''),
    }));

    /** 団体名候補Map（マスタ由来。同名団体のかな情報を統合） */
    const groupCandidateMap = (eventOrganizations || []).reduce((result, organization) => {
      /** 正規化した団体名 */
      const groupName = String(organization.group_name || '').trim();
      /** 正規化した団体かな */
      const groupNameKana = String(organization.group_name_kana || '').trim();
      if (!groupName) {
        return result;
      }

      /** 既存候補 */
      const existingCandidate = result.get(groupName);
      if (!existingCandidate) {
        result.set(groupName, {
          key: groupName,
          label: groupName,
          labelKana: groupNameKana,
        });
        return result;
      }

      // 既存候補にかながない場合のみ後続データで補完する
      if (!existingCandidate.labelKana && groupNameKana) {
        result.set(groupName, {
          ...existingCandidate,
          labelKana: groupNameKana,
        });
      }

      return result;
    }, new Map());

    /** 団体名候補 */
    const groupCandidates = Array.from(groupCandidateMap.values())
      .filter((candidate) => Boolean(candidate.key))
      .sort((left, right) => {
        /** 左かな名 */
        const leftKana = String(left.labelKana || '').trim();
        /** 右かな名 */
        const rightKana = String(right.labelKana || '').trim();
        if (leftKana && rightKana) {
          const kanaCompareResult = leftKana.localeCompare(rightKana, 'ja', { numeric: true });
          if (kanaCompareResult !== 0) {
            return kanaCompareResult;
          }
        } else if (leftKana || rightKana) {
          return leftKana ? -1 : 1;
        }

        return String(left.label || '').localeCompare(String(right.label || ''), 'ja', { numeric: true });
      });

    /** エリア候補 */
    const areaCandidates = (areaLocations || [])
      .map((area, index) => ({
        key: String(area.area_id || '').trim(),
        label: String(area.area_name || '').trim() || `エリア ${String(area.area_id || '').trim()}`,
        labelKana: String(area.area_name_kana || '').trim(),
        order: Number.isFinite(Number(area.display_order)) ? Number(area.display_order) : index + 1,
      }))
      .filter((candidate) => Boolean(candidate.key))
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return left.label.localeCompare(right.label, 'ja', { numeric: true });
      })
      .map(({ key, label, labelKana }) => ({ key, label, labelKana }));

    /** 未設定エリアの予定が存在するか */
    const hasUnassignedAreaItems = (scheduleItems || []).some(
      (item) => !String(item.areaId || '').trim()
    );
    if (hasUnassignedAreaItems) {
      areaCandidates.push({
        key: 'UNASSIGNED_AREA',
        label: 'エリア未設定',
        labelKana: '',
      });
    }

    return {
      [BOOKMARK_AXES.BUILDING]: buildingCandidates,
      [BOOKMARK_AXES.GROUP]: groupCandidates,
      [BOOKMARK_AXES.AREA]: areaCandidates,
    };
  }, [areaLocations, eventOrganizations, orderedSettingsBuildings, scheduleItems]);

  /** 軸ごとの候補キー->表示名マップ */
  const axisCandidateLabelMap = useMemo(() => {
    /** 建物候補の表示名マップ */
    const buildingLabelMap = (axisCandidatesMap[BOOKMARK_AXES.BUILDING] || []).reduce(
      (result, candidate) => {
        /** 候補キー */
        const candidateKey = String(candidate?.key || '').trim();
        /** 候補表示名 */
        const candidateLabel = String(candidate?.label || '').trim();
        if (!candidateKey) {
          return result;
        }
        result[candidateKey] = candidateLabel || candidateKey;
        return result;
      },
      {}
    );

    /** エリア候補の表示名マップ */
    const areaLabelMapByKey = (axisCandidatesMap[BOOKMARK_AXES.AREA] || []).reduce((result, candidate) => {
      /** 候補キー */
      const candidateKey = String(candidate?.key || '').trim();
      /** 候補表示名 */
      const candidateLabel = String(candidate?.label || '').trim();
      if (!candidateKey) {
        return result;
      }
      result[candidateKey] = candidateLabel || candidateKey;
      return result;
    }, {});

    /** 団体候補の表示名マップ */
    const groupLabelMap = (axisCandidatesMap[BOOKMARK_AXES.GROUP] || []).reduce((result, candidate) => {
      /** 候補キー */
      const candidateKey = String(candidate?.key || '').trim();
      /** 候補表示名 */
      const candidateLabel = String(candidate?.label || '').trim();
      if (!candidateKey) {
        return result;
      }
      result[candidateKey] = candidateLabel || candidateKey;
      return result;
    }, {});

    return {
      [BOOKMARK_AXES.BUILDING]: buildingLabelMap,
      [BOOKMARK_AXES.AREA]: areaLabelMapByKey,
      [BOOKMARK_AXES.GROUP]: groupLabelMap,
    };
  }, [axisCandidatesMap]);

  /** ブックマークの選択項目名を表示用テキストへ変換する */
  const buildBookmarkCriteriaSummaryText = useCallback((bookmark) => {
    /** 評価軸 */
    const axis = String(bookmark?.axis || BOOKMARK_AXES.BUILDING).trim() || BOOKMARK_AXES.BUILDING;
    /** 軸ごとの候補表示名マップ */
    const labelMap = axisCandidateLabelMap[axis] || {};
    /** ブックマークの選択キー配列 */
    const criteriaKeys = Array.isArray(bookmark?.criteriaKeys)
      ? bookmark.criteriaKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    /** 選択キーから復元した表示名一覧（重複排除） */
    const criteriaLabels = Array.from(
      new Set(
        criteriaKeys.map((key) => {
          return String(labelMap[key] || key).trim();
        }).filter(Boolean)
      )
    );

    if (criteriaLabels.length === 0) {
      return '表示対象なし';
    }

    return criteriaLabels.join(' / ');
  }, [axisCandidateLabelMap]);

  /** 設定モーダルで表示する現在選択中項目テキスト */
  const draftSelectedCriteriaSummaryText = useMemo(() => {
    /** 現在の軸に対応する候補表示名マップ */
    const currentAxisLabelMap = axisCandidateLabelMap[draftAxis] || {};
    /** 現在選択中キー一覧 */
    const selectedKeys = Array.isArray(draftSelectedCriteriaKeys)
      ? draftSelectedCriteriaKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    /** 表示名へ解決した選択項目一覧（重複排除） */
    const selectedLabels = Array.from(
      new Set(
        selectedKeys.map((key) => {
          return String(currentAxisLabelMap[key] || key).trim();
        }).filter(Boolean)
      )
    );

    if (selectedLabels.length === 0) {
      return '未選択';
    }

    return selectedLabels.join(' / ');
  }, [axisCandidateLabelMap, draftAxis, draftSelectedCriteriaKeys]);

  /** モーダルで表示する候補一覧（検索適用後） */
  const filteredDraftCandidates = useMemo(() => {
    /** 現在軸の候補一覧 */
    const candidates = axisCandidatesMap[draftAxis] || [];
    /** 正規化検索語 */
    const normalizedQuery = normalizeSearchText(draftSearchText);
    if (!normalizedQuery) {
      return candidates;
    }

    /** クエリをトークン分割 */
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);

    /** 検索用に正規化済みフィールドを付与した候補一覧 */
    const searchableCandidates = candidates.map((candidate) => ({
      ...candidate,
      _search: {
        label: normalizeSearchText(candidate.label || ''),
        labelKana: normalizeSearchText(candidate.labelKana || ''),
      },
    }));

    /** 部分一致（AND）した候補 */
    const partialMatchedCandidates = searchableCandidates.filter((candidate) => {
      /** 候補の検索対象フィールド */
      const searchableFields = [
        candidate._search.label,
        candidate._search.labelKana,
      ];

      return queryTokens.every((token) => {
        return searchableFields.some((field) => String(field || '').includes(token));
      });
    });

    if (partialMatchedCandidates.length > 0) {
      return partialMatchedCandidates
        .sort((left, right) => {
          /** 左候補スコア */
          const leftScore = calculateCandidatePrefixPriorityScore(left, queryTokens);
          /** 右候補スコア */
          const rightScore = calculateCandidatePrefixPriorityScore(right, queryTokens);
          if (leftScore !== rightScore) {
            return rightScore - leftScore;
          }
          return String(left.label || '').localeCompare(String(right.label || ''), 'ja', { numeric: true });
        })
        .map(({ _search, ...rest }) => rest);
    }

    /** 部分一致ゼロ時はあいまい検索で候補を補う */
    const fuzzySearcher = new Fuse(searchableCandidates, {
      includeScore: false,
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
      keys: [
        { name: '_search.label', weight: 0.56 },
        { name: '_search.labelKana', weight: 0.44 },
      ],
    });

    return fuzzySearcher.search(normalizedQuery).map((result) => {
      /** Fuse結果の候補 */
      const matchedCandidate = result.item;
      const { _search, ...rest } = matchedCandidate;
      return rest;
    });
  }, [axisCandidatesMap, draftAxis, draftSearchText]);

  /** 選択中日付のインデックス */
  const selectedDateIndex = useMemo(() => {
    return availableDates.indexOf(selectedDate);
  }, [availableDates, selectedDate]);

  /** 前日へ移動可能か */
  const canMovePrevDate = selectedDateIndex > 0;
  /** 翌日へ移動可能か */
  const canMoveNextDate = selectedDateIndex !== -1 && selectedDateIndex < availableDates.length - 1;
  /** 1時間ごとの罫線色（テーマ色を濃く適用） */
  const hourlyLineColor = useMemo(() => toAlphaColor(theme.primary, 0.72), [theme.primary]);
  /** 通常罫線色（テーマ色を薄く適用） */
  const regularLineColor = useMemo(() => toAlphaColor(theme.primary, 0.18), [theme.primary]);

  /**
   * タイムラインを取得する
   * @returns {Promise<void>} 取得処理
   */
  const fetchTimeline = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      /** タイムライン取得結果 */
      const result = await timeScheduleService.selectTimeScheduleTimeline({
        scheduleDate: selectedDate,
        buildingIds: [],
      });

      setAreas(result.areas || []);
      setAreaLocations(result.areaLocations || []);
      setEventOrganizations(result.eventOrganizations || []);
      setTimelineRows(result.timeline || []);
      setScheduleItems(result.slots || []);
      setAvailableDates(result.availableDates || []);

      if (result.resolvedScheduleDate && result.resolvedScheduleDate !== selectedDate) {
        setSelectedDate(result.resolvedScheduleDate);
      }
    } catch (error) {
      setErrorMessage(error?.message || 'タイムスケジュールの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    restoreSelections();
  }, [restoreSelections]);

  useEffect(() => {
    fetchTimeline();
    persistSelections(
      selectedDate,
      displayBookmarks,
      activeBookmarkId,
      hiddenBookmarkIds,
      bookmarkOrderIds,
      defaultBookmarkColorMap
    );
  }, [
    activeBookmarkId,
    bookmarkOrderIds,
    defaultBookmarkColorMap,
    displayBookmarks,
    fetchTimeline,
    hiddenBookmarkIds,
    persistSelections,
    selectedDate,
  ]);

  useEffect(() => {
    if (!activeBookmarkId) {
      return;
    }
    if (!hiddenBookmarkIds.includes(String(activeBookmarkId || ''))) {
      return;
    }
    setActiveBookmarkId(String(visibleBookmarks[0]?.id || orderedMergedBookmarks[0]?.id || ''));
  }, [activeBookmarkId, hiddenBookmarkIds, orderedMergedBookmarks, visibleBookmarks]);

  useEffect(() => {
    if (activeBookmarkId) {
      return;
    }
    if (visibleBookmarks.length > 0) {
      setActiveBookmarkId(String(visibleBookmarks[0].id || ''));
      return;
    }
    if (orderedMergedBookmarks.length > 0) {
      setActiveBookmarkId(String(orderedMergedBookmarks[0].id || ''));
    }
  }, [activeBookmarkId, orderedMergedBookmarks, visibleBookmarks]);

  useEffect(() => {
    /** 現在有効なブックマークID一覧 */
    const mergedBookmarkIds = (mergedBookmarks || []).map((bookmark) => String(bookmark.id || ''));
    /** 既存並び順のうち有効なIDだけ抽出 */
    const normalizedExistingIds = (bookmarkOrderIds || []).filter((bookmarkId) =>
      mergedBookmarkIds.includes(String(bookmarkId || ''))
    );
    /** 並び順にない新規ID一覧 */
    const missingIds = mergedBookmarkIds.filter(
      (bookmarkId) => !normalizedExistingIds.includes(String(bookmarkId || ''))
    );
    /** 次の並び順ID一覧 */
    const nextOrderIds = [...normalizedExistingIds, ...missingIds];

    if (isSameStringArray(nextOrderIds, bookmarkOrderIds)) {
      return;
    }
    setBookmarkOrderIds(nextOrderIds);
  }, [bookmarkOrderIds, mergedBookmarks]);

  /**
   * タイムライン表示対象アイテムを表示中ブックマーク群で絞り込む
   */
  const visibleScheduleItems = useMemo(() => {
    return (scheduleItems || []).filter((item) => {
      return (visibleBookmarks || []).some((bookmark) => {
        /** 評価軸で抽出したキー */
        const axisValue = extractAxisValue(item, bookmark.axis || BOOKMARK_AXES.BUILDING, areaLabelMap);
        /** ブックマーク基準キー */
        const bookmarkCriteriaKeys = Array.isArray(bookmark.criteriaKeys)
          ? bookmark.criteriaKeys.map((key) => String(key || ''))
          : [];
        return bookmarkCriteriaKeys.includes(String(axisValue.key || ''));
      });
    });
  }, [areaLabelMap, scheduleItems, visibleBookmarks]);

  /**
   * 開始時刻順でスケジュールを並べる
   */
  const sortedScheduleItems = useMemo(() => {
    return [...visibleScheduleItems].sort((left, right) => {
      const leftStart = typeof left.entryStartMinutes === 'number' ? left.entryStartMinutes : left.startMinutes;
      const rightStart = typeof right.entryStartMinutes === 'number' ? right.entryStartMinutes : right.startMinutes;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }

      const leftEnd = typeof left.exitEndMinutes === 'number' ? left.exitEndMinutes : left.endMinutes;
      const rightEnd = typeof right.exitEndMinutes === 'number' ? right.exitEndMinutes : right.endMinutes;
      const leftDuration = leftEnd - leftStart;
      const rightDuration = rightEnd - rightStart;
      if (leftDuration !== rightDuration) {
        return rightDuration - leftDuration;
      }

      return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'ja', {
        numeric: true,
      });
    });
  }, [visibleScheduleItems]);

  /**
   * ブックマークごとに重複時間をレーン分割し、列情報を作る
   */
  const criterionGroups = useMemo(() => {
    /** レイアウト済みグループ */
    const groups = [];
    /** 列オフセット */
    let columnOffset = 0;

    (visibleBookmarks || []).forEach((bookmark) => {
      /** ブックマークID */
      const bookmarkId = String(bookmark.id || '');
      /** ブックマーク基準キー */
      const bookmarkCriteriaKeys = Array.isArray(bookmark.criteriaKeys)
        ? bookmark.criteriaKeys.map((key) => String(key || ''))
        : [];
      /** 対象ブックマークで表示するアイテム */
      const groupItems = (sortedScheduleItems || []).filter((item) => {
        /** 評価軸で抽出したキー */
        const axisValue = extractAxisValue(item, bookmark.axis || BOOKMARK_AXES.BUILDING, areaLabelMap);
        return bookmarkCriteriaKeys.includes(String(axisValue.key || ''));
      });
      /** 現在テーマで可読性を満たすブックマーク色 */
      const resolvedBookmarkThemeColor = resolveReadableBookmarkThemeColor(bookmark.color, theme);
      /** レーン終端時刻一覧 */
      const laneEndMinutes = [];
      /** レイアウト済みカード */
      const laidOutCards = [];

      groupItems.forEach((item) => {
        const itemStart = typeof item.entryStartMinutes === 'number' ? item.entryStartMinutes : item.startMinutes;
        const itemEnd = typeof item.exitEndMinutes === 'number' ? item.exitEndMinutes : item.endMinutes;
        
        /** 表示開始分 */
        const clampedStartMinutes = Math.max(itemStart, OPERATION_START_MINUTES);
        /** 表示終了分 */
        const clampedEndMinutes = Math.min(itemEnd, OPERATION_END_MINUTES);
        if (clampedEndMinutes <= clampedStartMinutes) {
          return;
        }

        /** 割り当て先レーン番号 */
        let laneIndex = laneEndMinutes.findIndex((laneEnd) => clampedStartMinutes >= laneEnd);
        if (laneIndex === -1) {
          laneIndex = laneEndMinutes.length;
          laneEndMinutes.push(clampedEndMinutes);
        } else {
          laneEndMinutes[laneIndex] = clampedEndMinutes;
        }

        /** 上位置 */
        const top =
          ((clampedStartMinutes - OPERATION_START_MINUTES) / TIME_SLOT_INTERVAL_MINUTES) * TIMELINE_ROW_HEIGHT;
        /** 高さ */
        const height = Math.max(
          ((clampedEndMinutes - clampedStartMinutes) / TIME_SLOT_INTERVAL_MINUTES) * TIMELINE_ROW_HEIGHT - 4,
          36
        );

        laidOutCards.push({
          ...item,
          criterionKey: bookmarkId,
          criterionLabel: String(bookmark.name || 'ブックマーク'),
          bookmarkColor: resolvedBookmarkThemeColor,
          laneIndex,
          columnIndex: columnOffset + laneIndex,
          top,
          height,
        });
      });

      /** 最低1列は確保 */
      const laneCount = Math.max(laneEndMinutes.length, 1);

      groups.push({
        criterionKey: bookmarkId,
        criterionLabel: String(bookmark.name || 'ブックマーク'),
        criterionColor: resolvedBookmarkThemeColor,
        startColumnIndex: columnOffset,
        laneCount,
        cards: laidOutCards,
      });

      columnOffset += laneCount;
    });

    if (groups.length === 0) {
      groups.push({
        criterionKey: 'EMPTY',
        criterionLabel: '表示項目なし',
        startColumnIndex: 0,
        laneCount: 1,
        cards: [],
      });
    }

    return groups;
  }, [areaLabelMap, sortedScheduleItems, theme, visibleBookmarks]);

  /** レイアウト済みカード一覧 */
  const laidOutScheduleCards = useMemo(() => {
    return criterionGroups.flatMap((group) => group.cards);
  }, [criterionGroups]);

  /** カード列数 */
  const timelineColumnCount = useMemo(() => {
    return Math.max(
      criterionGroups.reduce((sum, group) => sum + Number(group.laneCount || 0), 0),
      1
    );
  }, [criterionGroups]);

  /** タイムラインキャンバス高さ */
  const timelineCanvasHeight = useMemo(() => {
    return timelineRows.length * TIMELINE_ROW_HEIGHT;
  }, [timelineRows.length]);

  /** タイムラインキャンバス幅 */
  const timelineCanvasWidth = useMemo(() => {
    const calculatedWidth =
      timelineColumnCount * TIMELINE_CARD_WIDTH +
      Math.max(0, timelineColumnCount - 1) * TIMELINE_CARD_GAP +
      16;
    return Math.max(calculatedWidth, timelineViewportWidth - TIMELINE_TIME_COLUMN_WIDTH - 8);
  }, [timelineColumnCount, timelineViewportWidth]);

  /**
   * 日付移動
   * @param {number} offsetDays - 移動日数
   */
  const handleMoveDate = useCallback((offsetDays) => {
    if (availableDates.length === 0 || selectedDateIndex === -1) {
      return;
    }

    /** 移動先インデックス */
    const nextIndex = selectedDateIndex + offsetDays;
    if (nextIndex < 0 || nextIndex >= availableDates.length) {
      return;
    }

    setSelectedDate(availableDates[nextIndex]);
  }, [availableDates, selectedDateIndex]);

  /**
   * 設定中の基準キー選択を切り替える
   * @param {string} criterionKey - 基準キー
   */
  const handleToggleDraftCriterion = useCallback((criterionKey) => {
    /** 正規化キー */
    const normalizedKey = String(criterionKey || '').trim();
    if (!normalizedKey) {
      return;
    }

    setDraftSelectedCriteriaKeys((previousKeys) => {
      if (previousKeys.includes(normalizedKey)) {
        return previousKeys.filter((key) => key !== normalizedKey);
      }
      return [...previousKeys, normalizedKey];
    });
  }, []);

  /**
   * 設定中内容をブックマークとして保存する
   */
  const handleSaveBookmark = useCallback(() => {
    /** 正規化した名称 */
    const normalizedName = String(draftBookmarkName || '').trim();
    if (!normalizedName) {
      setSettingsErrorMessage('表示項目名を入力してください。');
      return;
    }

    if (draftSelectedCriteriaKeys.length === 0) {
      setSettingsErrorMessage('表示対象を1つ以上選択してください。');
      return;
    }

    /** 正規化した基準キー一覧 */
    const normalizedCriteriaKeys = Array.from(
      new Set(draftSelectedCriteriaKeys.map((key) => String(key || '').trim()).filter(Boolean))
    );
    /** 正規化したカラー */
    const normalizedBookmarkColor = normalizeBookmarkThemeColor(draftBookmarkColor);
    /** 一覧モーダル経由の編集か（下書き保存対象か） */
    const isDraftCommitFlow = shouldReturnToBookmarkList;

    if (editingBookmarkId) {
      const applyEditBookmark = (previousBookmarks) => {
        return (previousBookmarks || []).map((bookmark) => {
          if (String(bookmark?.id || '') !== editingBookmarkId) {
            return bookmark;
          }
          return {
            ...bookmark,
            name: normalizedName,
            axis: draftAxis,
            criteriaKeys: normalizedCriteriaKeys,
            color: normalizedBookmarkColor,
          };
        });
      };

      if (isDraftCommitFlow) {
        setDraftDisplayBookmarks((previousBookmarks) => applyEditBookmark(previousBookmarks));
      } else {
        setDisplayBookmarks((previousBookmarks) => applyEditBookmark(previousBookmarks));
        setActiveBookmarkId(editingBookmarkId);
      }

      setSettingsErrorMessage('');
      if (shouldReturnToBookmarkList) {
        setIsBookmarkListModalVisible(true);
        setTimeout(() => {
          setIsDisplaySettingsModalVisible(false);
        }, 0);
        setShouldReturnToBookmarkList(false);
      }
      return;
    }

    /** 追加するブックマーク */
    const nextBookmark = {
      id: `bookmark_${Date.now()}`,
      name: normalizedName,
      axis: draftAxis,
      criteriaKeys: normalizedCriteriaKeys,
      color: normalizedBookmarkColor,
    };

    if (isDraftCommitFlow) {
      setDraftDisplayBookmarks((previousBookmarks) => {
        return [...(previousBookmarks || []), nextBookmark];
      });
      setDraftBookmarkOrderIds((previousIds) => [...(previousIds || []), nextBookmark.id]);
      setDraftHiddenBookmarkIds((previousIds) =>
        (previousIds || []).filter((bookmarkId) => bookmarkId !== nextBookmark.id)
      );
    } else {
      setDisplayBookmarks((previousBookmarks) => {
        return [...(previousBookmarks || []), nextBookmark];
      });
      setBookmarkOrderIds((previousIds) => [...(previousIds || []), nextBookmark.id]);
      setHiddenBookmarkIds((previousIds) => previousIds.filter((bookmarkId) => bookmarkId !== nextBookmark.id));
      setActiveBookmarkId(nextBookmark.id);
    }

    setDraftBookmarkName('');
    setSettingsErrorMessage('');
    if (shouldReturnToBookmarkList) {
      setIsBookmarkListModalVisible(true);
      setTimeout(() => {
        setIsDisplaySettingsModalVisible(false);
      }, 0);
      setShouldReturnToBookmarkList(false);
    }
  }, [
    draftAxis,
    draftBookmarkColor,
    draftBookmarkName,
    draftSelectedCriteriaKeys,
    editingBookmarkId,
    shouldReturnToBookmarkList,
      shouldReturnToBookmarkList,
    ]);

    /** 一覧モーダル経由で編集するための下書き状態を初期化する */
    const prepareDraftStatesFromCommitted = useCallback(() => {
      setDraftDisplayBookmarks([...(displayBookmarks || [])]);
      setDraftHiddenBookmarkIds([...(hiddenBookmarkIds || [])]);
      setDraftBookmarkOrderIds([...(bookmarkOrderIds || [])]);
      setDraftDefaultBookmarkColorMap({ ...(defaultBookmarkColorMap || {}) });
    }, [bookmarkOrderIds, defaultBookmarkColorMap, displayBookmarks, hiddenBookmarkIds]);

    /** 一覧モーダル編集を破棄して本体状態へ戻す */
    const resetDraftStatesToCommitted = useCallback(() => {
      setDraftDisplayBookmarks([...(displayBookmarks || [])]);
      setDraftHiddenBookmarkIds([...(hiddenBookmarkIds || [])]);
      setDraftBookmarkOrderIds([...(bookmarkOrderIds || [])]);
      setDraftDefaultBookmarkColorMap({ ...(defaultBookmarkColorMap || {}) });
    }, [bookmarkOrderIds, defaultBookmarkColorMap, displayBookmarks, hiddenBookmarkIds]);

    const handleOpenCreateSettings = useCallback(() => {
      setEditingBookmarkId('');
      setDraftAxis(BOOKMARK_AXES.BUILDING);
      setDraftSelectedCriteriaKeys([]);
      setDraftBookmarkName('');
      setDraftBookmarkColor(DEFAULT_BOOKMARK_THEME_COLOR);
      setDraftSearchText('');
      setSettingsErrorMessage('');
      setShouldReturnToBookmarkList(true);
      setIsDisplaySettingsModalVisible(true);
      setTimeout(() => {
        setIsBookmarkListModalVisible(false);
      }, 0);
    }, []);

    /**
     * 既定ブックマークのカラー専用モーダルを開く
     * @param {Object} bookmark - 編集対象の既定ブックマーク
     */
    const handleOpenDefaultBookmarkColorModal = useCallback((bookmark) => {
      /** 既定ブックマークID */
      const bookmarkId = String(bookmark?.id || '').trim();
      if (!bookmarkId || !bookmarkId.startsWith(DEFAULT_BOOKMARK_ID_PREFIX)) {
        return;
      }

      setEditingDefaultBookmarkId(bookmarkId);
      setEditingDefaultBookmarkName(String(bookmark?.name || '既定項目'));
      setDraftDefaultBookmarkColor(normalizeBookmarkThemeColor(bookmark?.color));
      setIsDefaultBookmarkColorModalVisible(true);
      setTimeout(() => {
        setIsBookmarkListModalVisible(false);
      }, 0);
    }, []);

    /**
     * 既定ブックマークのカラー専用モーダルを閉じる
     */
    const handleCloseDefaultBookmarkColorModal = useCallback(() => {
      setIsBookmarkListModalVisible(true);
      setTimeout(() => {
        setIsDefaultBookmarkColorModalVisible(false);
      }, 0);
      setEditingDefaultBookmarkId('');
      setEditingDefaultBookmarkName('');
    }, []);

    /**
     * 既定ブックマークのテーマカラーを保存する
     */
    const handleSaveDefaultBookmarkColor = useCallback(() => {
      /** 保存対象ID */
      const bookmarkId = String(editingDefaultBookmarkId || '').trim();
      if (!bookmarkId || !bookmarkId.startsWith(DEFAULT_BOOKMARK_ID_PREFIX)) {
        handleCloseDefaultBookmarkColorModal();
        return;
      }

      /** 正規化したカラー */
      const normalizedColor = normalizeBookmarkThemeColor(draftDefaultBookmarkColor);
      setDraftDefaultBookmarkColorMap((previousMap) => ({
        ...(previousMap || {}),
        [bookmarkId]: normalizedColor,
      }));
      handleCloseDefaultBookmarkColorModal();
    }, [
      draftDefaultBookmarkColor,
      editingDefaultBookmarkId,
      handleCloseDefaultBookmarkColorModal,
    ]);

    /**
     * 詳細設定モーダルを編集モードで開く
     * @param {Object} bookmark - 編集対象ブックマーク
     */
    const handleOpenEditSettings = useCallback((bookmark) => {
      if (!bookmark) {
        return;
      }

      if (String(bookmark.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX)) {
        handleOpenDefaultBookmarkColorModal(bookmark);
        return;
      }

      setEditingBookmarkId(String(bookmark.id || ''));
      setDraftAxis(bookmark.axis || BOOKMARK_AXES.BUILDING);
      setDraftSelectedCriteriaKeys(
        Array.isArray(bookmark.criteriaKeys)
          ? bookmark.criteriaKeys.map((key) => String(key || '')).filter(Boolean)
          : []
      );
      setDraftBookmarkName(String(bookmark.name || ''));
      setDraftBookmarkColor(normalizeBookmarkThemeColor(bookmark.color));
      setDraftSearchText('');
      setSettingsErrorMessage('');
      setShouldReturnToBookmarkList(true);
      setIsDisplaySettingsModalVisible(true);
      setTimeout(() => {
        setIsBookmarkListModalVisible(false);
      }, 0);
    }, [handleOpenDefaultBookmarkColorModal]);

    /**
     * 指定ブックマークの表示/非表示を切り替える
     * @param {string} bookmarkId - ブックマークID
     */
    const handleToggleBookmarkVisibility = useCallback((bookmarkId) => {
      /** 正規化ID */
      const normalizedBookmarkId = String(bookmarkId || '').trim();
      if (!normalizedBookmarkId) {
        return;
      }

      setDraftHiddenBookmarkIds((previousIds) => {
        /** 現在の編集中ID一覧 */
        const currentIds = Array.isArray(previousIds)
          ? previousIds
          : (hiddenBookmarkIds || []);

        if (currentIds.includes(normalizedBookmarkId)) {
          return currentIds.filter((id) => id !== normalizedBookmarkId);
        }
        return [...currentIds, normalizedBookmarkId];
      });
    }, [hiddenBookmarkIds]);

    /**
     * ブックマーク一覧モーダルを開く
     * @param {string} initialTab - 初期表示タブ
     */
    const handleOpenBookmarkListModal = useCallback((initialTab = BOOKMARK_LIST_TABS.DEFAULT) => {
      /** 正規化した初期タブ */
      const normalizedInitialTab =
        initialTab === BOOKMARK_LIST_TABS.MY_LIST
          ? BOOKMARK_LIST_TABS.MY_LIST
          : BOOKMARK_LIST_TABS.DEFAULT;
      prepareDraftStatesFromCommitted();
      setActiveBookmarkListTab(normalizedInitialTab);
      setIsBookmarkListModalVisible(true);
    }, [prepareDraftStatesFromCommitted]);

    /**
     * 指定ブックマークを削除する
     * @param {string} bookmarkId - ブックマークID
     */
    const handleDeleteBookmark = useCallback((bookmarkId) => {
      const normalizedBookmarkId = String(bookmarkId || '').trim();
      if (!normalizedBookmarkId || normalizedBookmarkId.startsWith(DEFAULT_BOOKMARK_ID_PREFIX)) {
        return;
      }

      if (isBookmarkListModalVisible) {
        setDraftDisplayBookmarks((previousBookmarks) =>
          (previousBookmarks || []).filter(
            (bookmark) => String(bookmark?.id || '') !== normalizedBookmarkId
          )
        );
        setDraftHiddenBookmarkIds((previousIds) =>
          (previousIds || []).filter((id) => id !== normalizedBookmarkId)
        );
        setDraftBookmarkOrderIds((previousIds) =>
          (previousIds || []).filter((id) => String(id || '') !== normalizedBookmarkId)
        );
        return;
      }

      setDisplayBookmarks((previousBookmarks) =>
        (previousBookmarks || []).filter(
          (bookmark) => String(bookmark?.id || '') !== normalizedBookmarkId
        )
      );

      setHiddenBookmarkIds((previousIds) => previousIds.filter((id) => id !== normalizedBookmarkId));

      setActiveBookmarkId((previousActiveId) => {
        if (String(previousActiveId || '') === normalizedBookmarkId) {
          return String(visibleBookmarks[0]?.id || orderedMergedBookmarks[0]?.id || '');
        }
        return previousActiveId;
      });
      setBookmarkOrderIds((previousIds) =>
        (previousIds || []).filter((bookmarkId) => String(bookmarkId || '') !== normalizedBookmarkId)
      );
    }, [isBookmarkListModalVisible, orderedMergedBookmarks, visibleBookmarks]);

    /**
     * ブックマーク削除確認モーダルを開く
     * @param {Object} bookmark - 削除対象ブックマーク
     */
    const handleOpenDeleteConfirmModal = useCallback((bookmark) => {
      /** ブックマークID */
      const bookmarkId = String(bookmark?.id || '').trim();
      if (!bookmarkId || bookmarkId.startsWith(DEFAULT_BOOKMARK_ID_PREFIX)) {
        return;
      }
      setPendingDeleteBookmark(bookmark);
      setIsDeleteConfirmModalVisible(true);
    }, []);

    /**
     * ブックマーク削除確認モーダルを閉じる
     */
    const handleCloseDeleteConfirmModal = useCallback(() => {
      setIsDeleteConfirmModalVisible(false);
      setPendingDeleteBookmark(null);
    }, []);

    /**
     * 削除確認モーダルで「はい」を押したときの処理
     */
    const handleConfirmDeleteBookmark = useCallback(() => {
      /** 削除対象ID */
      const bookmarkId = String(pendingDeleteBookmark?.id || '').trim();
      if (!bookmarkId) {
        handleCloseDeleteConfirmModal();
        return;
      }

      handleDeleteBookmark(bookmarkId);
      handleCloseDeleteConfirmModal();
    }, [handleCloseDeleteConfirmModal, handleDeleteBookmark, pendingDeleteBookmark]);

    /**
     * 並び替えドラッグを開始する
     * @param {string} bookmarkId - 対象ブックマークID
     * @param {number} initialPageY - ドラッグ開始時のページY座標
     */
    const handleStartBookmarkReorderDrag = useCallback((bookmarkId, initialPageY = 0) => {
      if (activeBookmarkListTab !== BOOKMARK_LIST_TABS.MY_LIST) {
        return;
      }
      /** 正規化ID */
      const normalizedBookmarkId = String(bookmarkId || '').trim();
      if (!normalizedBookmarkId) {
        return;
      }

      /** 対象の現在インデックス */
      const currentIndex = (myListBookmarkIdsForModal || []).findIndex(
        (currentBookmarkId) => String(currentBookmarkId || '') === normalizedBookmarkId
      );
      if (currentIndex === -1) {
        return;
      }

      setDraggingBookmarkId(normalizedBookmarkId);
      setDraggingOffsetY(0);
      reorderDragStateRef.current = {
        activeBookmarkId: normalizedBookmarkId,
        startIndex: currentIndex,
        currentIndex,
        startPageY: Number(initialPageY) || 0,
      };
    }, [activeBookmarkListTab, myListBookmarkIdsForModal]);

  /**
   * 並び替えドラッグ中の移動量を処理する
   * @param {string} bookmarkId - 対象ブックマークID
   * @param {number} gestureDy - ジェスチャー累積Y移動量
   */
  const handleMoveBookmarkReorderDrag = useCallback((bookmarkId, gestureDy) => {
    if (activeBookmarkListTab !== BOOKMARK_LIST_TABS.MY_LIST) {
      return;
    }
    /** 正規化ID */
    const normalizedBookmarkId = String(bookmarkId || '').trim();
    /** 現在のドラッグ状態 */
    const currentDragState = reorderDragStateRef.current;
    if (!normalizedBookmarkId || currentDragState.activeBookmarkId !== normalizedBookmarkId) {
      return;
    }

    /** 累積ドラッグ量 */
    const normalizedGestureDy = Number(gestureDy) || 0;

    /** 1行あたりのドラッグピッチ（行高 + 行間） */
    const rowPitch =
      Math.max(Number(bookmarkRowHeight || 0), REORDER_DRAG_ROW_HEIGHT_PX) + BOOKMARK_LIST_ROW_GAP_PX;
    /** 既に並び替えで移動済みの行数 */
    const movedIndexCount =
      Number(currentDragState.currentIndex || 0) - Number(currentDragState.startIndex || 0);
    /**
     * 見た目のズレ補正後オフセット
     * 行が入れ替わると要素の自然位置も動くため、移動済み行数分を差し引いて
     * ポインタ配下の見た目位置を維持する。
     */
    const compensatedOffsetY = normalizedGestureDy - movedIndexCount * rowPitch;
    latestDraggingOffsetRef.current = compensatedOffsetY;
    if (dragOffsetAnimationFrameRef.current === null) {
      dragOffsetAnimationFrameRef.current = requestAnimationFrame(() => {
        dragOffsetAnimationFrameRef.current = null;
        setDraggingOffsetY(latestDraggingOffsetRef.current);
      });
    }

    /** ドラッグ距離を行数換算（急なジャンプを防ぐためtrunc） */
    const movedRows =
      normalizedGestureDy >= 0
        ? Math.trunc(normalizedGestureDy / rowPitch)
        : -Math.trunc(Math.abs(normalizedGestureDy) / rowPitch);
    /** 開始位置から見た目標インデックス */
    const targetIndexFromStart = Number(currentDragState.startIndex || 0) + movedRows;
    /** 並び順末尾インデックス */
    const lastIndex = Math.max((myListBookmarkIdsForModal || []).length - 1, 0);
    /** 正規化した目標インデックス */
    const nextIndex = Math.max(0, Math.min(targetIndexFromStart, lastIndex));

    if (nextIndex !== Number(currentDragState.currentIndex || 0)) {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      if (isBookmarkListModalVisible) {
        setDraftBookmarkOrderIds((previousIds) => {
          /** 現在の編集中並び順 */
          const currentOrderIds = Array.isArray(previousIds) && previousIds.length > 0
            ? previousIds
            : (bookmarkOrderIds || []);
          return moveSubsetIdInFullOrder(
            currentOrderIds,
            myListBookmarkIdsForModal,
            normalizedBookmarkId,
            nextIndex
          );
        });
      } else {
        setBookmarkOrderIds((previousIds) =>
          moveSubsetIdInFullOrder(previousIds, myListBookmarkIdsForModal, normalizedBookmarkId, nextIndex)
        );
      }
      currentDragState.currentIndex = nextIndex;
    }
  }, [
    activeBookmarkListTab,
    bookmarkOrderIds,
    bookmarkRowHeight,
    isBookmarkListModalVisible,
    myListBookmarkIdsForModal,
  ]);

  /**
   * ページY座標からドラッグ移動量を計算して並び替え処理へ渡す
   * @param {string} bookmarkId - 対象ブックマークID
   * @param {number} currentPageY - 現在のページY座標
   */
  const handleMoveBookmarkReorderDragByPageY = useCallback((bookmarkId, currentPageY) => {
    /** 現在のドラッグ状態 */
    const currentDragState = reorderDragStateRef.current;
    /** 開始Y */
    const startPageY = Number(currentDragState.startPageY || 0);
    /** 現在Y */
    const normalizedCurrentPageY = Number(currentPageY || 0);
    /** ドラッグ量 */
    const gestureDy = normalizedCurrentPageY - startPageY;
    handleMoveBookmarkReorderDrag(bookmarkId, gestureDy);
  }, [handleMoveBookmarkReorderDrag]);

  /**
   * Webマウスドラッグのイベントリスナーを解除する
   */
  const clearWebMouseDragListeners = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    /** 現在のmoveリスナー */
    const moveListener = webMouseDragListenersRef.current.move;
    /** 現在のupリスナー */
    const upListener = webMouseDragListenersRef.current.up;

    if (moveListener) {
      window.removeEventListener('mousemove', moveListener);
    }
    if (upListener) {
      window.removeEventListener('mouseup', upListener);
    }

    webMouseDragListenersRef.current = {
      move: null,
      up: null,
    };
  }, []);

  /**
   * ドラッグ中オフセット更新スケジューラを停止する
   */
  const cancelDraggingOffsetAnimationFrame = useCallback(() => {
    if (dragOffsetAnimationFrameRef.current === null) {
      return;
    }
    cancelAnimationFrame(dragOffsetAnimationFrameRef.current);
    dragOffsetAnimationFrameRef.current = null;
  }, []);

  /**
   * 並び替えドラッグを終了する
   */
  const handleEndBookmarkReorderDrag = useCallback(() => {
    clearWebMouseDragListeners();
    cancelDraggingOffsetAnimationFrame();
    setDraggingBookmarkId('');
    latestDraggingOffsetRef.current = 0;
    setDraggingOffsetY(0);
    reorderDragStateRef.current = {
      activeBookmarkId: '',
      startIndex: -1,
      currentIndex: -1,
      startPageY: 0,
    };
  }, [cancelDraggingOffsetAnimationFrame, clearWebMouseDragListeners]);

  /**
   * Webでハンドルのマウスドラッグを開始する
   * @param {string} bookmarkId - 対象ブックマークID
   * @param {Object} event - マウスイベント
   */
  const handleStartBookmarkMouseDrag = useCallback((bookmarkId, event) => {
    if (typeof window === 'undefined') {
      return;
    }

    /** 正規化ID */
    const normalizedBookmarkId = String(bookmarkId || '').trim();
    if (!normalizedBookmarkId) {
      return;
    }

    /** 開始Y座標 */
    const startPageY = Number(event?.nativeEvent?.pageY ?? event?.pageY ?? 0);
    handleStartBookmarkReorderDrag(normalizedBookmarkId, startPageY);

    const handleMouseMove = (mouseEvent) => {
      /** 現在Y座標 */
      const currentPageY = Number(mouseEvent?.pageY || 0);
      handleMoveBookmarkReorderDragByPageY(normalizedBookmarkId, currentPageY);
    };

    const handleMouseUp = () => {
      handleEndBookmarkReorderDrag();
    };

    clearWebMouseDragListeners();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });
    webMouseDragListenersRef.current = {
      move: handleMouseMove,
      up: handleMouseUp,
    };

    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (event?.stopPropagation) {
      event.stopPropagation();
    }
  }, [
    clearWebMouseDragListeners,
    handleEndBookmarkReorderDrag,
    handleMoveBookmarkReorderDragByPageY,
    handleStartBookmarkReorderDrag,
  ]);

  useEffect(() => {
    return () => {
      clearWebMouseDragListeners();
      cancelDraggingOffsetAnimationFrame();
    };
  }, [cancelDraggingOffsetAnimationFrame, clearWebMouseDragListeners]);

  /**
   * カード押下時の処理
   * @param {Object} item - 対象アイテム
   */
  const handlePressItem = useCallback((item) => {
    /** 詳細モーダル表示用の場所名（建物 + 場所） */
    const modalLocationName = buildBuildingLocationLabel(
      item?.buildingLocationName,
      item?.locationName
    );
    setSelectedItem({
      ...item,
      locationName:
        modalLocationName ||
        String(item?.locationName || '').trim() ||
        String(item?.buildingLocationName || '').trim(),
    });
    setIsModalVisible(true);
  }, []);

  /**
   * モーダルを閉じる
   */
  const handleCloseModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  /**
   * 表示設定モーダルを閉じる
   */
  const handleCloseDisplaySettingsModal = useCallback(() => {
    if (shouldReturnToBookmarkList) {
      setIsBookmarkListModalVisible(true);
      setTimeout(() => {
        setIsDisplaySettingsModalVisible(false);
        setShouldReturnToBookmarkList(false);
      }, 0);
      return;
    }
    setIsDisplaySettingsModalVisible(false);
  }, [shouldReturnToBookmarkList]);

  /**
   * ブックマーク一覧モーダルを閉じる
   */
  const handleCloseBookmarkListModal = useCallback(() => {
    if (draggingBookmarkId) {
      handleEndBookmarkReorderDrag();
    }
    resetDraftStatesToCommitted();
    setIsBookmarkListModalVisible(false);
  }, [draggingBookmarkId, handleEndBookmarkReorderDrag, resetDraftStatesToCommitted]);

  /**
   * ブックマーク一覧モーダルの変更内容を反映して閉じる
   */
  const handleApplyBookmarkListModal = useCallback(() => {
    /** モーダル編集中のブックマークを確定 */
    const committedDisplayBookmarks = (draftDisplayBookmarks || [])
      .map((bookmark) => ({
        ...bookmark,
        id: String(bookmark?.id || '').trim(),
        axis: String(bookmark?.axis || BOOKMARK_AXES.BUILDING).trim() || BOOKMARK_AXES.BUILDING,
        criteriaKeys: Array.isArray(bookmark?.criteriaKeys)
          ? bookmark.criteriaKeys.map((key) => String(key || '').trim()).filter(Boolean)
          : [],
        color: normalizeBookmarkThemeColor(bookmark?.color),
      }))
      .filter((bookmark) => Boolean(bookmark.id) && (bookmark.criteriaKeys || []).length > 0);
    /** モーダル編集中の非表示IDを確定 */
    const committedHiddenIds = (draftHiddenBookmarkIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    /** モーダル編集中の並び順IDを確定 */
    const committedOrderIds = (draftBookmarkOrderIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    setDisplayBookmarks(committedDisplayBookmarks);
    setHiddenBookmarkIds(committedHiddenIds);
    setBookmarkOrderIds(committedOrderIds);
    setDefaultBookmarkColorMap({ ...(draftDefaultBookmarkColorMap || {}) });
    if (draggingBookmarkId) {
      handleEndBookmarkReorderDrag();
    }
    setIsBookmarkListModalVisible(false);
  }, [
    draftBookmarkOrderIds,
    draftDefaultBookmarkColorMap,
    draftDisplayBookmarks,
    draftHiddenBookmarkIds,
    draggingBookmarkId,
    handleEndBookmarkReorderDrag,
  ]);

  /** 表示項目設定モーダルが既存編集モードか */
  const isEditingDisplayBookmark = Boolean(String(editingBookmarkId || '').trim());

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      <View style={styles.headerSection}>
        <View style={[styles.dateControlRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[styles.dateButton, !canMovePrevDate && styles.disabledDateButton]}
            onPress={() => handleMoveDate(-1)}
            disabled={!canMovePrevDate}
          >
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.dateText, { color: theme.text }]}>{formatDisplayDate(selectedDate)}</Text>
          <TouchableOpacity
            style={[styles.dateButton, !canMoveNextDate && styles.disabledDateButton]}
            onPress={() => handleMoveDate(1)}
            disabled={!canMoveNextDate}
          >
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.timelineControlRow}>
          <View style={styles.timelineTabRow}>
            <TouchableOpacity
              style={[
                styles.timelineTabButton,
                {
                  borderColor:
                    activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.DEFAULT ? theme.primary : theme.border,
                  backgroundColor:
                    activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.DEFAULT
                      ? toAlphaColor(theme.primary, 0.12)
                      : theme.surface,
                },
              ]}
              onPress={() => setActiveTimelineBookmarkTab(BOOKMARK_LIST_TABS.DEFAULT)}
            >
              <Text
                style={[
                  styles.timelineTabButtonText,
                  {
                    color:
                      activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.DEFAULT
                        ? theme.primary
                        : theme.textSecondary,
                  },
                ]}
              >
                デフォルト
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.timelineTabButton,
                {
                  borderColor:
                    activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.MY_LIST ? theme.primary : theme.border,
                  backgroundColor:
                    activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.MY_LIST
                      ? toAlphaColor(theme.primary, 0.12)
                      : theme.surface,
                },
              ]}
              onPress={() => setActiveTimelineBookmarkTab(BOOKMARK_LIST_TABS.MY_LIST)}
            >
              <Text
                style={[
                  styles.timelineTabButtonText,
                  {
                    color:
                      activeTimelineBookmarkTab === BOOKMARK_LIST_TABS.MY_LIST
                        ? theme.primary
                        : theme.textSecondary,
                  },
                ]}
              >
                マイリスト
              </Text>
            </TouchableOpacity>
          </View>

          {!isMobileLayout ? (
            <TouchableOpacity
              style={[
                styles.timelineActionIconButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
              onPress={() => handleOpenBookmarkListModal(activeTimelineBookmarkTab)}
            >
              <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>読み込み中...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={fetchTimeline}>
              <Text style={styles.retryButtonText}>再取得</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={styles.timelineRoot}
            onLayout={(event) => {
              setTimelineViewportWidth(event.nativeEvent.layout.width);
            }}
          >
            <View style={[styles.locationHeaderRow, { borderBottomColor: theme.border, backgroundColor: theme.background }]}> 
              <View style={styles.locationHeaderTimeCell}> 
              </View>

              <View style={styles.locationHeaderViewport}>
                <View
                  style={[
                    styles.locationHeaderContent,
                    {
                      width: timelineCanvasWidth,
                      transform: [{ translateX: -timelineScrollX }],
                    },
                  ]}
                >
                  {criterionGroups.map((group, index) => (
                    <View
                      key={`header-${group.criterionKey}-${index}`}
                      style={[
                        styles.locationHeaderItem,
                        {
                          width:
                            group.laneCount * TIMELINE_CARD_WIDTH +
                            Math.max(0, group.laneCount - 1) * TIMELINE_CARD_GAP,
                          marginRight: index === criterionGroups.length - 1 ? 0 : TIMELINE_CARD_GAP,
                          borderColor: theme.border,
                          backgroundColor: group.criterionColor || DEFAULT_BOOKMARK_THEME_COLOR,
                          ...(isMobileLayout
                            ? {
                                flexDirection: 'row',
                                paddingHorizontal: 0,
                                overflow: 'hidden',
                              }
                            : {}),
                        },
                      ]}
                    >
                      {isMobileLayout ? (
                        Array.from({ length: group.laneCount }).map((_, laneIndex) => (
                          <View
                            key={laneIndex}
                            style={{
                              width: TIMELINE_CARD_WIDTH,
                              marginRight: laneIndex === group.laneCount - 1 ? 0 : TIMELINE_CARD_GAP,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <Text numberOfLines={1} style={[styles.locationHeaderText, { color: theme.text }]}> 
                              {group.criterionLabel}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text numberOfLines={1} style={[styles.locationHeaderText, { color: theme.text }]}> 
                          {group.criterionLabel}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.timelineVerticalScroll}
              contentContainerStyle={styles.timelineVerticalContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={[styles.timelineWrapper, { minHeight: timelineCanvasHeight }]}> 
                <View style={styles.timeColumnStatic}>
                  {timelineRows.map((row) => (
                    <View
                      key={`time-${row.key}`}
                      style={[
                        styles.timelineRowLabel,
                        {
                          borderBottomWidth: 0,
                          borderTopColor: row.minutes % 60 === 0 ? hourlyLineColor : regularLineColor,
                          borderTopWidth: row.minutes === OPERATION_START_MINUTES ? 0 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.timeText, { color: theme.textSecondary }]}>{row.time}</Text>
                    </View>
                  ))}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={styles.timelineGridScroll}
                  onScroll={(event) => {
                    setTimelineScrollX(event.nativeEvent.contentOffset.x || 0);
                  }}
                  scrollEventThrottle={16}
                >
                  <View
                    style={[
                      styles.timelineGridCanvas,
                      {
                        height: timelineCanvasHeight,
                        width: timelineCanvasWidth,
                      },
                    ]}
                  >
                    {timelineRows.map((row, rowIndex) => (
                      <View
                        key={`line-${row.key}`}
                        style={[
                          styles.timelineGridLine,
                          {
                            top: rowIndex * TIMELINE_ROW_HEIGHT,
                            borderBottomWidth: 0,
                            borderTopColor: row.minutes % 60 === 0 ? hourlyLineColor : regularLineColor,
                            borderTopWidth: row.minutes === OPERATION_START_MINUTES ? 0 : 1,
                          },
                        ]}
                      />
                    ))}

                    {criterionGroups.slice(0, -1).map((group) => {
                      /** 次ブックマーク開始列インデックス */
                      const nextGroupStartColumnIndex =
                        Number(group.startColumnIndex || 0) + Number(group.laneCount || 0);
                      /** ブックマーク境界のX座標 */
                      const dividerLeft =
                        nextGroupStartColumnIndex * TIMELINE_CARD_WIDTH +
                        Math.max(0, nextGroupStartColumnIndex - 1) * TIMELINE_CARD_GAP +
                        TIMELINE_CARD_GAP / 2;

                      return (
                        <View
                          key={`divider-${group.criterionKey}`}
                          style={[
                            styles.timelineVerticalDivider,
                            {
                              left: dividerLeft,
                              borderLeftColor: theme.border,
                              height: timelineCanvasHeight,
                            },
                          ]}
                        />
                      );
                    })}

                    {criterionGroups
                      .filter((group) => (group.cards || []).length === 0)
                      .map((group) => {
                        /** 左位置 */
                        const emptyLeft =
                          group.startColumnIndex * (TIMELINE_CARD_WIDTH + TIMELINE_CARD_GAP);
                        /** 表示幅 */
                        const emptyWidth =
                          group.laneCount * TIMELINE_CARD_WIDTH +
                          Math.max(0, group.laneCount - 1) * TIMELINE_CARD_GAP;

                        return (
                          <View
                            key={`empty-wrap-${group.criterionKey}`}
                            style={[
                              styles.emptyColumnWrap,
                              {
                                left: emptyLeft,
                                width: emptyWidth,
                                height: timelineCanvasHeight,
                                pointerEvents: 'none',
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.emptyColumnBadge,
                                {
                                  borderColor: theme.border,
                                  backgroundColor: toAlphaColor(theme.surface, 0.92),
                                },
                              ]}
                            >
                              <Text style={[styles.emptyColumnBadgeText, { color: theme.textSecondary }]}>該当なし</Text>
                            </View>
                          </View>
                        );
                      })}

                    {laidOutScheduleCards.map((item) => {
                      const itemStart = typeof item.entryStartMinutes === 'number' ? item.entryStartMinutes : item.startMinutes;
                      const itemEnd = typeof item.exitEndMinutes === 'number' ? item.exitEndMinutes : item.endMinutes;
                      
                      const entryDuration = Math.max(0, item.startMinutes - itemStart);
                      const mainDuration = Math.max(0, item.endMinutes - item.startMinutes);
                      const exitDuration = Math.max(0, itemEnd - item.endMinutes);
                      const hasOptionalTimes = entryDuration > 0 || exitDuration > 0;

                      return (
                      <TouchableOpacity
                        key={`${item.source_type}-${item.source_id}-${item.startMinutes}-${item.endMinutes}`}
                        style={[
                          styles.itemCard,
                          styles.absoluteItemCard,
                          {
                            backgroundColor: item.bookmarkColor || DEFAULT_BOOKMARK_THEME_COLOR,
                            borderColor: theme.border,
                            left: item.columnIndex * (TIMELINE_CARD_WIDTH + TIMELINE_CARD_GAP),
                            top: item.top,
                            height: item.height,
                            ...(hasOptionalTimes && {
                              padding: 0,
                              overflow: 'hidden',
                              flexDirection: 'column',
                            }),
                          },
                        ]}
                        onPress={() => handlePressItem(item)}
                      >
                        {hasOptionalTimes ? (
                          <>
                            {/** 準備時間ブロック */}
                            {entryDuration > 0 && (
                              <View style={{ flex: entryDuration, minHeight: 16, backgroundColor: toAlphaColor(theme.text, 0.08), borderBottomWidth: 1, borderBottomColor: toAlphaColor(theme.border, 0.5), borderBottomStyle: 'dashed', paddingHorizontal: 4, paddingVertical: 1, justifyContent: 'center' }}>
                                <Text style={[styles.itemMeta, { color: theme.textSecondary, fontSize: 10, lineHeight: 12 }]} numberOfLines={1}>
                                  {item.entry_label || '準備'}　{item.entry_start_time}〜
                                </Text>
                              </View>
                            )}
                            {/** 企画本番ブロック */}
                            <View style={{ flex: mainDuration, paddingHorizontal: 12, paddingVertical: 10, gap: 4, justifyContent: 'flex-start' }}>
                              {(() => {
                                const cardLocationName = buildBuildingLocationLabel(
                                  item?.buildingLocationName,
                                  item?.locationName
                                );
                                return (
                                  <>
                                    <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>{item.displayName}</Text>
                                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{buildCardTimeRangeLabel(item.start_time, item.end_time)}</Text>
                                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{cardLocationName || item.locationName || '場所未設定'}</Text>
                                  </>
                                );
                              })()}
                            </View>
                            {/** 片付け時間ブロック */}
                            {exitDuration > 0 && (
                              <View style={{ flex: exitDuration, minHeight: 16, backgroundColor: toAlphaColor(theme.text, 0.08), borderTopWidth: 1, borderTopColor: toAlphaColor(theme.border, 0.5), borderTopStyle: 'dashed', paddingHorizontal: 4, paddingVertical: 1, justifyContent: 'center' }}>
                                <Text style={[styles.itemMeta, { color: theme.textSecondary, fontSize: 10, lineHeight: 12 }]} numberOfLines={1}>
                                  {item.exit_label || '片付け'}　〜{item.exit_end_time}
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <>
                            {/** カード表示用の場所名（建物 + 場所） - 従来通り */}
                            {(() => {
                              const cardLocationName = buildBuildingLocationLabel(
                                item?.buildingLocationName,
                                item?.locationName
                              );
                              return (
                                <>
                                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>{item.displayName}</Text>
                                  <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{buildCardTimeRangeLabel(item.start_time, item.end_time)}</Text>
                                  <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{cardLocationName || item.locationName || '場所未設定'}</Text>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      <DetailModal
        visible={isModalVisible}
        item={selectedItem}
        onClose={handleCloseModal}
      />

      {isMobileLayout ? (
        <TouchableOpacity
          style={[
            styles.mobileFloatingSettingsButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
            },
          ]}
          onPress={() => handleOpenBookmarkListModal(activeTimelineBookmarkTab)}
        >
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={isDisplaySettingsModalVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseDisplaySettingsModal}
      >
        <Pressable style={styles.settingsModalBackdrop} onPress={handleCloseDisplaySettingsModal}>
          <Pressable
            style={[styles.settingsModalCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}
          > 
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.settingsModalTitle, { color: theme.text }]}>
                {isEditingDisplayBookmark ? '表示項目の編集' : '表示項目の追加'}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseIconButton}
                onPress={handleCloseDisplaySettingsModal}
              >
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.settingsModalDescription, { color: theme.textSecondary }]}>評価軸を選択して検索し、表示項目を名前付きで保存できます。</Text>

            <TextInput
              value={draftBookmarkName}
              onChangeText={setDraftBookmarkName}
              placeholder="表示名（例: 団体A運営確認）"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.settingsInput,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
            />

            <View style={styles.bookmarkColorPickerWrap}>
              <Text style={[styles.bookmarkColorPickerLabel, { color: theme.textSecondary }]}>テーマカラー</Text>
              <View style={styles.bookmarkColorPickerGrid}>
                {BOOKMARK_THEME_COLORS.map((color) => {
                  /** 選択中カラーか */
                  const isSelectedColor = normalizeBookmarkThemeColor(draftBookmarkColor) === color;
                  /** テーマ補正後の表示カラー */
                  const resolvedPreviewColor = resolveReadableBookmarkThemeColor(color, theme);
                  return (
                    <TouchableOpacity
                      key={`bookmark-color-${color}`}
                      style={[
                        styles.bookmarkColorChip,
                        {
                          backgroundColor: resolvedPreviewColor,
                          borderColor: isSelectedColor ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setDraftBookmarkColor(color)}
                    >
                      {isSelectedColor ? <Ionicons name="checkmark" size={14} color={theme.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.selectedCriteriaSummaryWrap,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              <Text style={[styles.bookmarkColorPickerLabel, { color: theme.textSecondary }]}>現在選択中の項目</Text>
              <Text style={[styles.selectedCriteriaSummaryText, { color: theme.text }]} numberOfLines={2}>
                {draftSelectedCriteriaSummaryText}
              </Text>
            </View>

            <View style={styles.axisTabRow}>
              {Object.keys(BOOKMARK_AXIS_LABELS).map((axisKey) => {
                /** 選択中タブか */
                const isAxisActive = draftAxis === axisKey;
                return (
                  <TouchableOpacity
                    key={`axis-${axisKey}`}
                    style={[
                      styles.axisTabButton,
                      {
                        borderColor: isAxisActive ? theme.primary : theme.border,
                        backgroundColor: isAxisActive ? toAlphaColor(theme.primary, 0.12) : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      setDraftAxis(axisKey);
                      setDraftSelectedCriteriaKeys([]);
                      setDraftSearchText('');
                      setSettingsErrorMessage('');
                    }}
                  >
                    <Text
                      style={[
                        styles.axisTabButtonText,
                        { color: isAxisActive ? theme.primary : theme.textSecondary },
                      ]}
                    >
                      {BOOKMARK_AXIS_LABELS[axisKey]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={draftSearchText}
              onChangeText={setDraftSearchText}
              placeholder={`${BOOKMARK_AXIS_LABELS[draftAxis]}を検索`}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.settingsInput,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
            />

            <ScrollView style={styles.settingsModalList} contentContainerStyle={styles.settingsModalListContent}>
              {filteredDraftCandidates.map((candidate) => {
                /** 候補キー */
                const candidateKey = String(candidate.key || '');
                /** 選択状態 */
                const isSelected = draftSelectedCriteriaKeys.includes(candidateKey);

                return (
                  <TouchableOpacity
                    key={`setting-${candidateKey}`}
                    style={[
                      styles.settingsOptionRow,
                      {
                        borderColor: isSelected ? theme.primary : theme.border,
                        backgroundColor: isSelected ? toAlphaColor(theme.primary, 0.12) : theme.surface,
                      },
                    ]}
                    onPress={() => handleToggleDraftCriterion(candidateKey)}
                  >
                    <View
                      style={[
                        styles.settingsOptionIndicator,
                        {
                          borderColor: isSelected ? theme.primary : theme.border,
                          backgroundColor: isSelected ? theme.primary : theme.background,
                          justifyContent: 'center',
                          alignItems: 'center',
                        },
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color={theme.background} />
                      )}
                    </View>
                    <Text style={[styles.settingsOptionLabel, { color: theme.text }]}>{candidate.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {settingsErrorMessage ? (
              <Text style={[styles.settingsErrorText, { color: '#ef4444' }]}>{settingsErrorMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.settingsModalSaveButton, { backgroundColor: theme.primary }]}
              onPress={handleSaveBookmark}
            >
              <Text style={styles.settingsModalSaveButtonText}>
                {isEditingDisplayBookmark ? '設定を更新する' : '表示項目を追加する'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isBookmarkListModalVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseBookmarkListModal}
      >
        <Pressable style={styles.settingsModalBackdrop} onPress={handleCloseBookmarkListModal}>
          <Pressable
            style={[styles.bookmarkListModalCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}
          > 
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.settingsModalTitle, { color: theme.text }]}>タイムスケジュール設定</Text>
              <TouchableOpacity
                style={styles.modalCloseIconButton}
                onPress={handleCloseBookmarkListModal}
              >
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {!isMobileLayout ? (
              <View style={styles.bookmarkListTabRow}>
                <TouchableOpacity
                  style={[
                    styles.bookmarkListTabButton,
                    {
                      borderColor:
                        activeBookmarkListTab === BOOKMARK_LIST_TABS.DEFAULT ? theme.primary : theme.border,
                      backgroundColor:
                        activeBookmarkListTab === BOOKMARK_LIST_TABS.DEFAULT
                          ? toAlphaColor(theme.primary, 0.12)
                          : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    setActiveBookmarkListTab(BOOKMARK_LIST_TABS.DEFAULT);
                    if (draggingBookmarkId) {
                      handleEndBookmarkReorderDrag();
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.bookmarkListTabButtonText,
                      {
                        color:
                          activeBookmarkListTab === BOOKMARK_LIST_TABS.DEFAULT
                            ? theme.primary
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    デフォルト
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.bookmarkListTabButton,
                    {
                      borderColor:
                        activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST ? theme.primary : theme.border,
                      backgroundColor:
                        activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST
                          ? toAlphaColor(theme.primary, 0.12)
                          : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    setActiveBookmarkListTab(BOOKMARK_LIST_TABS.MY_LIST);
                  }}
                >
                  <Text
                    style={[
                      styles.bookmarkListTabButtonText,
                      {
                        color:
                          activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST
                            ? theme.primary
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    マイリスト
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.settingsModalDescription, { color: theme.textSecondary }]}> 
              {activeBookmarkListTab === BOOKMARK_LIST_TABS.DEFAULT
                ? 'デフォルトは表示/非表示の切り替えとテーマカラー変更ができます。'
                : 'マイリストでは表示/非表示の切替、並び替え、設定編集、削除、追加ができます。'}
            </Text>

            <ScrollView
              style={styles.bookmarkListScroll}
              contentContainerStyle={styles.bookmarkListContent}
              scrollEnabled={!draggingBookmarkId}
            >
              {(activeBookmarkListTab === BOOKMARK_LIST_TABS.DEFAULT
                ? defaultBookmarksForModal
                : myListBookmarksForModal).map((bookmark) => {
                /** 非表示状態 */
                const isHidden = effectiveHiddenBookmarkIdsForModal.includes(String(bookmark.id || ''));
                /** システム既定か */
                const isSystemBookmark = String(bookmark.id || '').startsWith(DEFAULT_BOOKMARK_ID_PREFIX);
                /** 並び替え対象ID */
                const normalizedBookmarkId = String(bookmark.id || '').trim();
                /** 並び替え中か */
                const isDragging = draggingBookmarkId === normalizedBookmarkId;
                /** マイリストタブか */
                const isMyListTab = activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST;
                /** 現在テーマで可読性を満たすブックマーク色 */
                const resolvedBookmarkThemeColor = resolveReadableBookmarkThemeColor(bookmark.color, theme);
                /** 操作ボタンの背景色（色付き行では背景色を半透明で重ねて視認性を確保） */
                const bookmarkActionButtonBackgroundColor = isHidden
                  ? theme.surface
                  : toAlphaColor(theme.background, 0.72);
                /** 操作ボタンの枠線色（色付き行では文字色ベースで少し濃くする） */
                const bookmarkActionButtonBorderColor = isHidden
                  ? theme.border
                  : toAlphaColor(theme.text, 0.22);
                /** 操作アイコン色 */
                const bookmarkActionIconColor = isHidden ? theme.textSecondary : theme.text;

                return (
                  <View
                    key={`bookmark-list-${bookmark.id}`}
                    onLayout={(event) => {
                      /** 実測行高さ */
                      const measuredHeight = Number(event?.nativeEvent?.layout?.height || 0);
                      if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
                        return;
                      }

                      if (Math.abs(measuredHeight - bookmarkRowHeight) <= 2) {
                        return;
                      }
                      setBookmarkRowHeight(measuredHeight);
                    }}
                    style={[
                      styles.bookmarkListRow,
                      isDragging
                        ? {
                            transform: [{ translateY: draggingOffsetY }],
                            zIndex: 20,
                            elevation: 8,
                          }
                        : null,
                      {
                        borderColor: isDragging ? theme.primary : theme.border,
                        backgroundColor: isDragging
                          ? toAlphaColor(theme.primary, 0.16)
                          : isHidden
                            ? theme.surface
                            : resolvedBookmarkThemeColor,
                        opacity: isHidden ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={styles.bookmarkListMainArea}>
                      <View style={styles.bookmarkInlineReorderContainer}> 
                        {isMyListTab ? (
                          <View
                            style={styles.bookmarkSwipeHandle}
                            onStartShouldSetResponder={() => Platform.OS !== 'web' || isMobileLayout}
                            onStartShouldSetResponderCapture={() => Platform.OS !== 'web' || isMobileLayout}
                            onMoveShouldSetResponder={() => Platform.OS !== 'web' || isMobileLayout}
                            onMoveShouldSetResponderCapture={() => Platform.OS !== 'web' || isMobileLayout}
                            onMouseDown={(event) => {
                              handleStartBookmarkMouseDrag(normalizedBookmarkId, event);
                            }}
                            onResponderGrant={(event) => {
                              const pageY = Number(
                                event?.nativeEvent?.pageY ?? event?.nativeEvent?.locationY ?? 0
                              );
                              handleStartBookmarkReorderDrag(normalizedBookmarkId, pageY);
                            }}
                            onResponderMove={(event) => {
                              const pageY = Number(
                                event?.nativeEvent?.pageY ?? event?.nativeEvent?.locationY ?? 0
                              );
                              handleMoveBookmarkReorderDragByPageY(normalizedBookmarkId, pageY);
                            }}
                            onResponderRelease={handleEndBookmarkReorderDrag}
                            onResponderTerminate={handleEndBookmarkReorderDrag}
                            onResponderTerminationRequest={() => false}
                          >
                            <Ionicons
                              name="reorder-three-outline"
                              size={20}
                              color={isDragging ? theme.primary : theme.textSecondary}
                            />
                          </View>
                        ) : (
                          <View style={styles.bookmarkSwipeHandlePlaceholder} />
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.bookmarkVisibilityArea}
                        onPress={() => handleToggleBookmarkVisibility(bookmark.id)}
                      >
                        <View style={styles.bookmarkListTextBlock}>
                          <Text style={[styles.savedBookmarkName, { color: theme.text }]} numberOfLines={1}>
                            {bookmark.name}
                          </Text>
                          <Text style={[styles.savedBookmarkMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                            {buildBookmarkCriteriaSummaryText(bookmark)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {(isMyListTab || isSystemBookmark) ? (
                      <TouchableOpacity
                        style={[
                          styles.bookmarkIconButton,
                          {
                            borderColor: bookmarkActionButtonBorderColor,
                            backgroundColor: bookmarkActionButtonBackgroundColor,
                          },
                        ]}
                        onPress={() => handleOpenEditSettings(bookmark)}
                      >
                        <Ionicons name="settings-outline" size={16} color={bookmarkActionIconColor} />
                      </TouchableOpacity>
                    ) : null}

                    {!isSystemBookmark && isMyListTab ? (
                      <TouchableOpacity
                        style={[
                          styles.bookmarkActionButton,
                          {
                            borderColor: bookmarkActionButtonBorderColor,
                            backgroundColor: bookmarkActionButtonBackgroundColor,
                          },
                        ]}
                        onPress={() => handleOpenDeleteConfirmModal(bookmark)}
                      >
                        <Ionicons name="trash-outline" size={16} color={bookmarkActionIconColor} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}

              {activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST && myListBookmarksForModal.length === 0 ? (
                <View style={[styles.bookmarkListEmptyWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                  <Text style={[styles.bookmarkListEmptyText, { color: theme.textSecondary }]}>マイリストはまだありません。追加から作成できます。</Text>
                </View>
              ) : null}
            </ScrollView>

            {activeBookmarkListTab === BOOKMARK_LIST_TABS.MY_LIST ? (
              <TouchableOpacity
                style={[styles.bookmarkAddButton, { borderColor: theme.primary, backgroundColor: toAlphaColor(theme.primary, 0.12) }]}
                onPress={() => {
                  handleOpenCreateSettings();
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                <Text style={[styles.bookmarkAddButtonText, { color: theme.primary }]}>追加</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.settingsModalSaveButton, { backgroundColor: theme.primary }]}
              onPress={handleApplyBookmarkListModal}
            >
              <Text style={styles.settingsModalSaveButtonText}>設定を反映する</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isDefaultBookmarkColorModalVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseDefaultBookmarkColorModal}
      >
        <Pressable style={styles.settingsModalBackdrop} onPress={handleCloseDefaultBookmarkColorModal}>
          <Pressable
            style={[styles.defaultBookmarkColorModalCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.settingsModalTitle, { color: theme.text }]}>既定表示項目の色設定</Text>
              <TouchableOpacity
                style={styles.modalCloseIconButton}
                onPress={handleCloseDefaultBookmarkColorModal}
              >
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.settingsModalDescription, { color: theme.textSecondary }]}>既定表示項目は名前と表示条件が固定です。テーマカラーのみ変更できます。</Text>

            <View style={styles.defaultBookmarkNameWrap}>
              <Text style={[styles.bookmarkColorPickerLabel, { color: theme.textSecondary }]}>表示項目名</Text>
              <TextInput
                value={editingDefaultBookmarkName}
                editable={false}
                placeholder="既定表示項目"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.settingsInput,
                  styles.settingsInputDisabled,
                  {
                    color: theme.textSecondary,
                    borderColor: theme.border,
                    backgroundColor: toAlphaColor(theme.surface, 0.78),
                  },
                ]}
              />
            </View>

            <View style={styles.bookmarkColorPickerWrap}>
              <Text style={[styles.bookmarkColorPickerLabel, { color: theme.textSecondary }]}>テーマカラー</Text>
              <View style={styles.bookmarkColorPickerGrid}>
                {BOOKMARK_THEME_COLORS.map((color) => {
                  /** 選択中カラーか */
                  const isSelectedColor = normalizeBookmarkThemeColor(draftDefaultBookmarkColor) === color;
                  /** テーマ補正後の表示カラー */
                  const resolvedPreviewColor = resolveReadableBookmarkThemeColor(color, theme);
                  return (
                    <TouchableOpacity
                      key={`default-bookmark-color-${color}`}
                      style={[
                        styles.bookmarkColorChip,
                        {
                          backgroundColor: resolvedPreviewColor,
                          borderColor: isSelectedColor ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setDraftDefaultBookmarkColor(color)}
                    >
                      {isSelectedColor ? <Ionicons name="checkmark" size={14} color={theme.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.settingsModalSaveButton, { backgroundColor: theme.primary }]}
              onPress={handleSaveDefaultBookmarkColor}
            >
              <Text style={styles.settingsModalSaveButtonText}>設定を反映する</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isDeleteConfirmModalVisible}
        transparent
        animationType="none"
        onRequestClose={handleCloseDeleteConfirmModal}
      >
        <Pressable style={styles.settingsModalBackdrop} onPress={handleCloseDeleteConfirmModal}>
          <Pressable
            style={[styles.deleteConfirmModalCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.settingsModalTitle, { color: theme.text }]}>ブックマークを削除</Text>
            <Text style={[styles.settingsModalDescription, { color: theme.textSecondary }]}> 
              「{String(pendingDeleteBookmark?.name || 'このブックマーク')}」を削除しますか？
            </Text>

            <View style={styles.deleteConfirmButtonRow}>
              <TouchableOpacity
                style={[styles.deleteConfirmPrimaryButton, { backgroundColor: '#ef4444' }]}
                onPress={handleConfirmDeleteBookmark}
              >
                <Text style={styles.deleteConfirmPrimaryButtonText}>はい</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmSecondaryButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={handleCloseDeleteConfirmModal}
              >
                <Text style={[styles.deleteConfirmSecondaryButtonText, { color: theme.textSecondary }]}>いいえ</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
  },
  operationText: {
    fontSize: 12,
    lineHeight: 18,
  },
  dateControlRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledDateButton: {
    opacity: 0.35,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '700',
  },
  timelineControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineTabRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  timelineTabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineTabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timelineActionIconButton: {
    width: 42,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileFloatingSettingsButton: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },
  settingsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  settingsModalCard: {
    width: '100%',
    maxWidth: 560,
    height: '80%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  settingsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  settingsModalDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  axisTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  axisTabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  axisTabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  settingsInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  bookmarkColorPickerWrap: {
    gap: 8,
  },
  bookmarkColorPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookmarkColorPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bookmarkColorChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCriteriaSummaryWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  selectedCriteriaSummaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  settingsModalList: {
    maxHeight: 250,
  },
  settingsModalListContent: {
    gap: 8,
    paddingTop: 2,
    paddingBottom: 2,
  },
  settingsOptionRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsOptionIndicator: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
  },
  settingsOptionLabel: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  settingsErrorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  settingsModalSaveButton: {
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsModalSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalCloseIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedBookmarkName: {
    fontSize: 13,
    fontWeight: '700',
  },
  savedBookmarkMeta: {
    fontSize: 11,
  },
  bookmarkListModalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '84%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  defaultBookmarkColorModalCard: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  defaultBookmarkNameWrap: {
    gap: 6,
  },
  settingsInputDisabled: {
    opacity: 0.75,
  },
  bookmarkListScroll: {
    maxHeight: 420,
  },
  bookmarkListContent: {
    gap: 8,
  },
  bookmarkListTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bookmarkListTabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkListTabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bookmarkListRow: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookmarkListMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookmarkInlineReorderContainer: {
    justifyContent: 'center',
  },
  bookmarkSwipeHandle: {
    width: 30,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  bookmarkSwipeHandlePlaceholder: {
    width: 30,
    minHeight: 44,
  },
  bookmarkVisibilityArea: {
    flex: 1,
  },
  bookmarkListTextBlock: {
    flex: 1,
    gap: 2,
  },
  bookmarkIconButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkActionButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkActionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteConfirmModalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  deleteConfirmButtonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  deleteConfirmSecondaryButton: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteConfirmPrimaryButton: {
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bookmarkAddButton: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  bookmarkAddButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bookmarkListEmptyWrap: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  bookmarkListEmptyText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  timelineRoot: {
    flex: 1,
  },
  locationHeaderRow: {
    height: LOCATION_HEADER_HEIGHT,
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  locationHeaderTimeCell: {
    width: TIMELINE_TIME_COLUMN_WIDTH,
    justifyContent: 'center',
    paddingLeft: 12,
  },
  locationHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  locationHeaderViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  locationHeaderContent: {
    flexDirection: 'row',
    height: LOCATION_HEADER_HEIGHT,
    alignItems: 'center',
  },
  locationHeaderItem: {
    height: LOCATION_HEADER_HEIGHT - 10,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  locationHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  timelineWrapper: {
    flexDirection: 'row',
  },
  timelineVerticalScroll: {
    flex: 1,
  },
  timelineVerticalContent: {
    flexGrow: 1,
  },
  timeColumnStatic: {
    width: TIMELINE_TIME_COLUMN_WIDTH,
  },
  timelineRowLabel: {
    height: TIMELINE_ROW_HEIGHT,
    borderTopWidth: 1,
    justifyContent: 'flex-start',
    paddingLeft: 12,
    paddingTop: 2,
  },
  timelineGridScroll: {
    flex: 1,
  },
  timelineGridCanvas: {
    position: 'relative',
  },
  timelineGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  timelineVerticalDivider: {
    position: 'absolute',
    top: 0,
    borderLeftWidth: 1,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 12,
    width: TIMELINE_CARD_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  absoluteItemCard: {
    position: 'absolute',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyColumnBadge: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    zIndex: 1,
  },
  emptyColumnWrap: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  emptyColumnBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default TimeScheduleScreen;
