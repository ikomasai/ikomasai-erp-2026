/**
 * 本部向け鍵管理パネル（リデザイン版）
 * 貸出/返却は KeyLoanTerminalModal（全画面端末）で行う。
 * パネル自体は「端末を開く」ボタン、貸出中一覧（団体別グループ）、
 * 施錠確認状況（フィルタ/サマリー/再貸出バッジ）、予約管理を担当する。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createKeyLoan,
  listKeyLoans,
  returnKeyAndCreateLockTask,
} from '../../../services/supabase/keyLoanService';
import {
  KEY_RESERVATION_STATUSES,
  listKeyReservations,
  updateKeyReservationStatus,
} from '../../../services/supabase/keyReservationService';
import KeyStatusBoardModal from './KeyStatusBoardModal';
import KeyLoanTerminalModal from './KeyLoanTerminalModal';

/**
 * 施錠確認結果の表示情報（ラベル・背景色・テキスト色・アイコン）
 * 色・ラベル・アイコンはここで一元管理する
 */
const LOCK_CHECK_INFO = {
  locked: { label: '施錠済', bgColor: '#22A06B20', textColor: '#22A06B', icon: '✅' },
  unlocked: { label: '未施錠', bgColor: '#D1242F20', textColor: '#D1242F', icon: '❌' },
  cannot_confirm: { label: '確認不可', bgColor: '#9F6E0020', textColor: '#9F6E00', icon: '⚠️' },
};

/**
 * 施錠確認フィルタの選択肢定数
 * key: フィルタ識別子 / label: 表示テキスト
 */
const LOCK_CHECK_FILTERS = [
  { key: 'pending', label: '⏳ 未確認のみ' },
  { key: 'all', label: '全て' },
  { key: 'done', label: '確認済' },
];

/** 予約ステータスの表示ラベル */
const RESERVATION_STATUS_LABELS = {
  [KEY_RESERVATION_STATUSES.PENDING]: '承認待ち',
  [KEY_RESERVATION_STATUSES.APPROVED]: '承認済み',
  [KEY_RESERVATION_STATUSES.REJECTED]: '却下',
  [KEY_RESERVATION_STATUSES.CANCELED]: '取消',
};

/**
 * 文字列の前後空白を除去するユーティリティ
 * @param {*} value - 入力値
 * @returns {string} トリム済み文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * 日時を短縮表示する（今日なら HH:MM、別日なら M/D HH:MM）
 * @param {string|null} dateStr - ISO 日時文字列
 * @returns {string} 短縮表示文字列
 */
const formatCompactDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  /** 同じ年月日かどうかを判定 */
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  /** HH:MM 形式 */
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (isToday) return hhmm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
};

/**
 * 鍵予約の表示用鍵ラベルを取得（コンポーネント外定義で安定参照を確保）
 * リレーション→メタデータ→key_code の順で優先する
 * @param {Object} reservation - 鍵予約オブジェクト
 * @returns {string} 表示用ラベル
 */
const getReservationKeyLabel = (reservation) => {
  const fromRelation = normalizeText(reservation?.keys?.display_name);
  if (fromRelation) return fromRelation;
  const fromMetadata = normalizeText(reservation?.metadata?.key_name);
  if (fromMetadata) return fromMetadata;
  return normalizeText(reservation?.key_code) || '鍵未設定';
};

/**
 * 検索バーコンポーネント
 * @param {Object} props
 * @param {string} props.value - 検索文字列
 * @param {(v: string) => void} props.onChange - 変更コールバック
 * @param {string} props.placeholder - プレースホルダーテキスト
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} 検索バー
 */
