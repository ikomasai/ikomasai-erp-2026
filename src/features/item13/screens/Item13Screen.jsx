/**
 * Item13 screen (HQ).
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
  ITEM13_EVALUATION_DECISION_OPTIONS,
  ITEM13_NOTIFY_TARGET_OPTIONS,
  ITEM13_SECTION_OPTIONS,
  ITEM13_SEVERITY_LABELS,
  ITEM13_TASK_STATUS_OPTIONS,
  ITEM13_TICKET_STATUS_OPTIONS,
} from '../constants';
import {
  appendTicketMessageForHq,
  assignTicketToHqUser,
  decideEvaluationForHq,
  returnKeyAndCreateLockTaskForHq,
  selectActiveKeyLoansForHq,
  selectHqDashboardSummary,
  selectPatrolTaskResultByTaskId,
  selectPatrolTasksByTicketId,
  selectPatrolTasksForHq,
  selectPendingEvaluationsForHq,
  selectRecentRadioLogs,
  selectTicketDetailForHq,
  selectTicketMessagesForHq,
  selectTicketsForHq,
  updatePatrolTaskForHq,
  updateTicketNotifyTarget,
  updateTicketStatusForHq,
} from '../services/item13Service';

const SCREEN_NAME = '本部';

const TICKET_TYPE_LABELS = {
  emergency: '緊急連絡',
  rule_question: 'ルール問い合わせ',
  layout_change: '配置変更',
  distribution_change: '会計連携',
  damage_report: '物品連携',
  key_preapply: '鍵事前申請',
  start_report: '企画開始報告',
  end_report: '企画終了報告',
};

const TASK_TYPE_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'confirm_start', label: '開始確認' },
  { value: 'confirm_end', label: '終了確認' },
  { value: 'lock_check', label: '施錠確認' },
  { value: 'emergency_support', label: '緊急対応' },
  { value: 'routine_patrol', label: '定常巡回' },
  { value: 'other', label: 'その他' },
];

const TASK_TYPE_LABELS = TASK_TYPE_OPTIONS.reduce((map, option) => {
  if (option.value) {
    map[option.value] = option.label;
  }
  return map;
}, {});
const TICKET_STATUS_LABELS = ITEM13_TICKET_STATUS_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});
const TASK_STATUS_LABELS = ITEM13_TASK_STATUS_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});
const NOTIFY_TARGET_LABELS = ITEM13_NOTIFY_TARGET_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});
const PRIORITY_LABELS = {
  high: '高',
  normal: '通常',
  low: '低',
};

const TICKET_STATUS_FILTER_OPTIONS = [{ value: '', label: 'すべて' }, ...ITEM13_TICKET_STATUS_OPTIONS];
const TASK_STATUS_FILTER_OPTIONS = [{ value: '', label: 'すべて' }, ...ITEM13_TASK_STATUS_OPTIONS];
const NOTIFY_TARGET_FILTER_OPTIONS = [{ value: '', label: '全対象' }, ...ITEM13_NOTIFY_TARGET_OPTIONS];
const LOCK_TASK_CREATE_OPTIONS = [
  { value: true, label: '施錠確認タスクを作成' },
  { value: false, label: '返却のみ（作成しない）' },
];
const MESSAGE_VISIBILITY_OPTIONS = [
  { value: false, label: '公開返信' },
  { value: true, label: '内部メモ' },
];

/**
 * Selectable chips.
 */
