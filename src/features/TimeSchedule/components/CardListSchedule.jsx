/**
 * カードリストモード用スケジュール表示コンポーネント
 * ブックマーク単一選択で、イベントをカード形式で縦表示
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  Modal,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { Ionicons } from '../../../shared/components/icons';
import DetailModal from '../../01_Events&Stalls_list/components/DetailModal';

/**
 * カラーコードに透過度を適用するユーティリティ
 * @param {string} colorText HEXカラーコード
 * @param {number} alpha 透過度 (0.0〜1.0)
 * @returns {string} RGBA形式のカラー
 */
const toAlphaColor = (colorText, alpha) => {
  if (!colorText || typeof colorText !== 'string') return `rgba(0,0,0,${alpha})`;
  if (colorText.startsWith('rgba')) return colorText;
  
  // HEXをRGBに変換
  let hex = colorText.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * 数字を等幅（tabular-nums）で表示し、コロンの垂直位置を微調整するコンポーネント
 */
const FormattedTime = ({ text, style }) => {
  if (!text || typeof text !== 'string') return null;
  
  if (text.includes(':')) {
    const parts = text.split(':');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[style, { fontVariant: ['tabular-nums'], includeFontPadding: false }]}>{parts[0]}</Text>
        <Text style={[style, { fontVariant: ['tabular-nums'], paddingBottom: 1, includeFontPadding: false, textAlignVertical: 'center' }]}>:</Text>
        <Text style={[style, { fontVariant: ['tabular-nums'], includeFontPadding: false }]}>{parts[1]}</Text>
      </View>
    );
  }

  return <Text style={[style, { fontVariant: ['tabular-nums'], includeFontPadding: false }]}>{text}</Text>;
};

/**
 * 日本語ラベルとコロンを分割し、コロンの垂直位置を微調整するコンポーネント
 */
const LabelWithColon = ({ label, style }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text style={[style, { includeFontPadding: false }]}>{label}</Text>
    <Text style={[style, { paddingBottom: 1, includeFontPadding: false, textAlignVertical: 'center' }]}>:</Text>
  </View>
);

/**
 * カードリストモード用スケジュール表示コンポーネント
 * @param {{
 *   events: Array<Object>,
 *   loading: boolean,
 *   error: Error|null,
 *   activeBookmarkId: string,
 *   allBookmarks: Array<Object>,
 *   onActiveBookmarkChange: Function,
 *   onRefresh: Function,
 *   selectedDate: string,
 *   showBookmarkSelector?: boolean
 * }} props
 */