const SearchBar = ({ value, onChange, placeholder, theme }) => (
  <View
    style={[styles.searchBar, { backgroundColor: theme.background, borderColor: theme.border }]}
  >
    <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>🔍</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      style={[styles.searchInput, { color: theme.text }]}
      returnKeyType="search"
    />
    {value ? (
      <TouchableOpacity onPress={() => onChange('')}>
        <Text style={[styles.searchClearText, { color: theme.textSecondary }]}>✕</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

/**
 * 本部向け鍵管理パネル
 * @param {Object} props - プロパティ
 * @param {Object} props.theme - テーマ
 * @param {Object|null} props.user - ログインユーザー
 * @param {Function} [props.onLoanCreated] - 貸出登録後コールバック
 * @param {Function} [props.onLoanReturned] - 返却後コールバック
 * @returns {JSX.Element} 鍵管理パネル
 */
const HQKeyManagementPanel = ({ theme, user, onLoanCreated, onLoanReturned }) => {
  /** 貸出一覧（全ステータス含む） */
  const [keyLoans, setKeyLoans] = useState([]);
  /** 鍵予約一覧（全ステータス含む） */
  const [keyReservations, setKeyReservations] = useState([]);
  /** 貸出一覧読み込み中フラグ */
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);
  /** 鍵予約読み込み中フラグ */
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  /** 処理中フラグ（返却・予約操作） */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 全体表示ボードモーダルの表示フラグ */
  const [isBoardVisible, setIsBoardVisible] = useState(false);
  /** 貸出/返却端末モーダルの表示フラグ */
  const [isTerminalVisible, setIsTerminalVisible] = useState(false);
  /** 貸出中一覧の検索文字列 */
  const [loanSearch, setLoanSearch] = useState('');
  /** 施錠確認セクションの検索文字列 */
  const [lockSearch, setLockSearch] = useState('');
  /** 施錠確認フィルタ: 'pending'(未確認のみ) | 'all'(全て) | 'done'(確認済) */
  const [lockCheckFilter, setLockCheckFilter] = useState('pending');
  /** 予約一覧の検索文字列（承認待ち・対応済み共通） */
  const [reservationSearch, setReservationSearch] = useState('');
  /** 各セクションの折りたたみ状態（true = 折りたたみ中） */
  const [isLoansCollapsed, setIsLoansCollapsed] = useState(false);
  const [isLockCheckCollapsed, setIsLockCheckCollapsed] = useState(false);
  const [isPendingReservationsCollapsed, setIsPendingReservationsCollapsed] = useState(false);
  const [isResolvedReservationsCollapsed, setIsResolvedReservationsCollapsed] = useState(true);

  /**
   * メッセージ表示（Web/Native共通）
   * @param {string} title - タイトル
   * @param {string} message - 本文
   */
  const showMessage = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  /**
   * 現在貸出中の鍵ラベルセット
   * 施錠確認行での「再貸出中」バッジ表示に使用する
   * @type {Set<string>}
   */
  const loanedKeyLabelSet = useMemo(() => {
    const loaned = keyLoans.filter((loan) => loan.status === 'loaned');
    return new Set(loaned.map((loan) => loan.key_label).filter(Boolean));
  }, [keyLoans]);

  /**
   * 貸出中を event_name でグループ化した配列（検索フィルタ適用済み）
   * 各グループに orgName / earliestLoanedAt / loans を保持する
   * @type {Array<{orgName: string, earliestLoanedAt: string, loans: Array}>}
   */
  const loanedByOrg = useMemo(() => {
    const loaned = keyLoans.filter((loan) => loan.status === 'loaned');
    const query = normalizeText(loanSearch).toLowerCase();
    /** 鍵ラベル・借受人名・企画名で絞り込む */
    const filtered = query
      ? loaned.filter(
          (loan) =>
            (loan.key_label || '').toLowerCase().includes(query) ||
            (loan.borrower_name || '').toLowerCase().includes(query) ||
            (loan.event_name || '').toLowerCase().includes(query)
        )
      : loaned;
    /** event_name をキーとしてグループ化 */
    const groupMap = new Map();
    filtered.forEach((loan) => {
      const groupKey = normalizeText(loan.event_name) || '（企画名未設定）';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          orgName: groupKey,
          earliestLoanedAt: loan.loaned_at,
          loans: [],
        });
      }
      const group = groupMap.get(groupKey);
      group.loans.push(loan);
      /** より古い貸出時刻をグループ代表とする */
      if (loan.loaned_at < group.earliestLoanedAt) {
        group.earliestLoanedAt = loan.loaned_at;
      }
    });
    return Array.from(groupMap.values());
  }, [keyLoans, loanSearch]);

  /**
   * 施錠確認状況のサマリー（返却済み全件ベース・検索/フィルタ非適用）
   * @type {{ pending: number, locked: number, unlocked: number, cannotConfirm: number, total: number }}
   */
  const lockCheckSummary = useMemo(() => {
    const returned = keyLoans.filter((loan) => loan.status === 'returned');
    /** 施錠確認ステータス別に集計 */
    const pending = returned.filter((l) => !l.lock_check_status).length;
    const locked = returned.filter((l) => l.lock_check_status === 'locked').length;
    const unlocked = returned.filter((l) => l.lock_check_status === 'unlocked').length;
    const cannotConfirm = returned.filter((l) => l.lock_check_status === 'cannot_confirm').length;
    return { pending, locked, unlocked, cannotConfirm, total: returned.length };
  }, [keyLoans]);

  /**
   * 施錠確認対象一覧（フィルタ・検索・最新50件適用済み）
   * デフォルトは 'pending'（未確認のみ）でアクションが必要なものを前面に出す
   * @type {Array}
   */
  const lockCheckItems = useMemo(() => {
    const returned = keyLoans.filter((loan) => loan.status === 'returned').slice(0, 50);
    /** フィルタ適用 */
    let filtered;
    if (lockCheckFilter === 'pending') {
      /** 施錠確認ステータスが未設定のもの */
      filtered = returned.filter((l) => !l.lock_check_status);
    } else if (lockCheckFilter === 'done') {
      /** 施錠確認ステータスが設定済みのもの */
      filtered = returned.filter((l) => !!l.lock_check_status);
    } else {
      filtered = returned;
    }
    /** 検索クエリ適用 */
    const query = normalizeText(lockSearch).toLowerCase();
    if (!query) return filtered;
    return filtered.filter(
      (loan) =>
        (loan.key_label || '').toLowerCase().includes(query) ||
        (loan.borrower_name || '').toLowerCase().includes(query) ||
        (loan.event_name || '').toLowerCase().includes(query)
    );
  }, [keyLoans, lockCheckFilter, lockSearch]);

  /**
   * 承認待ち予約を event_name 単位でグループ化（検索フィルタ適用済み）
   * @type {Array<{eventName: string, eventLocation: string, earliestCreatedAt: string, reservations: Array}>}
   */
  const groupedPendingReservations = useMemo(() => {
    const pending = keyReservations.filter(
      (r) => r.status === KEY_RESERVATION_STATUSES.PENDING
    );
    const query = normalizeText(reservationSearch).toLowerCase();
    /** 企画名・場所・鍵名で絞り込む */
    const filtered = query
      ? pending.filter(
          (r) =>
            (r.event_name || '').toLowerCase().includes(query) ||
            (r.event_location || '').toLowerCase().includes(query) ||
            getReservationKeyLabel(r).toLowerCase().includes(query)
        )
      : pending;
    /** event_name をキーとしてグループ化 */
    const groupMap = new Map();
    filtered.forEach((r) => {
      const groupKey = normalizeText(r.event_name) || '（企画名未設定）';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          eventName: groupKey,
          eventLocation: normalizeText(r.event_location) || '-',
          earliestCreatedAt: r.created_at,
          reservations: [],
        });
      }
      const group = groupMap.get(groupKey);
      group.reservations.push(r);
      /** より古い申請日時をグループ代表とする */
      if (r.created_at < group.earliestCreatedAt) {
        group.earliestCreatedAt = r.created_at;
      }
    });
    return Array.from(groupMap.values());
  }, [keyReservations, reservationSearch]);

  /**
   * 対応済み予約（最新20件・予約検索バーと同一クエリ）
   * @type {Array}
   */
  const recentResolvedReservations = useMemo(() => {
    const resolved = keyReservations
      .filter((r) => r.status !== KEY_RESERVATION_STATUSES.PENDING)
      .slice(0, 20);
    const query = normalizeText(reservationSearch).toLowerCase();
    if (!query) return resolved;
    return resolved.filter(
      (r) =>
        (r.event_name || '').toLowerCase().includes(query) ||
        getReservationKeyLabel(r).toLowerCase().includes(query)
    );
  }, [keyReservations, reservationSearch]);

  /**
   * 貸出一覧を読み込む
   * @returns {Promise<void>} 読み込み処理
   */
  const loadKeyLoans = async () => {
    setIsLoadingLoans(true);
    const { data, error } = await listKeyLoans({ limit: 120 });
    setIsLoadingLoans(false);
    if (error) {
      console.error('鍵貸出一覧取得に失敗:', error);
      return;
    }
    setKeyLoans(data || []);
  };

  /**
   * 鍵予約一覧を読み込む
   * @returns {Promise<void>} 読み込み処理
   */
  const loadKeyReservations = async () => {
    setIsLoadingReservations(true);
    const { data, error } = await listKeyReservations({ limit: 120 });
    setIsLoadingReservations(false);
    if (error) {
      console.error('鍵予約一覧取得に失敗:', error);
      return;
    }
    setKeyReservations(data || []);
  };

  /**
   * 返却処理
   * - 'temporary'（返却）: 施錠確認依頼なしで即返却
   * - 'permanent'（完全返却）: 返却後に施錠確認依頼の有無を選択可能
   * @param {string} loanId - 貸出ID
   * @param {'temporary'|'permanent'} returnType - 返却種別
   * @returns {Promise<void>} 実行処理
   */
  const handleReturnLoan = async (loanId, returnType) => {
    if (!user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }
    /**
     * 施錠確認タスクを作成するか
     * 完全返却（permanent）の場合は常に施錠確認タスクを作成する
     */
    const createLockTask = returnType === 'permanent';

    setIsSubmitting(true);
    const { error } = await returnKeyAndCreateLockTask({
      loanId,
      createLockTask,
      returnUserId: user.id,
      optionalAssignee: null,
    });
    setIsSubmitting(false);

    if (error) {
      showMessage('返却エラー', error.message || '返却処理に失敗しました');
      return;
    }
    await loadKeyLoans();
    onLoanReturned?.();
  };

  /**
   * 鍵予約を承認/却下し、承認時は貸出記録を自動作成する
   * @param {string} reservationId - 予約ID
   * @param {'approved'|'rejected'} status - 更新ステータス
   * @returns {Promise<void>} 更新処理
   */
  const handleReservationDecision = async (reservationId, status) => {
    if (!user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }
    /**
     * 更新前の予約データを state から取得（keys join を含むため、貸出作成時の鍵ラベル解決に使用）
     */
    const originalReservation = keyReservations.find((r) => r.id === reservationId);

    setIsSubmitting(true);
    const { error } = await updateKeyReservationStatus({
      reservationId,
      status,
      approvedBy: user.id,
    });
    if (error) {
      setIsSubmitting(false);
      showMessage('更新エラー', error.message || '鍵予約の更新に失敗しました');
      return;
    }

    /** 承認時は貸出記録を自動作成する（承認＝貸し出し） */
    if (status === KEY_RESERVATION_STATUSES.APPROVED && originalReservation) {
      const keyCode = normalizeText(originalReservation.key_code);
      /** keys join を優先し、なければ metadata.key_name、最後に key_code を使用 */
      const keyLabel = getReservationKeyLabel(originalReservation);
      if (keyCode && keyLabel) {
        const { error: loanError } = await createKeyLoan({
          keyCode,
          keyLabel,
          eventName: normalizeText(originalReservation.event_name) || null,
          eventLocation: normalizeText(originalReservation.event_location) || null,
          metadata: {
            /** 予約IDをメタデータに保存して予約との紐付けを維持 */
            reservation_id: originalReservation.id,
            org_id: originalReservation.org_id || null,
          },
        });
        if (loanError) {
          console.warn('貸出自動作成エラー（承認後）:', loanError);
        }
      }
    }

    setIsSubmitting(false);
    await loadKeyReservations();
    /** 承認時は貸出一覧も再取得して即座に反映 */
    if (status === KEY_RESERVATION_STATUSES.APPROVED) {
      await loadKeyLoans();
    }
  };

  /**
   * グループ内の全予約を一括承認し、それぞれ貸出記録を自動作成する
   * @param {Array} reservations - 承認対象の予約配列（グループ内の全予約）
   * @returns {Promise<void>} 一括承認処理
   */
  const handleApproveGroup = async (reservations) => {
    if (!user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }
    if (reservations.length === 0) return;

    setIsSubmitting(true);
    /** 各予約を直列で承認→貸出作成（並列にすると DB 競合の可能性があるため） */
    for (const reservation of reservations) {
      const keyCode = normalizeText(reservation.key_code);
      /** keys join を優先し、なければ metadata.key_name、最後に key_code を使用 */
      const keyLabel = getReservationKeyLabel(reservation);

      const { error } = await updateKeyReservationStatus({
        reservationId: reservation.id,
        status: KEY_RESERVATION_STATUSES.APPROVED,
        approvedBy: user.id,
      });
      if (error) {
        console.error('一括承認エラー（一件）:', error);
        /** エラーがあっても次の予約の処理を継続 */
        continue;
      }

      /** 貸出記録を自動作成 */
      if (keyCode && keyLabel) {
        const { error: loanError } = await createKeyLoan({
          keyCode,
          keyLabel,
          eventName: normalizeText(reservation.event_name) || null,
          eventLocation: normalizeText(reservation.event_location) || null,
          metadata: {
            reservation_id: reservation.id,
            org_id: reservation.org_id || null,
          },
        });
        if (loanError) {
          console.warn('貸出自動作成エラー（一括承認後）:', loanError);
        }
      }
    }

    setIsSubmitting(false);
    /** 承認後に予約・貸出一覧を両方再取得 */
    await loadKeyReservations();
    await loadKeyLoans();
  };

  useEffect(() => {
    loadKeyLoans();
    loadKeyReservations();
  }, []);

  /**
   * 自動更新：30秒ごとに貸出・予約一覧を再取得する
   * 操作中の isSubmitting フラグが立っているときはスキップし、二重更新を防ぐ
   */
  useEffect(() => {
    /** 30秒間隔の更新タイマー */
    const interval = setInterval(() => {
      loadKeyLoans();
      loadKeyReservations();
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  /** 現在貸出中の鍵の合計件数 */
  const totalLoanedCount = keyLoans.filter((l) => l.status === 'loaned').length;
  /** 承認待ち予約の件数 */
  const pendingReservationCount = keyReservations.filter(
    (r) => r.status === KEY_RESERVATION_STATUSES.PENDING
  ).length;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ── ヘッダー ── */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>鍵貸出/返却（本部）</Text>
        <View style={styles.headerActions}>
          {/* 全体表示ボタン */}
          <TouchableOpacity
            style={[styles.boardButton, { backgroundColor: theme.primary }]}
            onPress={() => setIsBoardVisible(true)}
          >
            <Text style={styles.boardButtonText}>全体表示</Text>
          </TouchableOpacity>
          {/* 更新ボタン */}
          <TouchableOpacity
            style={[styles.refreshButton, { borderColor: theme.border }]}
            onPress={() => {
              loadKeyLoans();
              loadKeyReservations();
            }}
            disabled={isSubmitting}
          >
            <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 全体表示ボードモーダル */}
      <KeyStatusBoardModal
        visible={isBoardVisible}
        onClose={() => setIsBoardVisible(false)}
        theme={theme}
        user={user}
        onLoanCreated={loadKeyLoans}
        onLoanReturned={loadKeyLoans}
      />

      {/* 鍵貸出/返却端末モーダル（全画面） */}
      <KeyLoanTerminalModal
        visible={isTerminalVisible}
        onClose={() => setIsTerminalVisible(false)}
        theme={theme}
        user={user}
        onLoanCreated={() => {
          loadKeyLoans();
          onLoanCreated?.();
        }}
        onLoanReturned={() => {
          loadKeyLoans();
          onLoanReturned?.();
        }}
      />

      {/* 端末を開くボタン */}
      <TouchableOpacity
        style={[styles.terminalButton, { backgroundColor: theme.primary }]}
        onPress={() => setIsTerminalVisible(true)}
      >
        <Text style={styles.terminalButtonText}>🔑 鍵貸出・返却端末を開く</Text>
      </TouchableOpacity>

      {/* ══════════════════════════════════════════
          貸出中セクション（団体別グループ表示）
          ══════════════════════════════════════════ */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsLoansCollapsed((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={[styles.subTitle, styles.subTitleNoMargin, { color: theme.text }]}>
          貸出中（{totalLoanedCount}本）
        </Text>
        <Text style={[styles.collapseIcon, { color: theme.textSecondary }]}>
          {isLoansCollapsed ? '▶' : '▼'}
        </Text>
      </TouchableOpacity>
      {!isLoansCollapsed && (
        <>
      <SearchBar
        value={loanSearch}
        onChange={setLoanSearch}
        placeholder="鍵・借受人・企画名で検索"
        theme={theme}
      />
      {isLoadingLoans ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
      ) : loanedByOrg.length === 0 ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
          {loanSearch ? '検索結果がありません' : '貸出中の鍵はありません'}
        </Text>
      ) : (
        <View style={styles.list}>
          {loanedByOrg.map((group) => (
            <View
              key={group.orgName}
              style={[styles.orgGroup, { borderColor: theme.border, backgroundColor: theme.background }]}
            >
              {/* グループヘッダー：団体名 / 鍵数バッジ / 最初の貸出時刻 */}
              <View style={[styles.orgHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.orgName, { color: theme.text }]} numberOfLines={1}>
                  {group.orgName}
                </Text>
                <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.countBadgeText}>{group.loans.length}本</Text>
                </View>
                <Text style={[styles.orgTime, { color: theme.textSecondary }]}>
                  {formatCompactDateTime(group.earliestLoanedAt)}〜
                </Text>
              </View>
              {/* 鍵ごとの水平1行レイアウト */}
              {group.loans.map((loan, index) => (
                <View
                  key={loan.id}
                  style={[
                    styles.keyRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  ]}
                >
                  {/* 鍵ラベル */}
                  <Text style={[styles.keyLabel, { color: theme.primary }]} numberOfLines={1}>
                    🔑 {loan.key_label || '-'}
                  </Text>
                  {/* 借受人名（可変幅） */}
                  <Text style={[styles.keyBorrower, { color: theme.text }]} numberOfLines={1}>
                    {loan.borrower_name || '-'}
                  </Text>
                  {/* 貸出時刻 */}
                  <Text style={[styles.keyTime, { color: theme.textSecondary }]}>
                    {formatCompactDateTime(loan.loaned_at)}
                  </Text>
                  {/* 操作ボタン群 */}
                  <View style={styles.keyActions}>
                    <TouchableOpacity
                      style={[styles.subActionButton, { borderColor: theme.border }]}
                      onPress={() => handleReturnLoan(loan.id, 'temporary')}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.subActionText, { color: theme.textSecondary }]}>
                        返却
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.subActionButton, { borderColor: theme.border }]}
                      onPress={() => handleReturnLoan(loan.id, 'permanent')}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.subActionText, { color: theme.textSecondary }]}>
                        完全返却
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      </>
      )}

      {/* ══════════════════════════════════════════
          施錠確認状況セクション
          ══════════════════════════════════════════ */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsLockCheckCollapsed((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.subTitle, styles.subTitleNoMargin, { color: theme.text }]}>
            施錠確認状況
          </Text>
          {/* 未確認件数バッジ：折りたたみ中でも件数を把握できるよう常時表示 */}
          {lockCheckSummary.pending > 0 && (
            <View style={[styles.countBadge, { backgroundColor: '#3B5BDB' }]}>
              <Text style={styles.countBadgeText}>⏳ {lockCheckSummary.pending}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.collapseIcon, { color: theme.textSecondary }]}>
          {isLockCheckCollapsed ? '▶' : '▼'}
        </Text>
      </TouchableOpacity>
      {!isLockCheckCollapsed && (
        <>

      {/* サマリーバッジ行（未確認/施錠済/未施錠/確認不可を一覧表示） */}
      <View style={styles.lockSummaryRow}>
        <View style={styles.summaryBadgePending}>
          <Text style={styles.summaryBadgePendingText}>
            ⏳ 未確認 {lockCheckSummary.pending}
          </Text>
        </View>
        <View style={styles.summaryBadgeLocked}>
          <Text style={styles.summaryBadgeLockedText}>
            ✅ 施錠済 {lockCheckSummary.locked}
          </Text>
        </View>
        {/* 未施錠は件数があるときだけ強調表示 */}
        {lockCheckSummary.unlocked > 0 && (
          <View style={styles.summaryBadgeUnlocked}>
            <Text style={styles.summaryBadgeUnlockedText}>
              ❌ 未施錠 {lockCheckSummary.unlocked}
            </Text>
          </View>
        )}
        {/* 確認不可は件数があるときだけ表示 */}
        {lockCheckSummary.cannotConfirm > 0 && (
          <View style={styles.summaryBadgeCannotConfirm}>
            <Text style={styles.summaryBadgeCannotConfirmText}>
              ⚠️ 確認不可 {lockCheckSummary.cannotConfirm}
            </Text>
          </View>
        )}
      </View>

      {/* フィルタ pill 行（未確認のみ / 全て / 確認済） */}
      <View style={styles.filterRow}>
        {LOCK_CHECK_FILTERS.map((filter) => {
          /** 現在選択中のフィルタかどうか */
          const isActive = lockCheckFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              style={[
                styles.filterPill,
                {
                  backgroundColor: isActive ? theme.primary : theme.background,
                  borderColor: isActive ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setLockCheckFilter(filter.key)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: isActive ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 施錠確認 検索バー */}
      <SearchBar
        value={lockSearch}
        onChange={setLockSearch}
        placeholder="鍵・借受人・企画名で検索"
        theme={theme}
      />

      {/* 施錠確認 一覧 */}
      {lockCheckItems.length === 0 ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
          {lockSearch
            ? '検索結果がありません'
            : lockCheckFilter === 'pending'
            ? '未確認の施錠確認はありません ✅'
            : '該当データはありません'}
        </Text>
      ) : (
        <View style={styles.list}>
          {lockCheckItems.map((loan) => {
            /** 施錠確認結果の表示情報（未確認の場合は null） */
            const checkInfo = LOCK_CHECK_INFO[loan.lock_check_status] || null;
            /** この鍵が完全返却後に再借出されているかどうか */
            const isReloaned = loanedKeyLabelSet.has(loan.key_label);
            /** 未施錠の場合は赤背景で強調 */
            const isUnlocked = loan.lock_check_status === 'unlocked';
            return (
              <View
                key={loan.id}
                style={[
                  styles.lockCheckRow,
                  {
                    borderColor: isUnlocked ? '#D1242F' : theme.border,
                    backgroundColor: isUnlocked ? '#FFF8F8' : theme.background,
                    borderWidth: isUnlocked ? 2 : 1,
                  },
                ]}
              >
                {/* 鍵ラベル */}
                <Text style={[styles.keyLabel, { color: theme.primary }]} numberOfLines={1}>
                  🔑 {loan.key_label || '-'}
                </Text>
                {/* 団体名 / 借受人名 */}
                <Text style={[styles.lockCheckMeta, { color: theme.text }]} numberOfLines={1}>
                  {loan.event_name || '-'} / {loan.borrower_name || '-'}
                </Text>
                {/* 返却時刻 */}
                <Text style={[styles.lockCheckMeta, { color: theme.textSecondary }]}>
                  返却: {formatCompactDateTime(loan.returned_at)}
                </Text>
                {/* ステータスバッジ行 */}
                <View style={styles.lockCheckBadgeRow}>
                  {/* 施錠確認ステータスバッジ */}
                  {checkInfo ? (
                    <View style={[styles.lockBadge, { backgroundColor: checkInfo.bgColor }]}>
                      <Text style={[styles.lockBadgeText, { color: checkInfo.textColor }]}>
                        {checkInfo.icon} {checkInfo.label}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.lockBadge, { backgroundColor: '#E8EEFF' }]}>
                      <Text style={[styles.lockBadgeText, { color: '#3B5BDB' }]}>⏳ 未確認</Text>
                    </View>
                  )}
                  {/* 再貸出中バッジ：完全返却後に同じ鍵が再度貸出されている場合 */}
                  {isReloaned && (
                    <View style={[styles.lockBadge, { backgroundColor: '#FFF3CD' }]}>
                      <Text style={[styles.lockBadgeText, { color: '#9F6E00' }]}>🔄 再貸出中</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
        </>
      )}

      {/* ══════════════════════════════════════════
          鍵予約（承認待ち）
          ══════════════════════════════════════════ */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsPendingReservationsCollapsed((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.subTitle, styles.subTitleNoMargin, { color: theme.text }]}>
            鍵予約（承認待ち）
          </Text>
          {/* 承認待ち件数バッジ：折りたたみ中でも件数を把握できるよう常時表示 */}
          {pendingReservationCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: '#F0A500' }]}>
              <Text style={styles.countBadgeText}>{pendingReservationCount}件</Text>
            </View>
          )}
        </View>
        <Text style={[styles.collapseIcon, { color: theme.textSecondary }]}>
          {isPendingReservationsCollapsed ? '▶' : '▼'}
        </Text>
      </TouchableOpacity>
      {!isPendingReservationsCollapsed && (
        <>
      <SearchBar
        value={reservationSearch}
        onChange={setReservationSearch}
        placeholder="企画名・場所・鍵で検索"
        theme={theme}
      />
      {isLoadingReservations ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>読み込み中...</Text>
      ) : groupedPendingReservations.length === 0 ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
          {reservationSearch ? '検索結果がありません' : '承認待ちの鍵予約はありません'}
        </Text>
      ) : (
        <View style={styles.list}>
          {groupedPendingReservations.map((group) => (
            <View
              key={group.eventName}
              style={[styles.orgGroup, { borderColor: theme.border, backgroundColor: theme.background }]}
            >
              {/* グループヘッダー：企画名 / 鍵数バッジ / 申請日時 / 全て承認ボタン */}
              <View style={[styles.orgHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.orgName, { color: theme.text }]} numberOfLines={1}>
                  {group.eventName}
                </Text>
                <View style={[styles.countBadge, { backgroundColor: '#F0A500' }]}>
                  <Text style={styles.countBadgeText}>{group.reservations.length}本</Text>
                </View>
                <Text style={[styles.orgTime, { color: theme.textSecondary }]}>
                  申請: {formatCompactDateTime(group.earliestCreatedAt)}
                </Text>
                {/* 複数鍵の場合は一括承認ボタンを表示（単一鍵は個別ボタンで対応） */}
                {group.reservations.length > 1 && (
                  <TouchableOpacity
                    style={[styles.approveAllButton, { backgroundColor: '#22A06B' }]}
                    onPress={() => handleApproveGroup(group.reservations)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.approveAllButtonText}>全て承認</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* 場所情報 */}
              <Text
                style={[styles.orgSubMeta, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                場所: {group.eventLocation}
              </Text>
              {/* 鍵ごとのリスト（各鍵に承認・却下ボタン） */}
              {group.reservations.map((reservation, index) => (
                <View
                  key={reservation.id}
                  style={[
                    styles.keyRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    index === 0 && { borderTopColor: theme.border },
                  ]}
                >
                  {/* 鍵ラベル（flex: 1 で残スペースを占有して右にボタンを寄せる） */}
                  <Text
                    style={[styles.keyLabel, { color: theme.primary, flex: 1 }]}
                    numberOfLines={1}
                  >
                    🔑 {getReservationKeyLabel(reservation)}
                  </Text>
                  {/* 承認・却下ボタン */}
                  <View style={styles.keyActions}>
                    <TouchableOpacity
                      style={[styles.subActionButton, { borderColor: theme.border }]}
                      onPress={() =>
                        handleReservationDecision(reservation.id, KEY_RESERVATION_STATUSES.APPROVED)
                      }
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.subActionText, { color: '#22A06B' }]}>承認</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.subActionButton, { borderColor: theme.border }]}
                      onPress={() =>
                        handleReservationDecision(reservation.id, KEY_RESERVATION_STATUSES.REJECTED)
                      }
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.subActionText, { color: '#D1242F' }]}>却下</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
        </>
      )}

      {/* ══════════════════════════════════════════
          鍵予約（対応済み）
          ══════════════════════════════════════════ */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsResolvedReservationsCollapsed((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={[styles.subTitle, styles.subTitleNoMargin, { color: theme.text }]}>
          鍵予約（対応済み）
        </Text>
        <Text style={[styles.collapseIcon, { color: theme.textSecondary }]}>
          {isResolvedReservationsCollapsed ? '▶' : '▼'}
        </Text>
      </TouchableOpacity>
      {!isResolvedReservationsCollapsed && (
        <>
      {recentResolvedReservations.length === 0 ? (
        <Text style={[styles.helpText, { color: theme.textSecondary }]}>
          {reservationSearch ? '検索結果がありません' : '対応済みデータはまだありません'}
        </Text>
      ) : (
        <View style={styles.list}>
          {recentResolvedReservations.map((reservation) => (
            <View
              key={reservation.id}
              style={[
                styles.lockCheckRow,
                { borderColor: theme.border, backgroundColor: theme.background, borderWidth: 1 },
              ]}
            >
              {/* 鍵ラベル */}
              <Text style={[styles.keyLabel, { color: theme.primary }]} numberOfLines={1}>
                🔑 {getReservationKeyLabel(reservation)}
              </Text>
              {/* 企画名 */}
              <Text style={[styles.lockCheckMeta, { color: theme.text }]} numberOfLines={1}>
                {normalizeText(reservation.event_name) || '（企画名未設定）'}
              </Text>
              {/* ステータスバッジ + 対応日時 */}
              <View style={styles.lockCheckBadgeRow}>
                <View style={[styles.lockBadge, { backgroundColor: theme.border + '50' }]}>
                  <Text style={[styles.lockBadgeText, { color: theme.textSecondary }]}>
                    {RESERVATION_STATUS_LABELS[reservation.status] || reservation.status}
                  </Text>
                </View>
                <Text style={[styles.lockCheckMeta, { color: theme.textSecondary }]}>
                  {reservation.approved_at ? formatCompactDateTime(reservation.approved_at) : '-'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /** カード外枠 */
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  /** ヘッダー行：タイトル + ボタン群 */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** 全体表示ボタン */
  boardButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  boardButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  /** 端末を開くボタン（目立つ大きめデザイン） */
  terminalButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  terminalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  /** セクションタイトル */
  subTitle: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '700',
  },
  /** 折りたたみヘッダー行（タイトル + 矢印アイコン） */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 2,
  },
  /** sectionHeader 内の左側（タイトル + バッジ） */
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** 折りたたみ時にマージンを消すための上書き */
  subTitleNoMargin: {
    marginTop: 0,
    marginBottom: 0,
  },
  /** 折りたたみ矢印アイコン */
  collapseIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  /** 検索バー */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchClearText: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  /** リストコンテナ */
  list: {
    gap: 8,
  },
  /** 団体グループ外枠 */
  orgGroup: {
    borderWidth: 1,
    borderRadius: 10,
  },
  /** 団体グループヘッダー行（borderBottomColor は動的設定） */
  orgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  orgName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  /** 場所などのサブメタ情報（ヘッダー直下） */
  orgSubMeta: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingBottom: 4,
    paddingTop: 2,
  },
  /** 件数バッジ */
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  orgTime: {
    fontSize: 12,
  },
  /** 鍵1行：水平レイアウト（グループ内） */
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  /** 鍵ラベル（🔑 A-101 形式） */
  keyLabel: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 72,
  },
  /** 借受人名（可変幅） */
  keyBorrower: {
    flex: 1,
    fontSize: 12,
  },
  /** 時刻表示（右寄せ） */
  keyTime: {
    fontSize: 12,
    minWidth: 50,
    textAlign: 'right',
  },
  /** 操作ボタン群（水平配置） */
  keyActions: {
    flexDirection: 'row',
    gap: 6,
  },
  /** 返却・承認などの小さいアクションボタン */
  subActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 施錠確認 サマリーバッジ行 */
  lockSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  /** 未確認バッジ */
  summaryBadgePending: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#EEF2FF',
  },
  summaryBadgePendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B5BDB',
  },
  /** 施錠済バッジ */
  summaryBadgeLocked: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ECFDF5',
  },
  summaryBadgeLockedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22A06B',
  },
  /** 未施錠バッジ（件数がある場合のみ表示） */
  summaryBadgeUnlocked: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FEF2F2',
  },
  summaryBadgeUnlockedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D1242F',
  },
  /** 確認不可バッジ（件数がある場合のみ表示） */
  summaryBadgeCannotConfirm: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFFBEA',
  },
  summaryBadgeCannotConfirmText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9F6E00',
  },
  /** フィルタ pill 行 */
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /** 施錠確認行（borderWidth/borderColor/backgroundColor は動的設定） */
  lockCheckRow: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  lockCheckMeta: {
    fontSize: 12,
  },
  /** 施錠確認バッジ行（横並び・ラップあり） */
  lockCheckBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  /** 施錠確認ステータスバッジ / 再貸出バッジ共通 */
  lockBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  /** 更新ボタン */
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
  /** 空状態・読み込み中テキスト */
  helpText: {
    fontSize: 13,
    lineHeight: 20,
  },
  /** グループ一括承認ボタン */
  approveAllButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 4,
  },
  approveAllButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default HQKeyManagementPanel;
