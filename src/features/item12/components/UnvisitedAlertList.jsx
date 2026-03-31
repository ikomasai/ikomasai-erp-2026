/**
 * 未巡回アラート一覧コンポーネント
 * 閾値選択と未巡回場所リストを表示する
 */

import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';

/** 未巡回アラート閾値の選択肢（分） */
const UNVISITED_ALERT_OPTIONS = [30, 60, 90, 120];

/**
 * 未巡回アラート一覧コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Array} props.unvisitedLocations - 未巡回場所配列
 * @param {boolean} props.isLoadingUnvisitedLocations - 読み込み中フラグ
 * @param {number} props.unvisitedAlertMinutes - 選択中閾値（分）
 * @param {Function} props.onChangeAlertMinutes - 閾値変更コールバック
 * @param {Function} props.onRefresh - 更新ボタン押下コールバック
 * @returns {JSX.Element} 未巡回アラート一覧UI
 */
const UnvisitedAlertList = ({
  theme,
  unvisitedLocations,
  isLoadingUnvisitedLocations,
  unvisitedAlertMinutes,
  onChangeAlertMinutes,
  onRefresh,
}) => {
  /** 閾値超過件数 */
  const alertCount = unvisitedLocations.filter((location) => location.is_alert).length;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>未巡回アラート</Text>
          <Text style={[styles.sectionSubTitle, { color: theme.textSecondary }]}>
            閾値を超えた場所を先頭に出し、見落としを減らします。
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
          onPress={onRefresh}
        >
          <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.alertSummaryCard,
          {
            borderLeftColor: alertCount > 0 ? theme.error : theme.primary,
            backgroundColor: alertCount > 0 ? `${theme.error}10` : theme.background,
          },
        ]}
      >
        <Text style={[styles.alertSummaryValue, { color: alertCount > 0 ? theme.error : theme.text }]}>
          {alertCount}
        </Text>
        <Text style={[styles.alertSummaryLabel, { color: theme.textSecondary }]}>
          閾値超過の場所
        </Text>
      </View>

      {/* 閾値変更UIは onChangeAlertMinutes が渡された場合（本部）のみ表示 */}
      {onChangeAlertMinutes ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>アラート閾値</Text>
          <View style={styles.optionGroup}>
            {UNVISITED_ALERT_OPTIONS.map((minutes) => {
              /** 選択中かどうか */
              const isActive = minutes === unvisitedAlertMinutes;
              return (
                <Pressable
                  key={String(minutes)}
                  style={[
                    styles.optionButton,
                    {
                      borderColor: isActive ? theme.primary : theme.border,
                      backgroundColor: isActive ? theme.primary : theme.background,
                    },
                  ]}
                  onPress={() => onChangeAlertMinutes(minutes)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      { color: isActive ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {minutes}分
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        /* 閾値変更不可の場合（巡回サポート側）は現在の閾値を読み取り専用で表示 */
        <View style={[styles.readonlyThresholdRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <Text style={[styles.readonlyThresholdLabel, { color: theme.textSecondary }]}>
            アラート閾値（本部設定）
          </Text>
          <Text style={[styles.readonlyThresholdValue, { color: theme.text }]}>
            {unvisitedAlertMinutes}分
          </Text>
        </View>
      )}

      {isLoadingUnvisitedLocations ? (
        <SkeletonLoader lines={3} baseColor={theme.border} />
      ) : unvisitedLocations.length === 0 ? (
        <EmptyState
          icon="🚨"
          title="未巡回アラートはありません"
          description="すべての場所が閾値内に巡回されています"
          theme={theme}
        />
      ) : (
        <View style={styles.ticketList}>
          {unvisitedLocations.slice(0, 24).map((row) => {
            /** 経過時間表示 */
            const elapsedLabel =
              row.elapsed_minutes === null
                ? '-'
                : `${Math.floor(row.elapsed_minutes / 60)}時間${row.elapsed_minutes % 60}分`;

            return (
              <View
                key={row.location_id}
                style={[
                  styles.ticketItem,
                  {
                    borderColor: row.is_alert ? theme.error : theme.border,
                    borderLeftColor: row.is_alert ? theme.error : theme.border,
                    backgroundColor: row.is_alert ? `${theme.error}0A` : theme.background,
                  },
                ]}
              >
                <View style={styles.ticketHeaderRow}>
                  <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                    {row.location_label}
                  </Text>
                  <View
                    style={[
                      styles.alertBadge,
                      {
                        backgroundColor: row.is_alert ? theme.error : theme.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertBadgeText,
                        { color: row.is_alert ? '#FFFFFF' : theme.textSecondary },
                      ]}
                    >
                      {elapsedLabel}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
                  最終巡回:{' '}
                  {row.last_checked_at
                    ? new Date(row.last_checked_at).toLocaleString('ja-JP')
                    : '巡回記録なし'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /** 外枠カード: shadow で浮かせる / borderWidth削除 */
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubTitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  /** 更新ボタン: primary薄め背景 / borderWidth削除 */
  refreshButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** アラートサマリーカード: 左アクセントボーダー + shadow */
  alertSummaryCard: {
    borderLeftWidth: 4,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** アラート件数: fontSize 24→32 */
  alertSummaryValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  alertSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  /** 閾値ボタン: pill型 / アクティブ時fill */
  optionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  /** 閾値の読み取り専用表示（巡回サポート側） */
  readonlyThresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  readonlyThresholdLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  readonlyThresholdValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  ticketList: {
    gap: 8,
  },
  /** タスク行: 左アクセントボーダー + shadow */
  ticketItem: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  ticketTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  /** アラートバッジ: pill型 / borderWidth削除 */
  alertBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ticketMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
});

export default UnvisitedAlertList;
