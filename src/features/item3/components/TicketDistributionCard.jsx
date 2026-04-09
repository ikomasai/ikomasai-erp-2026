/**
 * 配布率カードコンポーネント
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DISTRIBUTION_TYPES, STATUS_COLORS } from '../constants';
import { useTheme } from '../../../shared/hooks/useTheme';

/** 日付チップ間隔 */
const DATE_CHIP_GAP = 8;
/** 日付チップ高さ */
const DATE_CHIP_HEIGHT = 32;
/** 日付チップ横余白 */
const DATE_CHIP_PADDING_HORIZONTAL = 12;
/** 日付チップ文字サイズ */
const DATE_CHIP_FONT_SIZE = 13;
/** 時間枠ボタン高さ */
const TIME_SLOT_BUTTON_HEIGHT = 36;

/**
 * 日付を日本語表示に整形する
 * @param {string} dateString - 日付文字列
 * @returns {string} 表示用日付
 */
const formatDateLabel = (dateString) => {
  if (!dateString) {
    return '日付未設定';
  }

  /** 日付オブジェクト */
  const date = new Date(dateString);

  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
};

/**
 * 時刻表示を整形する
 * @param {string} timeString - 時刻文字列
 * @returns {string} 表示用時刻
 */
const formatTimeLabel = (timeString) => {
  if (!timeString) {
    return '--:--';
  }

  return timeString.slice(0, 5);
};

/**
 * ステータスのバッジ色を取得する
 * @param {string} status - ステータス
 * @returns {string} 色コード
 */
const getStatusColor = (status) => {
  return STATUS_COLORS[status] || '#95a5a6';
};

/**
 * 順次案内制の情報表示
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.sequential - 順次案内制データ
 * @returns {JSX.Element} 表示
 */
const SequentialInfo = ({ sequential }) => {
  /** テーマ */
  const { theme } = useTheme();

  return (
    <View>
      <View style={[styles.waitTimeBox, { backgroundColor: theme.background, borderRadius: theme.borderRadius }]}>
        <Text style={[styles.waitTimeLabel, { color: theme.primary }]}>待ち時間</Text>
        <Text style={[styles.waitTimeValue, { color: theme.text }]}>{sequential.estimatedWaitMinutes}分</Text>
      </View>
      <View style={styles.infoGrid}>
        <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>現在呼び出し</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{sequential.currentCallNumber}</Text>
        </View>
        <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>最後尾番号</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{sequential.lastTicketNumber}</Text>
        </View>
        <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>待ち人数(人)</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{sequential.waitingCount}</Text>
        </View>
        <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>1グループあたり</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{sequential.estimatedWaitPerNumber}分</Text>
        </View>
      </View>
    </View>
  );
};

/**
 * 時間枠定員制の情報表示
 * @param {Object} props - コンポーネントプロパティ
 * @param {Array<Object>} props.timeSlots - 時間枠一覧
 * @returns {JSX.Element} 表示
 */
const TimeSlotInfo = ({ timeSlots }) => {
  /** テーマ */
  const { theme } = useTheme();

  if (!timeSlots.length) {
    return <Text style={[styles.emptyText, { color: theme.textSecondary }]}>時間枠が登録されていません</Text>;
  }

  return (
    <View style={styles.timeSlotList}>
      {timeSlots.map((slot) => (
        <View key={slot.id} style={styles.timeSlotCard}>
          <View style={styles.timeSlotHeader}>
            <Text style={[styles.timeSlotTitle, { color: theme.text }]}>
              {formatTimeLabel(slot.startTime)} - {formatTimeLabel(slot.endTime)}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(slot.status) },
              ]}
            >
              <Text style={styles.statusText}>{slot.statusLabel}</Text>
            </View>
          </View>
          <View style={styles.infoGrid}>
            <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>定員(人)</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{slot.capacityPerSlot}</Text>
            </View>
            <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>発券済み(人)</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{slot.currentCount}</Text>
            </View>
            <View style={[styles.infoItem, { backgroundColor: theme.surface, borderRadius: theme.borderRadius }]}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>残り枠(人)</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{slot.remainingCount}</Text>
            </View>
          </View>
          {slot.isClosed && (
            <Text style={[styles.closedText, { color: theme.error }]}>受付終了</Text>
          )}
        </View>
      ))}
    </View>
  );
};

