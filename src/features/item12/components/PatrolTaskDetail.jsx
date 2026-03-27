/**
 * タスク詳細・操作コンポーネント
 * 向かいます/完了ボタン、結果選択、メモ、結果履歴、元連絡案件メッセージを表示する
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  PATROL_RESULT_CODES,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';

/** タスク種別表示名 */
const TASK_TYPE_LABELS = {
  [PATROL_TASK_TYPES.CONFIRM_START]: '企画開始確認',
  [PATROL_TASK_TYPES.CONFIRM_END]: '企画終了確認',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '施錠確認',
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '緊急対応',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '定常巡回',
  [PATROL_TASK_TYPES.OTHER]: 'その他',
};

/** タスク状態表示名 */
const TASK_STATUS_LABELS = {
  [PATROL_TASK_STATUSES.OPEN]: '未対応',
  [PATROL_TASK_STATUSES.ACCEPTED]: '受諾',
  [PATROL_TASK_STATUSES.EN_ROUTE]: '移動中',
  [PATROL_TASK_STATUSES.DONE]: '完了',
  [PATROL_TASK_STATUSES.CANCELED]: '取消',
};

/** 結果コードごとの表示名 */
const RESULT_LABELS = {
  [PATROL_RESULT_CODES.OK]: '問題なし',
  [PATROL_RESULT_CODES.NOT_STARTED]: '開始していない',
  [PATROL_RESULT_CODES.NOT_ENDED]: '終了していない',
  [PATROL_RESULT_CODES.NEED_SUPPORT]: '別対応必要',
  [PATROL_RESULT_CODES.LOCKED]: '施錠済',
  [PATROL_RESULT_CODES.UNLOCKED]: '未施錠',
  [PATROL_RESULT_CODES.CANNOT_CONFIRM]: '確認不可',
};

/**
 * タスク詳細・操作コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Object|null} props.user - ログインユーザー情報
 * @param {Object} props.selectedTask - 選択中タスク
 * @param {Array} props.resultOptions - 完了結果候補配列
 * @param {string} props.resultCode - 選択中結果コード
 * @param {Function} props.onChangeResultCode - 結果コード変更コールバック
 * @param {string} props.patrolMemo - 巡回メモ文字列
 * @param {Function} props.onChangePatrolMemo - メモ変更コールバック
 * @param {boolean} props.isSubmitting - 送信中フラグ
 * @param {boolean} props.canAccept - 受諾可能フラグ
 * @param {boolean} props.canComplete - 完了可能フラグ
 * @param {Function} props.onAcceptTask - 向かいますボタン押下コールバック
 * @param {Function} props.onCompleteTask - 完了ボタン押下コールバック
 * @param {Function} props.onSendMemoOnly - メモのみ共有ボタン押下コールバック
 * @param {Array} props.taskResults - タスク結果履歴配列
 * @param {boolean} props.isLoadingTaskResults - 結果読み込み中フラグ
 * @param {Function} props.onRefreshTaskResults - 結果履歴更新コールバック
 * @param {Array} props.sourceMessages - 元連絡案件メッセージ配列
 * @param {boolean} props.isLoadingSourceMessages - メッセージ読み込み中フラグ
 * @param {Function} props.onRefreshSourceMessages - メッセージ更新コールバック
 * @returns {JSX.Element} タスク詳細UI
 */
