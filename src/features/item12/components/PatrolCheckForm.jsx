/**
 * 定常巡回チェックフォームコンポーネント
 * 本部評価と同じ企画マスタを巡回対象として選び、確認項目の一覧を見たうえで巡回記録を残す
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
 * 巡回チェック項目の一覧
 * DB の patrol_checks.check_items (jsonb) には
 * { key, label, answerKey, answerLabel, memo } の配列として保存する
 */
export const PATROL_CHECK_ITEM_OPTIONS = [
  {
    key: 'progress_status',
    label: '企画書通り進行中か',
  },
  {
    key: 'health_issue',
    label: '体調不良はいるか',
  },
  {
    key: 'trouble',
    label: '困りごとはあるか',
  },
  {
    key: 'nuisance_visitor',
    label: '迷惑来場者はいるか',
  },
  {
    key: 'unlocked_room',
    label: '無人・未施錠教室はあるか',
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
 * @param {Array} props.patrolLocations - 巡回対象候補配列（events ベース）
 * @param {string} props.selectedPatrolLocationId - 選択中企画ID
 * @param {Function} props.onSelectLocation - 企画選択コールバック
 * @param {string} props.patrolLocationText - 選択中企画表示文字列
 * @param {boolean} props.isChecklistConfirmed - 確認済みチェック状態
 * @param {Function} props.onToggleChecklistConfirmed - 確認済み切り替えコールバック
 * @param {Function} props.onClearSelectedLocation - 選択中企画の解除コールバック
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
  isChecklistConfirmed,
  onToggleChecklistConfirmed,
  onClearSelectedLocation,
  isSubmittingPatrolCheck,
  onSubmitPatrolCheck,
  recentPatrolChecks,
  isLoadingRecentPatrolChecks,
  onRefresh,
}) => {
  /** 団体名検索キーワード */
  const [organizationSearch, setOrganizationSearch] = useState('');
  /**
   * 選択済み状態で「選び直す」を押したときに企画一覧を再表示するフラグ
   * true のときは selectedLocation があっても候補リストを表示する
   */
  const [isReselecting, setIsReselecting] = useState(false);

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
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>定常巡回チェック</Text>
        </View>
        <View style={styles.sectionHeaderActions}>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
            onPress={onRefresh}
          >
            <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
          </TouchableOpacity>
          {selectedLocation && !isReselecting ? (
            <>
              {/* 選択済み状態から別の企画に選び直すボタン */}
              <TouchableOpacity
                style={[styles.reselectButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}12` }]}
                onPress={() => setIsReselecting(true)}
              >
                <Text style={[styles.reselectButtonText, { color: theme.primary }]}>選び直す</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setIsReselecting(false);
                  onClearSelectedLocation();
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
            </>
          ) : selectedLocation && isReselecting ? (
            /* 選び直し中は「戻る」ボタン（選択をキャンセルして元の状態に戻す） */
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={() => setIsReselecting(false)}
            >
              <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>戻る</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.locationSummaryCard,
          { borderLeftColor: theme.primary, backgroundColor: `${theme.primary}08` },
        ]}
      >
        <Text style={[styles.locationSummaryLabel, { color: theme.textSecondary }]}>
          選択中の企画
        </Text>
        <Text style={[styles.locationSummaryValue, { color: theme.text }]}>
          {currentLocationLabel}
        </Text>
      </View>

      {selectedLocation && !isReselecting ? (
        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
          選択中の企画だけ表示しています。別の企画に変更するときは「選び直す」を押してください。
        </Text>
      ) : (
        <>
          {/* 選び直し中の場合は現在の選択を強調表示 */}
          {isReselecting && selectedLocation ? (
            <Text style={[styles.subLabel, { color: theme.primary }]}>
              ↩ 別の企画を選択すると切り替わります
            </Text>
          ) : null}
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
                    onPress={() => {
                      /** 企画を選択したら選び直しモードを終了する */
                      setIsReselecting(false);
                      onSelectLocation(location);
                    }}
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
      <View
        style={[
          styles.checkCard,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        {PATROL_CHECK_ITEM_OPTIONS.map((item, index) => (
          <View key={item.key} style={styles.checkBulletRow}>
            <View style={[styles.checkBullet, { backgroundColor: `${theme.primary}15` }]}>
              <Text style={[styles.checkBulletText, { color: theme.primary }]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.checkCardTitle, styles.checkBulletLabel, { color: theme.text }]}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[
          styles.confirmCard,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
        onPress={() => onToggleChecklistConfirmed(!isChecklistConfirmed)}
      >
        <View style={styles.confirmRow}>
          <View
            style={[
              styles.confirmCheckbox,
              {
                borderColor: isChecklistConfirmed ? theme.primary : theme.border,
                backgroundColor: isChecklistConfirmed ? theme.primary : theme.surface,
              },
            ]}
          >
            {isChecklistConfirmed ? (
              <Text style={styles.confirmCheckboxText}>✓</Text>
            ) : null}
          </View>
          <View style={styles.confirmTextBlock}>
            <Text style={[styles.checkCardTitle, { color: theme.text }]}>
              上記のチェック項目を確認しました
            </Text>
            <Text style={[styles.supportNoticeText, { color: theme.textSecondary }]}>
              何かあったら本部に連絡してください
            </Text>
          </View>
        </View>
      </Pressable>

      <TouchableOpacity
        style={[
          styles.actionButton,
          { backgroundColor: isChecklistConfirmed ? theme.primary : theme.border },
        ]}
        onPress={onSubmitPatrolCheck}
        disabled={isSubmittingPatrolCheck || !isChecklistConfirmed}
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
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
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
  /** キャンセル/戻るボタン */
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
  /** 選び直すボタン: pill型 */
  reselectButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  reselectButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  /** 選択中企画サマリーカード: 左アクセントボーダー */
  locationSummaryCard: {
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
  /** 検索入力: borderRadius 14→12 */
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
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
    borderRadius: 12,
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
  /** チェックカード: borderWidth 1.5 + shadow */
  checkCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  checkCardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  checkBulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  checkBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBulletText: {
    fontSize: 12,
    fontWeight: '800',
  },
  checkBulletLabel: {
    flex: 1,
    lineHeight: 22,
  },
  confirmCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCheckboxText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  confirmTextBlock: {
    flex: 1,
    gap: 4,
  },
  supportNoticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 登録ボタン: pill型 (borderRadius 14→24) */
  actionButton: {
    borderRadius: 24,
    paddingVertical: 14,
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
    borderRadius: 12,
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
