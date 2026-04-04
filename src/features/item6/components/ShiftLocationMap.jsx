/**
 * 厚生部場所管理のキャンパスマップ表示
 *
 * Leaflet CRS.Simple を使い、キャンパス画像上にマーカーを配置する。
 * - Web: Leaflet を直接 DOM にマウント（iframe不使用で状態同期が確実）
 * - iOS/Android: WebView 内で Leaflet を描画し postMessage で通信
 *
 * 仕様: docs/プロジェクト仕様書_厚生部場所機能.md
 * - 厚生部長: マップ上でピンを指定して場所を登録・更新・削除
 * - 厚生部員: 有効な場所から現在地を選択して登録
 * - 管理者: 閲覧のみ
 */

import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../shared/components/icons';
import { CAMPUS_BOUNDS, MAP_INTERACTION_MODES } from '../constants.js';

/** マップ画像のサイズ（ピクセル） */
const MAP_IMAGE_WIDTH = 1191;
const MAP_IMAGE_HEIGHT = 900;

/** マップ画像アセットの参照 */
const MAP_IMAGE_ASSET = require('../../../../assets/map.png');

/** Leaflet 標準カラーマーカーの CDN ベースURL */
const MARKER_ICON_BASE = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img';
/** Leaflet 標準マーカーの影画像URL */
const MARKER_SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

/** マーカーの色名マッピング（leaflet-color-markers の色名に対応） */
const MARKER_COLORS = {
  /** 通常の場所（青） */
  normal: 'blue',
  /** 選択中・編集対象（赤） */
  selected: 'red',
  /** 現在地登録先（緑） */
  highlighted: 'green',
  /** 新規ドラフト（オレンジ） */
  draft: 'orange',
};

/** 凡例表示用のHEX色 */
const LEGEND_COLORS = {
  normal: '#2A81CB',
  selected: '#CB2B3E',
  highlighted: '#2AAD27',
  draft: '#CB8427',
};

/**
 * マップ画像のURLを解決する
 * Expo Web では require() が文字列またはオブジェクトを返す
 * @returns {string} マップ画像のURL
 */
const resolveMapImageUrl = () => {
  if (typeof MAP_IMAGE_ASSET === 'string') {
    if (MAP_IMAGE_ASSET.startsWith('/') && typeof window !== 'undefined') {
      return window.location.origin + MAP_IMAGE_ASSET;
    }
    return MAP_IMAGE_ASSET;
  }
  if (MAP_IMAGE_ASSET && typeof MAP_IMAGE_ASSET === 'object' && MAP_IMAGE_ASSET.uri) {
    const uri = MAP_IMAGE_ASSET.uri;
    if (uri.startsWith('/') && typeof window !== 'undefined') {
      return window.location.origin + uri;
    }
    return uri;
  }
  return '';
};

/**
 * 緯度経度を CRS.Simple 座標 [y, x] に変換する
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @returns {Array<number>} [y, x]
 */
const geoToPixel = (lat, lng) => {
  const xRatio = (lng - CAMPUS_BOUNDS.longitudeMin) / (CAMPUS_BOUNDS.longitudeMax - CAMPUS_BOUNDS.longitudeMin);
  const yRatio = 1 - (lat - CAMPUS_BOUNDS.latitudeMin) / (CAMPUS_BOUNDS.latitudeMax - CAMPUS_BOUNDS.latitudeMin);
  return [yRatio * MAP_IMAGE_HEIGHT, xRatio * MAP_IMAGE_WIDTH];
};

/**
 * CRS.Simple 座標を緯度経度に変換する
 * @param {number} y - Y座標
 * @param {number} x - X座標
 * @returns {Object} { latitude, longitude }
 */
