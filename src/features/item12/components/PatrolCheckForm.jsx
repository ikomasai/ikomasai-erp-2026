/**
 * 定常巡回チェックフォームコンポーネント
 * organizations_events を巡回対象として選び、設問ごとの回答と項目別メモを記録する
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';
import {
  matchesOrganizationEventSearchKeyword,
  normalizeOrganizationEventSearchValue,
} from '../../../shared/utils/organizationEventList';

/**
 * 巡回チェック項目の選択肢
 * DB の patrol_checks.check_items (jsonb) に
 * { key, label, answerKey, answerLabel, memo } の配列として保存する
 */
export const PATROL_CHECK_ITEM_OPTIONS = [
  {
    key: 'progress_status',
    label: '企画書通り進行中か',
    options: [
      { key: 'good', label: 'よく進行している' },
      { key: 'normal', label: '普通に進行している' },
      { key: 'bad', label: 'うまくいっていない' },
    ],
  },
  {
    key: 'health_issue',
    label: '体調不良はいるか',
    options: [
      { key: 'present', label: 'いる' },
      { key: 'none', label: 'いない' },
    ],
  },
  {
    key: 'trouble',
    label: '困りごとはあるか',
    options: [
      { key: 'present', label: 'ある' },
      { key: 'none', label: 'ない' },
    ],
  },
  {
    key: 'nuisance_visitor',
    label: '迷惑来場者はいるか',
    options: [
      { key: 'present', label: 'いる' },
      { key: 'none', label: 'いない' },
    ],
  },
  {
    key: 'unlocked_room',
    label: '無人・未施錠教室はあるか',
    options: [
      { key: 'present', label: 'ある' },
      { key: 'none', label: 'ない' },
    ],
  },
];

/**
 * 履歴の check_items を表示向けに正規化する
 * @param {Array} value - patrol_checks.check_items の値
 * @returns {Array} 表示向け配列
 */
const normalizeHistoryCheckItems = (value) => {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === 'string') {
        return {
          key: item,
          label: item,
          answerKey: '',
          answerLabel: '',
          score: null,
          memo: '',
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      return {
        key: item.key || item.label,
        label: item.label || item.key || '項目名未設定',
        answerKey: item.answerKey || '',
        answerLabel: item.answerLabel || item.answer || '',
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
        memo: item.memo || '',
      };
    })
    .filter(Boolean);
};

/**
 * 定常巡回チェックフォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Array} props.patrolLocations - 巡回対象候補配列（organizations_events）
 * @param {string} props.selectedPatrolLocationId - 選択中企画ID
 * @param {Function} props.onSelectLocation - 企画選択コールバック
 * @param {string} props.patrolLocationText - 選択中企画表示文字列
 * @param {Object} props.patrolCheckItems - 項目別評価状態
 * @param {Function} props.onChangeCheckAnswer - 項目別回答変更コールバック
 * @param {Function} props.onChangeCheckMemo - 項目別メモ変更コールバック
 * @param {Function} props.onClearSelectedLocation - 選択中企画の解除コールバック
 * @param {string} props.patrolCheckMemo - 全体メモ文字列
 * @param {Function} props.onChangeSummaryMemo - 全体メモ変更コールバック
 * @param {boolean} props.isSubmittingPatrolCheck - 登録中フラグ
 * @param {Function} props.onSubmitPatrolCheck - 登録ボタン押下コールバック
 * @param {Array} props.recentPatrolChecks - 直近巡回チェック履歴配列
 * @param {boolean} props.isLoadingRecentPatrolChecks - 履歴読み込み中フラグ
 * @param {Function} props.onRefresh - 更新ボタン押下コールバック
 * @returns {JSX.Element} 定常巡回チェックフォームUI
 */
