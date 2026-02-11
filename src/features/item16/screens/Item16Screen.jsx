/**
 * Item16 screen (Exhibitor).
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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  ITEM16_PRIORITY_OPTIONS,
  ITEM16_REPORT_TYPE_OPTIONS,
  ITEM16_SECTION_OPTIONS,
  ITEM16_TICKET_STATUS_LABELS,
  ITEM16_TICKET_TYPE_OPTIONS,
} from '../constants';
import {
  appendTicketMessage,
  createKeyReservation,
  createTicketWithAutoTasks,
  selectExhibitorEvents,
  selectExhibitorOrganization,
  selectExhibitorTickets,
  selectReservableKeys,
  selectTicketDetail,
  selectTicketMessages,
} from '../services/item16Service';
import item16PayloadBuilder from '../utils/item16PayloadBuilder.js';

const { buildEventReportPayload, buildTicketPayload } = item16PayloadBuilder;

const SCREEN_NAME = '出展';

const TICKET_TYPE_LABEL_MAP = ITEM16_TICKET_TYPE_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});
const PRIORITY_LABEL_MAP = ITEM16_PRIORITY_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});
const TICKET_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'active', label: '対応中' },
  { value: 'done', label: '完了' },
];

const toLocalDateTimeText = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const toDateTimeInputValue = (date) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
};

const formatElapsedText = (value) => {
  if (!value) {
    return '-';
  }

  const created = new Date(value).getTime();
  if (Number.isNaN(created)) {
    return '-';
  }

  const totalMinutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}分`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}時間 ${minutes}分`;
};

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
            activeOpacity={0.88}
          >
            <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 12, fontWeight: '700' }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const Item16Screen = ({ navigation }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();
  const { width } = useWindowDimensions();

  const [section, setSection] = useState('tickets');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [organization, setOrganization] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [events, setEvents] = useState([]);
  const [keys, setKeys] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('all');

  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [isTicketDrawerOpen, setIsTicketDrawerOpen] = useState(false);
  const ticketDrawerProgress = useRef(new Animated.Value(0)).current;
  const ticketDrawerWidth = width;
  const ticketDrawerTranslateX = ticketDrawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [ticketDrawerWidth, 0],
  });

  const [ticketForm, setTicketForm] = useState({
    ticketType: 'emergency',
    priority: 'normal',
    eventId: '',
    locationId: '',
    title: '',
    description: '',
  });
  const [reportForm, setReportForm] = useState({
    reportType: 'start_report',
    eventId: '',
    memo: '',
  });
  const [reservationForm, setReservationForm] = useState({
    keyId: '',
    requestedStartAt: toDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    requestedEndAt: toDateTimeInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    reason: '',
  });

  const filteredTickets = useMemo(() => {
    if (ticketFilter === 'active') {
      return tickets.filter((ticket) =>
        ['new', 'acknowledged', 'in_progress', 'waiting_external'].includes(ticket.ticket_status)
      );
    }
    if (ticketFilter === 'done') {
      return tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.ticket_status));
    }
    return tickets;
  }, [ticketFilter, tickets]);

  const eventOptions = useMemo(
    () => events.map((event) => ({ value: event.id, label: event.name || event.id })),
    [events]
  );
  const keyOptions = useMemo(
    () =>
      keys.map((key) => ({
        value: key.id,
        label: `${key.key_code || 'KEY'} / ${key.display_name || '名称未設定'}`,
      })),
    [keys]
  );
  const activeTicketCount = useMemo(
    () =>
      tickets.filter((ticket) =>
        ['new', 'acknowledged', 'in_progress', 'waiting_external'].includes(ticket.ticket_status)
      ).length,
    [tickets]
  );

  const loadTickets = useCallback(async (organizationId) => {
    if (!organizationId) {
      setTickets([]);
      return;
    }

    const { tickets: list, error } = await selectExhibitorTickets(organizationId);
    if (error) {
      setTickets([]);
      setErrorMessage('連絡一覧の取得に失敗しました。');
      return;
    }

    setTickets(list || []);
  }, []);

  const loadThread = useCallback(async (ticketId) => {
    if (!ticketId) {
      setTicketDetail(null);
      setTicketMessages([]);
      return;
    }

    setIsThreadLoading(true);
    const [detailResult, messageResult] = await Promise.all([
      selectTicketDetail(ticketId),
      selectTicketMessages(ticketId),
    ]);
    setIsThreadLoading(false);

    if (detailResult.error) {
      setTicketDetail(null);
      setErrorMessage('連絡詳細の取得に失敗しました。');
    } else {
      setTicketDetail(detailResult.ticket || null);
    }

    if (messageResult.error) {
      setTicketMessages([]);
    } else {
      setTicketMessages(messageResult.messages || []);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      setErrorMessage('ログイン情報がありません。');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    const { organization: organizationRow, error: orgError } = await selectExhibitorOrganization(user.id);
    if (orgError || !organizationRow) {
      setIsLoading(false);
      setErrorMessage('出展団体の所属情報が見つかりません。');
      return;
    }

    setOrganization(organizationRow);

    const [ticketResult, eventResult, keyResult] = await Promise.all([
      selectExhibitorTickets(organizationRow.id),
      selectExhibitorEvents(organizationRow.id),
      selectReservableKeys(),
    ]);

    setTickets(ticketResult.tickets || []);
    setEvents(eventResult.events || []);
    setKeys(keyResult.keys || []);

    setTicketForm((previous) => ({
      ...previous,
      eventId: previous.eventId || eventResult.events?.[0]?.id || '',
    }));
    setReportForm((previous) => ({
      ...previous,
      eventId: previous.eventId || eventResult.events?.[0]?.id || '',
    }));
    setReservationForm((previous) => ({
      ...previous,
      keyId: previous.keyId || keyResult.keys?.[0]?.id || '',
    }));

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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

  useEffect(() => {
    loadThread(selectedTicketId);
  }, [loadThread, selectedTicketId]);

  const handleCreateTicket = async () => {
    if (!organization?.id || !user?.id) {
      return;
    }

    try {
      setIsBusy(true);
      const payload = buildTicketPayload({
        ...ticketForm,
        orgId: organization.id,
        createdBy: user.id,
      });
      const { result, error } = await createTicketWithAutoTasks(payload);
      if (error) {
        throw error;
      }

      Alert.alert('送信完了', `受付番号 ${result?.ticket_no || '-'} を作成しました。`);
      setTicketForm((previous) => ({
        ...previous,
        title: '',
        description: '',
      }));

      await loadTickets(organization.id);
      if (result?.ticket_id) {
        setSelectedTicketId(result.ticket_id);
      }
      setSection('tickets');
    } catch (error) {
      Alert.alert('送信失敗', error.message || '連絡作成に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!organization?.id || !user?.id || !reportForm.eventId) {
      return;
    }

    try {
      setIsBusy(true);
      const selectedEvent = events.find((event) => event.id === reportForm.eventId);
      const payload = buildEventReportPayload({
        ...reportForm,
        eventName: selectedEvent?.name || '',
        orgId: organization.id,
        orgName: organization.name,
        createdBy: user.id,
      });
      const { result, error } = await createTicketWithAutoTasks(payload);
      if (error) {
        throw error;
      }

      Alert.alert('送信完了', '開始/終了報告を送信しました。');
      setReportForm((previous) => ({ ...previous, memo: '' }));
      await loadTickets(organization.id);
      if (result?.ticket_id) {
        setSelectedTicketId(result.ticket_id);
      }
      setSection('tickets');
    } catch (error) {
      Alert.alert('送信失敗', error.message || '開始/終了報告に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePostReply = async () => {
    const trimmedBody = replyBody.trim();
    if (!selectedTicketId || !user?.id || !trimmedBody) {
      return;
    }

    setIsBusy(true);
    const { error } = await appendTicketMessage({
      ticketId: selectedTicketId,
      authorId: user.id,
      body: trimmedBody,
    });
    setIsBusy(false);

    if (error) {
      Alert.alert('投稿失敗', error.message || '返信投稿に失敗しました。');
      return;
    }

    setReplyBody('');
    await loadThread(selectedTicketId);
  };

  const handleCreateReservation = async () => {
    if (!organization?.id || !user?.id) {
      return;
    }

    try {
      setIsBusy(true);
      const { reservation, error } = await createKeyReservation({
        ...reservationForm,
        orgId: organization.id,
        requestedBy: user.id,
      });
      if (error) {
        throw error;
      }

      Alert.alert('申請完了', `予約番号: ${reservation?.reservation_no || '-'}`);
      setReservationForm((previous) => ({ ...previous, reason: '' }));
    } catch (error) {
      Alert.alert('申請失敗', error.message || '鍵事前申請に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const openTicketDrawer = useCallback(() => {
    setIsTicketDrawerOpen(true);
    Animated.timing(ticketDrawerProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [ticketDrawerProgress]);

  const closeTicketDrawer = useCallback(() => {
    Animated.timing(ticketDrawerProgress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsTicketDrawerOpen(false);
      }
    });
  }, [ticketDrawerProgress]);

  useEffect(() => {
    if (section !== 'tickets' && isTicketDrawerOpen) {
      closeTicketDrawer();
    }
  }, [closeTicketDrawer, isTicketDrawerOpen, section]);

  useEffect(() => {
    if (!selectedTicketId && isTicketDrawerOpen) {
      closeTicketDrawer();
    }
  }, [closeTicketDrawer, isTicketDrawerOpen, selectedTicketId]);

  const renderTicketSection = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>自団体の連絡一覧</Text>
          <TouchableOpacity
            style={[styles.buttonMini, { backgroundColor: theme.primary }]}
            onPress={() => loadTickets(organization?.id)}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>再取得</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>対応状況ごとに確認できます。</Text>
        <OptionChips
          options={TICKET_FILTER_OPTIONS}
          selectedValue={ticketFilter}
          onSelect={setTicketFilter}
          theme={theme}
        />

        {filteredTickets.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象の連絡はありません。</Text>
        ) : (
          filteredTickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={[
                styles.ticketCard,
                {
                  borderColor: ticket.id === selectedTicketId ? theme.primary : theme.border,
                  backgroundColor: theme.surfaceSecondary || theme.background,
                },
              ]}
              onPress={() => {
                setSelectedTicketId(ticket.id);
                openTicketDrawer();
              }}
              activeOpacity={0.9}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.itemNo, { color: theme.primary }]}>{ticket.ticket_no}</Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>経過: {formatElapsedText(ticket.created_at)}</Text>
              </View>
              <Text style={[styles.itemTitle, { color: theme.text }]}>{ticket.title}</Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                種別: {TICKET_TYPE_LABEL_MAP[ticket.ticket_type] || ticket.ticket_type}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                状態: {ITEM16_TICKET_STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status}
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>更新: {toLocalDateTimeText(ticket.updated_at)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );

  const renderTicketDetailSection = () => {
    if (!ticketDetail) {
      return (
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            一覧から連絡を選択すると、ここに詳細が表示されます。
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>連絡詳細</Text>
        <Text style={[styles.itemNo, { color: theme.primary }]}>{ticketDetail.ticket_no}</Text>
        <Text style={[styles.itemTitle, { color: theme.text }]}>{ticketDetail.title}</Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{ticketDetail.description}</Text>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          種別: {TICKET_TYPE_LABEL_MAP[ticketDetail.ticket_type] || ticketDetail.ticket_type}
        </Text>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          状態: {ITEM16_TICKET_STATUS_LABELS[ticketDetail.ticket_status] || ticketDetail.ticket_status}
        </Text>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          優先度: {PRIORITY_LABEL_MAP[ticketDetail.priority] || ticketDetail.priority}
        </Text>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          作成日時: {toLocalDateTimeText(ticketDetail.created_at)}
        </Text>

        <View style={[styles.inlinePanel, { borderColor: theme.border }]}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>返信スレッド</Text>
          {isThreadLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : ticketMessages.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>返信はまだありません。</Text>
          ) : (
            ticketMessages.map((message) => (
              <View
                key={message.id}
                style={[styles.messageCard, { borderColor: theme.border, backgroundColor: theme.background }]}
              >
                <Text style={[styles.metaTextStrong, { color: theme.text }]}>{message.author_name || message.author_id}</Text>
                <Text style={[styles.bodyText, { color: theme.text }]}>{message.body}</Text>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {toLocalDateTimeText(message.created_at)}
                </Text>
              </View>
            ))
          )}

          <TextInput
            style={[
              styles.inputMulti,
              {
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.surfaceSecondary || theme.background,
              },
            ]}
            value={replyBody}
            onChangeText={setReplyBody}
            placeholder="本部への追記や補足を入力"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handlePostReply}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>返信を投稿</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCreateSection = () => (
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.panelTitle, { color: theme.text }]}>新規連絡の作成</Text>
      <Text style={[styles.helperText, { color: theme.textSecondary }]}>緊急連絡・ルール問い合わせ・変更連絡をここから送信します。</Text>

      <Text style={[styles.fieldLabel, { color: theme.text }]}>種別</Text>
      <OptionChips
        options={ITEM16_TICKET_TYPE_OPTIONS}
        selectedValue={ticketForm.ticketType}
        onSelect={(ticketType) => setTicketForm((previous) => ({ ...previous, ticketType }))}
        theme={theme}
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>優先度</Text>
      <OptionChips
        options={ITEM16_PRIORITY_OPTIONS}
        selectedValue={ticketForm.priority}
        onSelect={(priority) => setTicketForm((previous) => ({ ...previous, priority }))}
        theme={theme}
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>対象企画</Text>
      {eventOptions.length === 0 ? (
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>紐付く企画がありません。運用担当者へ確認してください。</Text>
      ) : (
        <OptionChips
          options={eventOptions}
          selectedValue={ticketForm.eventId}
          onSelect={(eventId) => setTicketForm((previous) => ({ ...previous, eventId }))}
          theme={theme}
        />
      )}

      <Text style={[styles.fieldLabel, { color: theme.text }]}>件名</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={ticketForm.title}
        onChangeText={(title) => setTicketForm((previous) => ({ ...previous, title }))}
        placeholder="件名を入力"
        placeholderTextColor={theme.textSecondary}
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>詳細</Text>
      <TextInput
        style={[
          styles.inputMulti,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={ticketForm.description}
        onChangeText={(description) => setTicketForm((previous) => ({ ...previous, description }))}
        placeholder="状況、困っている点、希望対応を記載"
        placeholderTextColor={theme.textSecondary}
        multiline
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>場所ID（任意）</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={ticketForm.locationId}
        onChangeText={(locationId) => setTicketForm((previous) => ({ ...previous, locationId }))}
        placeholder="location_id (uuid)"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={handleCreateTicket}
        disabled={isBusy}
      >
        <Text style={styles.buttonText}>連絡を送信</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReportSection = () => (
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.panelTitle, { color: theme.text }]}>企画開始/終了報告</Text>
      <Text style={[styles.helperText, { color: theme.textSecondary }]}>送信後、本部と巡回の確認フローが開始されます。</Text>

      <Text style={[styles.fieldLabel, { color: theme.text }]}>報告種別</Text>
      <OptionChips
        options={ITEM16_REPORT_TYPE_OPTIONS}
        selectedValue={reportForm.reportType}
        onSelect={(reportType) => setReportForm((previous) => ({ ...previous, reportType }))}
        theme={theme}
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>対象企画</Text>
      {eventOptions.length === 0 ? (
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>対象企画がないため、報告を送信できません。</Text>
      ) : (
        <OptionChips
          options={eventOptions}
          selectedValue={reportForm.eventId}
          onSelect={(eventId) => setReportForm((previous) => ({ ...previous, eventId }))}
          theme={theme}
        />
      )}

      <Text style={[styles.fieldLabel, { color: theme.text }]}>補足メモ（任意）</Text>
      <TextInput
        style={[
          styles.inputMulti,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={reportForm.memo}
        onChangeText={(memo) => setReportForm((previous) => ({ ...previous, memo }))}
        placeholder="遅延や特記事項があれば記載"
        placeholderTextColor={theme.textSecondary}
        multiline
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={handleSubmitReport}
        disabled={isBusy || !reportForm.eventId}
      >
        <Text style={styles.buttonText}>報告を送信</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReservationSection = () => (
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.panelTitle, { color: theme.text }]}>鍵事前申請</Text>
      <Text style={[styles.helperText, { color: theme.textSecondary }]}>利用予定時刻を指定して申請します。承認後に予約確定となります。</Text>

      <Text style={[styles.fieldLabel, { color: theme.text }]}>対象鍵</Text>
      {keyOptions.length === 0 ? (
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>現在申請可能な鍵がありません。</Text>
      ) : (
        <OptionChips
          options={keyOptions}
          selectedValue={reservationForm.keyId}
          onSelect={(keyId) => setReservationForm((previous) => ({ ...previous, keyId }))}
          theme={theme}
        />
      )}

      <Text style={[styles.fieldLabel, { color: theme.text }]}>利用開始（YYYY-MM-DDTHH:mm）</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={reservationForm.requestedStartAt}
        onChangeText={(requestedStartAt) =>
          setReservationForm((previous) => ({ ...previous, requestedStartAt }))
        }
        placeholder="2026-02-10T09:00"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>利用終了（YYYY-MM-DDTHH:mm）</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={reservationForm.requestedEndAt}
        onChangeText={(requestedEndAt) =>
          setReservationForm((previous) => ({ ...previous, requestedEndAt }))
        }
        placeholder="2026-02-10T10:00"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
      />

      <Text style={[styles.fieldLabel, { color: theme.text }]}>利用理由（任意）</Text>
      <TextInput
        style={[
          styles.inputMulti,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.surfaceSecondary || theme.background,
          },
        ]}
        value={reservationForm.reason}
        onChangeText={(reason) => setReservationForm((previous) => ({ ...previous, reason }))}
        placeholder="利用用途を記載"
        placeholderTextColor={theme.textSecondary}
        multiline
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={handleCreateReservation}
        disabled={isBusy || !reservationForm.keyId}
      >
        <Text style={styles.buttonText}>鍵申請を送信</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSection = () => {
    if (section === 'create') {
      return renderCreateSection();
    }
    if (section === 'report') {
      return renderReportSection();
    }
    if (section === 'reservation') {
      return renderReservationSection();
    }
    return renderTicketSection();
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
        {ITEM16_SECTION_OPTIONS.map((item) => {
          const selected = section === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.sectionTabChip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.primary : theme.surface,
                },
              ]}
              onPress={() => {
                setSection(item.value);
                if (item.value !== 'tickets' && isTicketDrawerOpen) {
                  closeTicketDrawer();
                }
              }}
            >
              <Text style={[styles.sectionTabLabel, { color: selected ? '#FFFFFF' : theme.text }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>出展データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.scopeCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.rowBetween}>
              <View style={styles.scopeTextWrap}>
                <Text style={[styles.scopeTitle, { color: theme.text }]}>現在の出展担当範囲</Text>
                <Text style={[styles.scopeText, { color: theme.textSecondary }]}>団体: {organization?.name || '-'}</Text>
                <Text style={[styles.scopeText, { color: theme.textSecondary }]}>ユーザー: {userInfo?.name || user?.email || user?.id || '-'}</Text>
              </View>
              <View
                style={[
                  styles.countBadge,
                  {
                    borderColor: `${theme.primary}60`,
                    backgroundColor: `${theme.primary}16`,
                  },
                ]}
              >
                <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                <Text style={[styles.countBadgeText, { color: theme.primary }]}>対応中 {activeTicketCount}件</Text>
              </View>
            </View>
          </View>

          {errorMessage ? (
            <View style={[styles.panel, { borderColor: theme.error, backgroundColor: `${theme.error}10` }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {renderSection()}
        </ScrollView>
      )}

      {isTicketDrawerOpen ? (
        <View style={styles.drawerLayer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.drawerBackdrop,
              {
                opacity: ticketDrawerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.26],
                }),
              },
            ]}
          />
          <TouchableOpacity style={styles.drawerBackdropHit} activeOpacity={1} onPress={closeTicketDrawer} />

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: ticketDrawerWidth,
                borderLeftColor: theme.border,
                backgroundColor: theme.background,
                transform: [{ translateX: ticketDrawerTranslateX }],
              },
            ]}
          >
            <View style={[styles.drawerHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[styles.drawerTitle, { color: theme.text }]}>連絡詳細</Text>
              <TouchableOpacity
                style={[styles.drawerCloseButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={closeTicketDrawer}
              >
                <Text style={[styles.drawerCloseText, { color: theme.text }]}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.drawerContent}
              contentContainerStyle={styles.drawerContentContainer}
              showsVerticalScrollIndicator={false}
            >
              {renderTicketDetailSection()}
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
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
  scopeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scopeTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  scopeTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  scopeText: {
    fontSize: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ticketCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  messageCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  itemNo: {
    fontSize: 12,
    fontWeight: '800',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  metaTextStrong: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 12,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  helperText: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 88,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  button: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMini: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  countBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default Item16Screen;
