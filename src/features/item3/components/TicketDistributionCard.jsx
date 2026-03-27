/**
 * 配布率カードコンポーネント
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DISTRIBUTION_TYPES, STATUS_COLORS } from '../constants';

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
  return (
    <View>
      <View style={styles.waitTimeBox}>
        <Text style={styles.waitTimeLabel}>待ち時間</Text>
        <Text style={styles.waitTimeValue}>{sequential.estimatedWaitMinutes}分</Text>
      </View>
      <View style={styles.infoGrid}>
      <View style={styles.infoItem}>
        <Text style={styles.infoLabel}>現在呼び出し</Text>
        <Text style={styles.infoValue}>{sequential.currentCallNumber}</Text>
      </View>
      <View style={styles.infoItem}>
        <Text style={styles.infoLabel}>最後尾番号</Text>
        <Text style={styles.infoValue}>{sequential.lastTicketNumber}</Text>
      </View>
      <View style={styles.infoItem}>
        <Text style={styles.infoLabel}>待ち人数(人)</Text>
        <Text style={styles.infoValue}>{sequential.waitingCount}</Text>
      </View>
      <View style={styles.infoItem}>
        <Text style={styles.infoLabel}>1番号あたり</Text>
        <Text style={styles.infoValue}>{sequential.estimatedWaitPerNumber}分</Text>
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
  if (!timeSlots.length) {
    return <Text style={styles.emptyText}>時間枠が登録されていません</Text>;
  }

  return (
    <View style={styles.timeSlotList}>
      {timeSlots.map((slot) => (
        <View key={slot.id} style={styles.timeSlotCard}>
          <View style={styles.timeSlotHeader}>
            <Text style={styles.timeSlotTitle}>
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
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>定員(人)</Text>
              <Text style={styles.infoValue}>{slot.capacityPerSlot}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>発券済み(人)</Text>
              <Text style={styles.infoValue}>{slot.currentCount}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>残り枠(人)</Text>
              <Text style={styles.infoValue}>{slot.remainingCount}</Text>
            </View>
          </View>
          {slot.isClosed && (
            <Text style={styles.closedText}>受付終了</Text>
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
  /** 時間枠の折りたたみ状態 */
  const [isTimeSlotCollapsed, setIsTimeSlotCollapsed] = useState(false);

  /** 時間枠一覧を開閉する */
  const toggleTimeSlotCollapse = () => {
    setIsTimeSlotCollapsed((prev) => !prev);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{item.eventName}</Text>
          <Text style={styles.cardSubtitle}>{item.location || '場所未設定'}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        >
          <Text style={styles.statusText}>{item.statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.dateText}>開催日: {formatDateLabel(item.date)}</Text>
      <Text style={styles.typeText}>
        配布方式: {distributionType === DISTRIBUTION_TYPES.SEQUENTIAL ? '順次案内制' : '時間枠定員制'}
      </Text>

      {distributionType === DISTRIBUTION_TYPES.SEQUENTIAL ? (
        <SequentialInfo sequential={item.sequential} />
      ) : (
        <View>
          <View style={styles.timeSlotToggleRow}>
            <Text style={styles.timeSlotToggleLabel}>時間枠一覧</Text>
            <Text style={styles.timeSlotToggleButton} onPress={toggleTimeSlotCollapse}>
              {isTimeSlotCollapsed ? '開く' : '閉じる'}
            </Text>
          </View>
          {!isTimeSlotCollapsed && <TimeSlotInfo timeSlots={item.timeSlots} />}
        </View>
      )}

      {item.updatedAt && (
        <Text style={styles.updatedText}>
          更新: {new Date(item.updatedAt).toLocaleString('ja-JP')}
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
  timeSlotToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeSlotToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  timeSlotToggleButton: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
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
