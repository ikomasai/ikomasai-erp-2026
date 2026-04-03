/**
 * 厚生部場所管理の schematic マップ表示
 * Web / Native 共通で使えるよう、座標をキャンパス領域にマッピングして描画する。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, PanResponder } from 'react-native';
import { MaterialCommunityIcons } from '../../../shared/components/icons';
import { CAMPUS_BOUNDS, DEFAULT_MAP_REGION, MAP_INTERACTION_MODES } from '../constants.js';

const MAP_IMAGE = require('../../../../assets/map.png');
const MAP_IMAGE_WIDTH = 1191;
const MAP_IMAGE_HEIGHT = 900;
const MAP_SCALE = 1.45;
const TAP_DRAG_THRESHOLD = 4;
const MARKER_PIN_HEIGHT = 28;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getImageFrame = (boxWidth, boxHeight) => {
  if (boxWidth <= 0 || boxHeight <= 0) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }

  const scale = Math.min(boxWidth / MAP_IMAGE_WIDTH, boxHeight / MAP_IMAGE_HEIGHT);
  const width = MAP_IMAGE_WIDTH * scale;
  const height = MAP_IMAGE_HEIGHT * scale;

  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
};

const mapCoordinateToPoint = (coordinate, width, height) => {
  if (!coordinate || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2 };
  }

  const longitudeRange = CAMPUS_BOUNDS.longitudeMax - CAMPUS_BOUNDS.longitudeMin;
  const latitudeRange = CAMPUS_BOUNDS.latitudeMax - CAMPUS_BOUNDS.latitudeMin;
  const imageFrame = getImageFrame(width, height);

  const xRatio = (Number(coordinate.longitude) - CAMPUS_BOUNDS.longitudeMin) / longitudeRange;
  const yRatio = 1 - (Number(coordinate.latitude) - CAMPUS_BOUNDS.latitudeMin) / latitudeRange;

  return {
    x: imageFrame.x + clamp(xRatio, 0, 1) * imageFrame.width,
    y: imageFrame.y + clamp(yRatio, 0, 1) * imageFrame.height,
  };
};

const mapPointToCoordinate = (x, y, width, height) => {
  const longitudeRange = CAMPUS_BOUNDS.longitudeMax - CAMPUS_BOUNDS.longitudeMin;
  const latitudeRange = CAMPUS_BOUNDS.latitudeMax - CAMPUS_BOUNDS.latitudeMin;
  const imageFrame = getImageFrame(width, height);
  const clampedX = clamp(x, imageFrame.x, imageFrame.x + imageFrame.width);
  const clampedY = clamp(y, imageFrame.y, imageFrame.y + imageFrame.height);
  const xRatio = imageFrame.width > 0 ? (clampedX - imageFrame.x) / imageFrame.width : 0;
  const yRatio = imageFrame.height > 0 ? (clampedY - imageFrame.y) / imageFrame.height : 0;

  return {
    latitude: CAMPUS_BOUNDS.latitudeMin + (1 - yRatio) * latitudeRange,
    longitude: CAMPUS_BOUNDS.longitudeMin + xRatio * longitudeRange,
  };
};

const getContentSize = (layout) => {
  const width = Math.max(Math.round(layout.width * MAP_SCALE), layout.width);
  const height = Math.max(Math.round(layout.height * MAP_SCALE), layout.height);

  return { width, height };
};

const clampPan = (nextPan, layout, contentSize) => {
  if (!layout.width || !layout.height) {
    return nextPan;
  }

  const minX = Math.min(0, layout.width - contentSize.width);
  const minY = Math.min(0, layout.height - contentSize.height);

  return {
    x: clamp(nextPan.x, minX, 0),
    y: clamp(nextPan.y, minY, 0),
  };
};

const MarkerBubble = ({ theme, title, subtitle, color, selected, onPress }) => {
  const Container = onPress ? TouchableOpacity : View;
  const pinColor = selected ? theme?.error || '#E53935' : color;

  return (
    <Container
      {...(onPress
        ? {
            activeOpacity: 0.85,
            onPress,
          }
        : {})}
      style={[styles.marker, selected && styles.markerSelected]}
    >
      <View style={styles.pinWrapper}>
        {selected ? <View style={[styles.selectedRing, { borderColor: pinColor }]} /> : null}
        <MaterialCommunityIcons name="map-marker" size={28} color={pinColor} />
      </View>
      <View style={[styles.bubble, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text
          style={[styles.bubbleTitle, { color: theme.text }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.bubbleSubtitle, { color: theme.textSecondary }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Container>
  );
};

const LocationMarker = ({
  theme,
  marker,
  layoutSize,
  onDraftCoordinateChange,
  onLayout,
}) => {
  const dragStartCoordinateRef = useRef(marker.coordinate);

  useEffect(() => {
    dragStartCoordinateRef.current = marker.coordinate;
  }, [marker.coordinate]);

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => marker.draggable,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          marker.draggable && (Math.abs(gestureState.dx) > TAP_DRAG_THRESHOLD || Math.abs(gestureState.dy) > TAP_DRAG_THRESHOLD),
        onPanResponderGrant: () => {
          dragStartCoordinateRef.current = marker.coordinate;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!marker.draggable || !onDraftCoordinateChange) {
            return;
          }

          const startCoordinate = dragStartCoordinateRef.current;
          const startPoint = mapCoordinateToPoint(startCoordinate, layoutSize.width, layoutSize.height);
          const nextCoordinate = mapPointToCoordinate(
            startPoint.x + gestureState.dx,
            startPoint.y + gestureState.dy,
            layoutSize.width,
            layoutSize.height
          );

          onDraftCoordinateChange(nextCoordinate);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {},
        onShouldBlockNativeResponder: () => false,
      }),
    [layoutSize.height, layoutSize.width, marker.coordinate, marker.draggable, onDraftCoordinateChange]
  );

  return (
    <View
      {...(marker.draggable ? dragResponder.panHandlers : {})}
      onLayout={onLayout}
      style={[
        styles.markerWrap,
        {
          left: marker.x - (marker.width ?? 88) / 2,
          top: marker.y - MARKER_PIN_HEIGHT,
        },
      ]}
    >
      <MarkerBubble
        theme={theme}
        title={marker.title}
        subtitle={marker.subtitle}
        color={marker.color}
        selected={marker.selected}
        onPress={marker.onPress}
      />
    </View>
  );
};

const MarkerLayer = ({
  theme,
  locations,
  draftCoordinate,
  onDraftCoordinateChange,
  interactionMode = MAP_INTERACTION_MODES.pin,
  selectedLocationId,
  highlightedLocationId,
  focusLocationId = null,
  canEdit,
  onLocationPress,
  onBoardPress,
  height,
  compact,
}) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [markerLayouts, setMarkerLayouts] = useState({});
  const layoutRef = useRef(layout);
  const contentSizeRef = useRef(contentSize);
  const panRef = useRef(pan);
  const dragStartPanRef = useRef({ x: 0, y: 0 });
  const hasInitializedPanRef = useRef(false);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    contentSizeRef.current = contentSize;
  }, [contentSize]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (!layout.width || !layout.height) {
      return;
    }

    const nextContentSize = getContentSize(layout);
    setContentSize(nextContentSize);

    if (!hasInitializedPanRef.current) {
      const initialPan = {
        x: (layout.width - nextContentSize.width) / 2,
        y: (layout.height - nextContentSize.height) / 2,
      };
      setPan(clampPan(initialPan, layout, nextContentSize));
      hasInitializedPanRef.current = true;
      return;
    }

    setPan((current) => clampPan(current, layout, nextContentSize));
  }, [layout.height, layout.width]);

  useEffect(() => {
    if (!focusLocationId || !layout.width || !layout.height || !contentSize.width || !contentSize.height) {
      return;
    }

    const focusLocation = (locations || []).find((location) => location.id === focusLocationId && location.is_active !== false);
    if (!focusLocation) {
      return;
    }

    const point = mapCoordinateToPoint(
      { latitude: Number(focusLocation.latitude), longitude: Number(focusLocation.longitude) },
      contentSize.width,
      contentSize.height
    );

    const nextPan = {
      x: layout.width / 2 - point.x,
      y: layout.height / 2 - point.y,
    };

    setPan(clampPan(nextPan, layout, contentSize));
  }, [contentSize.height, contentSize.width, focusLocationId, layout.height, layout.width, locations]);

  const markers = useMemo(() => {
    const safeWidth = contentSize.width || layout.width;
    const safeHeight = contentSize.height || layout.height;
    const activeLocations = (locations || []).filter((location) => location.is_active !== false);

    const locationMarkers = activeLocations.map((location) => {
      const isEditableSelectedLocation =
        canEdit &&
        interactionMode === MAP_INTERACTION_MODES.pin &&
        selectedLocationId === location.id;
      const coordinate = isEditableSelectedLocation && draftCoordinate ? draftCoordinate : {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      };
      const point = mapCoordinateToPoint(
        coordinate,
        safeWidth,
        safeHeight
      );

      return {
        key: `location-${location.id}`,
        x: point.x,
        y: point.y,
        width: markerLayouts[`location-${location.id}`]?.width,
        color: location.is_active ? theme.primary : theme.textSecondary,
        selected: selectedLocationId === location.id || highlightedLocationId === location.id,
        title: location.name,
        coordinate,
        draggable: isEditableSelectedLocation,
        onPress: isEditableSelectedLocation ? undefined : () => onLocationPress?.(location),
      };
    });

    const draftMarker =
      canEdit && interactionMode === MAP_INTERACTION_MODES.pin && draftCoordinate && !selectedLocationId
        ? [
            {
              key: 'draft-location',
              x: mapCoordinateToPoint(draftCoordinate, safeWidth, safeHeight).x,
              y: mapCoordinateToPoint(draftCoordinate, safeWidth, safeHeight).y,
              width: markerLayouts['draft-location']?.width,
              color: theme.error,
              selected: true,
              title: '選択中の位置',
              coordinate: draftCoordinate,
              draggable: false,
              onPress: undefined,
            },
          ]
        : [];

    return [...locationMarkers, ...draftMarker];
  }, [
    canEdit,
    draftCoordinate,
    contentSize.height,
    contentSize.width,
    interactionMode,
    layout.height,
    layout.width,
    locations,
    onLocationPress,
    selectedLocationId,
    highlightedLocationId,
    theme.error,
    theme.primary,
    theme.textSecondary,
    markerLayouts,
  ]);

  const getCoordinateFromTouch = (locationX, locationY) => {
    const activeContentSize = contentSizeRef.current;
    const activePan = panRef.current;
    const contentX = clamp(locationX - activePan.x, 0, activeContentSize.width);
    const contentY = clamp(locationY - activePan.y, 0, activeContentSize.height);

    return mapPointToCoordinate(contentX, contentY, activeContentSize.width, activeContentSize.height);
  };

  const handlePinTap = (event) => {
    if (!canEdit || interactionMode !== MAP_INTERACTION_MODES.pin || layout.width <= 0 || layout.height <= 0) {
      return;
    }

    const { locationX, locationY } = event.nativeEvent;
    const coordinate = getCoordinateFromTouch(locationX, locationY);
    onBoardPress?.(coordinate);
  };

  const mapPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactionMode === MAP_INTERACTION_MODES.move && canEdit,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          interactionMode === MAP_INTERACTION_MODES.move &&
          canEdit &&
          (Math.abs(gestureState.dx) > TAP_DRAG_THRESHOLD || Math.abs(gestureState.dy) > TAP_DRAG_THRESHOLD),
        onPanResponderGrant: () => {
          dragStartPanRef.current = panRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!canEdit || interactionMode !== MAP_INTERACTION_MODES.move) {
            return;
          }

          const nextPan = {
            x: dragStartPanRef.current.x + gestureState.dx,
            y: dragStartPanRef.current.y + gestureState.dy,
          };
          setPan(clampPan(nextPan, layoutRef.current, contentSizeRef.current));
        },
        onPanResponderRelease: (event, gestureState) => {
          if (!canEdit || interactionMode !== MAP_INTERACTION_MODES.move) {
            return;
          }
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {},
        onShouldBlockNativeResponder: () => false,
      }),
    [canEdit, interactionMode]
  );

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="map-marker-radius" size={18} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>キャンパス上の場所</Text>
      </View>

      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {canEdit
          ? interactionMode === MAP_INTERACTION_MODES.move
            ? '地図をスライドして位置を合わせるモードです。'
            : '地図をタップしてピンを指定するモードです。'
          : '登録済みの場所と現在地を確認できます。'}
      </Text>

      <View
        style={[
          styles.board,
          {
            height,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          },
          compact && styles.boardCompact,
        ]}
        onLayout={(event) => {
          setLayout(event.nativeEvent.layout);
          setReady(true);
        }}
      >
        <View style={styles.mapSurface}>
          <View
            style={[
              styles.mapCanvas,
              {
                width: contentSize.width || '100%',
                height: contentSize.height || '100%',
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
              },
            ]}
            {...mapPanResponder.panHandlers}
          >
            <ImageBackground source={MAP_IMAGE} resizeMode="contain" style={styles.mapImage}>
              <View style={styles.gridLayer} pointerEvents="none">
                {Array.from({ length: 4 }).map((_, index) => (
                  <View
                    key={`v-${index}`}
                    style={[
                      styles.gridVertical,
                      {
                        left: `${((index + 1) / 5) * 100}%`,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                ))}
                {Array.from({ length: 4 }).map((_, index) => (
                  <View
                    key={`h-${index}`}
                    style={[
                      styles.gridHorizontal,
                      {
                        top: `${((index + 1) / 5) * 100}%`,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                ))}
              </View>

              <View style={styles.labelOverlay} pointerEvents="none">
                <Text style={[styles.overlayTitle, { color: theme.text }]}>近畿大学 東大阪キャンパス</Text>
              <Text style={[styles.overlaySubtitle, { color: theme.textSecondary }]}>登録済みの場所を表示しています</Text>
              </View>

              {ready ? (
                <View style={styles.markerLayer} pointerEvents="box-none">
                  {markers.map((marker) => (
                    <LocationMarker
                      key={marker.key}
                      theme={theme}
                      marker={marker}
                      layoutSize={{
                        width: contentSize.width || layout.width,
                        height: contentSize.height || layout.height,
                      }}
                      onDraftCoordinateChange={onDraftCoordinateChange}
                      onLayout={(event) => {
                        const { width, height } = event.nativeEvent.layout;
                        setMarkerLayouts((current) => {
                          const nextLayout = current[marker.key];
                          if (nextLayout?.width === width && nextLayout?.height === height) {
                            return current;
                          }

                          return {
                            ...current,
                            [marker.key]: { width, height },
                          };
                        });
                      }}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.loadingLayer}>
                  <MaterialCommunityIcons name="map" size={32} color={theme.textSecondary} />
                  <Text style={[styles.loadingText, { color: theme.textSecondary }]}>マップを準備中...</Text>
                </View>
              )}
            </ImageBackground>
          </View>

          {canEdit && interactionMode === MAP_INTERACTION_MODES.pin ? (
            <View
              style={styles.pinLayer}
              pointerEvents="auto"
              onStartShouldSetResponder={() => true}
              onResponderRelease={handlePinTap}
              onResponderTerminationRequest={() => true}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>場所</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>選択中</Text>
        </View>
      </View>
    </View>
  );
};

const ShiftLocationMap = (props) => {
  return <MarkerLayer {...props} />;
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  board: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 420,
  },
  mapSurface: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  mapCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
  },
  mapImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  boardCompact: {
    minHeight: 360,
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    opacity: 0.35,
  },
  gridHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    opacity: 0.35,
  },
  labelOverlay: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
    maxWidth: '75%',
  },
  overlayTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  overlaySubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  markerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  markerWrap: {
    position: 'absolute',
  },
  marker: {
    alignItems: 'center',
  },
  markerSelected: {
    zIndex: 3,
  },
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    marginBottom: 4,
  },
  bubble: {
    minWidth: 88,
    maxWidth: 136,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  bubbleSubtitle: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  selectedRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    opacity: 0.6,
  },
  loadingLayer: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  pinLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 12,
  },
});

export default ShiftLocationMap;
