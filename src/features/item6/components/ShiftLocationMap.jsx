/**
 * 厚生部場所管理のキャンパスマップ表示
 *
 * Leaflet CRS.Simple を使い、キャンパス画像上にマーカーを配置する。
 * - Web: Leaflet を直接 DOM にマウント（iframe不使用で状態同期が確実）
 * - iOS/Android: WebView 内で Leaflet を描画し postMessage で通信
 *
 * 仕様: docs/プロジェクト仕様書_厚生部場所機能.md
 * - 厚生部員: マップ上でピンを指定して場所を登録・更新・削除
 * - 厚生部員: 有効な場所から現在地を選択して登録
 * - 管理者: 閲覧のみ
 */

import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../shared/components/icons';
import { CAMPUS_BOUNDS } from '../constants.js';

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
 * @param {string} [props.selectedLocationId] - 選択中の場所ID
 * @param {string} [props.highlightedLocationId] - ハイライト中の場所ID
 * @param {string} [props.focusLocationId] - フォーカス対象の場所ID
 * @param {boolean} [props.canEdit] - 編集モード有効フラグ
 * @param {Function} [props.onLocationPress] - マーカータップコールバック
 * @param {Function} [props.onBoardPress] - マップタップコールバック
 * @param {Function} [props.onClearSelection] - 選択解除コールバック
 * @param {boolean} [props.showClearSelectionButton] - 選択解除ボタンを表示するか
 * @returns {React.ReactElement}
 */
const ShiftLocationMap = ({
  theme,
  compact,
  height,
  locations = [],
  draftCoordinate,
  onDraftCoordinateChange,
  selectedLocationId = '',
  highlightedLocationId = '',
  focusLocationId = null,
  canEdit = false,
  onLocationPress,
  onBoardPress,
  onClearSelection,
  showClearSelectionButton = false,
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
  /** @type {boolean} マップ初期化完了フラグ */
  const [mapReady, setMapReady] = useState(false);
  /** @type {React.MutableRefObject<Object>} 最新のコールバック参照（stale closure回避） */
  const callbacksRef = useRef({ onLocationPress, onBoardPress, onDraftCoordinateChange });
  /** @type {boolean} Leaflet CSS/JS の読み込み完了状態 */
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  /** @type {boolean} エラー状態 */
  const [loadError, setLoadError] = useState(false);

  /* コールバック参照を常に最新に保つ（useEffectのクロージャ問題を回避） */
  useEffect(() => {
    callbacksRef.current = { onLocationPress, onBoardPress, onDraftCoordinateChange };
  }, [onLocationPress, onBoardPress, onDraftCoordinateChange]);

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
    setMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      initializedRef.current = false;
      setMapReady(false);
      markersRef.current = {};
      draftMarkerRef.current = null;
    };
  }, [leafletLoaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.dragging.enable();
    map.getContainer().style.cursor = canEdit ? 'grab' : '';
  }, [canEdit]);

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
        draggable: false,
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

      markersRef.current[loc.id] = marker;
    });
  }, [locations, selectedLocationId, highlightedLocationId, canEdit, draftCoordinate, mapReady]);

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
  }, [draftCoordinate, canEdit, selectedLocationId, mapReady]);

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
  }, [focusLocationId, locations, mapReady]);

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
          <MaterialCommunityIcons name="map-marker-alert" size={32} color={theme.text} />
          <Text style={[styles.fallbackText, { color: theme.text }]}>
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
        <MaterialCommunityIcons name="map-marker-alert" size={32} color={theme.text} />
        <Text style={[styles.fallbackText, { color: theme.text }]}>
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
          ? 'マップをドラッグして移動し、タップでピンを配置できます。ピンチで拡大・縮小できます。'
          : '登録済みの場所と現在地を確認できます。ピンチで拡大・縮小できます。'}
      </Text>

      <View style={[styles.mapShell, { height }]}>
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

        {showClearSelectionButton && onClearSelection ? (
          <TouchableOpacity
            style={[
              styles.clearSelectionButton,
              {
                backgroundColor: `${theme.primary}18`,
                borderColor: theme.primary,
              },
            ]}
            onPress={onClearSelection}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={theme.primary} />
            <Text style={[styles.clearSelectionText, { color: theme.primary }]}>選択解除</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.normal }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>場所</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.selected }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>選択中</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.highlighted }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>現在地登録先</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEGEND_COLORS.draft }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>新規</Text>
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
  mapShell: { position: 'relative' },
  /** マップ表示エリア */
  mapContainer: { borderRadius: 12, overflow: 'hidden', minHeight: 300 },
  /** 選択解除ボタン */
  clearSelectionButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** 選択解除テキスト */
  clearSelectionText: {
    fontSize: 12,
    fontWeight: '700',
  },
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
