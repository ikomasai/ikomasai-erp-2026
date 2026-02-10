/**
 * Item12 screen (Patrol).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  ITEM12_CHECK_CATEGORY_OPTIONS,
  ITEM12_EVALUATION_STATUS_OPTIONS,
  ITEM12_RESULT_CODE_OPTIONS,
  ITEM12_SCORE_OPTIONS,
  ITEM12_SECTION_OPTIONS,
  ITEM12_TASK_STATUS_LABELS,
  ITEM12_TASK_TYPE_LABELS,
} from '../constants';
import {
  acceptPatrolTask,
  completePatrolTask,
  createEvaluationCheck,
  createPatrolCheck,
  selectPatrolTasksForUser,
  selectUnvisitedAlerts,
} from '../services/item12Service';

const SCREEN_NAME = '巡回';

/**
 * Selectable chip row.
 */
const OptionChips = ({ options, selectedValue, onSelect, theme }) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <View style={styles.chipsWrap}>
      {options.map((option) => {
        const value = option.value;
        const isSelected = selectedValue === value;

        return (
          <TouchableOpacity
            key={`${value}`}
            style={[
              styles.chip,
              {
                borderColor: isSelected ? theme.primary : theme.border,
                backgroundColor: isSelected ? theme.primary : theme.surface,
              },
            ]}
            onPress={() => onSelect(value)}
          >
            <Text style={{ color: isSelected ? '#FFFFFF' : theme.text, fontSize: 12 }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/**
 * Patrol screen.
 */
const Item12Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();

  const [activeSection, setActiveSection] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [taskResultForm, setTaskResultForm] = useState({
    resultCode: 'OK',
    memo: '',
    photoBucket: '',
    photoPath: '',
  });

  const [checkForm, setCheckForm] = useState({
    checkCategory: 'trouble',
    locationId: '',
    memo: '',
    photoBucket: '',
    photoPath: '',
  });

  const [evaluationForm, setEvaluationForm] = useState({
    evaluationStatus: 'pending',
    taskId: '',
    ticketId: '',
    eventId: '',
    score: 3,
    comment: '',
  });

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) || null;
  }, [selectedTaskId, tasks]);

  /**
   * Format datetime.
   */
  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  };

  /**
   * Load task list and unvisited alert.
   */
  const loadTasksAndAlerts = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      setErrorMessage('ログイン情報がありません。');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [taskResult, alertResult] = await Promise.all([
        selectPatrolTasksForUser(user.id),
        selectUnvisitedAlerts(user.id),
      ]);

      if (taskResult.error) {
        setErrorMessage('巡回タスクの取得に失敗しました。');
        setTasks([]);
      } else {
        setTasks(taskResult.tasks || []);
      }

      if (alertResult.error) {
        setAlerts([]);
      } else {
        setAlerts(alertResult.alerts || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  /**
   * Initial load.
   */
  useEffect(() => {
    loadTasksAndAlerts();
  }, [loadTasksAndAlerts]);

  /**
   * Keep selected task synced.
   */
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    const exists = tasks.some((task) => task.id === selectedTaskId);
    if (!exists) {
      setSelectedTaskId(tasks[0].id);
      setEvaluationForm((previous) => ({ ...previous, taskId: tasks[0].id }));
    }
  }, [selectedTaskId, tasks]);

  /**
   * Accept task (open -> accepted).
   */
  const handleAcceptTask = async (taskId) => {
    if (!taskId || !user?.id) {
      return;
    }

    setIsBusy(true);
    try {
      const { result, error } = await acceptPatrolTask(taskId, user.id);

      if (error) {
        Alert.alert('受諾失敗', error.message || 'タスクを受諾できませんでした。');
        return;
      }

      Alert.alert('受諾完了', `タスク ${result?.task_no || ''} を受諾しました。`);
      await loadTasksAndAlerts();
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Complete selected task with result payload.
   */
  const handleCompleteTask = async () => {
    if (!selectedTaskId || !user?.id) {
      return;
    }

    setIsBusy(true);
    try {
      const { result, error } = await completePatrolTask(selectedTaskId, {
        resultCode: taskResultForm.resultCode,
        memo: taskResultForm.memo,
        photoBucket: taskResultForm.photoBucket,
        photoPath: taskResultForm.photoPath,
        createdBy: user.id,
      });

      if (error) {
        Alert.alert('完了失敗', error.message || 'タスクを完了できませんでした。');
        return;
      }

      Alert.alert(
        '完了',
        `タスク ${result?.task_no || ''} を完了しました。\n結果: ${result?.result_code || taskResultForm.resultCode}`
      );
      setTaskResultForm((previous) => ({
        ...previous,
        memo: '',
        photoBucket: '',
        photoPath: '',
      }));
      await loadTasksAndAlerts();
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Submit patrol check input.
   */
  const handleSubmitPatrolCheck = async () => {
    if (!user?.id) {
      return;
    }

    setIsBusy(true);
    try {
      const { check, error } = await createPatrolCheck({
        checkedBy: user.id,
        checkCategory: checkForm.checkCategory,
        locationId: checkForm.locationId,
        memo: checkForm.memo,
        photoBucket: checkForm.photoBucket,
        photoPath: checkForm.photoPath,
      });

      if (error) {
        Alert.alert('送信失敗', error.message || '巡回チェックを送信できませんでした。');
        return;
      }

      Alert.alert('送信完了', `巡回チェック ${check?.id || ''} を登録しました。`);
      setCheckForm((previous) => ({
        ...previous,
        locationId: '',
        memo: '',
        photoBucket: '',
        photoPath: '',
      }));
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Submit evaluation input.
   */
  const handleSubmitEvaluation = async () => {
    if (!user?.id) {
      return;
    }

    setIsBusy(true);
    try {
      const { evaluation, error } = await createEvaluationCheck({
        evaluatorId: user.id,
        evaluationStatus: evaluationForm.evaluationStatus,
        taskId: evaluationForm.taskId,
        ticketId: evaluationForm.ticketId,
        eventId: evaluationForm.eventId,
        score: evaluationForm.score,
        comment: evaluationForm.comment,
      });

      if (error) {
        Alert.alert('送信失敗', error.message || '評価入力を送信できませんでした。');
        return;
      }

      Alert.alert('送信完了', `評価 ${evaluation?.id || ''} を登録しました。`);
      setEvaluationForm((previous) => ({
        ...previous,
        comment: '',
      }));
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Render task block.
   */
  const renderTaskSection = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>タスク一覧</Text>
        <TouchableOpacity
          style={[styles.buttonMini, { backgroundColor: theme.primary }]}
          onPress={loadTasksAndAlerts}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>再取得</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>未巡回アラート</Text>
        {alerts.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>アラートはありません。</Text>
        ) : (
          alerts.map((task) => (
            <View key={task.id} style={[styles.alertItem, { borderColor: theme.error }]}>
              <Text style={[styles.alertTextStrong, { color: theme.error }]}>{task.task_no}</Text>
              <Text style={[styles.alertText, { color: theme.textSecondary }]}>
                {ITEM12_TASK_TYPE_LABELS[task.task_type] || task.task_type}
                {' / 経過 '}
                {task.overdue_minutes}
                {' 分'}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>未割当 + 自分担当タスク</Text>
        {tasks.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象タスクはありません。</Text>
        ) : (
          tasks.map((task) => {
            const isSelected = selectedTaskId === task.id;
            const canAccept = task.task_status === 'open';
            const statusLabel = ITEM12_TASK_STATUS_LABELS[task.task_status] || task.task_status;
            const typeLabel = ITEM12_TASK_TYPE_LABELS[task.task_type] || task.task_type;

            return (
              <TouchableOpacity
                key={task.id}
                style={[
                  styles.taskCard,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                onPress={() => {
                  setSelectedTaskId(task.id);
                  setEvaluationForm((previous) => ({ ...previous, taskId: task.id }));
                }}
              >
                <View style={styles.taskTopRow}>
                  <Text style={[styles.taskNoText, { color: theme.primary }]}>{task.task_no}</Text>
                  <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{statusLabel}</Text>
                </View>
                <Text style={[styles.taskTypeText, { color: theme.text }]}>{typeLabel}</Text>
                <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>
                  期限: {formatDateTime(task.due_at)}
                </Text>
                <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>
                  作成: {formatDateTime(task.created_at)}
                </Text>

                {canAccept ? (
                  <TouchableOpacity
                    style={[styles.buttonMini, { backgroundColor: theme.primary, marginTop: 8 }]}
                    onPress={() => handleAcceptTask(task.id)}
                    disabled={isBusy}
                  >
                    <Text style={styles.buttonText}>向かいます</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {selectedTask ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>タスク完了</Text>
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            {selectedTask.task_no} / {ITEM12_TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>結果コード</Text>
          <OptionChips
            options={ITEM12_RESULT_CODE_OPTIONS}
            selectedValue={taskResultForm.resultCode}
            onSelect={(resultCode) => setTaskResultForm((previous) => ({ ...previous, resultCode }))}
            theme={theme}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>メモ</Text>
          <TextInput
            style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
            value={taskResultForm.memo}
            onChangeText={(memo) => setTaskResultForm((previous) => ({ ...previous, memo }))}
            placeholder="結果メモ"
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>写真バケット（任意）</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            value={taskResultForm.photoBucket}
            onChangeText={(photoBucket) =>
              setTaskResultForm((previous) => ({ ...previous, photoBucket }))
            }
            placeholder="バケット名"
            placeholderTextColor={theme.textSecondary}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>写真パス（任意）</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            value={taskResultForm.photoPath}
            onChangeText={(photoPath) => setTaskResultForm((previous) => ({ ...previous, photoPath }))}
            placeholder="storage/path.jpg"
            placeholderTextColor={theme.textSecondary}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleCompleteTask}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>完了を登録</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  /**
   * Render patrol check input.
   */
  const renderPatrolCheckSection = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>巡回チェック入力</Text>

        <Text style={[styles.fieldLabel, { color: theme.text }]}>区分</Text>
        <OptionChips
          options={ITEM12_CHECK_CATEGORY_OPTIONS}
          selectedValue={checkForm.checkCategory}
          onSelect={(checkCategory) => setCheckForm((previous) => ({ ...previous, checkCategory }))}
          theme={theme}
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>location_id（任意）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={checkForm.locationId}
          onChangeText={(locationId) => setCheckForm((previous) => ({ ...previous, locationId }))}
          placeholder="uuid"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>メモ</Text>
        <TextInput
          style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
          value={checkForm.memo}
          onChangeText={(memo) => setCheckForm((previous) => ({ ...previous, memo }))}
          placeholder="巡回メモ"
          placeholderTextColor={theme.textSecondary}
          multiline
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>写真バケット（任意）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={checkForm.photoBucket}
          onChangeText={(photoBucket) => setCheckForm((previous) => ({ ...previous, photoBucket }))}
            placeholder="バケット名"
            placeholderTextColor={theme.textSecondary}
          />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>写真パス（任意）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={checkForm.photoPath}
          onChangeText={(photoPath) => setCheckForm((previous) => ({ ...previous, photoPath }))}
          placeholder="storage/path.jpg"
          placeholderTextColor={theme.textSecondary}
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={handleSubmitPatrolCheck}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>チェック送信</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /**
   * Render evaluation input.
   */
  const renderEvaluationSection = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>評価入力</Text>

        <Text style={[styles.fieldLabel, { color: theme.text }]}>状態</Text>
        <OptionChips
          options={ITEM12_EVALUATION_STATUS_OPTIONS}
          selectedValue={evaluationForm.evaluationStatus}
          onSelect={(evaluationStatus) =>
            setEvaluationForm((previous) => ({ ...previous, evaluationStatus }))
          }
          theme={theme}
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>task_id（推奨）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={evaluationForm.taskId}
          onChangeText={(taskId) => setEvaluationForm((previous) => ({ ...previous, taskId }))}
          placeholder="タスクID（UUID）"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>ticket_id（任意）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={evaluationForm.ticketId}
          onChangeText={(ticketId) => setEvaluationForm((previous) => ({ ...previous, ticketId }))}
          placeholder="チケットID（UUID）"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>event_id（任意）</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          value={evaluationForm.eventId}
          onChangeText={(eventId) => setEvaluationForm((previous) => ({ ...previous, eventId }))}
          placeholder="イベントID（UUID）"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>評価スコア</Text>
        <OptionChips
          options={ITEM12_SCORE_OPTIONS}
          selectedValue={evaluationForm.score}
          onSelect={(score) => setEvaluationForm((previous) => ({ ...previous, score }))}
          theme={theme}
        />

        <Text style={[styles.fieldLabel, { color: theme.text }]}>コメント（任意）</Text>
        <TextInput
          style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
          value={evaluationForm.comment}
          onChangeText={(comment) => setEvaluationForm((previous) => ({ ...previous, comment }))}
          placeholder="評価コメント"
          placeholderTextColor={theme.textSecondary}
          multiline
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={handleSubmitEvaluation}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>評価を送信</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSection = () => {
    if (activeSection === 'check') {
      return renderPatrolCheckSection();
    }
    if (activeSection === 'evaluation') {
      return renderEvaluationSection();
    }
    return renderTaskSection();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionTabsContent}
        style={[styles.sectionTabs, { borderBottomColor: theme.border }]}
      >
        {ITEM12_SECTION_OPTIONS.map((option) => {
          const isSelected = activeSection === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                {
                  borderColor: isSelected ? theme.primary : theme.border,
                  backgroundColor: isSelected ? theme.primary : theme.surface,
                },
              ]}
              onPress={() => setActiveSection(option.value)}
            >
              <Text style={{ color: isSelected ? '#FFFFFF' : theme.text, fontSize: 12 }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>巡回データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.scopeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.scopeTitle, { color: theme.text }]}>現在の巡回スコープ</Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              ユーザー: {userInfo?.name || user?.email || user?.id || '-'}
            </Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              表示条件: open かつ未割当または自分担当
            </Text>
          </View>

          {errorMessage ? (
            <View style={[styles.panel, { borderColor: theme.error, backgroundColor: theme.surface }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {renderSection()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTabs: { borderBottomWidth: 1 },
  sectionTabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  content: { flex: 1 },
  contentContainer: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    padding: 12,
    gap: 10,
  },
  scopeCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  scopeTitle: { fontSize: 14, fontWeight: '700' },
  scopeText: { fontSize: 12 },
  sectionBlock: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  panel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  taskCard: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 4 },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskNoText: { fontSize: 12, fontWeight: '700' },
  taskTypeText: { fontSize: 14, fontWeight: '600' },
  taskMetaText: { fontSize: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  button: { borderRadius: 8, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  buttonMini: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  helperText: { fontSize: 12 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { fontSize: 13, lineHeight: 20 },
  alertItem: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 2 },
  alertTextStrong: { fontSize: 12, fontWeight: '700' },
  alertText: { fontSize: 12 },
});

export default Item12Screen;