/**
 * 配布率カード
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.item - 配布状況データ
 * @returns {JSX.Element} 配布率カード
 */
const TicketDistributionCard = ({ item }) => {
  /** 企画タイプ */
  const distributionType = item.type;
  /** 日付別配列 */
  const dateEntries = item.dateEntries || [item];
  /** 日付タブ選択インデックス */
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  /** 時間枠の折りたたみ状態 */
  const [isTimeSlotCollapsed, setIsTimeSlotCollapsed] = useState(true);
  /** テーマ */
  const { theme } = useTheme();
  /** 表示対象の日付データ */
  const selectedEntry = dateEntries[selectedDateIndex] || dateEntries[0];

  useEffect(() => {
    if (selectedDateIndex >= dateEntries.length) {
      setSelectedDateIndex(0);
    }
  }, [dateEntries.length, selectedDateIndex]);

  /** 時間枠一覧を開閉する */
  const toggleTimeSlotCollapse = () => {
    setIsTimeSlotCollapsed((prev) => !prev);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderRadius: theme.borderRadius, shadowOpacity: theme.shadowOpacity }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{item.eventName}</Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>{item.location || '場所未設定'}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(selectedEntry.status) },
          ]}
        >
          <Text style={styles.statusText}>{selectedEntry.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.dateChipRow}>
        {dateEntries.map((entry, index) => {
          /** 選択中フラグ */
          const isActive = index === selectedDateIndex;

          return (
            <TouchableOpacity
              key={entry.eventDateId || entry.date || index}
              style={[
                styles.dateChip,
                { borderColor: theme.border, backgroundColor: theme.surface },
                isActive && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => setSelectedDateIndex(index)}
            >
              <Text
                style={[
                  styles.dateChipText,
                  { color: theme.text },
                  isActive && { color: '#FFFFFF' },
                ]}
              >
                {formatDateLabel(entry.date)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.dateText, { color: theme.textSecondary }]}>開催日: {formatDateLabel(selectedEntry.date)}</Text>
      <Text style={[styles.typeText, { color: theme.primary }]}>
        配布方式: {distributionType === DISTRIBUTION_TYPES.SEQUENTIAL ? '順次案内制' : '時間枠定員制'}
      </Text>

      {distributionType === DISTRIBUTION_TYPES.SEQUENTIAL ? (
        <SequentialInfo sequential={selectedEntry.sequential} />
      ) : (
        <View>
          <Text style={[styles.timeSlotToggleLabel, { color: theme.text }]}>時間枠一覧</Text>
          {!isTimeSlotCollapsed && <TimeSlotInfo timeSlots={selectedEntry.timeSlots} />}
          <TouchableOpacity
            style={[styles.timeSlotToggleButton, { borderColor: theme.primary }]}
            onPress={toggleTimeSlotCollapse}
          >
            <Text style={[styles.timeSlotToggleButtonText, { color: theme.primary }]}
            >
              {isTimeSlotCollapsed ? '一覧を開く' : '一覧を閉じる'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedEntry.updatedAt && (
        <Text style={[styles.updatedText, { color: theme.textSecondary }]}>
          更新: {new Date(selectedEntry.updatedAt).toLocaleString('ja-JP')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#7f8c8d',
    marginTop: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 6,
  },
  typeText: {
    fontSize: 13,
    color: '#2980b9',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  dateChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DATE_CHIP_GAP,
    marginBottom: 10,
  },
  dateChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: DATE_CHIP_PADDING_HORIZONTAL,
    height: DATE_CHIP_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateChipText: {
    fontSize: DATE_CHIP_FONT_SIZE,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  infoItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    minWidth: 120,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  waitTimeBox: {
    backgroundColor: '#f1f8ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  waitTimeLabel: {
    fontSize: 12,
    color: '#2980b9',
    marginBottom: 6,
  },
  waitTimeValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2c3e50',
  },
  timeSlotToggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  timeSlotToggleButton: {
    alignSelf: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 20,
    height: TIME_SLOT_BUTTON_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeSlotToggleButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  timeSlotList: {
    gap: 12,
  },
  timeSlotCard: {
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  timeSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeSlotTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  updatedText: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 12,
    textAlign: 'right',
  },
  closedText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 8,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#95a5a6',
    textAlign: 'center',
    paddingVertical: 12,
  },
});

export default TicketDistributionCard;