const PatrolTaskDetail = ({
  theme,
  user,
  selectedTask,
  resultOptions,
  resultCode,
  onChangeResultCode,
  patrolMemo,
  onChangePatrolMemo,
  isSubmitting,
  canAccept,
  canComplete,
  onAcceptTask,
  onCompleteTask,
  onSendMemoOnly,
  taskResults,
  isLoadingTaskResults,
  onRefreshTaskResults,
  sourceMessages,
  isLoadingSourceMessages,
  onRefreshSourceMessages,
}) => {
  /** 場所表示 */
  const locationLabel = selectedTask.event_location || selectedTask.location_text || '場所未設定';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>タスク詳細</Text>
          <Text style={[styles.sectionSubTitle, { color: theme.textSecondary }]}>
            状況確認から対応登録まで、このカード内で完結できます。
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { borderColor: theme.border, backgroundColor: `${theme.primary}12` },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: theme.primary }]}>
            {TASK_STATUS_LABELS[selectedTask.task_status] || selectedTask.task_status}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.focusCard,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <View style={styles.focusBadgeRow}>
          <View
            style={[
              styles.focusBadge,
              { borderColor: theme.border, backgroundColor: `${theme.primary}12` },
            ]}
          >
            <Text style={[styles.focusBadgeText, { color: theme.primary }]}>
              {TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type}
            </Text>
          </View>
          {selectedTask.source_ticket_id ? (
            <View
              style={[
                styles.focusBadge,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text style={[styles.focusBadgeText, { color: theme.textSecondary }]}>
                元連絡案件あり
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.ticketDetailTitle, { color: theme.text }]}>
          {selectedTask.event_name || '企画名未設定'}
        </Text>
        <Text style={[styles.focusLocation, { color: theme.text }]}>📍 {locationLabel}</Text>
        <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
          タスク番号: {selectedTask.task_no || '-'}
        </Text>
        <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
          元連絡案件: {selectedTask.source_ticket_id || 'なし'} / 元鍵貸出: {selectedTask.source_key_loan_id || 'なし'}
        </Text>
      </View>

      <View
        style={[
          styles.actionPanel,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>次の操作</Text>
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
          現地へ向かうときは先に受諾し、対応後は結果とメモを添えて完了登録してください。
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: canAccept ? theme.primary : theme.border },
            ]}
            disabled={!canAccept || isSubmitting}
            onPress={onAcceptTask}
          >
            <Text style={styles.actionButtonText}>向かいます</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: canComplete ? (theme.success || '#22A06B') : theme.border },
            ]}
            disabled={!canComplete || isSubmitting}
            onPress={onCompleteTask}
          >
            <Text style={styles.actionButtonText}>完了登録</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[
            styles.memoButton,
            {
              borderColor: theme.border,
              backgroundColor: selectedTask.source_ticket_id ? theme.surface : theme.border,
            },
          ]}
          onPress={onSendMemoOnly}
          disabled={!selectedTask.source_ticket_id || isSubmitting}
        >
          <Text style={[styles.memoButtonText, { color: theme.textSecondary }]}>メモのみ共有</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.requestCard,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>指示メモ</Text>
        <Text style={[styles.requestBody, { color: theme.text }]}>
          {selectedTask.notes || '指示メモはありません'}
        </Text>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>完了結果</Text>
      <View style={styles.optionGroup}>
        {resultOptions.map((option) => {
          /** 選択中かどうか */
          const isActive = option.key === resultCode;
          return (
            <Pressable
              key={option.key}
              style={[
                styles.optionButton,
                {
                  borderColor: isActive ? theme.primary : theme.border,
                  backgroundColor: isActive ? `${theme.primary}1A` : theme.background,
                },
              ]}
              onPress={() => onChangeResultCode(option.key)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: isActive ? theme.primary : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>巡回メモ</Text>
      <TextInput
        value={patrolMemo}
        onChangeText={onChangePatrolMemo}
        multiline
        placeholder="現地状況・対応内容を入力してください"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.memoInput,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
            color: theme.text,
          },
        ]}
      />

      <View style={styles.sectionHeader}>
        <Text style={[styles.label, { color: theme.text }]}>タスク結果履歴</Text>
        <TouchableOpacity
          style={[styles.refreshButton, { borderColor: theme.border }]}
          onPress={onRefreshTaskResults}
        >
          <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
        </TouchableOpacity>
      </View>

      {isLoadingTaskResults ? (
        <SkeletonLoader lines={3} baseColor={theme.border} />
      ) : taskResults.length === 0 ? (
        <EmptyState
          icon="📝"
          title="結果履歴はまだありません"
          description="タスク完了後に結果が表示されます"
          theme={theme}
        />
      ) : (
        <View style={styles.messageList}>
          {taskResults.map((result) => (
            <View
              key={result.id}
              style={[
                styles.messageItem,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}>
                {RESULT_LABELS[result.result_code] || result.result_code}
              </Text>
              <Text style={[styles.messageBody, { color: theme.text }]}>
                {result.memo || 'メモなし'}
              </Text>
              <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                {new Date(result.created_at).toLocaleString('ja-JP')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {selectedTask.source_ticket_id ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.label, { color: theme.text }]}>元連絡案件メッセージ</Text>
            <TouchableOpacity
              style={[styles.refreshButton, { borderColor: theme.border }]}
              onPress={onRefreshSourceMessages}
            >
              <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
            </TouchableOpacity>
          </View>

          {isLoadingSourceMessages ? (
            <SkeletonLoader lines={3} baseColor={theme.border} />
          ) : sourceMessages.length === 0 ? (
            <EmptyState
              icon="📝"
              title="メッセージはまだありません"
              description="元連絡案件のメッセージが表示されます"
              theme={theme}
            />
          ) : (
            <View style={styles.messageList}>
              {sourceMessages.map((message) => {
                /** 自分のメッセージかどうか */
                const isMine = message.author_id === user?.id;

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageItem,
                      {
                        borderColor: isMine ? theme.primary : theme.border,
                        backgroundColor: isMine ? `${theme.primary}12` : theme.background,
                      },
                    ]}
                  >
                    <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}>
                      {isMine ? '巡回担当（あなた）' : '他担当/企画者'}
                    </Text>
                    <Text style={[styles.messageBody, { color: theme.text }]}>{message.body}</Text>
                    <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                      {new Date(message.created_at).toLocaleString('ja-JP')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTitleBlock: {
    flex: 1,
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubTitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  focusCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  focusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  focusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  focusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ticketDetailTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  focusLocation: {
    fontSize: 14,
    fontWeight: '700',
  },
  ticketMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  actionPanel: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  requestCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  requestBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
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
  memoInput: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 112,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  memoButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  memoButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageList: {
    gap: 8,
    marginBottom: 12,
  },
  messageItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageAuthor: {
    fontSize: 11,
    marginBottom: 2,
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageDate: {
    fontSize: 11,
    marginTop: 4,
  },
});

export default PatrolTaskDetail;