const PatrolCheckForm = ({
  theme,
  patrolLocations,
  selectedPatrolLocationId,
  onSelectLocation,
  patrolLocationText,
  patrolCheckItems,
  onChangeCheckAnswer,
  onChangeCheckMemo,
  onClearSelectedLocation,
  patrolCheckMemo,
  onChangeSummaryMemo,
  isSubmittingPatrolCheck,
  onSubmitPatrolCheck,
  recentPatrolChecks,
  isLoadingRecentPatrolChecks,
  onRefresh,
}) => {
  /** 団体名検索キーワード */
  const [organizationSearch, setOrganizationSearch] = useState('');

  /** 選択中企画 */
  const selectedLocation = useMemo(() => {
    return patrolLocations.find((location) => String(location.id) === String(selectedPatrolLocationId)) || null;
  }, [patrolLocations, selectedPatrolLocationId]);

  /** 団体名で絞り込んだ企画候補 */
  const filteredLocations = useMemo(() => {
    /** 検索文字列 */
    const keyword = normalizeOrganizationEventSearchValue(organizationSearch);

    if (!keyword) {
      return patrolLocations;
    }

    return patrolLocations.filter((location) => {
      const organizationName = location.organizationName || '';
      return matchesOrganizationEventSearchKeyword(organizationName, keyword);
    });
  }, [organizationSearch, patrolLocations]);

  /** 現在入力している巡回対象 */
  const currentLocationLabel =
    patrolLocationText.trim() ||
    selectedLocation?.label ||
    '企画を選択してください';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>定常巡回チェック</Text>
          <Text style={[styles.sectionSubTitle, { color: theme.textSecondary }]}>
            団体名で絞り込み、企画を1件選んでから各項目の状況を記録します。
          </Text>
        </View>
        <View style={styles.sectionHeaderActions}>
          <TouchableOpacity
            style={[styles.refreshButton, { borderColor: theme.border }]}
            onPress={onRefresh}
          >
            <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
          </TouchableOpacity>
          {selectedLocation ? (
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={onClearSelectedLocation}
            >
              <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>キャンセル</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.locationSummaryCard,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.locationSummaryLabel, { color: theme.textSecondary }]}>
          選択中の企画
        </Text>
        <Text style={[styles.locationSummaryValue, { color: theme.text }]}>
          {currentLocationLabel}
        </Text>
      </View>

      {selectedLocation ? (
        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
          選択中の企画だけ表示しています。別の企画を選ぶときはキャンセルしてください。
        </Text>
      ) : (
        <>
          <Text style={[styles.label, { color: theme.text }]}>団体名で絞り込み</Text>
          <TextInput
            value={organizationSearch}
            onChangeText={setOrganizationSearch}
            placeholder="例: 情祭"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.searchInput,
              {
                borderColor: theme.border,
                backgroundColor: theme.background,
                color: theme.text,
              },
            ]}
          />

          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>対象企画を1件選択</Text>
          {filteredLocations.length === 0 ? (
            <Text style={[styles.emptyInlineText, { color: theme.textSecondary }]}>
              該当する企画候補がありません
            </Text>
          ) : (
            <View style={styles.locationList}>
              {filteredLocations.slice(0, 18).map((location) => {
                /** 選択中かどうか */
                const isActive = String(location.id) === String(selectedPatrolLocationId);

                return (
                  <Pressable
                    key={location.id}
                    style={[
                      styles.locationOption,
                      {
                        borderColor: isActive ? theme.primary : theme.border,
                        backgroundColor: isActive ? `${theme.primary}12` : theme.background,
                      },
                    ]}
                    onPress={() => onSelectLocation(location)}
                  >
                    <Text
                      style={[
                        styles.locationOptionOrg,
                        { color: isActive ? theme.primary : theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {location.organizationName || '団体名未設定'}
                    </Text>
                    <Text
                      style={[
                        styles.locationOptionEvent,
                        { color: isActive ? theme.primary : theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {location.eventName || '企画名未設定'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      <Text style={[styles.label, { color: theme.text }]}>チェック項目</Text>
      <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
        各項目について当てはまる選択肢を選んでください。必要なら各項目にメモを残せます。
      </Text>
      <View style={styles.checkItemList}>
        {PATROL_CHECK_ITEM_OPTIONS.map((item) => {
          /** 現在の回答 */
          const answerKey = patrolCheckItems[item.key]?.answerKey || '';
          /** 現在の項目別メモ */
          const memo = patrolCheckItems[item.key]?.memo || '';

          return (
            <View
              key={item.key}
              style={[
                styles.checkCard,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Text style={[styles.checkCardTitle, { color: theme.text }]}>{item.label}</Text>
              <View style={styles.answerRow}>
                {item.options.map((option) => {
                  /** 選択中かどうか */
                  const isActive = option.key === answerKey;

                  return (
                    <Pressable
                      key={`${item.key}-${option.key}`}
                      style={[
                        styles.answerButton,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? `${theme.primary}18` : theme.surface,
                        },
                      ]}
                      onPress={() => onChangeCheckAnswer(item.key, option.key, option.label)}
                    >
                      <Text
                        style={[
                          styles.answerButtonText,
                          { color: isActive ? theme.primary : theme.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={memo}
                onChangeText={(value) => onChangeCheckMemo(item.key, value)}
                multiline
                placeholder="この項目の気づきや補足"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.itemMemoInput,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    color: theme.text,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>全体メモ（任意）</Text>
      <TextInput
        value={patrolCheckMemo}
        onChangeText={onChangeSummaryMemo}
        multiline
        placeholder="全体として残したい補足があれば入力"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.summaryMemoInput,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
            color: theme.text,
          },
        ]}
      />

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: theme.primary }]}
        onPress={onSubmitPatrolCheck}
        disabled={isSubmittingPatrolCheck}
      >
        <Text style={styles.actionButtonText}>
          {isSubmittingPatrolCheck ? '登録中...' : '巡回チェックを記録'}
        </Text>
      </TouchableOpacity>

      <View style={styles.historyHeader}>
        <Text style={[styles.label, { color: theme.text }]}>直近の巡回チェック</Text>
        <Text style={[styles.historyCount, { color: theme.textSecondary }]}>
          {recentPatrolChecks.length}件
        </Text>
      </View>
      {isLoadingRecentPatrolChecks ? (
        <SkeletonLoader lines={3} baseColor={theme.border} />
      ) : recentPatrolChecks.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="まだ巡回チェックはありません"
          description="巡回チェックを記録すると履歴が表示されます"
          theme={theme}
        />
      ) : (
        <View style={styles.historyList}>
          {recentPatrolChecks.map((check) => {
            /** 表示用に正規化した履歴項目 */
            const historyItems = normalizeHistoryCheckItems(check.check_items);

            return (
              <View
                key={check.id}
                style={[
                  styles.historyItem,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
              >
                <Text style={[styles.historyItemTitle, { color: theme.text }]}>
                  {check.location_text}
                </Text>
                <View style={styles.historyCheckList}>
                  {historyItems.map((item) => (
                    <View key={`${check.id}-${item.key}`} style={styles.historyCheckRow}>
                      <Text style={[styles.historyCheckLabel, { color: theme.text }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.historyCheckScore, { color: theme.primary }]}>
                        {item.answerLabel || (item.score ? `${item.score} / 5` : '旧形式')}
                      </Text>
                      {item.memo ? (
                        <Text style={[styles.historyCheckMemo, { color: theme.textSecondary }]}>
                          {item.memo}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                {check.memo ? (
                  <Text style={[styles.historySummaryMemo, { color: theme.textSecondary }]}>
                    全体メモ: {check.memo}
                  </Text>
                ) : null}
                <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                  {new Date(check.checked_at || check.created_at).toLocaleString('ja-JP')}
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
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  refreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  locationSummaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  locationSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  locationSummaryValue: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  emptyInlineText: {
    fontSize: 12,
    lineHeight: 18,
  },
  locationList: {
    gap: 8,
  },
  locationOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  locationOptionOrg: {
    fontSize: 11,
    fontWeight: '700',
  },
  locationOptionEvent: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkItemList: {
    gap: 10,
  },
  checkCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  checkCardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  answerButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  answerButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemMemoInput: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  summaryMemoInput: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actionButton: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyList: {
    gap: 8,
    marginBottom: 12,
  },
  historyItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  historyCheckList: {
    gap: 6,
  },
  historyCheckRow: {
    gap: 2,
  },
  historyCheckLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyCheckScore: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyCheckMemo: {
    fontSize: 12,
    lineHeight: 18,
  },
  historySummaryMemo: {
    fontSize: 12,
    lineHeight: 18,
  },
  historyDate: {
    fontSize: 11,
  },
});

export default PatrolCheckForm;
