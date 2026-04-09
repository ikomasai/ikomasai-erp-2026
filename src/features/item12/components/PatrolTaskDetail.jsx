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
  useWindowDimensions,
  View,
} from 'react-native';
import {
  getEvaluationPatrolTaskItemName,
  getEvaluationPatrolTaskItemNames,
  getPatrolTaskDisplayType,
  PATROL_RESULT_CODES,
  PATROL_TASK_DISPLAY_TYPES,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';

/** 表示専用の評価タスクラベル */
const EVALUATION_TASK_LABEL = '企画評価';

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

/** 開始/終了確認タスクで指示メモに追記する確認ポイント */
const TASK_INSTRUCTION_MEMO_LINES = {
  [PATROL_TASK_TYPES.CONFIRM_START]: [
    '体調不良がないか見ましょう',
    '準備ができているか見ましょう',
    '困りごとがあるか見ましょう',
  ],
  [PATROL_TASK_TYPES.CONFIRM_END]: [
    '体調不良がないか見ましょう',
    '片付けができているか見ましょう',
    '困りごとがあるか見ましょう',
  ],
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
 * @param {boolean} props.canAccept - 受諾可能フラグ（向かいますボタン押下可否）
 * @param {boolean} props.hasAnyActiveTask - 自分が対応中の別タスクが存在するかどうか
 * @param {boolean} props.canComplete - 完了可能フラグ
 * @param {Function} props.onAcceptTask - 向かいますボタン押下コールバック
 * @param {Function} props.onRejectTask - 拒否ボタン押下コールバック（割当を外して未割当に戻す）
 * @param {Function} props.onCompleteTask - 完了ボタン押下コールバック
 * @param {Function} props.onSendMemoOnly - メモのみ共有ボタン押下コールバック
 * @param {Array} props.taskResults - タスク結果履歴配列
 * @param {boolean} props.isLoadingTaskResults - 結果読み込み中フラグ
 * @param {Function} props.onRefreshTaskResults - 結果履歴更新コールバック
 * @param {Array} props.sourceMessages - 元連絡案件メッセージ配列
 * @param {boolean} props.isLoadingSourceMessages - メッセージ読み込み中フラグ
 * @param {Function} props.onRefreshSourceMessages - メッセージ更新コールバック
 * @param {Object} [props.evaluationInputs] - 評価項目ごとの入力状態
 * @param {Function} [props.onChangeEvaluationScore] - 評価点数変更コールバック
 * @param {Function} [props.onChangeEvaluationComment] - 評価コメント変更コールバック
 * @param {string} [props.evaluationSummaryMemo] - 総評メモ
 * @param {Function} [props.onChangeEvaluationSummaryMemo] - 総評メモ変更コールバック
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
  hasAnyActiveTask,
  canComplete,
  onAcceptTask,
  onRejectTask,
  onCompleteTask,
  onSendMemoOnly,
  taskResults,
  isLoadingTaskResults,
  onRefreshTaskResults,
  sourceMessages,
  isLoadingSourceMessages,
  onRefreshSourceMessages,
  evaluationInputs = {},
  onChangeEvaluationScore = () => {},
  onChangeEvaluationComment = () => {},
  evaluationSummaryMemo = '',
  onChangeEvaluationSummaryMemo = () => {},
}) => {
  /** 画面幅（レスポンシブ対応用） */
  const { width: windowWidth } = useWindowDimensions();
  /** スマホ幅かどうか（768px 未満） */
  const isMobile = windowWidth < 768;
  /** 場所表示 */
  const locationLabel = selectedTask.event_location || selectedTask.location_text || '場所未設定';
  /** 自分がこのタスクの担当者かどうか */
  const isAssignedToMe = selectedTask.assigned_to && selectedTask.assigned_to === user?.id;
  const evaluationItemName = getEvaluationPatrolTaskItemName(selectedTask);
  const isEvaluationTask = getPatrolTaskDisplayType(selectedTask) === PATROL_TASK_DISPLAY_TYPES.EVALUATION;
  const evaluationItems = isEvaluationTask ? getEvaluationPatrolTaskItemNames(selectedTask) : [];
  const taskTypeLabel = isEvaluationTask ? EVALUATION_TASK_LABEL : TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type;
  const normalizedTaskNote = (selectedTask.notes || '').trim();
  const instructionMemoLines = TASK_INSTRUCTION_MEMO_LINES[selectedTask.task_type] || [];

  return (
    <View style={[styles.card, isMobile && styles.cardMobile, { backgroundColor: theme.surface }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>タスク詳細</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: `${theme.primary}15` },
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
          { borderLeftColor: theme.primary, backgroundColor: `${theme.primary}08` },
        ]}
      >
        <View style={styles.focusBadgeRow}>
          <View
            style={[
              styles.focusBadge,
              { backgroundColor: `${theme.primary}15` },
            ]}
          >
            <Text style={[styles.focusBadgeText, { color: theme.primary }]}>
              {taskTypeLabel}
            </Text>
          </View>
          {selectedTask.source_ticket_id ? (
            <View
              style={[
                styles.focusBadge,
                { backgroundColor: theme.border },
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
      </View>

      {selectedTask.source_ticket?.description ? (
        <View
          style={[
            styles.sourceTicketDescriptionBox,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.label, { color: theme.text, marginTop: 0 }]}>依頼内容</Text>
          <Text style={[styles.sourceTicketDescriptionText, { color: theme.text }]}>
            {selectedTask.source_ticket.description}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.actionPanel,
          { backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>次の操作</Text>
        {/* 向かいます不可バナー: 別タスク対応中で未割当タスクを受諾できない場合に表示 */}
        {!isAssignedToMe && hasAnyActiveTask && selectedTask.task_status === PATROL_TASK_STATUSES.OPEN && (
          <View style={styles.cannotAcceptBanner}>
            <Text style={styles.cannotAcceptBannerText}>
              現在別のタスクを対応中のため受諾できません
            </Text>
          </View>
        )}
        <View style={[styles.actionRow, isMobile && styles.actionRowMobile]}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              isMobile && styles.actionButtonMobile,
              { backgroundColor: canAccept ? theme.primary : theme.border },
            ]}
            disabled={!canAccept || isSubmitting}
            onPress={onAcceptTask}
          >
            <Text style={[styles.actionButtonText, isMobile && styles.actionButtonTextMobile]}>向かいます</Text>
          </TouchableOpacity>
          {/* 拒否ボタン: 自分に割り当てられたタスクのみ表示 */}
          {isAssignedToMe ? (
            <TouchableOpacity
              style={[styles.actionButton, isMobile && styles.actionButtonMobile, { backgroundColor: '#E53E3E' }]}
              disabled={isSubmitting}
              onPress={onRejectTask}
            >
              <Text style={[styles.actionButtonText, isMobile && styles.actionButtonTextMobile]}>拒否</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.actionButton,
              isMobile && styles.actionButtonMobile,
              { backgroundColor: canComplete ? (theme.success || '#22A06B') : theme.border },
            ]}
            disabled={!canComplete || isSubmitting}
            onPress={onCompleteTask}
          >
            <Text style={[styles.actionButtonText, isMobile && styles.actionButtonTextMobile]}>
              {isEvaluationTask ? '評価登録' : '完了登録'}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[
            styles.memoButton,
            {
              backgroundColor: selectedTask.source_ticket_id ? `${theme.primary}15` : theme.border,
            },
          ]}
          onPress={onSendMemoOnly}
          disabled={!selectedTask.source_ticket_id || isSubmitting}
        >
          <Text style={[styles.memoButtonText, { color: selectedTask.source_ticket_id ? theme.primary : theme.textSecondary }]}>メモのみ共有</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.requestCard,
          { backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>
          {isEvaluationTask ? '評価項目' : '指示メモ'}
        </Text>
        {/* 施錠確認タスクの場合は鍵名を目立つように強調表示する */}
        {isEvaluationTask && evaluationItemName ? (
          <View>
            <View style={styles.evaluationItemChipList}>
              {evaluationItems.map((item) => (
                <View
                  key={item}
                  style={[styles.evaluationItemChip, { backgroundColor: `${theme.primary}12` }]}
                >
                  <Text style={[styles.evaluationItemChipText, { color: theme.text }]}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : selectedTask.task_type === PATROL_TASK_TYPES.LOCK_CHECK && selectedTask.notes ? (
          (() => {
            /** notes が "鍵返却後の施錠確認: [鍵ラベル]" 形式かチェック */
            const colonIndex = selectedTask.notes.indexOf(':');
            const hasKeyLabel = colonIndex !== -1;
            /** コロン前のプレフィックス（"鍵返却後の施錠確認" など） */
            const prefix = hasKeyLabel ? selectedTask.notes.substring(0, colonIndex).trim() : null;
            /** コロン後の鍵名部分 */
            const keyLabel = hasKeyLabel
              ? selectedTask.notes.substring(colonIndex + 1).trim()
              : selectedTask.notes;
            return (
              <View>
                {prefix ? (
                  <Text style={[styles.requestBody, { color: theme.textSecondary }]}>
                    {prefix}:
                  </Text>
                ) : null}
                <Text style={[styles.keyLabelHighlight, { color: theme.text }]}>
                  🔑 {keyLabel}
                </Text>
              </View>
            );
          })()
        ) : (
          <View style={styles.requestContent}>
            {normalizedTaskNote ? (
              <Text style={[styles.requestBody, { color: theme.text }]}>
                {normalizedTaskNote}
              </Text>
            ) : null}
            {instructionMemoLines.length > 0 ? (
              <View
                style={[
                  styles.instructionMemoCard,
                  { backgroundColor: `${theme.primary}10` },
                ]}
              >
                <Text style={[styles.instructionMemoTitle, { color: theme.text }]}>
                  確認ポイント
                </Text>
                {instructionMemoLines.map((line) => (
                  <View key={line} style={styles.instructionMemoRow}>
                    <Text style={[styles.instructionMemoBullet, { color: theme.primary }]}>
                      ・
                    </Text>
                    <Text style={[styles.instructionMemoText, { color: theme.text }]}>
                      {line}
                    </Text>
                  </View>
                ))}
                <Text style={[styles.instructionMemoFooter, { color: theme.textSecondary }]}>
                  何かあれば本部に連絡してください。
                </Text>
              </View>
            ) : null}
            {!normalizedTaskNote && instructionMemoLines.length === 0 ? (
              <Text style={[styles.requestBody, { color: theme.text }]}>
                指示メモはありません
              </Text>
            ) : null}
          </View>
        )}
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
                  backgroundColor: isActive ? theme.primary : theme.background,
                },
              ]}
              onPress={() => onChangeResultCode(option.key)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  { color: isActive ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isEvaluationTask ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>評価入力</Text>
          {evaluationItems.map((item) => {
            const scoreValue = Number(evaluationInputs[item]?.score || 0);
            const itemComment = evaluationInputs[item]?.comment || '';

            return (
              <View
                key={item}
                style={[
                  styles.evaluationInputCard,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
              >
                <Text style={[styles.evaluationInputTitle, { color: theme.text }]}>{item}</Text>
                <View style={styles.evaluationScoreRow}>
                  {[1, 2, 3, 4, 5].map((score) => {
                    const isActive = score === scoreValue;

                    return (
                      <Pressable
                        key={`${item}-${score}`}
                        style={[
                          styles.evaluationScoreButton,
                          {
                            borderColor: isActive ? theme.primary : theme.border,
                            backgroundColor: isActive ? theme.primary : theme.surface,
                          },
                        ]}
                        onPress={() => onChangeEvaluationScore(item, score)}
                      >
                        <Text
                          style={[
                            styles.evaluationScoreButtonText,
                            { color: isActive ? '#FFFFFF' : theme.text },
                          ]}
                        >
                          {score}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={itemComment}
                  onChangeText={(value) => onChangeEvaluationComment(item, value)}
                  multiline
                  placeholder="項目ごとのコメントを入力"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.evaluationCommentInput,
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

          <Text style={[styles.label, { color: theme.text }]}>総評メモ</Text>
          <TextInput
            value={evaluationSummaryMemo}
            onChangeText={onChangeEvaluationSummaryMemo}
            multiline
            placeholder="全体の印象や気づきを入力してください"
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
        </>
      ) : (
        <>
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
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.label, { color: theme.text }]}>タスク結果履歴</Text>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
          onPress={onRefreshTaskResults}
        >
          <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
              style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
              onPress={onRefreshSourceMessages}
            >
              <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
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
  /** スマホ向けカード: 余白を詰める */
  cardMobile: {
    padding: 12,
    borderRadius: 14,
    gap: 10,
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
  /** ステータスバッジ: pill型 */
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  /** タスク情報フォーカスカード: 左アクセントボーダー + shadow */
  focusCard: {
    borderLeftWidth: 4,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  focusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  /** 種別バッジ: pill型 / borderWidth削除 */
  focusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  focusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sourceTicketDescriptionBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: -2,
    marginBottom: 2,
    gap: 6,
  },
  sourceTicketDescriptionText: {
    fontSize: 13,
    lineHeight: 20,
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
  /** アクションパネル: borderWidth削除 + shadow */
  actionPanel: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** 指示メモカード: borderWidth削除 + shadow */
  requestCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  requestBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  requestContent: {
    gap: 10,
  },
  instructionMemoCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  instructionMemoTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  instructionMemoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  instructionMemoBullet: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  instructionMemoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  instructionMemoFooter: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
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
  /** 結果選択ボタン: pill型 / アクティブ時fill */
  optionButton: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionButtonText: {
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
  /** メモ入力: borderRadius 14→12 */
  memoInput: {
    borderWidth: 1,
    borderRadius: 12,
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
  /** スマホ向けボタン行: 折り返し可能にして各ボタンを大きく */
  actionRowMobile: {
    flexWrap: 'wrap',
    gap: 10,
  },
  /** アクションボタン: pill型 (borderRadius 14→24) */
  actionButton: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  /** スマホ向けボタン: 最小幅を設定して折り返し時も押しやすく */
  actionButtonMobile: {
    minWidth: '45%',
    paddingVertical: 16,
    borderRadius: 24,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  /** スマホ向けボタンテキスト: 少し大きく */
  actionButtonTextMobile: {
    fontSize: 16,
  },
  /** メモのみ共有ボタン: pill型 */
  memoButton: {
    borderRadius: 24,
    paddingVertical: 11,
    alignItems: 'center',
    overflow: 'hidden',
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
    borderRadius: 12,
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
  /** 自分に割り当てられたタスクであることを知らせるバナー（青系） */
  assignedToMeBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1565C0',
    alignItems: 'center',
    marginBottom: 8,
  },
  assignedToMeBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  /** 別タスク対応中で受諾不可バナー */
  cannotAcceptBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FF4D4F',
    alignItems: 'center',
  },
  cannotAcceptBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  /** 施錠確認タスクの鍵名強調表示 */
  keyLabelHighlight: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    lineHeight: 26,
  },
  evaluationItemChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  evaluationItemChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  evaluationItemChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  evaluationInputCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  evaluationInputTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  evaluationScoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  evaluationScoreButton: {
    minWidth: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  evaluationScoreButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  evaluationCommentInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
});

export default PatrolTaskDetail;
