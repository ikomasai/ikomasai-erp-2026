/**
 * 企画評価入力フォームコンポーネント
 * 点数、コメント入力、評価履歴を表示する
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
import { PATROL_TASK_TYPES } from '../../../services/supabase/patrolTaskService';
import { EVALUATION_STATUSES } from '../../../services/supabase/evaluationService';
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

/** 評価ステータス表示名 */
const EVALUATION_STATUS_LABELS = {
  [EVALUATION_STATUSES.PENDING]: '承認待ち',
  [EVALUATION_STATUSES.APPROVED]: '承認済み',
  [EVALUATION_STATUSES.REJECTED]: '却下',
  [EVALUATION_STATUSES.REWORK]: '差戻し',
};

/**
 * 企画評価入力フォームコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Object|null} props.selectedTask - 選択中タスク（評価対象）
 * @param {number} props.evaluationScore - 評価点数
 * @param {Function} props.onChangeScore - 点数変更コールバック
 * @param {string} props.evaluationComment - 評価コメント
 * @param {Function} props.onChangeComment - コメント変更コールバック
 * @param {boolean} props.isSubmittingEvaluation - 登録中フラグ
 * @param {Function} props.onSubmitEvaluation - 登録ボタン押下コールバック
 * @param {Array} props.myEvaluationChecks - 評価入力履歴配列
 * @param {boolean} props.isLoadingMyEvaluationChecks - 履歴読み込み中フラグ
 * @param {Function} props.onRefresh - 更新ボタン押下コールバック
 * @returns {JSX.Element} 企画評価入力フォームUI
 */
const PatrolEvaluationForm = ({
  theme,
  selectedTask,
  evaluationScore,
  onChangeScore,
  evaluationComment,
  onChangeComment,
  isSubmittingEvaluation,
  onSubmitEvaluation,
  myEvaluationChecks,
  isLoadingMyEvaluationChecks,
  onRefresh,
}) => {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>企画評価入力</Text>
          <Text style={[styles.sectionSubTitle, { color: theme.textSecondary }]}>
            完了済みタスクを選び、現地の質を短く明確に残します。
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { borderColor: theme.border }]}
          onPress={onRefresh}
        >
          <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.targetCard,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.targetLabel, { color: theme.textSecondary }]}>評価対象</Text>
        <Text style={[styles.targetTitle, { color: theme.text }]}>
          {selectedTask ? selectedTask.event_name || '企画名未設定' : '未選択'}
        </Text>
        <Text style={[styles.ticketMeta, { color: theme.textSecondary }]}>
          {selectedTask
            ? `${TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type} / ${
                selectedTask.event_location || selectedTask.location_text || '場所未設定'
              }`
            : 'タスク一覧で完了済みの案件を選択してください'}
        </Text>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>点数</Text>
      <View style={styles.scoreGrid}>
        {[1, 2, 3, 4, 5].map((score) => {
          /** 選択中かどうか */
          const isActive = score === evaluationScore;

          return (
            <Pressable
              key={String(score)}
              style={[
                styles.scoreButton,
                {
                  borderColor: isActive ? theme.primary : theme.border,
                  backgroundColor: isActive ? `${theme.primary}18` : theme.background,
                },
              ]}
              onPress={() => onChangeScore(score)}
            >
              <Text
                style={[
                  styles.scoreValue,
                  { color: isActive ? theme.primary : theme.text },
                ]}
              >
                {score}
              </Text>
              <Text
                style={[
                  styles.scoreLabel,
                  { color: isActive ? theme.primary : theme.textSecondary },
                ]}
              >
                点
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>コメント</Text>
      <TextInput
        value={evaluationComment}
        onChangeText={onChangeComment}
        multiline
        placeholder="評価理由・現地状況を入力してください"
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
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: theme.primary }]}
        onPress={onSubmitEvaluation}
        disabled={isSubmittingEvaluation}
      >
        <Text style={styles.actionButtonText}>
          {isSubmittingEvaluation ? '登録中...' : '評価を承認待ちで登録'}
        </Text>
      </TouchableOpacity>

      <View style={styles.historyHeader}>
        <Text style={[styles.label, { color: theme.text }]}>最近の評価入力</Text>
        <Text style={[styles.historyCount, { color: theme.textSecondary }]}>
          {myEvaluationChecks.length}件
        </Text>
      </View>
      {isLoadingMyEvaluationChecks ? (
        <SkeletonLoader lines={3} baseColor={theme.border} />
      ) : myEvaluationChecks.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="評価入力履歴はまだありません"
          description="評価を登録すると履歴が表示されます"
          theme={theme}
        />
      ) : (
        <View style={styles.messageList}>
          {myEvaluationChecks.map((evaluation) => (
            <View
              key={evaluation.id}
              style={[
                styles.messageItem,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <View style={styles.historyItemHeader}>
                <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}>
                  {EVALUATION_STATUS_LABELS[evaluation.evaluation_status] || evaluation.evaluation_status}
                </Text>
                <View
                  style={[
                    styles.scoreMiniBadge,
                    { borderColor: theme.border, backgroundColor: `${theme.primary}12` },
                  ]}
                >
                  <Text style={[styles.scoreMiniBadgeText, { color: theme.primary }]}>
                    {evaluation.score || '-'}点
                  </Text>
                </View>
              </View>
              <Text style={[styles.messageBody, { color: theme.text }]}>
                {evaluation.comment || 'コメントなし'}
              </Text>
              <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                {new Date(evaluation.created_at).toLocaleString('ja-JP')}
              </Text>
            </View>
          ))}
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
  targetCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  targetTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  ticketMeta: {
    fontSize: 12,
    lineHeight: 18,
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
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreButton: {
    minWidth: '18%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  memoInput: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 110,
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
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  messageAuthor: {
    fontSize: 11,
  },
  scoreMiniBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scoreMiniBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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

export default PatrolEvaluationForm;
