/**
 * シフト変更申請履歴画面（祭実長・部長向け）
 * 自分が申請したシフト変更申請の一覧をステータス別に確認できます
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { selectShiftChangeRequestsByUser } from '../services/shiftChangeService';

/**
 * フィルター選択肢
 * key: DB上のステータス値または 'all'
 */
const FILTER_OPTIONS = [
  { key: 'all', label: '全て' },
  { key: 'pending', label: '未対応' },
  { key: 'completed', label: '完了' },
  { key: 'rejected', label: '却下' },
];

/**
 * ステータスごとの表示設定を返す
 * @param {string} status - DBのステータス値
 * @returns {{ label: string, color: string, bgColor: string }} 表示設定
 */
const getStatusConfig = (status) => {
  switch (status) {
    case 'completed':
      return { label: '✅ 完了', color: '#2E7D32', bgColor: '#E8F5E9' };
    case 'rejected':
      return { label: '❌ 却下', color: '#C62828', bgColor: '#FFEBEE' };
    default:
      return { label: '⏳ 未対応', color: '#E65100', bgColor: '#FFF3E0' };
  }
};

/**
 * ISO形式の日時文字列を表示用に変換（M月D日 HH:mm）
 * @param {string} isoString - ISO形式の日時文字列
 * @returns {string} 表示用の日時文字列
 */
const formatDateTime = (isoString) => {
  if (!isoString) {
    return '';
  }
  const date = new Date(isoString);
  /** 月（1始まり） */
  const month = date.getMonth() + 1;
  /** 日 */
  const day = date.getDate();
  /** 時 */
  const hours = String(date.getHours()).padStart(2, '0');
  /** 分 */
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
};

/**
 * YYYY-MM-DD形式の日付文字列を表示用に変換（M月D日）
 * @param {string} dateString - YYYY-MM-DD形式の日付
 * @returns {string} 表示用の日付文字列
 */
const formatShiftDate = (dateString) => {
  if (!dateString) {
    return '';
  }
  const [, month, day] = dateString.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
};

/**
 * シフト変更申請履歴画面コンポーネント（祭実長・部長向け）
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.userId - ログインユーザーID
 * @param {number} [props.refreshTrigger] - 親からの強制リロードトリガー（値が変わるたびにリロード）
 * @returns {JSX.Element} 申請履歴画面
 */
const ShiftChangeHistoryScreen = ({ userId, refreshTrigger }) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 申請一覧 */
  const [requests, setRequests] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** フィルター（'all' | 'pending' | 'completed' | 'rejected'） */
  const [filter, setFilter] = useState('all');

  /**
   * 申請履歴を取得する
   */
  const loadRequests = useCallback(async () => {
    if (!userId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    const { requests: data, error } = await selectShiftChangeRequestsByUser(userId);
    if (error) {
      setErrorMessage('申請履歴の取得に失敗しました');
    } else {
      setRequests(data);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests, refreshTrigger]);

  /**
   * フィルター適用後の申請一覧
   */
  const filteredRequests =
    filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  /**
   * 申請カードを描画する
   * @param {{ item: Object }} param0 - FlatListの描画引数
   * @returns {JSX.Element} 申請カード
   */
  const renderItem = ({ item }) => {
    /** ステータス表示設定 */
    const statusConfig = getStatusConfig(item.status);
    /** シフト交換（true）か移動（false）かを判定 */
    const isSwap = !!item.destination_area_name;

    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {/* カードヘッダー：ステータスバッジ・変更タイプ */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
          <Text
            style={[
              styles.changeTypeBadge,
              {
                color: isSwap ? '#1565C0' : '#6A1B9A',
                backgroundColor: isSwap ? '#E3F2FD' : '#F3E5F5',
              },
            ]}
          >
            {isSwap ? '交換' : '移動'}
          </Text>
        </View>

        {/* 団体名・日付 */}
        <Text style={[styles.organizationDate, { color: theme.text }]}>
          {item.organization_name}　{formatShiftDate(item.shift_date)}
        </Text>

        {/* シフト詳細 */}
        <View style={[styles.shiftDetail, { borderColor: theme.border }]}>
          <View style={styles.shiftRow}>
            <Text style={[styles.shiftLabel, { color: theme.textSecondary }]}>変更元</Text>
            <Text style={[styles.shiftValue, { color: theme.text }]}>
              {item.source_member_name}さん・{item.source_time_slot}・{item.source_area_name}
            </Text>
          </View>
          <Text style={[styles.shiftArrowText, { color: theme.textSecondary }]}>↕</Text>
          <View style={styles.shiftRow}>
            <Text style={[styles.shiftLabel, { color: theme.textSecondary }]}>
              {isSwap ? '交換先' : '移動先'}
            </Text>
            <Text style={[styles.shiftValue, { color: theme.text }]}>
              {item.destination_member_name}さん
              {isSwap
                ? `・${item.destination_time_slot}・${item.destination_area_name}`
                : '（シフトなし）'}
            </Text>
          </View>
        </View>

        {/* 申請者メモ（あれば表示） */}
        {item.requester_note ? (
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            📝 申請メモ: {item.requester_note}
          </Text>
        ) : null}

        {/* 対応コメント（承認・却下済みの場合に表示） */}
        {item.responder_note && item.status !== 'pending' ? (
          <View
            style={[
              styles.responderNote,
              {
                backgroundColor: item.status === 'completed' ? '#E8F5E9' : '#FFEBEE',
                borderColor: item.status === 'completed' ? '#4CAF50' : '#F44336',
              },
            ]}
          >
            <Text
              style={[
                styles.responderNoteText,
                { color: item.status === 'completed' ? '#2E7D32' : '#C62828' },
              ]}
            >
              {item.status === 'completed' ? '対応内容' : '却下理由'}: {item.responder_note}
            </Text>
          </View>
        ) : null}

        {/* 申請日時 */}
        <Text style={[styles.createdAt, { color: theme.textSecondary }]}>
          申請日時: {formatDateTime(item.created_at)}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* フィルタータブ + 更新ボタン */}
      <View
        style={[
          styles.filterRow,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.filterButton,
              filter === opt.key && [
                styles.filterButtonActive,
                { borderBottomColor: theme.primary },
              ],
            ]}
            onPress={() => setFilter(opt.key)}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: filter === opt.key ? theme.primary : theme.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ローディング */}
      {isLoading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>読み込み中...</Text>
        </View>
      )}

      {/* エラー */}
      {!isLoading && errorMessage !== '' && (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={loadRequests}
          >
            <Text style={styles.retryButtonText}>再試行</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 空状態 */}
      {!isLoading && errorMessage === '' && filteredRequests.length === 0 && (
        <View style={styles.centerContainer}>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            {filter === 'all'
              ? '申請履歴がありません'
              : 'この条件に一致する申請はありません'}
          </Text>
        </View>
      )}

      {/* 申請一覧 */}
      {!isLoading && errorMessage === '' && filteredRequests.length > 0 && (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterButtonActive: {
    borderBottomWidth: 2,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  centerContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  centerText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  changeTypeBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  organizationDate: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  shiftDetail: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  shiftLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 44,
    paddingTop: 1,
  },
  shiftValue: {
    fontSize: 13,
    flex: 1,
  },
  shiftArrowText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 2,
  },
  noteText: {
    fontSize: 13,
    marginBottom: 4,
  },
  responderNote: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  responderNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  createdAt: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
});

export default ShiftChangeHistoryScreen;
