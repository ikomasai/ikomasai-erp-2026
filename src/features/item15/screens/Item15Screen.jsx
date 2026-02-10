/**
 * Item15 screen (Property).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  ITEM15_INBOX_STATUS_OPTIONS,
  ITEM15_MESSAGE_KIND_OPTIONS,
  ITEM15_SECTION_OPTIONS,
  ITEM15_STATUS_BUCKET_LABELS,
  ITEM15_TICKET_STATUS_OPTIONS,
} from '../constants';
import {
  appendPropertyTicketMessage,
  completePropertyTicket,
  selectPropertyTicketAttachments,
  selectPropertyTicketDetail,
  selectPropertyTicketMessages,
  selectPropertyTickets,
  updatePropertyTicketStatus,
} from '../services/item15Service';

const SCREEN_NAME = '物品';
const SUPABASE_URL = process?.env?.EXPO_PUBLIC_SUPABASE_URL || '';

const TICKET_STATUS_LABELS = ITEM15_TICKET_STATUS_OPTIONS.reduce((map, option) => {
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
 * Property screen.
 */
const Item15Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();

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
  const [brokenImageMap, setBrokenImageMap] = useState({});

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets]
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
   * Resolve an attachment URI for image display.
   * @param {Object} attachment - ticket_attachments row.
   * @returns {string} URI text or empty.
   */
  const resolveAttachmentUri = (attachment) => {
    const path = `${attachment?.storage_path || ''}`.trim();
    const bucket = `${attachment?.storage_bucket || ''}`.trim();

    if (!path) {
      return '';
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (!bucket || !SUPABASE_URL) {
      return '';
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  };

  /**
   * Determine if attachment looks like an image.
   * @param {Object} attachment - ticket_attachments row.
   * @returns {boolean} True when image-like.
   */
  const isImageAttachment = (attachment) => {
    const mimeType = `${attachment?.mime_type || ''}`.toLowerCase();
    if (mimeType.startsWith('image/')) {
      return true;
    }

    const path = `${attachment?.storage_path || ''}`.toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(path);
  };

  /**
   * Load property inbox tickets by status bucket.
   */
  const loadTickets = useCallback(async (statusBucket = inboxStatus) => {
    const { tickets: rows, error } = await selectPropertyTickets({ statusBucket });

    if (error) {
      setErrorMessage('物品一覧の取得に失敗しました。');
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
      setBrokenImageMap({});
      return;
    }

    setThreadLoading(true);
    const [detailResult, messageResult, attachmentResult] = await Promise.all([
      selectPropertyTicketDetail(ticketId),
      selectPropertyTicketMessages(ticketId),
      selectPropertyTicketAttachments(ticketId),
    ]);
    setThreadLoading(false);

    if (detailResult.error) {
      setTicketDetail(null);
      setErrorMessage('チケット詳細の取得に失敗しました。');
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
    const { error } = await appendPropertyTicketMessage({
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
    const { error } = await updatePropertyTicketStatus(selectedTicketId, statusForm.ticketStatus);
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
    const { error } = await completePropertyTicket(selectedTicketId);
    setBusy(false);

    if (error) {
      Alert.alert('完了更新失敗', error.message || '完了更新に失敗しました。');
      return;
    }

    Alert.alert('完了', 'チケットを解決済みに更新しました。');
    await Promise.all([loadTickets(inboxStatus), loadTicketDetail(selectedTicketId)]);
  };

  /**
   * Record image load failure and fallback.
   */
  const markImageBroken = (attachmentId) => {
    setBrokenImageMap((previous) => ({
      ...previous,
      [attachmentId]: true,
    }));
  };

  /**
   * Render property inbox.
   */
  const renderInboxSection = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>一覧</Text>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          「damage_report」かつ「notify_target=property」のみ表示
        </Text>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>ステータス</Text>
        <OptionChips
          options={ITEM15_INBOX_STATUS_OPTIONS}
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
          一覧（{ITEM15_STATUS_BUCKET_LABELS[inboxStatus] || inboxStatus}）
        </Text>
        {tickets.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象チケットはありません。</Text>
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
            一覧からチケットを選択してください。
          </Text>
        </View>
      ) : (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.panelTitle, { color: theme.text }]}>物品チケット詳細</Text>
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
            <Text style={[styles.fieldLabel, { color: theme.text }]}>添付画像</Text>
            {attachments.length === 0 ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>添付はありません。</Text>
            ) : (
              attachments.map((attachment) => {
                const imageUri = resolveAttachmentUri(attachment);
                const canShowImage =
                  isImageAttachment(attachment) && imageUri && !brokenImageMap[attachment.id];

                return (
                  <View key={attachment.id} style={[styles.photoCard, { borderColor: theme.border }]}>
                    {canShowImage ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                        onError={() => markImageBroken(attachment.id)}
                      />
                    ) : (
                      <View style={[styles.photoFallback, { borderColor: theme.border }]}>
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          画像プレビューを表示できません
                        </Text>
                      </View>
                    )}
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
                );
              })
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
              options={ITEM15_MESSAGE_KIND_OPTIONS}
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
            options={ITEM15_TICKET_STATUS_OPTIONS}
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
    if (section === 'detail') {
      return renderDetailSection();
    }
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
        {ITEM15_SECTION_OPTIONS.map((option) => {
          const selected = section === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.primary : theme.surface,
                },
              ]}
              onPress={() => setSection(option.value)}
            >
              <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 12 }}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>物品データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.scopeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.scopeTitle, { color: theme.text }]}>現在の物品スコープ</Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              ユーザー: {userInfo?.name || user?.email || user?.id || '-'}
            </Text>
            <Text style={[styles.scopeText, { color: theme.textSecondary }]}>
              「damage_report」専用一覧（対象外チケットは非表示）
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
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    padding: 12,
    gap: 10,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  sectionBlock: { gap: 10 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  inlinePanel: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  scopeCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  scopeTitle: { fontSize: 14, fontWeight: '700' },
  scopeText: { fontSize: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  photoCard: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  photoImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  photoFallback: {
    width: '100%',
    height: 220,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageItem: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 3 },
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
});

export default Item15Screen;