export const CardListSchedule = ({
  events = [],
  loading = false,
  error = null,
  activeBookmarkId,
  bookmarks = [],
  onBookmarkIdChange,
  onRefresh,
  selectedDate,
  showBookmarkSelector = true,
}) => {
  const { theme } = useTheme();

  // ローカル状態
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showMobileSelectorModal, setShowMobileSelectorModal] = useState(false);

  // アクティブなブックマークの色を取得
  const activeBookmarkColor = useMemo(() => {
    if (!bookmarks || !activeBookmarkId) return theme.primary;
    const activeBookmark = bookmarks.find(b => String(b.id) === String(activeBookmarkId));
    return activeBookmark?.color || theme.primary;
  }, [bookmarks, activeBookmarkId, theme.primary]);

  /**
   * 現在選択中のブックマークに基づいてイベントをフィルタリング
   * parent (TimeScheduleScreen) から渡される events は既にこのブックマークに関連付けられている想定だが、
   * 安全のために表示上でも利用する。
   */
  const displayEvents = useMemo(() => {
    if (!activeBookmarkId) return [];
    // eventsは親からフィルタリング済みで渡される想定だが、
    // ここでさらに精査したりソートしたりできるようにしておく
    return events;
  }, [events, activeBookmarkId]);

  /**
   * イベントカードタップ時のハンドラー
   */
  const handleEventCardPress = useCallback((eventItem) => {
    setSelectedEvent(eventItem);
    setShowDetailModal(true);
  }, []);

  /**
   * 詳細モーダル閉じる時のハンドラー
   */
  const handleDetailModalClose = useCallback(() => {
    setShowDetailModal(false);
    setSelectedEvent(null);
  }, []);

  /**
   * 時刻文字列をフォーマット（HH:mm）
   */
  const formatTimeLabel = useCallback((timeText) => {
    const parts = String(timeText || '').split(':');
    return `${parts[0]}:${parts[1] || '00'}`;
  }, []);

  /**
   * イベント時刻範囲をフォーマット
   */
  const formatTimeRange = useCallback((startTime, endTime) => {
    const start = formatTimeLabel(startTime);
    const end = formatTimeLabel(endTime);
    return start && end ? `${start} - ${end}` : start || end || '時間未設定';
  }, [formatTimeLabel]);

  /**
   * 場所名を生成（建物 + 場所）
   */
  const buildLocationLabel = useCallback((eventItem) => {
    const building = String(eventItem?.buildingLocationName || '').trim();
    const location = String(eventItem?.locationName || '').trim();
    return [building, location].filter(Boolean).join(' ');
  }, []);

  /**
   * 企画カテゴリ表示名を生成する
   */
  const buildCategoryLabel = useCallback((eventItem) => {
    return (
      String(eventItem?.categoryName || '').trim() ||
      String(eventItem?.categoryId || '').trim() ||
      ''
    );
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ブックマークセレクター */}
      {showBookmarkSelector ? (
        <View style={[styles.bookmarkSelectorContainer, { borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScrollContent}
          >
            {bookmarks && bookmarks.map((bookmark) => {
              const isActive = String(bookmark.id) === activeBookmarkId;
              const bColor = bookmark.color || theme.primary;
              return (
                <TouchableOpacity
                  key={bookmark.id}
                  onPress={() => onBookmarkIdChange(String(bookmark.id))}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? bColor : theme.surface,
                      borderColor: isActive ? bColor : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isActive ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {bookmark?.name || bookmark?.title || '名称未設定'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.mobileSelectorContainer, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.mobileSelectorButton,
              { backgroundColor: activeBookmarkColor, borderColor: theme.border }
            ]}
            onPress={() => setShowMobileSelectorModal(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.mobileSelectorButtonText, { color: theme.text }]}>
              {bookmarks.find(b => String(b.id) === activeBookmarkId)?.name || bookmarks.find(b => String(b.id) === activeBookmarkId)?.title || '名称未設定'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* エラー表示 */}
      {error && !loading && (
        <View style={[styles.errorContainer, { backgroundColor: theme.error + '20' }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            イベント読み込みエラー
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.error }]}
            onPress={onRefresh}
          >
            <Text style={[styles.retryButtonText, { color: '#fff' }]}>
              再取得
            </Text>
          </Pressable>
        </View>
      )}

      {/* ローディング表示 */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={theme.primary}
          />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            読み込み中...
          </Text>
        </View>
      )}

      {/* イベントリスト */}
      {!loading && displayEvents && displayEvents.length > 0 ? (
        <ScrollView
          style={styles.eventListContainer}
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={16}
        >
          {displayEvents.map((eventItem, index) => {
            const eventName =
              String(eventItem?.eventName || eventItem?.displayName || eventItem?.name || '').trim() ||
              '名称未設定';
            const startTime = eventItem?.startTime || eventItem?.start_time;
            const endTime = eventItem?.endTime || eventItem?.end_time;
            const locationLabel = buildLocationLabel(eventItem);
            const timeRange = formatTimeRange(startTime, endTime);
            const categoryLabel = buildCategoryLabel(eventItem);

            const entryStartTime = eventItem?.entry_start_time || eventItem?.entryStartTime;
            const exitEndTime = eventItem?.exit_end_time || eventItem?.exitEndTime;
            const itemColor = activeBookmarkColor;

            return (
              <Pressable
                key={`${eventName}-${index}`}
                style={[
                  styles.eventCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderLeftColor: itemColor,
                    borderLeftWidth: 5,
                  },
                ]}
                onPress={() => handleEventCardPress(eventItem)}
              >
                <View style={styles.cardMainContent}>
                  {/* 時刻バッジ */}
                  <View style={styles.timeBadgeContainer}>
                    <View
                      style={[
                        styles.timeSection,
                        {
                          backgroundColor: itemColor,
                          borderColor: itemColor,
                        },
                      ]}
                    >
                      <FormattedTime 
                        text={formatTimeLabel(startTime)} 
                        style={[styles.timeText, { color: theme.text }]} 
                      />
                    </View>
                    <View style={styles.optionalTimesColumn}>
                      <View style={[styles.optionalTimeBadge, { backgroundColor: toAlphaColor(theme.text, 0.05), opacity: entryStartTime ? 1 : 0 }]}>
                        <LabelWithColon 
                          label="前" 
                          style={[styles.optionalTimeLabel, { color: theme.textSecondary }]}
                        />
                        <FormattedTime 
                          text={entryStartTime ? formatTimeLabel(entryStartTime) : '--:--'} 
                          style={[styles.optionalTimeValue, { color: theme.textSecondary }]} 
                        />
                      </View>
                      <View style={[styles.optionalTimeBadge, { backgroundColor: toAlphaColor(theme.text, 0.05), opacity: exitEndTime ? 1 : 0 }]}>
                        <LabelWithColon 
                          label="後" 
                          style={[styles.optionalTimeLabel, { color: theme.textSecondary }]}
                        />
                        <FormattedTime 
                          text={exitEndTime ? formatTimeLabel(exitEndTime) : '--:--'} 
                          style={[styles.optionalTimeValue, { color: theme.textSecondary }]} 
                        />
                      </View>
                    </View>
                  </View>

                  {/* イベント情報 */}
                  <View style={styles.infoSection}>
                    <Text
                      style={[styles.eventName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {eventName}
                    </Text>

                    <View style={styles.categoryRow}>
                      <View style={[styles.categoryBadge, { backgroundColor: toAlphaColor(theme.text, 0.05), opacity: categoryLabel ? 1 : 0 }]}>
                        <Text style={[styles.categoryText, { color: theme.textSecondary }]}>{categoryLabel || ' '}</Text>
                      </View>
                    </View>

                    <View style={[styles.detailItem, { opacity: locationLabel ? 1 : 0 }]}>
                      <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
                      <Text style={[styles.detailText, { color: theme.textSecondary }]} numberOfLines={1}>
                        {locationLabel || ' '}
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.border}
                  />
                </View>
              </Pressable>
            );
          })}
          <View style={styles.listFooter} />
        </ScrollView>
      ) : !loading && (!events || events.length === 0) ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="calendar-outline"
            size={48}
            color={theme.textSecondary}
          />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {'このブックマークのイベントは\nまだ表示されていません'}
          </Text>
        </View>
      ) : null}

      {/* 詳細モーダル（時間表モードと同じコンポーネント呼び出し） */}
      <DetailModal
        visible={showDetailModal}
        item={selectedEvent}
        onClose={handleDetailModalClose}
      />

      {/* モバイル用ブックマーク選択モーダル */}
      {!showBookmarkSelector && (
        <Modal
          visible={showMobileSelectorModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowMobileSelectorModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowMobileSelectorModal(false)}
          >
            <Pressable style={[styles.mobileSelectorModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.mobileSelectorModalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.mobileSelectorModalTitle, { color: theme.text }]}>ブックマークを選択</Text>
                <TouchableOpacity onPress={() => setShowMobileSelectorModal(false)} style={styles.mobileSelectorModalClose}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.mobileSelectorModalList} showsVerticalScrollIndicator={false}>
                {bookmarks && bookmarks.map((bookmark) => {
                  const isActive = String(bookmark.id) === activeBookmarkId;
                  const bColor = bookmark.color || theme.primary;
                  return (
                    <TouchableOpacity
                      key={bookmark.id}
                      style={[
                        styles.mobileSelectorModalListItem,
                        { backgroundColor: bColor }
                      ]}
                      onPress={() => {
                        onBookmarkIdChange(String(bookmark.id));
                        setShowMobileSelectorModal(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.mobileSelectorModalListItemText,
                        { color: theme.text, fontWeight: isActive ? 'bold' : 'normal' }
                      ]}>
                        {bookmark?.name || bookmark?.title || '名称未設定'}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark" size={20} color={theme.text} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 40 }} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 8,
  },

  /* ブックマークセレクター（チップバー） */
  bookmarkSelectorContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },

  chipScrollContent: {
    paddingHorizontal: 12,
    gap: 10,
  },

  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
  },



  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
  },

  mobileSelectorContainer: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  mobileSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  mobileSelectorButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mobileSelectorModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '80%',
    paddingBottom: 30, // SafeArea考慮
  },
  mobileSelectorModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  mobileSelectorModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  mobileSelectorModalClose: {
    padding: 4,
  },
  mobileSelectorModalList: {
    padding: 16,
  },
  mobileSelectorModalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  mobileSelectorModalListItemText: {
    fontSize: 16,
  },

  /* ローディング・エラー表示 */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },

  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },

  errorContainer: {
    marginHorizontal: 8,
    marginVertical: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },

  errorText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },

  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  /* イベントリスト */
  eventListContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },

  eventCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardMainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  timeBadgeContainer: {
    alignItems: 'center',
    gap: 4,
  },
  timeSection: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  optionalTimesColumn: {
    gap: 2,
    marginTop: 2,
    alignItems: 'center',
  },
  optionalTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    gap: 3,
  },
  optionalTimeLabel: {
    fontSize: 9,
    fontWeight: '800',
    opacity: 0.8,
  },
  optionalTimeValue: {
    fontSize: 10,
    fontWeight: '600',
  },
  infoSection: {
    flex: 1,
    gap: 8,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  categoryRow: {
    flexDirection: 'row',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '600',
  },
  listFooter: {
    height: 40,
  },
});
