/**
 * Item14 screen (Accounting).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  ITEM14_INBOX_STATUS_OPTIONS,
  ITEM14_MESSAGE_KIND_OPTIONS,
  ITEM14_SECTION_OPTIONS,
  ITEM14_STATUS_BUCKET_LABELS,
  ITEM14_TICKET_STATUS_OPTIONS,
} from '../constants';
import {
  appendAccountingTicketMessage,
  completeAccountingTicket,
  selectAccountingTicketAttachments,
  selectAccountingTicketDetail,
  selectAccountingTicketMessages,
  selectAccountingTickets,
  updateAccountingTicketStatus,
} from '../services/item14Service';

const SCREEN_NAME = '会計';

const TICKET_STATUS_LABELS = ITEM14_TICKET_STATUS_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});

/**
 * Selectable chip row.
 */
const OptionChips = ({ options, selectedValue, onSelect, theme }) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <View style={styles.rowWrap}>
      {options.map((option) => {
        const selected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={`${option.value}`}
            style={[
              styles.chip,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: selected ? theme.primary : theme.surface,
              },
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 12 }}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

/**
 * Item14 accounting screen.
 */
const Item14Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();
  const { width } = useWindowDimensions();

  const [section, setSection] = useState('inbox');
  const [inboxStatus, setInboxStatus] = useState('unread');
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [messageForm, setMessageForm] = useState({
    messageKind: 'reply',
    body: '',
  });
  const [statusForm, setStatusForm] = useState({
    ticketStatus: 'acknowledged',
  });
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const detailDrawerProgress = useRef(new Animated.Value(0)).current;
  const detailDrawerWidth = width;
  const detailDrawerTranslateX = detailDrawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [detailDrawerWidth, 0],
  });

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets]
  );

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
   * Load inbox tickets by status bucket.
   */
  const loadTickets = useCallback(async (statusBucket = inboxStatus) => {
    const { tickets: rows, error } = await selectAccountingTickets({ statusBucket });

    if (error) {
      setErrorMessage('会計一覧の取得に失敗しました。');
      setTickets([]);
      return;
    }

    setTickets(rows || []);
  }, [inboxStatus]);

  /**
   * Load selected ticket detail + thread + attachments.
   */
  const loadTicketDetail = useCallback(async (ticketId) => {
    if (!ticketId) {
      setTicketDetail(null);
      setMessages([]);
      setAttachments([]);
      return;
    }

    setThreadLoading(true);
    const [detailResult, messageResult, attachmentResult] = await Promise.all([
      selectAccountingTicketDetail(ticketId),
      selectAccountingTicketMessages(ticketId),
      selectAccountingTicketAttachments(ticketId),
    ]);
    setThreadLoading(false);

    if (detailResult.error) {
      setTicketDetail(null);
      setErrorMessage('連絡詳細の取得に失敗しました。');
    } else {
      const detail = detailResult.ticket || null;
      setTicketDetail(detail);
      setStatusForm((previous) => ({
        ...previous,
        ticketStatus: detail?.ticket_status || 'acknowledged',
      }));
    }

    if (messageResult.error) {
      setMessages([]);
    } else {
      setMessages(messageResult.messages || []);
    }

    if (attachmentResult.error) {
      setAttachments([]);
    } else {
      setAttachments(attachmentResult.attachments || []);
    }
  }, []);

  /**
   * Initial load.
   */
  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setLoading(false);
        setErrorMessage('ログイン情報がありません。');
        return;
      }

      setLoading(true);
      setErrorMessage('');
      await loadTickets('unread');
      setLoading(false);
    };

    run();
  }, [user?.id]);

  /**
   * Keep selected ticket id synced.
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
   * Load detail when selection changes.
   */
  useEffect(() => {
    loadTicketDetail(selectedTicketId);
  }, [loadTicketDetail, selectedTicketId]);

  /**
   * Update inbox filter and reload.
   */
  const handleChangeInboxStatus = async (statusBucket) => {
    setInboxStatus(statusBucket);
    await loadTickets(statusBucket);
  };

  const openDetailDrawer = useCallback(() => {
    setIsDetailDrawerOpen(true);
    Animated.timing(detailDrawerProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [detailDrawerProgress]);

  const closeDetailDrawer = useCallback(() => {
    Animated.timing(detailDrawerProgress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsDetailDrawerOpen(false);
        setSection('inbox');
      }
    });
  }, [detailDrawerProgress]);

  useEffect(() => {
    if (!selectedTicketId && isDetailDrawerOpen) {
      closeDetailDrawer();
    }
  }, [closeDetailDrawer, isDetailDrawerOpen, selectedTicketId]);

  /**
   * Post reply/public memo to ticket.
   */
  const handlePostMessage = async () => {
    const body = messageForm.body.trim();
    if (!selectedTicketId || !user?.id || !body) {
      return;
    }

    const isInternal = messageForm.messageKind === 'memo';
    setBusy(true);
    const { error } = await appendAccountingTicketMessage({
      ticketId: selectedTicketId,
      authorId: user.id,
      body,
      isInternal,
    });
    setBusy(false);

    if (error) {
      Alert.alert('投稿失敗', error.message || '投稿に失敗しました。');
      return;
    }

    setMessageForm((previous) => ({ ...previous, body: '' }));
    await loadTicketDetail(selectedTicketId);
  };

  /**
   * Update ticket status.
   */
  const handleUpdateStatus = async () => {
    if (!selectedTicketId) {
      return;
    }

    setBusy(true);
    const { error } = await updateAccountingTicketStatus(selectedTicketId, statusForm.ticketStatus);
    setBusy(false);

    if (error) {
      Alert.alert('更新失敗', error.message || '状態更新に失敗しました。');
      return;
    }

    await Promise.all([loadTickets(inboxStatus), loadTicketDetail(selectedTicketId)]);
  };

  /**
   * Complete ticket as resolved.
   */
  const handleComplete = async () => {
    if (!selectedTicketId) {
      return;
    }

    setBusy(true);
    const { error } = await completeAccountingTicket(selectedTicketId);
    setBusy(false);

    if (error) {
      Alert.alert('完了更新失敗', error.message || '完了更新に失敗しました。');
      return;
    }

    Alert.alert('完了', 'チケットを解決済みに更新しました。');
    await Promise.all([loadTickets(inboxStatus), loadTicketDetail(selectedTicketId)]);
  };

  /**
   * Render accounting inbox.
   */
  const renderInboxSection = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>一覧</Text>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          「distribution_change」かつ「notify_target=accounting」のみ表示
        </Text>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>ステータス</Text>
        <OptionChips
          options={ITEM14_INBOX_STATUS_OPTIONS}
          selectedValue={inboxStatus}
          onSelect={handleChangeInboxStatus}
          theme={theme}
        />
        <TouchableOpacity
          style={[styles.buttonMini, { backgroundColor: theme.primary }]}
          onPress={() => loadTickets(inboxStatus)}
          disabled={busy}
        >
          <Text style={styles.buttonText}>再取得</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>
          一覧（{ITEM14_STATUS_BUCKET_LABELS[inboxStatus] || inboxStatus}）
        </Text>
        {tickets.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象の連絡はありません。</Text>
        ) : (
          tickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={[
                styles.card,
                {
                  borderColor: ticket.id === selectedTicketId ? theme.primary : theme.border,
                  backgroundColor: theme.background,
                },
              ]}
              onPress={() => {
                setSelectedTicketId(ticket.id);
                setSection('detail');
                openDetailDrawer();
              }}
            >
              <Text style={[styles.itemNo, { color: theme.primary }]}>{ticket.ticket_no}</Text>
              <Text style={[styles.itemTitle, { color: theme.text }]}>{ticket.title}</Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                状態: {TICKET_STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                作成: {formatDateTime(ticket.created_at)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );

  /**
   * Render selected ticket detail.
   */
  const renderDetailSection = () => (
    <View style={styles.sectionBlock}>
      {!ticketDetail ? (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            一覧から連絡を選択してください。
          </Text>
        </View>
      ) : (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.panelTitle, { color: theme.text }]}>会計連絡の詳細</Text>
            <TouchableOpacity
              style={[styles.buttonMini, { backgroundColor: theme.primary }]}
              onPress={() => loadTicketDetail(ticketDetail.id)}
              disabled={busy}
            >
              <Text style={styles.buttonText}>再取得</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.itemNo, { color: theme.primary }]}>{ticketDetail.ticket_no}</Text>
          <Text style={[styles.itemTitle, { color: theme.text }]}>{ticketDetail.title}</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{ticketDetail.description}</Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            状態: {TICKET_STATUS_LABELS[ticketDetail.ticket_status] || ticketDetail.ticket_status}
          </Text>
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            作成者: {ticketDetail.created_by} / 作成日時: {formatDateTime(ticketDetail.created_at)}
          </Text>

          <View style={[styles.inlinePanel, { borderColor: theme.border }]}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>添付</Text>
            {attachments.length === 0 ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>添付はありません。</Text>
            ) : (
              attachments.map((attachment) => (
                <View key={attachment.id} style={[styles.attachItem, { borderColor: theme.border }]}>
                  <Text style={[styles.metaTextStrong, { color: theme.text }]}>
                    {attachment.caption || attachment.storage_path}
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    {attachment.storage_bucket}/{attachment.storage_path}
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    {attachment.mime_type || '-'} / {attachment.file_size_bytes || 0} バイト
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.inlinePanel, { borderColor: theme.border }]}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>返信スレッド</Text>
            {threadLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : messages.length === 0 ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>投稿はありません。</Text>
            ) : (
              messages.map((message) => (
                <View key={message.id} style={[styles.messageItem, { borderColor: theme.border }]}>
                  <Text style={[styles.metaTextStrong, { color: theme.text }]}>
                    {message.author_name || message.author_id}
                  </Text>
                  <Text style={[styles.bodyText, { color: theme.text }]}>{message.body}</Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    {message.is_internal ? '内部メモ' : '公開返信'} / {formatDateTime(message.created_at)}
                  </Text>
                </View>
              ))
            )}

            <Text style={[styles.fieldLabel, { color: theme.text }]}>投稿種別</Text>
            <OptionChips
              options={ITEM14_MESSAGE_KIND_OPTIONS}
              selectedValue={messageForm.messageKind}
              onSelect={(messageKind) => setMessageForm((previous) => ({ ...previous, messageKind }))}
              theme={theme}
            />

            <TextInput
              style={[styles.inputMulti, { borderColor: theme.border, color: theme.text }]}
              value={messageForm.body}
              onChangeText={(body) => setMessageForm((previous) => ({ ...previous, body }))}
              placeholder={messageForm.messageKind === 'memo' ? '対応メモ' : '回答本文'}
              placeholderTextColor={theme.textSecondary}
              multiline
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={handlePostMessage}
              disabled={busy}
            >
              <Text style={styles.buttonText}>投稿</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>状態更新</Text>
          <OptionChips
            options={ITEM14_TICKET_STATUS_OPTIONS}
            selectedValue={statusForm.ticketStatus}
            onSelect={(ticketStatus) => setStatusForm((previous) => ({ ...previous, ticketStatus }))}
            theme={theme}
          />
          <View style={styles.rowWrap}>
            <TouchableOpacity
              style={[styles.buttonMini, { backgroundColor: theme.primary }]}
              onPress={handleUpdateStatus}
              disabled={busy}
            >
              <Text style={styles.buttonText}>状態を更新</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonMini, { backgroundColor: '#16A34A' }]}
              onPress={handleComplete}
              disabled={busy}
            >
              <Text style={styles.buttonText}>完了（解決済み）</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderSection = () => {
    return renderInboxSection();
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
        {ITEM14_SECTION_OPTIONS.map((option) => {
          const selected = section === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.sectionTabChip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.primary : theme.surface,
                },
              ]}
              onPress={() => {
                if (option.value === 'detail') {
                  if (!selectedTicketId) {
                    Alert.alert('未選択', '一覧から連絡を選択してください。');
                    return;
                  }
                  setSection('detail');
                  openDetailDrawer();
                  return;
                }
                setSection(option.value);
                if (isDetailDrawerOpen) {
                  closeDetailDrawer();
                }
              }}
            >
              <Text style={[styles.sectionTabLabel, { color: selected ? '#FFFFFF' : theme.text }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>会計データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.scopeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.scopeTitle, { color: theme.text }]}>現在の会計担当範囲</Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              ユーザー: {userInfo?.name || user?.email || user?.id || '-'}
            </Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              「distribution_change」専用一覧（対象外の連絡は非表示）
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

      {isDetailDrawerOpen ? (
        <View style={styles.drawerLayer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.drawerBackdrop,
              {
                opacity: detailDrawerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.26],
                }),
              },
            ]}
          />
          <TouchableOpacity style={styles.drawerBackdropHit} activeOpacity={1} onPress={closeDetailDrawer} />

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: detailDrawerWidth,
                borderLeftColor: theme.border,
                backgroundColor: theme.background,
                transform: [{ translateX: detailDrawerTranslateX }],
              },
            ]}
          >
            <View style={[styles.drawerHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[styles.drawerTitle, { color: theme.text }]}>連絡詳細</Text>
              <TouchableOpacity
                style={[styles.drawerCloseButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={closeDetailDrawer}
              >
                <Text style={[styles.drawerCloseText, { color: theme.text }]}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.drawerContent}
              contentContainerStyle={styles.drawerContentContainer}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailSection()}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTabs: {
    borderBottomWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: 60,
  },
  sectionTabsContent: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sectionTabChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 38,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabLabel: { fontSize: 12, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: {
    maxWidth: 1024,
    width: '100%',
    alignSelf: 'center',
    padding: 14,
    gap: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  sectionBlock: { gap: 12 },
  drawerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 20,
    alignItems: 'flex-end',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  drawerBackdropHit: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerPanel: {
    height: '100%',
    borderLeftWidth: 1,
  },
  drawerHeader: {
    height: 56,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: { fontSize: 14, fontWeight: '700' },
  drawerCloseButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  drawerCloseText: { fontSize: 12, fontWeight: '700' },
  drawerContent: { flex: 1 },
  drawerContentContainer: { padding: 12, paddingBottom: 24 },
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  inlinePanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  scopeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scopeTitle: { fontSize: 14, fontWeight: '700' },
  scopeText: { fontSize: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  itemNo: { fontSize: 12, fontWeight: '700' },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  metaTextStrong: { fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 12 },
  bodyText: { fontSize: 13, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  helperText: { fontSize: 12 },
  errorText: { fontSize: 13, lineHeight: 20 },
  attachItem: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  messageItem: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 84,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  button: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  buttonMini: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});

export default Item14Screen;