const OptionChips = ({ options, selectedValue, onSelect, theme }) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <View style={styles.rowWrap}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={`${option.value}`}
            style={[
              styles.chip,
              {
                borderColor: isSelected ? theme.primary : theme.border,
                backgroundColor: isSelected ? theme.primary : theme.surface,
              },
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={{ color: isSelected ? '#FFFFFF' : theme.text, fontSize: 12 }}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/**
 * Item13 HQ screen.
 */
const Item13Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();

  const [section, setSection] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [radioLogs, setRadioLogs] = useState([]);

  const [ticketFilters, setTicketFilters] = useState({ notifyTarget: '', ticketStatus: '' });
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [linkedTicketTasks, setLinkedTicketTasks] = useState([]);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [ticketReplyForm, setTicketReplyForm] = useState({ body: '', isInternal: false });
  const [ticketActionForm, setTicketActionForm] = useState({
    ticketStatus: 'new',
    assigneeId: '',
    notifyTarget: 'none',
  });

  const [taskFilters, setTaskFilters] = useState({ taskStatus: '', taskType: '' });
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskResult, setTaskResult] = useState(null);
  const [taskUpdateForm, setTaskUpdateForm] = useState({
    taskStatus: '',
    assignedTo: '',
    notes: '',
  });

  const [activeLoans, setActiveLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [returnForm, setReturnForm] = useState({
    createLockTask: true,
    optionalAssignee: '',
  });

  const [evaluations, setEvaluations] = useState([]);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState(null);
  const [evaluationDecisionForm, setEvaluationDecisionForm] = useState({
    decision: 'approved',
    comment: '',
  });

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, tasks]
  );
  const selectedLoan = useMemo(
    () => activeLoans.find((loan) => loan.id === selectedLoanId) || null,
    [activeLoans, selectedLoanId]
  );
  const selectedEvaluation = useMemo(
    () => evaluations.find((evaluation) => evaluation.id === selectedEvaluationId) || null,
    [evaluations, selectedEvaluationId]
  );

  /**
   * Format datetime text.
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
   * Format elapsed duration from datetime.
   */
  const formatElapsed = (value) => {
    if (!value) {
      return '-';
    }
    const startedAtMs = new Date(value).getTime();
    if (Number.isNaN(startedAtMs)) {
      return '-';
    }

    const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAtMs) / 60000));
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  /**
   * Load dashboard summary and recent radio logs.
   */
  const loadDashboard = useCallback(async () => {
    const [summaryResult, logResult] = await Promise.all([
      selectHqDashboardSummary(),
      selectRecentRadioLogs(12),
    ]);

    if (summaryResult.error) {
      setErrorMessage('ダッシュボードの取得に失敗しました。');
    } else {
      setDashboardSummary(summaryResult.summary);
    }

    if (logResult.error) {
      setRadioLogs([]);
    } else {
      setRadioLogs(logResult.logs || []);
    }
  }, []);

  /**
   * Load ticket list by filter.
   */
  const loadTickets = useCallback(async (overrideFilters = null) => {
    const activeFilter = overrideFilters || ticketFilters;
    const { tickets: list, error } = await selectTicketsForHq(activeFilter);

    if (error) {
      setTickets([]);
      setErrorMessage('チケット一覧の取得に失敗しました。');
      return;
    }

    setTickets(list || []);
  }, [ticketFilters]);

  /**
   * Load selected ticket detail + thread + linked tasks.
   */
  const loadTicketThread = useCallback(async (ticketId) => {
    if (!ticketId) {
      setTicketDetail(null);
      setTicketMessages([]);
      setLinkedTicketTasks([]);
      return;
    }

    setIsThreadLoading(true);
    const [detailResult, messageResult, taskResultByTicket] = await Promise.all([
      selectTicketDetailForHq(ticketId),
      selectTicketMessagesForHq(ticketId),
      selectPatrolTasksByTicketId(ticketId),
    ]);
    setIsThreadLoading(false);

    if (detailResult.error) {
      setTicketDetail(null);
      setErrorMessage('チケット詳細の取得に失敗しました。');
    } else {
      const detail = detailResult.ticket || null;
      setTicketDetail(detail);
      setTicketActionForm((previous) => ({
        ...previous,
        ticketStatus: detail?.ticket_status || 'new',
        assigneeId: detail?.assigned_hq_user_id || '',
        notifyTarget: detail?.notify_target || 'none',
      }));
    }

    if (messageResult.error) {
      setTicketMessages([]);
    } else {
      setTicketMessages(messageResult.messages || []);
    }

    if (taskResultByTicket.error) {
      setLinkedTicketTasks([]);
    } else {
      setLinkedTicketTasks(taskResultByTicket.tasks || []);
    }
  }, []);

  /**
   * Load patrol task list.
   */
  const loadTasks = useCallback(async (overrideFilters = null) => {
    const activeFilter = overrideFilters || taskFilters;
    const { tasks: list, error } = await selectPatrolTasksForHq(activeFilter);

    if (error) {
      setTasks([]);
      setErrorMessage('巡回タスク一覧の取得に失敗しました。');
      return;
    }

    setTasks(list || []);
  }, [taskFilters]);

  /**
   * Load selected task result.
   */
  const loadTaskResult = useCallback(async (taskId) => {
    if (!taskId) {
      setTaskResult(null);
      return;
    }

    const { result, error } = await selectPatrolTaskResultByTaskId(taskId);
    if (error) {
      setTaskResult(null);
      return;
    }

    setTaskResult(result || null);
  }, []);

  /**
   * Load active key loan list.
   */
  const loadKeyLoans = useCallback(async () => {
    const { loans, error } = await selectActiveKeyLoansForHq();
    if (error) {
      setActiveLoans([]);
      setErrorMessage('鍵貸出一覧の取得に失敗しました。');
      return;
    }

    setActiveLoans(loans || []);
  }, []);

  /**
   * Load pending evaluation list.
   */
  const loadEvaluations = useCallback(async () => {
    const { evaluations: list, error } = await selectPendingEvaluationsForHq();
    if (error) {
      setEvaluations([]);
      setErrorMessage('評価承認待ちの取得に失敗しました。');
      return;
    }

    setEvaluations(list || []);
  }, []);

  /**
   * Initial data load.
   */
  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setIsLoading(false);
        setErrorMessage('ログイン情報がありません。');
        return;
      }

      setIsLoading(true);
      setErrorMessage('');
      await Promise.all([loadDashboard(), loadTickets(), loadTasks(), loadKeyLoans(), loadEvaluations()]);
      setIsLoading(false);
    };

    run();
  }, [user?.id]);

  /**
   * Keep selected ticket id valid.
   */
  useEffect(() => {
    if (tickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    const exists = tickets.some((ticket) => ticket.id === selectedTicketId);
    if (!exists) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [selectedTicketId, tickets]);

  /**
   * Keep selected task id valid.
   */
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    const exists = tasks.some((task) => task.id === selectedTaskId);
    if (!exists) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  /**
   * Keep selected loan id valid.
   */
  useEffect(() => {
    if (activeLoans.length === 0) {
      setSelectedLoanId(null);
      return;
    }

    const exists = activeLoans.some((loan) => loan.id === selectedLoanId);
    if (!exists) {
      setSelectedLoanId(activeLoans[0].id);
    }
  }, [activeLoans, selectedLoanId]);

  /**
   * Keep selected evaluation id valid.
   */
  useEffect(() => {
    if (evaluations.length === 0) {
      setSelectedEvaluationId(null);
      return;
    }

    const exists = evaluations.some((evaluation) => evaluation.id === selectedEvaluationId);
    if (!exists) {
      setSelectedEvaluationId(evaluations[0].id);
    }
  }, [evaluations, selectedEvaluationId]);

  /**
   * Load ticket thread when selection changes.
   */
  useEffect(() => {
    loadTicketThread(selectedTicketId);
  }, [loadTicketThread, selectedTicketId]);

  /**
   * Load selected task result when selection changes.
   */
  useEffect(() => {
    loadTaskResult(selectedTaskId);
  }, [loadTaskResult, selectedTaskId]);

  /**
   * Sync task update form with selected task.
   */
  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setTaskUpdateForm({
      taskStatus: selectedTask.task_status || '',
      assignedTo: selectedTask.assigned_to || '',
      notes: selectedTask.notes || '',
    });
  }, [selectedTask]);

  /**
   * Reusable fail alert.
   */
  const showFailAlert = (title, error) => {
    Alert.alert(title, error?.message || '操作に失敗しました。');
  };

  /**
   * Post ticket reply.
   */
  const handlePostReply = async () => {
    const body = ticketReplyForm.body.trim();
    if (!selectedTicketId || !user?.id || !body) {
      return;
    }

    setIsBusy(true);
    const { error } = await appendTicketMessageForHq({
      ticketId: selectedTicketId,
      authorId: user.id,
      body,
      isInternal: ticketReplyForm.isInternal,
    });
    setIsBusy(false);

    if (error) {
      showFailAlert('返信失敗', error);
      return;
    }

    setTicketReplyForm((previous) => ({ ...previous, body: '' }));
    await loadTicketThread(selectedTicketId);
  };

  /**
   * Update ticket status.
   */
  const handleUpdateTicketStatus = async () => {
    if (!selectedTicketId) {
      return;
    }

    setIsBusy(true);
    const { error } = await updateTicketStatusForHq(selectedTicketId, ticketActionForm.ticketStatus);
    setIsBusy(false);

    if (error) {
      showFailAlert('状態更新失敗', error);
      return;
    }

    await Promise.all([loadDashboard(), loadTickets()]);
    await loadTicketThread(selectedTicketId);
  };

  /**
   * Update ticket assignee.
   */
  const handleAssignTicket = async () => {
    if (!selectedTicketId) {
      return;
    }

    setIsBusy(true);
    const { error } = await assignTicketToHqUser(selectedTicketId, ticketActionForm.assigneeId || null);
    setIsBusy(false);

    if (error) {
      showFailAlert('担当更新失敗', error);
      return;
    }

    await Promise.all([loadTickets(), loadDashboard()]);
    await loadTicketThread(selectedTicketId);
  };

  /**
   * Update notify target for cross-department tracking.
   */
  const handleUpdateNotifyTarget = async () => {
    if (!selectedTicketId) {
      return;
    }

    setIsBusy(true);
    const { error } = await updateTicketNotifyTarget(selectedTicketId, ticketActionForm.notifyTarget);
    setIsBusy(false);

    if (error) {
      showFailAlert('連携先更新失敗', error);
      return;
    }

    await loadTickets();
    await loadTicketThread(selectedTicketId);
  };

  /**
   * Update selected patrol task.
   */
  const handleUpdateTask = async () => {
    if (!selectedTaskId) {
      return;
    }

    setIsBusy(true);
    const { error } = await updatePatrolTaskForHq(selectedTaskId, taskUpdateForm);
    setIsBusy(false);

    if (error) {
      showFailAlert('タスク更新失敗', error);
      return;
    }

    await Promise.all([loadTasks(), loadDashboard()]);
    await loadTaskResult(selectedTaskId);
  };

  /**
   * Return key loan and optionally create lock_check.
   */
  const handleReturnKeyLoan = async () => {
    if (!selectedLoanId) {
      return;
    }

    setIsBusy(true);
    const { result, error } = await returnKeyAndCreateLockTaskForHq(
      selectedLoanId,
      returnForm.createLockTask,
      returnForm.createLockTask ? returnForm.optionalAssignee || null : null
    );
    setIsBusy(false);

    if (error) {
      showFailAlert('鍵返却失敗', error);
      return;
    }

    const lockTaskMessage = returnForm.createLockTask
      ? result?.lock_task_created
        ? `施錠確認タスク: ${result?.lock_task_no || result?.lock_task_id || '-'}`
        : '施錠確認タスクは既存タスクのため新規作成なし'
      : '施錠確認タスクは作成していません';

    Alert.alert('返却完了', `${result?.loan_no || ''}\n${lockTaskMessage}`);
    setReturnForm((previous) => ({ ...previous, optionalAssignee: '' }));
    await Promise.all([loadDashboard(), loadKeyLoans(), loadTasks()]);
  };

  /**
   * Approve/reject/rework pending evaluation.
   */
  const handleDecideEvaluation = async () => {
    if (!selectedEvaluationId || !user?.id) {
      return;
    }

    setIsBusy(true);
    const { error } = await decideEvaluationForHq(selectedEvaluationId, {
      decision: evaluationDecisionForm.decision,
      comment: evaluationDecisionForm.comment,
      reviewedBy: user.id,
    });
    setIsBusy(false);

    if (error) {
      showFailAlert('評価更新失敗', error);
      return;
    }

    setEvaluationDecisionForm((previous) => ({ ...previous, comment: '' }));
    await Promise.all([loadDashboard(), loadEvaluations()]);
  };

  /**
   * Dashboard card click helper.
   */
  const openTicketsByStatus = async (ticketStatus = '') => {
    const next = { ...ticketFilters, ticketStatus };
    setTicketFilters(next);
    setSection('tickets');
    await loadTickets(next);
  };

  /**
   * Dashboard card click helper for tasks.
   */
  const openTasksByType = async (taskType = '') => {
    const next = { ...taskFilters, taskType };
    setTaskFilters(next);
    setSection('tasks');
    await loadTasks(next);
  };

  /**
   * Dashboard section.
   */
  const renderDashboard = () => {
    const summary = dashboardSummary || {};
    const cards = [
      { key: 'new_tickets', label: '新着チケット', value: summary.new_tickets || 0, onPress: () => openTicketsByStatus('new') },
      { key: 'late_tickets', label: '遅延チケット', value: summary.late_tickets || 0, onPress: () => setSection('tickets') },
      { key: 'lock_tasks', label: '施錠確認', value: summary.lock_tasks || 0, onPress: () => openTasksByType('lock_check') },
      { key: 'active_key_loans', label: '貸出中の鍵', value: summary.active_key_loans || 0, onPress: () => setSection('keys') },
      { key: 'active_patrol_tasks', label: '巡回タスク', value: summary.active_patrol_tasks || 0, onPress: () => setSection('tasks') },
      { key: 'recent_radio_logs', label: '無線ログ(1h)', value: summary.recent_radio_logs || 0, onPress: () => setSection('dashboard') },
      { key: 'pending_evaluations', label: '評価承認待ち', value: summary.pending_evaluations || 0, onPress: () => setSection('evaluation') },
    ];

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>全体監視</Text>
          <TouchableOpacity
            style={[styles.buttonMini, { backgroundColor: theme.primary }]}
            onPress={loadDashboard}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>再取得</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.key}
              style={[styles.summaryCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={card.onPress}
            >
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{card.label}</Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>{card.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>無線ログ（最新12件）</Text>
          {radioLogs.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>ログはありません。</Text>
          ) : (
            radioLogs.map((log) => (
              <View key={log.id} style={[styles.logItem, { borderColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.logSeverity, { color: theme.primary }]}>
                    [{ITEM13_SEVERITY_LABELS[log.severity] || log.severity}]
                  </Text>
                  <Text style={[styles.logTime, { color: theme.textSecondary }]}>{formatDateTime(log.logged_at)}</Text>
                </View>
                <Text style={[styles.logText, { color: theme.text }]}>{log.message}</Text>
                <Text style={[styles.logMeta, { color: theme.textSecondary }]}>
                  channel: {log.channel || '-'} / logged_by: {log.logged_by || '-'}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  /**
   * Ticket section.
   */
  const renderTickets = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>チケット絞り込み</Text>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>状態</Text>
        <OptionChips
          options={TICKET_STATUS_FILTER_OPTIONS}
          selectedValue={ticketFilters.ticketStatus}
          onSelect={(ticketStatus) => setTicketFilters((previous) => ({ ...previous, ticketStatus }))}
          theme={theme}
        />
        <Text style={[styles.fieldLabel, { color: theme.text }]}>連携先</Text>
        <OptionChips
          options={NOTIFY_TARGET_FILTER_OPTIONS}
          selectedValue={ticketFilters.notifyTarget}
          onSelect={(notifyTarget) => setTicketFilters((previous) => ({ ...previous, notifyTarget }))}
          theme={theme}
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => loadTickets(ticketFilters)}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>一覧更新</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>チケット一覧</Text>
        {tickets.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象チケットはありません。</Text>
        ) : (
          tickets.map((ticket) => {
            const isSelected = ticket.id === selectedTicketId;
            return (
              <TouchableOpacity
                key={ticket.id}
                style={[
                  styles.card,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                onPress={() => setSelectedTicketId(ticket.id)}
              >
                <View style={styles.rowBetween}>
                  <Text style={[styles.itemNo, { color: theme.primary }]}>{ticket.ticket_no}</Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>経過: {formatElapsed(ticket.created_at)}</Text>
                </View>
                <Text style={[styles.itemTitle, { color: theme.text }]}>{ticket.title}</Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                  {TICKET_TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}
                  {' / '}
                  {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                  {' / '}
                  {TICKET_STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status}
                </Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  通知先: {NOTIFY_TARGET_LABELS[ticket.notify_target] || 'なし'} / 担当: {ticket.assigned_hq_user_id || '-'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {ticketDetail ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>チケット詳細</Text>
          <Text style={[styles.itemNo, { color: theme.primary }]}>{ticketDetail.ticket_no}</Text>
          <Text style={[styles.itemTitle, { color: theme.text }]}>{ticketDetail.title}</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{ticketDetail.description}</Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            状態: {TICKET_STATUS_LABELS[ticketDetail.ticket_status] || ticketDetail.ticket_status}
            {' / '}
            通知先: {NOTIFY_TARGET_LABELS[ticketDetail.notify_target] || 'なし'}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            作成者: {ticketDetail.created_by} / 本部担当: {ticketDetail.assigned_hq_user_id || '-'}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            作成日時: {formatDateTime(ticketDetail.created_at)}
          </Text>

          {(ticketDetail.notify_target === 'accounting' || ticketDetail.notify_target === 'property') ? (
            <View style={[styles.inlineNotice, { borderColor: theme.border }]}>
              <Text style={[styles.helperText, { color: theme.textSecondary }]}> 
                部署連携追跡: {NOTIFY_TARGET_LABELS[ticketDetail.notify_target] || ticketDetail.notify_target}
                {' / '}
                現在状態: {TICKET_STATUS_LABELS[ticketDetail.ticket_status] || ticketDetail.ticket_status}
              </Text>
            </View>
          ) : null}

          <View style={[styles.inlineNotice, { borderColor: theme.border }]}> 
            <Text style={[styles.fieldLabel, { color: theme.text }]}>紐づく巡回タスク</Text>
            {linkedTicketTasks.length === 0 ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>紐づくタスクはありません。</Text>
            ) : (
              linkedTicketTasks.map((task) => (
                <View key={task.id} style={[styles.linkedTaskItem, { borderColor: theme.border }]}> 
                  <Text style={[styles.metaTextStrong, { color: theme.primary }]}>{task.task_no}</Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                    {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                    {' / '}
                    {TASK_STATUS_LABELS[task.task_status] || task.task_status}
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                    担当者: {task.assigned_to || '-'} / 完了日時: {formatDateTime(task.done_at)}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.inlineNotice, { borderColor: theme.border }]}> 
            <Text style={[styles.fieldLabel, { color: theme.text }]}>返信スレッド</Text>
            {isThreadLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : ticketMessages.length === 0 ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>返信はまだありません。</Text>
            ) : (
              ticketMessages.map((message) => (
                <View key={message.id} style={[styles.messageCard, { borderColor: theme.border }]}> 
                  <Text style={[styles.metaTextStrong, { color: theme.text }]}>{message.author_name || message.author_id}</Text>
                  <Text style={[styles.bodyText, { color: theme.text }]}>{message.body}</Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                    {message.is_internal ? '内部メモ' : '公開返信'} / {formatDateTime(message.created_at)}
                  </Text>
                </View>
              ))
            )}

            <Text style={[styles.fieldLabel, { color: theme.text }]}>返信種別</Text>
            <OptionChips
              options={MESSAGE_VISIBILITY_OPTIONS}
              selectedValue={ticketReplyForm.isInternal}
              onSelect={(isInternal) => setTicketReplyForm((previous) => ({ ...previous, isInternal }))}
              theme={theme}
            />
            <TextInput
              style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
              value={ticketReplyForm.body}
              onChangeText={(body) => setTicketReplyForm((previous) => ({ ...previous, body }))}
              placeholder="返信本文"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={handlePostReply}
              disabled={isBusy}
            >
              <Text style={styles.buttonText}>返信投稿</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>状態更新</Text>
          <OptionChips
            options={ITEM13_TICKET_STATUS_OPTIONS}
            selectedValue={ticketActionForm.ticketStatus}
            onSelect={(ticketStatus) => setTicketActionForm((previous) => ({ ...previous, ticketStatus }))}
            theme={theme}
          />
          <TouchableOpacity
            style={[styles.buttonMini, { backgroundColor: theme.primary }]}
            onPress={handleUpdateTicketStatus}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>状態を更新</Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>担当者（user_id）</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            value={ticketActionForm.assigneeId}
            onChangeText={(assigneeId) => setTicketActionForm((previous) => ({ ...previous, assigneeId }))}
            placeholder="未入力で担当解除"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.buttonMini, { backgroundColor: theme.primary }]}
            onPress={handleAssignTicket}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>担当を更新</Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>連携先（追跡用）</Text>
          <OptionChips
            options={ITEM13_NOTIFY_TARGET_OPTIONS}
            selectedValue={ticketActionForm.notifyTarget}
            onSelect={(notifyTarget) => setTicketActionForm((previous) => ({ ...previous, notifyTarget }))}
            theme={theme}
          />
          <TouchableOpacity
            style={[styles.buttonMini, { backgroundColor: theme.primary }]}
            onPress={handleUpdateNotifyTarget}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>連携先を更新</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  /**
   * Patrol task section.
   */
  const renderTasks = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>巡回タスク絞り込み</Text>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>状態</Text>
        <OptionChips
          options={TASK_STATUS_FILTER_OPTIONS}
          selectedValue={taskFilters.taskStatus}
          onSelect={(taskStatus) => setTaskFilters((previous) => ({ ...previous, taskStatus }))}
          theme={theme}
        />
        <Text style={[styles.fieldLabel, { color: theme.text }]}>種別</Text>
        <OptionChips
          options={TASK_TYPE_OPTIONS}
          selectedValue={taskFilters.taskType}
          onSelect={(taskType) => setTaskFilters((previous) => ({ ...previous, taskType }))}
          theme={theme}
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => loadTasks(taskFilters)}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>一覧更新</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
        <Text style={[styles.panelTitle, { color: theme.text }]}>巡回タスク一覧</Text>
        {tasks.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象タスクはありません。</Text>
        ) : (
          tasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[
                styles.card,
                {
                  borderColor: task.id === selectedTaskId ? theme.primary : theme.border,
                  backgroundColor: theme.background,
                },
              ]}
              onPress={() => setSelectedTaskId(task.id)}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.itemNo, { color: theme.primary }]}>{task.task_no}</Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>経過: {formatElapsed(task.created_at)}</Text>
              </View>
              <Text style={[styles.itemTitle, { color: theme.text }]}>{TASK_TYPE_LABELS[task.task_type] || task.task_type}</Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                状態: {TASK_STATUS_LABELS[task.task_status] || task.task_status} / 担当者: {task.assigned_to || '-'}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                元チケット: {task.source_ticket_id || '-'} / 元鍵貸出: {task.source_key_loan_id || '-'}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selectedTask ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
          <Text style={[styles.panelTitle, { color: theme.text }]}>タスク詳細・更新</Text>
          <Text style={[styles.itemNo, { color: theme.primary }]}>{selectedTask.task_no}</Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            種別: {TASK_TYPE_LABELS[selectedTask.task_type] || selectedTask.task_type}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            作成日時: {formatDateTime(selectedTask.created_at)} / 期限: {formatDateTime(selectedTask.due_at)}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            受付日時: {formatDateTime(selectedTask.accepted_at)} / 完了日時: {formatDateTime(selectedTask.done_at)}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>状態</Text>
          <OptionChips
            options={ITEM13_TASK_STATUS_OPTIONS}
            selectedValue={taskUpdateForm.taskStatus}
            onSelect={(taskStatus) => setTaskUpdateForm((previous) => ({ ...previous, taskStatus }))}
            theme={theme}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>担当者（user_id）</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            value={taskUpdateForm.assignedTo}
            onChangeText={(assignedTo) => setTaskUpdateForm((previous) => ({ ...previous, assignedTo }))}
            placeholder="未入力で変更なし"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>メモ</Text>
          <TextInput
            style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
            value={taskUpdateForm.notes}
            onChangeText={(notes) => setTaskUpdateForm((previous) => ({ ...previous, notes }))}
            placeholder="更新メモ"
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleUpdateTask}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>タスク更新</Text>
          </TouchableOpacity>

          <View style={[styles.inlineNotice, { borderColor: theme.border }]}> 
            <Text style={[styles.fieldLabel, { color: theme.text }]}>結果確認</Text>
            {taskResult ? (
              <>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>結果コード: {taskResult.result_code}</Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>メモ: {taskResult.memo || '-'}</Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                  登録者: {taskResult.created_by} / {formatDateTime(taskResult.created_at)}
                </Text>
              </>
            ) : (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>結果は未登録です。</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );

  /**
   * Key loan section.
   */
  const renderKeys = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.rowBetween}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>鍵返却・施錠確認依頼</Text>
        <TouchableOpacity
          style={[styles.buttonMini, { backgroundColor: theme.primary }]}
          onPress={loadKeyLoans}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>再取得</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
        <Text style={[styles.panelTitle, { color: theme.text }]}>貸出中一覧</Text>
        {activeLoans.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>貸出中の鍵はありません。</Text>
        ) : (
          activeLoans.map((loan) => (
            <TouchableOpacity
              key={loan.id}
              style={[
                styles.card,
                {
                  borderColor: loan.id === selectedLoanId ? theme.primary : theme.border,
                  backgroundColor: theme.background,
                },
              ]}
              onPress={() => setSelectedLoanId(loan.id)}
            >
              <Text style={[styles.itemNo, { color: theme.primary }]}>{loan.loan_no}</Text>
              <Text style={[styles.itemTitle, { color: theme.text }]}> 
                {loan.keys?.key_code || '-'} / {loan.keys?.display_name || '不明な鍵'}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                借用者: {loan.borrower_user_id} / 状態: {loan.loan_status === 'loaned' ? '貸出中' : loan.loan_status}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                貸出日時: {formatDateTime(loan.loaned_at)} / 返却予定: {formatDateTime(loan.due_at)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selectedLoan ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
          <Text style={[styles.panelTitle, { color: theme.text }]}>返却処理</Text>
          <Text style={[styles.itemNo, { color: theme.primary }]}>{selectedLoan.loan_no}</Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            鍵ID: {selectedLoan.key_id} / 団体ID: {selectedLoan.org_id || '-'}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>施錠確認タスク作成</Text>
          <OptionChips
            options={LOCK_TASK_CREATE_OPTIONS}
            selectedValue={returnForm.createLockTask}
            onSelect={(createLockTask) => setReturnForm((previous) => ({ ...previous, createLockTask }))}
            theme={theme}
          />

          {returnForm.createLockTask ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>施錠タスク担当者（任意 user_id）</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                value={returnForm.optionalAssignee}
                onChangeText={(optionalAssignee) =>
                  setReturnForm((previous) => ({ ...previous, optionalAssignee }))
                }
                placeholder="未入力なら未割当で作成"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
              />
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleReturnKeyLoan}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>返却実行</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  /**
   * Evaluation approval section.
   */
  const renderEvaluations = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.rowBetween}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>評価承認</Text>
        <TouchableOpacity
          style={[styles.buttonMini, { backgroundColor: theme.primary }]}
          onPress={loadEvaluations}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>再取得</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
        <Text style={[styles.panelTitle, { color: theme.text }]}>承認待ち一覧</Text>
        {evaluations.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>承認待ちはありません。</Text>
        ) : (
          evaluations.map((evaluation) => (
            <TouchableOpacity
              key={evaluation.id}
              style={[
                styles.card,
                {
                  borderColor: evaluation.id === selectedEvaluationId ? theme.primary : theme.border,
                  backgroundColor: theme.background,
                },
              ]}
              onPress={() => setSelectedEvaluationId(evaluation.id)}
            >
              <Text style={[styles.itemNo, { color: theme.primary }]}>{evaluation.id}</Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                タスクID: {evaluation.task_id || '-'} / チケットID: {evaluation.ticket_id || '-'}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                評価者: {evaluation.evaluator_id} / 点数: {evaluation.score || '-'}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
                作成日時: {formatDateTime(evaluation.created_at)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selectedEvaluation ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
          <Text style={[styles.panelTitle, { color: theme.text }]}>承認判定</Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}> 
            評価者: {selectedEvaluation.evaluator_id} / 点数: {selectedEvaluation.score || '-'}
          </Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}> 
            コメント: {selectedEvaluation.comment || '-'}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>判定</Text>
          <OptionChips
            options={ITEM13_EVALUATION_DECISION_OPTIONS}
            selectedValue={evaluationDecisionForm.decision}
            onSelect={(decision) => setEvaluationDecisionForm((previous) => ({ ...previous, decision }))}
            theme={theme}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>コメント（任意）</Text>
          <TextInput
            style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
            value={evaluationDecisionForm.comment}
            onChangeText={(comment) => setEvaluationDecisionForm((previous) => ({ ...previous, comment }))}
            placeholder="承認メモ"
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleDecideEvaluation}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>判定を保存</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderSection = () => {
    if (section === 'tickets') {
      return renderTickets();
    }
    if (section === 'tasks') {
      return renderTasks();
    }
    if (section === 'keys') {
      return renderKeys();
    }
    if (section === 'evaluation') {
      return renderEvaluations();
    }
    return renderDashboard();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}> 
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.sectionTabs, { borderBottomColor: theme.border }]}
        contentContainerStyle={styles.sectionTabsContent}
      >
        {ITEM13_SECTION_OPTIONS.map((item) => {
          const selected = section === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.primary : theme.surface,
                },
              ]}
              onPress={() => setSection(item.value)}
            >
              <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 12 }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>本部データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.scopeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
            <Text style={[styles.scopeTitle, { color: theme.text }]}>現在の本部スコープ</Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}> 
              ユーザー: {userInfo?.name || user?.email || user?.id || '-'}
            </Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}> 
              再通知機能は今回スコープ外（対応状況の追跡のみ実装）
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
  sectionTabsContent: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  content: { flex: 1 },
  contentContainer: {
    maxWidth: 980,
    width: '100%',
    alignSelf: 'center',
    padding: 12,
    gap: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sectionBlock: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  panel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  scopeCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  scopeTitle: { fontSize: 14, fontWeight: '700' },
  scopeText: { fontSize: 12 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  card: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 4 },
  itemNo: { fontSize: 12, fontWeight: '700' },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  metaTextStrong: { fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 12 },
  bodyText: { fontSize: 13, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  helperText: { fontSize: 12 },
  errorText: { fontSize: 13, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 84,
    fontSize: 14,
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 140,
    gap: 4,
  },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  logItem: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 4 },
  logSeverity: { fontSize: 12, fontWeight: '700' },
  logTime: { fontSize: 11 },
  logText: { fontSize: 13, lineHeight: 18 },
  logMeta: { fontSize: 11 },
  inlineNotice: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  linkedTaskItem: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 2 },
  messageCard: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 3 },
});

export default Item13Screen;