const pixelToGeo = (y, x) => {
  const xRatio = x / MAP_IMAGE_WIDTH;
  const yRatio = y / MAP_IMAGE_HEIGHT;
  return {
    latitude: CAMPUS_BOUNDS.latitudeMin + (1 - yRatio) * (CAMPUS_BOUNDS.latitudeMax - CAMPUS_BOUNDS.latitudeMin),
    longitude: CAMPUS_BOUNDS.longitudeMin + xRatio * (CAMPUS_BOUNDS.longitudeMax - CAMPUS_BOUNDS.longitudeMin),
  };
};

/**
 * Leaflet 標準カラーマーカーアイコンを生成する
 * @param {Object} L - Leaflet ライブラリ参照
 * @param {string} colorName - 色名（blue, red, green, orange）
 * @returns {L.Icon} Leaflet アイコンインスタンス
 */
const createColorIcon = (L, colorName) => {
  return L.icon({
    iconUrl: `${MARKER_ICON_BASE}/marker-icon-2x-${colorName}.png`,
    shadowUrl: MARKER_SHADOW_URL,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};

/**
 * Leaflet ベースのキャンパスマップコンポーネント
 *
 * @param {Object} props
 * @param {Object} props.theme - テーマオブジェクト
 * @param {boolean} props.compact - コンパクト表示モード
 * @param {number} props.height - マップの高さ
 * @param {Array} props.locations - 場所マスタの配列
 * @param {Object} [props.draftCoordinate] - ドラフト座標 { latitude, longitude }
 * @param {Function} [props.onDraftCoordinateChange] - ドラフト座標変更コールバック
 * @param {string} [props.interactionMode] - 操作モード ('pin' | 'move')
 * @param {string} [props.selectedLocationId] - 選択中の場所ID
 * @param {string} [props.highlightedLocationId] - ハイライト中の場所ID
 * @param {string} [props.focusLocationId] - フォーカス対象の場所ID
 * @param {boolean} [props.canEdit] - 編集モード有効フラグ
 * @param {Function} [props.onLocationPress] - マーカータップコールバック
 * @param {Function} [props.onBoardPress] - マップタップコールバック
 * @returns {React.ReactElement}
 */
const ShiftLocationMap = ({
  theme,
  compact,
  height,
  locations = [],
  draftCoordinate,
  onDraftCoordinateChange,
  interactionMode = MAP_INTERACTION_MODES.pin,
  selectedLocationId = '',
  highlightedLocationId = '',
  focusLocationId = null,
  canEdit = false,
  onLocationPress,
  onBoardPress,
}) => {
  /** @type {React.MutableRefObject<HTMLDivElement|null>} マップコンテナのDOM参照 */
  const mapContainerRef = useRef(null);
  /** @type {React.MutableRefObject<Object|null>} Leafletマップインスタンス */
  const mapInstanceRef = useRef(null);
  /** @type {React.MutableRefObject<Object>} 現在表示中のマーカー群 */
  const markersRef = useRef({});
  /** @type {React.MutableRefObject<Object|null>} ドラフトマーカー */
  const draftMarkerRef = useRef(null);
  /** @type {React.MutableRefObject<boolean>} Leaflet初期化済みフラグ */
  const initializedRef = useRef(false);
  /** @type {React.MutableRefObject<Object>} 最新のコールバック参照（stale closure回避） */
  const callbacksRef = useRef({ onLocationPress, onBoardPress, onDraftCoordinateChange });
  /** @type {React.MutableRefObject<Object>} 最新のモード参照（初期化時のclosure問題回避） */
  const modeRef = useRef({ canEdit, interactionMode });
  /** @type {boolean} Leaflet CSS/JS の読み込み完了状態 */
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  /** @type {boolean} エラー状態 */
  const [loadError, setLoadError] = useState(false);

  /* コールバック参照を常に最新に保つ（useEffectのクロージャ問題を回避） */
  useEffect(() => {
    callbacksRef.current = { onLocationPress, onBoardPress, onDraftCoordinateChange };
  }, [onLocationPress, onBoardPress, onDraftCoordinateChange]);

  /* モード参照を常に最新に保つ */
  useEffect(() => {
    modeRef.current = { canEdit, interactionMode };
  }, [canEdit, interactionMode]);

  /**
   * Leaflet CSS/JS を動的に読み込む（Web版、1回だけ実行）
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    /* 既にLeafletが読み込み済みなら即座に完了 */
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    /* CSS を読み込み */
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    /* JS を読み込み */
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletLoaded(true);
    script.onerror = () => setLoadError(true);
    document.head.appendChild(script);
  }, []);

  /**
   * Leaflet マップを初期化する（1回だけ実行）
   */
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || initializedRef.current) return;
    if (!window.L) return;

    const L = window.L;
    const bounds = [[0, 0], [MAP_IMAGE_HEIGHT, MAP_IMAGE_WIDTH]];

    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 3,
      zoomSnap: 0.5,
      maxBounds: [[-50, -50], [MAP_IMAGE_HEIGHT + 50, MAP_IMAGE_WIDTH + 50]],
      maxBoundsViscosity: 0.8,
    });

    const imageUrl = resolveMapImageUrl();
    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);

    /* マップクリックでピン配置 */
    map.on('click', (e) => {
      const coordinate = pixelToGeo(e.latlng.lat, e.latlng.lng);
      callbacksRef.current.onBoardPress?.(coordinate);
    });

    mapInstanceRef.current = map;
    initializedRef.current = true;

    /* 初期化直後に操作モードを適用（refから最新の値を読む） */
    const currentMode = modeRef.current;
    if (currentMode.canEdit && currentMode.interactionMode === MAP_INTERACTION_MODES.pin) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      initializedRef.current = false;
      markersRef.current = {};
      draftMarkerRef.current = null;
    };
  }, [leafletLoaded]);

  /**
   * 操作モードに応じてドラッグ操作を切り替える
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (canEdit && interactionMode === MAP_INTERACTION_MODES.pin) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    }
  }, [canEdit, interactionMode]);

  /**
   * マーカーを更新する
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    const L = window.L;

    /* 既存マーカーを削除 */
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};

    /* アクティブな場所のマーカーを追加 */
    (locations || []).forEach((loc) => {
      if (loc.is_active === false) return;

      const isSelected = loc.id === selectedLocationId;
      const isHighlighted = loc.id === highlightedLocationId;
      const isDraggable = isSelected && canEdit;

      /** 選択中（編集中）のマーカーはドラフト座標を使う */
      const coordinate = (isSelected && canEdit && draftCoordinate)
        ? draftCoordinate
        : { latitude: Number(loc.latitude), longitude: Number(loc.longitude) };
      const pos = geoToPixel(Number(coordinate.latitude), Number(coordinate.longitude));

      /** 状態に応じたカラーアイコンを選択 */
      const colorName = isSelected ? MARKER_COLORS.selected
        : isHighlighted ? MARKER_COLORS.highlighted
        : MARKER_COLORS.normal;
      const icon = createColorIcon(L, colorName);

      const marker = L.marker(pos, {
        icon,
        draggable: isDraggable,
      }).addTo(map);

      /** 場所名をツールチップとして常時表示 */
      marker.bindTooltip(loc.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -42],
        className: 'leaflet-tooltip-custom',
      });

      /** マーカークリック */
      marker.on('click', () => {
        callbacksRef.current.onLocationPress?.(loc);
      });

      /** マーカードラッグ終了時に座標を更新 */
      marker.on('dragend', (e) => {
        const latlng = e.target.getLatLng();
        const newCoordinate = pixelToGeo(latlng.lat, latlng.lng);
        callbacksRef.current.onDraftCoordinateChange?.(newCoordinate);
      });

      markersRef.current[loc.id] = marker;
    });
  }, [locations, selectedLocationId, highlightedLocationId, canEdit, draftCoordinate]);

  /**
   * ドラフトマーカーを更新する
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    const L = window.L;
    const shouldShowDraft = draftCoordinate && canEdit && !selectedLocationId;

    if (shouldShowDraft) {
      const pos = geoToPixel(Number(draftCoordinate.latitude), Number(draftCoordinate.longitude));
      const icon = createColorIcon(L, MARKER_COLORS.draft);

      if (draftMarkerRef.current) {
        draftMarkerRef.current.setLatLng(pos);
        draftMarkerRef.current.setIcon(icon);
      } else {
        draftMarkerRef.current = L.marker(pos, { icon }).addTo(map);
      }
    } else if (draftMarkerRef.current) {
      map.removeLayer(draftMarkerRef.current);
      draftMarkerRef.current = null;
    }
  }, [draftCoordinate, canEdit, selectedLocationId]);

  /**
   * フォーカス対象の場所にマップをパンする
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusLocationId) return;

    const loc = (locations || []).find(
      (l) => l.id === focusLocationId && l.is_active !== false
    );
    if (!loc) return;

    const pos = geoToPixel(Number(loc.latitude), Number(loc.longitude));
    map.setView(pos, 1, { animate: true });
  }, [focusLocationId, locations]);

  /**
   * Native版のLeafletマップを描画する（WebView使用）
   * @returns {React.ReactElement}
   */
  const renderNativeMap = () => {
    const { buildLeafletHtml } = require('./leafletMapHtml.js');

    let WebView;
    try {
      WebView = require('react-native-webview').default;
    } catch (error) {
      return (
        <View style={[styles.fallback, { height, backgroundColor: theme.surface }]}>
          <MaterialCommunityIcons name="map-marker-alert" size={32} color={theme.textSecondary} />
          <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
            マップの表示にはreact-native-webviewが必要です
          </Text>
        </View>
      );
    }

    const htmlContent = buildLeafletHtml({
      mapImageBase64: '',
      imgWidth: MAP_IMAGE_WIDTH,
      imgHeight: MAP_IMAGE_HEIGHT,
    });

    return (
      <View style={[styles.mapContainer, { height }]}>
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
        />
      </View>
    );
  };

  /* エラー時のフォールバック */
  if (loadError) {
    return (
      <View style={[styles.fallback, { height, backgroundColor: theme.surface, borderColor: theme.border }]}>
        <MaterialCommunityIcons name="map-marker-alert" size={32} color={theme.textSecondary} />
        <Text style={[styles.fallbackText, { color: theme.textSecondary }]}>
          マップの読み込みに失敗しました
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="map-marker-radius" size={18} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>キャンパス上の場所</Text>
      </View>

      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {canEdit
          ? interactionMode === MAP_INTERACTION_MODES.move
            ? 'マップをドラッグして位置を調整できます。ピンチで拡大・縮小できます。'
            : 'マップをタップしてピンを配置できます。ピンチで拡大・縮小できます。'
          : '登録済みの場所と現在地を確認できます。ピンチで拡大・縮小できます。'}
      </Text>

      {Platform.OS === 'web' ? (
        <View style={[styles.mapContainer, { height }]}>
          <div
            ref={mapContainerRef}
            style={{ width: '100%', height: '100%', borderRadius: 12 }}
          />
        </View>
      ) : (
        renderNativeMap()
      )}

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.normal }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>場所</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.selected }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>選択中</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.highlighted }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>現在地登録先</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.draft }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>新規</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** 外枠コンテナ */
  container: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  /** ヘッダー行 */
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** セクションタイトル */
  title: { fontSize: 16, fontWeight: '700' },
  /** 説明テキスト */
  description: { fontSize: 13, lineHeight: 19 },
  /** マップ表示エリア */
  mapContainer: { borderRadius: 12, overflow: 'hidden', minHeight: 300 },
  /** WebView スタイル */
  webView: { flex: 1, backgroundColor: 'transparent' },
  /** フォールバック表示 */
  fallback: { borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  /** フォールバックテキスト */
  fallbackText: { fontSize: 13 },
  /** 凡例行 */
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  /** 凡例アイテム */
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /** 凡例ドット */
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  /** 凡例テキスト */
  legendText: { fontSize: 12 },
});

export default ShiftLocationMap;
