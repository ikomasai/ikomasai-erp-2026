/**
 * 鍵貸出/返却端末モーダル
 * 全画面表示で独立した貸出端末として動作する。
 * Web: position fixed でドロワーを含む全体を覆う
 * Native: Modal コンポーネントで全画面表示
 *
 * モード:
 *   null     → モード選択画面
 *   'borrow' → 貸出フロー（step=1: 入力, step=2: 確認）
 *   'return' → 返却フロー（貸出中一覧から複数選択して返却）
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KEY_CATALOG } from '../../item16/data/keyCatalog';
import {
  createKeyLoan,
  KEY_LOAN_STATUSES,
  listKeyLoans,
  returnKeyAndCreateLockTask,
} from '../../../services/supabase/keyLoanService';
import { ensureKeysSeededFromCatalog, listKeys } from '../../../services/supabase/keyMasterService';
import { selectAllUserProfiles } from '../../../services/supabase/userService';
import { selectAllOrganizations } from '../../../services/supabase/organizationService';
import { useTerminal } from '../../../shared/contexts/TerminalContext';

// ─── 定数 ────────────────────────────────────────────────────────────────────

/** 全画面 zIndex（ドロワーより上） */
const TERMINAL_Z_INDEX = 9999;

// ─── ユーティリティ ───────────────────────────────────────────────────────────

/**
 * 文字列正規化（trim）
 * @param {*} value - 入力値
 * @returns {string} trim済み文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * フォールバック用カタログから鍵オプションを生成する
 * DBが空の場合に使用する
 * @returns {Array} 鍵オプション一覧
 */
const toFallbackKeyOptions = () => {
  return KEY_CATALOG.map((item) => ({
    id: String(item.id),
    keyCode: String(item.id),
    label: `${item.building} / ${item.name}`,
    location: item.location || `${item.building} / ${item.name}`,
    name: item.name,
    building: item.building || '',
    classroomName: item.name || '',
  }));
};

// ─── SearchableDropdown サブコンポーネント ───────────────────────────────────

/**
 * 検索可能なプルダウンコンポーネント
 * position: absolute を使わずインラインフローで展開する。
 * これにより親 ScrollView の overflow: hidden にクリップされず、
 * タップイベントも確実に届く。
 * @param {Object} props - プロパティ
 * @param {Array<{id: string, name: string}>} props.options - 選択肢一覧
 * @param {{id: string, name: string}|null} props.value - 選択中オプション
 * @param {Function} props.onChange - 選択変更コールバック（option|null）
 * @param {string} props.placeholder - プレースホルダー
 * @param {Object} props.theme - テーマ
 * @returns {JSX.Element} プルダウンコンポーネント
 */
const SearchableDropdown = ({ options, value, onChange, placeholder, theme }) => {
  /** 検索クエリ */
  const [query, setQuery] = useState('');
  /** リスト展開フラグ */
  const [isOpen, setIsOpen] = useState(false);

  /** クエリで絞り込んだ選択肢（最大50件） */
  const filtered = useMemo(() => {
    const q = normalizeText(query).toLowerCase();
    const base = q ? options.filter((opt) => opt.name.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);

  /**
   * 選択肢をタップしたときの処理
   * @param {Object} opt - 選択したオプション
   * @returns {void}
   */
  const handleSelect = (opt) => {
    onChange(opt);
    setQuery('');
    setIsOpen(false);
  };

  /**
   * 選択をクリアする
   * @returns {void}
   */
  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
  };

  /** 選択済み: バッジ表示 */
  if (value) {
    return (
      <View style={[sdStyles.selectedBadge, { backgroundColor: `${theme.primary}18`, borderColor: theme.primary }]}>
        <Text style={[sdStyles.selectedBadgeText, { color: theme.primary }]} numberOfLines={1}>
          {value.name}
        </Text>
        <TouchableOpacity
          onPress={handleClear}
          style={sdStyles.clearButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[sdStyles.clearButtonText, { color: theme.primary }]}>×</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* 検索入力欄 */}
      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[sdStyles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
      />

      {/* ドロップダウンリスト（インラインフロー — absolute 不使用） */}
      {isOpen && filtered.length > 0 ? (
        <View style={[sdStyles.dropdownInline, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* maxHeight で高さを制限しスクロール可能にする */}
          <ScrollView
            style={sdStyles.dropdownScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {filtered.map((opt, idx) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  sdStyles.dropdownItem,
                  {
                    borderBottomColor: theme.border,
                    /** 最終行は下ボーダーなし */
                    borderBottomWidth: idx < filtered.length - 1 ? StyleSheet.hairlineWidth : 0,
                  },
                ]}
                onPress={() => handleSelect(opt)}
                activeOpacity={0.6}
              >
                <Text style={[sdStyles.dropdownItemText, { color: theme.text }]} numberOfLines={1}>
                  {opt.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
};

const sdStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  /** インラインフロー展開リスト（position: absolute を使わない） */
  dropdownInline: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  /** ドロップダウン内スクロール領域（最大高さで制限） */
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemText: {
    fontSize: 15,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  selectedBadgeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
});

// ─── メインコンポーネント ─────────────────────────────────────────────────────

/**
 * 鍵貸出/返却端末モーダル
 * @param {Object} props - プロパティ
 * @param {boolean} props.visible - 表示フラグ
 * @param {Function} props.onClose - 閉じるコールバック
 * @param {Object} props.theme - テーマ
 * @param {Object|null} props.user - ログインユーザー
 * @param {Function} [props.onLoanCreated] - 貸出登録後コールバック
 * @param {Function} [props.onLoanReturned] - 返却後コールバック
 * @returns {JSX.Element|null} 端末モーダル
 */
const KeyLoanTerminalModal = ({ visible, onClose, theme, user, onLoanCreated, onLoanReturned }) => {
  /** サイドバー制御（端末オープン中はドロワーを非表示） */
  const { openTerminal, closeTerminal } = useTerminal();

  /** 操作モード: null=選択中, 'borrow'=貸出, 'return'=返却 */
  const [mode, setMode] = useState(null);
  /** 貸出フローのステップ: 1=入力, 2=確認 */
  const [step, setStep] = useState(1);

  /** 借受人（ユーザープロフィール） */
  const [borrowerUser, setBorrowerUser] = useState(null);
  /** 団体 */
  const [organization, setOrganization] = useState(null);
  /** 選択中の棟名 */
  const [selectedBuilding, setSelectedBuilding] = useState('');
  /** 複数選択した鍵コード */
  const [selectedKeyCodes, setSelectedKeyCodes] = useState([]);
  /** 返却選択した貸出ID */
  const [selectedLoanIds, setSelectedLoanIds] = useState([]);

  /** ユーザープロフィール一覧 */
  const [userProfiles, setUserProfiles] = useState([]);
  /** 団体一覧 */
  const [organizations, setOrganizations] = useState([]);
  /** 鍵マスタ一覧 */
  const [keyOptions, setKeyOptions] = useState([]);
  /** 貸出一覧 */
  const [keyLoans, setKeyLoans] = useState([]);

  /** マスタデータ読み込み中フラグ */
  const [isLoading, setIsLoading] = useState(false);
  /** 貸出/返却処理中フラグ */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** デジタル時計用の現在時刻（1秒ごと更新） */
  const [clockTime, setClockTime] = useState(() => new Date());
  /** 返却モードの名前絞り込みフィルター */
  const [returnNameFilter, setReturnNameFilter] = useState('');
  /** 返却フローのステップ: 1=名前入力, 2=鍵選択 */
  const [returnStep, setReturnStep] = useState(1);

  // ─── ドロワーサイドバー制御 ──────────────────────────────────────────────────

  useEffect(() => {
    /** 端末を開いたときはサイドバーを隠し、閉じたときは戻す */
    if (visible) {
      openTerminal();
    } else {
      closeTerminal();
    }
    /** アンマウント時も必ず閉じる */
    return () => {
      closeTerminal();
    };
  }, [visible, openTerminal, closeTerminal]);

  // ─── Web ESCキー処理 ────────────────────────────────────────────────────────

  useEffect(() => {
    /** WebのみESCキーでモーダルを閉じる */
    if (!visible || Platform.OS !== 'web') {
      return;
    }

    /**
     * ESCキー押下ハンドラ
     * @param {KeyboardEvent} e - キーボードイベント
     * @returns {void}
     */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // ─── デジタル時計 ────────────────────────────────────────────────────────────

  useEffect(() => {
    /** 端末が表示中のみ1秒ごとに時刻を更新する */
    if (!visible) {
      return;
    }
    const timer = setInterval(() => {
      setClockTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [visible]);

  // ─── 表示時リセット ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      /** モーダルを開いたらモードと入力をリセット */
      setMode(null);
      resetBorrowForm();
      setSelectedLoanIds([]);
    }
  }, [visible]);

  // ─── データ読み込み ─────────────────────────────────────────────────────────

  /**
   * 全マスタデータを読み込む（ユーザー・団体・鍵・貸出一覧）
   * @returns {Promise<void>} 読み込み処理
   */
  const loadAllData = useCallback(async () => {
    setIsLoading(true);

    /** 全データを並行取得 */
    const [profilesResult, orgsResult, keysResult, loansResult] = await Promise.all([
      selectAllUserProfiles(),
      selectAllOrganizations(),
      listKeys({ activeOnly: true, limit: 500 }),
      listKeyLoans({ limit: 200 }),  // 貸出中・返却済み両方を取得
    ]);

    setIsLoading(false);

    /** ユーザープロフィールを設定 */
    if (!profilesResult.error) {
      setUserProfiles(
        (profilesResult.data || []).map((p) => ({
          id: p.user_id || p.id,
          name: normalizeText(p.name) || normalizeText(p.organization) || p.user_id || p.id,
        }))
      );
    }

    /** 団体一覧を設定 */
    if (!orgsResult.error) {
      setOrganizations(
        (orgsResult.data || []).map((o) => ({
          id: o.id,
          name: normalizeText(o.name),
        }))
      );
    }

    /** 鍵マスタを設定（DBが空ならカタログからシード） */
    let keysData = keysResult.data || [];
    if (!keysResult.error && keysData.length === 0) {
      const seeded = await ensureKeysSeededFromCatalog(KEY_CATALOG);
      keysData = seeded.data || [];
    }

    if (keysData.length > 0) {
      const rows = keysData.map((row) => {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        /** building カラム優先、なければ metadata.building を使用 */
        const building = normalizeText(row.building || metadata.building);
        /** classroom_name カラム優先、なければ display_name を使用 */
        const classroomName = normalizeText(row.classroom_name || metadata.name) || normalizeText(row.display_name);
        const fallbackLabel = [building, classroomName].filter(Boolean).join(' / ');
        return {
          id: row.id,
          keyCode: normalizeText(row.key_code) || row.id,
          label: normalizeText(row.display_name) || fallbackLabel || normalizeText(row.key_code) || row.id,
          location: normalizeText(row.location_text) || fallbackLabel || normalizeText(row.display_name),
          name: classroomName,
          building,
          classroomName,
        };
      });
      setKeyOptions(rows);
    } else {
      setKeyOptions(toFallbackKeyOptions());
    }

    /** 貸出中一覧を設定 */
    if (!loansResult.error) {
      setKeyLoans(loansResult.data || []);
    }
  }, []);

  /**
   * 貸出中一覧のみ再読み込み
   * @returns {Promise<void>} 読み込み処理
   */
  const reloadLoans = useCallback(async () => {
    const { data, error } = await listKeyLoans({ limit: 200 }); // 貸出中・返却済み両方
    if (!error) {
      setKeyLoans(data || []);
    }
  }, []);

  /** モーダルが可視になったときにデータを読み込む */
  useEffect(() => {
    if (visible) {
      loadAllData();
    }
  }, [visible, loadAllData]);

  // ─── 派生データ ─────────────────────────────────────────────────────────────

  /** 棟名一覧（ユニーク・ソート済み） */
  const buildingOptions = useMemo(() => {
    const seen = new Set();
    keyOptions.forEach((item) => {
      const b = normalizeText(item.building);
      if (b) {
        seen.add(b);
      }
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [keyOptions]);

  /** 選択棟の鍵一覧（棟未選択時は全件） */
  const filteredKeyOptions = useMemo(() => {
    if (!selectedBuilding) {
      return keyOptions;
    }
    return keyOptions.filter((item) => item.building === selectedBuilding);
  }, [keyOptions, selectedBuilding]);

  /** 選択済み鍵の情報一覧（確認画面・サマリー表示用） */
  const selectedKeys = useMemo(() => {
    return keyOptions.filter((item) => selectedKeyCodes.includes(item.keyCode));
  }, [keyOptions, selectedKeyCodes]);

  /** 現在貸出中のローン一覧（返却モード用） */
  const loanedItems = useMemo(() => {
    return keyLoans.filter((loan) => loan.status === KEY_LOAN_STATUSES.LOANED);
  }, [keyLoans]);

  /** 現在貸出中の鍵コードセット（グリッドでの貸出中表示用） */
  const loanedKeyCodeSet = useMemo(() => {
    return new Set(loanedItems.map((loan) => loan.key_code));
  }, [loanedItems]);

  /** 返却済みローン一覧（最新30件・履歴表示用） */
  const returnedItems = useMemo(() => {
    return keyLoans
      .filter((loan) => loan.status === KEY_LOAN_STATUSES.RETURNED)
      .slice(0, 30);
  }, [keyLoans]);

  /**
   * 返却モードで表示するローン一覧
   * 貸出中のみ対象に、returnNameFilter で借受人名・団体名を絞り込む
   */
  const filteredReturnLoans = useMemo(() => {
    const query = normalizeText(returnNameFilter).toLowerCase();
    if (!query) {
      return loanedItems;
    }
    return loanedItems.filter(
      (loan) =>
        (loan.borrower_name || '').toLowerCase().includes(query) ||
        (loan.event_name || '').toLowerCase().includes(query)
    );
  }, [loanedItems, returnNameFilter]);

  /**
   * 選択中の団体が過去に借りたことのある鍵一覧（ユニーク・最新順）
   * event_name または metadata.org_id で団体を照合する
   * 3日連続使用など、同じ鍵を再借用するときに役立てる
   */
  const orgPreviousKeys = useMemo(() => {
    if (!organization) {
      return [];
    }

    /** 対象団体の貸出履歴を絞り込む（名前 or org_id で照合） */
    const orgLoans = keyLoans.filter((loan) => {
      const nameMatch = loan.event_name === organization.name;
      const idMatch =
        loan.metadata &&
        typeof loan.metadata === 'object' &&
        loan.metadata.org_id === organization.id;
      return nameMatch || idMatch;
    });

    /** key_code でユニーク化しつつ鍵マスタ情報と結合（最新順に並んでいる前提） */
    const seen = new Set();
    const unique = [];
    for (const loan of orgLoans) {
      const code = loan.key_code;
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      /** keyOptions から対応する鍵マスタ情報を取得 */
      const keyInfo = keyOptions.find((k) => k.keyCode === code) || null;
      unique.push({
        keyCode: code,
        keyLabel: loan.key_label || keyInfo?.label || code,
        building: keyInfo?.building || '',
        classroomName: keyInfo?.classroomName || '',
      });
    }
    return unique;
  }, [organization, keyLoans, keyOptions]);

  /** 「確認へ」ボタンの活性条件 */
  const canProceedToConfirm = borrowerUser !== null && organization !== null && selectedKeyCodes.length > 0;

  // ─── フォームリセット ────────────────────────────────────────────────────────

  /**
   * 貸出フォームをリセット
   * @returns {void}
   */
  const resetBorrowForm = () => {
    setBorrowerUser(null);
    setOrganization(null);
    setSelectedBuilding('');
    setSelectedKeyCodes([]);
    setStep(1);
  };

  // ─── イベントハンドラ ────────────────────────────────────────────────────────

  /**
   * 鍵コードのトグル選択
   * @param {string} keyCode - 鍵コード
   * @returns {void}
   */
  const toggleKeyCode = (keyCode) => {
    setSelectedKeyCodes((prev) =>
      prev.includes(keyCode) ? prev.filter((c) => c !== keyCode) : [...prev, keyCode]
    );
  };

  /**
   * 貸出IDのトグル選択（返却モード用）
   * @param {string} loanId - 貸出ID
   * @returns {void}
   */
  const toggleLoanId = (loanId) => {
    setSelectedLoanIds((prev) =>
      prev.includes(loanId) ? prev.filter((id) => id !== loanId) : [...prev, loanId]
    );
  };

  /**
   * 団体の過去借用鍵を一括選択する
   * 現在貸出中の鍵は除外して選択に追加する
   * @returns {void}
   */
  const handleSelectAllOrgPreviousKeys = () => {
    /** 貸出中でない過去借用鍵のコードを取得 */
    const availableCodes = orgPreviousKeys
      .filter((item) => !loanedKeyCodeSet.has(item.keyCode))
      .map((item) => item.keyCode);
    setSelectedKeyCodes((prev) => {
      /** 既存の選択と結合してユニーク配列を作る */
      const merged = new Set([...prev, ...availableCodes]);
      return Array.from(merged);
    });
  };

  /**
   * 貸出実行（複数鍵をループ登録）
   * 一部失敗してもコミット済み分はそのまま保持し、結果を通知する
   * @returns {Promise<void>} 実行処理
   */
  const handleBorrowExecute = async () => {
    if (!borrowerUser || !organization || selectedKeyCodes.length === 0) {
      return;
    }

    setIsSubmitting(true);

    /** 成功件数・失敗件数カウンタ */
    let successCount = 0;
    let failCount = 0;

    for (const keyCode of selectedKeyCodes) {
      /** 鍵コードに対応する鍵情報を取得 */
      const keyInfo = keyOptions.find((k) => k.keyCode === keyCode);
      const { error } = await createKeyLoan({
        keyCode,
        keyLabel: keyInfo?.location || keyInfo?.label || keyCode,
        eventName: organization.name,
        borrowerName: borrowerUser.name,
        metadata: {
          org_id: organization.id,
          org_name: organization.name,
        },
      });

      if (error) {
        console.error(`鍵貸出登録エラー (keyCode=${keyCode}):`, error);
        failCount++;
      } else {
        successCount++;
      }
    }

    setIsSubmitting(false);

    /** 結果を通知 */
    if (failCount === 0) {
      if (Platform.OS === 'web') {
        window.alert(`貸出完了\n${successCount}件の鍵貸出を登録しました`);
      }
    } else {
      const message = `${successCount}件成功、${failCount}件失敗。失敗した鍵は手動で確認してください`;
      if (Platform.OS === 'web') {
        window.alert(`貸出結果\n${message}`);
      }
    }

    /** コールバックを呼んでリセット */
    onLoanCreated?.();
    await reloadLoans();
    resetBorrowForm();
    setMode(null);
  };

  /**
   * 返却実行（選択した複数貸出をループ処理）
   * 端末からの返却は常に施錠確認タスクを作成する
   * @returns {Promise<void>} 実行処理
   */
  const handleReturnExecute = async () => {
    if (selectedLoanIds.length === 0 || !user?.id) {
      return;
    }

    setIsSubmitting(true);

    /** 成功件数・失敗件数カウンタ */
    let successCount = 0;
    let failCount = 0;

    for (const loanId of selectedLoanIds) {
      const { error } = await returnKeyAndCreateLockTask({
        loanId,
        createLockTask: true,
        returnUserId: user.id,
        optionalAssignee: null,
      });

      if (error) {
        console.error(`鍵返却エラー (loanId=${loanId}):`, error);
        failCount++;
      } else {
        successCount++;
      }
    }

    setIsSubmitting(false);

    /** 結果を通知 */
    if (failCount === 0) {
      if (Platform.OS === 'web') {
        window.alert(`返却完了\n${successCount}件の返却と施錠確認タスクを登録しました`);
      }
    } else {
      const message = `${successCount}件成功、${failCount}件失敗。失敗した貸出は手動で確認してください`;
      if (Platform.OS === 'web') {
        window.alert(`返却結果\n${message}`);
      }
    }

    /** コールバックを呼んでリセット */
    onLoanReturned?.();
    await reloadLoans();
    setSelectedLoanIds([]);
    setMode(null);
  };

  // ─── レンダリング ────────────────────────────────────────────────────────────

  /** 非表示時は何も描画しない */
  if (!visible) {
    return null;
  }

  /**
   * 画面コンテンツを返す
   * @returns {JSX.Element} 内部コンテンツ
   */
  const renderContent = () => (
    <View style={[styles.inner, { backgroundColor: theme.background }]}>
      {/* ヘッダー（左: タイトル / 中央: デジタル時計 / 右: 閉じる） */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {/* 左: タイトル */}
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {mode === null ? '🔑 鍵貸出/返却端末' : mode === 'borrow' ? '🔑 鍵貸出' : '🔑 鍵返却'}
          </Text>
        </View>

        {/* 中央: デジタル時計 */}
        <View style={styles.headerCenter}>
          <Text style={[styles.clock, { color: theme.primary }]}>
            {clockTime.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </Text>
          <Text style={[styles.clockDate, { color: theme.textSecondary }]}>
            {clockTime.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              weekday: 'short',
            })}
          </Text>
        </View>

        {/* 右: 閉じるボタン */}
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { borderColor: theme.border }]}>
            <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>✕ 閉じる</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ローディング表示 */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>データを読み込み中...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── モード選択 ── */}
          {mode === null ? renderModeSelect() : null}

          {/* ── 貸出フロー ── */}
          {mode === 'borrow' && step === 1 ? renderBorrowInput() : null}
          {mode === 'borrow' && step === 2 ? renderBorrowConfirm() : null}

          {/* ── 返却フロー ── */}
          {mode === 'return' ? renderReturnMode() : null}
        </ScrollView>
      )}
    </View>
  );

  /**
   * モード選択画面を返す
   * @returns {JSX.Element} モード選択UI
   */
  const renderModeSelect = () => (
    <View style={styles.modeSelectContainer}>
      <Text style={[styles.modeSelectSubtitle, { color: theme.textSecondary }]}>
        操作を選択してください
      </Text>
      <TouchableOpacity
        style={[styles.modeBigButton, { backgroundColor: theme.primary }]}
        onPress={() => {
          setMode('borrow');
          setStep(1);
        }}
      >
        <Text style={styles.modeBigButtonIcon}>📤</Text>
        <Text style={styles.modeBigButtonText}>鍵を貸し出す</Text>
        <Text style={styles.modeBigButtonSub}>借受人・団体・鍵を選択して登録</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeBigButton, { backgroundColor: '#1A7F37' }]}
        onPress={() => {
          setMode('return');
          setReturnStep(1);
          setReturnNameFilter('');
          setSelectedLoanIds([]);
        }}
      >
        <Text style={styles.modeBigButtonIcon}>📥</Text>
        <Text style={styles.modeBigButtonText}>鍵を返却する</Text>
        <Text style={styles.modeBigButtonSub}>貸出中の鍵を選択して返却</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * 貸出入力画面（Step 1）を返す
   * @returns {JSX.Element} 貸出入力UI
   */
  const renderBorrowInput = () => (
    <View style={styles.section}>
      {/* ① 借受人選択 */}
      <Text style={[styles.label, { color: theme.text }]}>① 借受人を選択 *</Text>
      <SearchableDropdown
        options={userProfiles}
        value={borrowerUser}
        onChange={setBorrowerUser}
        placeholder="名前で検索..."
        theme={theme}
      />

      {/* ② 団体選択 */}
      <Text style={[styles.label, { color: theme.text }]}>② 団体を選択 *</Text>
      <SearchableDropdown
        options={organizations}
        value={organization}
        onChange={setOrganization}
        placeholder="団体名で検索..."
        theme={theme}
      />

      {/* ─── この団体の過去借用鍵（団体選択後に表示） ─── */}
      {organization && orgPreviousKeys.length > 0 ? (
        <View style={[styles.orgHistoryBox, { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}40` }]}>
          <View style={styles.orgHistoryHeader}>
            <Text style={[styles.orgHistoryTitle, { color: theme.primary }]}>
              ⭐ この団体の過去の借用鍵（{orgPreviousKeys.length}種類）
            </Text>
            <TouchableOpacity
              style={[styles.orgHistorySelectAllButton, { backgroundColor: theme.primary }]}
              onPress={handleSelectAllOrgPreviousKeys}
            >
              <Text style={styles.orgHistorySelectAllText}>前回と同じ鍵を全選択</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.orgHistoryHint, { color: theme.textSecondary }]}>
            タップで個別に追加できます。貸出中の鍵はグレー表示。
          </Text>
          <View style={styles.orgHistoryGrid}>
            {orgPreviousKeys.map((item) => {
              /** 既に選択済みかどうか */
              const isAlreadySelected = selectedKeyCodes.includes(item.keyCode);
              /** 現在貸出中かどうか */
              const isCurrentlyLoaned = loanedKeyCodeSet.has(item.keyCode);
              return (
                <TouchableOpacity
                  key={item.keyCode}
                  style={[
                    styles.orgHistoryChip,
                    isAlreadySelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                    !isAlreadySelected && isCurrentlyLoaned && { backgroundColor: theme.background, borderColor: theme.border, opacity: 0.5 },
                    !isAlreadySelected && !isCurrentlyLoaned && { backgroundColor: theme.surface, borderColor: `${theme.primary}60` },
                  ]}
                  onPress={() => {
                    if (!isCurrentlyLoaned) {
                      toggleKeyCode(item.keyCode);
                    }
                  }}
                  disabled={isCurrentlyLoaned}
                >
                  {item.building ? (
                    <Text style={[styles.orgHistoryChipBuilding, { color: isAlreadySelected ? 'rgba(255,255,255,0.75)' : theme.textSecondary }]}>
                      {item.building}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.orgHistoryChipName, { color: isAlreadySelected ? '#FFFFFF' : isCurrentlyLoaned ? theme.textSecondary : theme.text }]}
                    numberOfLines={2}
                  >
                    {isAlreadySelected ? '✓ ' : ''}{item.classroomName || item.keyLabel}
                  </Text>
                  {isCurrentlyLoaned ? (
                    <Text style={[styles.orgHistoryChipBadge, { color: '#D1242F' }]}>貸出中</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ─── 選択済み鍵サマリー（棟をまたいで常時表示） ─── */}
      {selectedKeys.length > 0 ? (
        <View style={[styles.selectedSummary, { backgroundColor: `${theme.primary}0F`, borderColor: theme.primary }]}>
          <Text style={[styles.selectedSummaryTitle, { color: theme.primary }]}>
            選択中の鍵 {selectedKeys.length}件
          </Text>
          <View style={styles.selectedSummaryList}>
            {selectedKeys.map((key) => (
              <TouchableOpacity
                key={key.keyCode}
                style={[styles.selectedSummaryChip, { backgroundColor: theme.primary }]}
                onPress={() => toggleKeyCode(key.keyCode)}
              >
                <Text style={styles.selectedSummaryChipText} numberOfLines={1}>
                  {key.building ? `${key.building} ` : ''}{key.classroomName || key.label}
                </Text>
                <Text style={styles.selectedSummaryChipClose}> ×</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* ③ 棟選択（変更しても選択はリセットされない） */}
      <Text style={[styles.label, { color: theme.text }]}>③ 棟を選択して教室を選ぶ（複数棟可）</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScrollContent}
        style={styles.pillScroll}
      >
        <TouchableOpacity
          style={[
            styles.pill,
            {
              backgroundColor: !selectedBuilding ? theme.primary : theme.background,
              borderColor: !selectedBuilding ? theme.primary : theme.border,
            },
          ]}
          onPress={() => setSelectedBuilding('')}
        >
          <Text style={[styles.pillText, { color: !selectedBuilding ? '#FFFFFF' : theme.textSecondary }]}>
            すべて
          </Text>
        </TouchableOpacity>
        {buildingOptions.map((building) => {
          /** 選択中かどうか */
          const isBuildingSelected = selectedBuilding === building;
          /** この棟から選択済みの鍵数 */
          const selectedCountInBuilding = selectedKeys.filter((k) => k.building === building).length;
          return (
            <TouchableOpacity
              key={building}
              style={[
                styles.pill,
                {
                  backgroundColor: isBuildingSelected ? theme.primary : theme.background,
                  borderColor: isBuildingSelected ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedBuilding(isBuildingSelected ? '' : building)}
            >
              <Text style={[styles.pillText, { color: isBuildingSelected ? '#FFFFFF' : theme.textSecondary }]}>
                {building}
                {selectedCountInBuilding > 0 ? ` ✓${selectedCountInBuilding}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ④ 教室（鍵）グリッド — 貸出中はバッジ付きで表示 */}
      <View style={styles.keyGrid}>
        {filteredKeyOptions.map((item) => {
          /** この鍵を選択中かどうか */
          const isSelected = selectedKeyCodes.includes(item.keyCode);
          /** この鍵が現在貸出中かどうか */
          const isLoaned = loanedKeyCodeSet.has(item.key_code || item.keyCode);
          return (
            <TouchableOpacity
              key={item.id || item.keyCode}
              style={[
                styles.keyCard,
                isSelected && { backgroundColor: `${theme.primary}1A`, borderColor: theme.primary, borderWidth: 2 },
                !isSelected && isLoaned && { backgroundColor: '#D1242F0D', borderColor: '#D1242F' },
                !isSelected && !isLoaned && { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 },
              ]}
              onPress={() => toggleKeyCode(item.keyCode)}
            >
              <Text style={[styles.keyCardCode, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.keyCode}
              </Text>
              <Text
                style={[styles.keyCardName, { color: isSelected ? theme.primary : isLoaned ? '#D1242F' : theme.text }]}
                numberOfLines={2}
              >
                {item.classroomName || item.name || item.label}
              </Text>
              {isLoaned ? (
                <Text style={styles.keyCardLoanedBadge}>貸出中</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 確認へボタン */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: canProceedToConfirm ? theme.primary : theme.border },
        ]}
        onPress={() => {
          if (canProceedToConfirm) {
            setStep(2);
          }
        }}
        disabled={!canProceedToConfirm}
      >
        <Text style={styles.primaryButtonText}>
          {canProceedToConfirm
            ? `確認へ（${selectedKeyCodes.length}件）`
            : '借受人・団体・教室を選択してください'}
        </Text>
      </TouchableOpacity>

      {/* 戻るボタン */}
      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: theme.border }]}
        onPress={() => {
          resetBorrowForm();
          setMode(null);
        }}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>← モード選択に戻る</Text>
      </TouchableOpacity>

      {/* ─── 最近の貸出履歴（返却済み） ─── */}
      {returnedItems.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={[styles.historySectionTitle, { color: theme.textSecondary }]}>
            最近の貸出履歴（返却済み）
          </Text>
          {returnedItems.map((loan) => (
            <View
              key={loan.id}
              style={[styles.historyRow, { borderColor: theme.border, backgroundColor: theme.background }]}
            >
              <Text style={[styles.historyLabel, { color: theme.text }]} numberOfLines={1}>
                {loan.key_label}
              </Text>
              <Text style={[styles.historyMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                {loan.borrower_name || '-'}　{loan.event_name || '-'}
              </Text>
              <Text style={[styles.historyMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                貸出: {loan.loaned_at ? new Date(loan.loaned_at).toLocaleString('ja-JP') : '-'}
              </Text>
              <Text style={[styles.historyMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                返却: {loan.returned_at ? new Date(loan.returned_at).toLocaleString('ja-JP') : '-'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  /**
   * 貸出確認画面（Step 2）を返す
   * @returns {JSX.Element} 貸出確認UI
   */
  const renderBorrowConfirm = () => (
    <View style={styles.section}>
      <Text style={[styles.confirmTitle, { color: theme.text }]}>貸出内容の確認</Text>

      <View style={[styles.confirmCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.confirmLabel, { color: theme.textSecondary }]}>借受人</Text>
        <Text style={[styles.confirmValue, { color: theme.text }]}>{borrowerUser?.name || '-'}</Text>

        <Text style={[styles.confirmLabel, { color: theme.textSecondary }]}>団体</Text>
        <Text style={[styles.confirmValue, { color: theme.text }]}>{organization?.name || '-'}</Text>

        <Text style={[styles.confirmLabel, { color: theme.textSecondary }]}>貸出鍵（{selectedKeys.length}件）</Text>
        {selectedKeys.map((key) => (
          <Text key={key.keyCode} style={[styles.confirmKeyItem, { color: theme.text }]}>
            • {key.label}
          </Text>
        ))}
      </View>

      {/* 貸出実行ボタン */}
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: isSubmitting ? theme.border : theme.primary }]}
        onPress={handleBorrowExecute}
        disabled={isSubmitting}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? '貸出処理中...' : `貸出実行（${selectedKeys.length}件）`}
        </Text>
      </TouchableOpacity>

      {/* 戻るボタン */}
      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: theme.border }]}
        onPress={() => setStep(1)}
        disabled={isSubmitting}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>← 入力に戻る</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * 返却モード画面を返す（ステップで分岐）
   * @returns {JSX.Element} 返却UI
   */
  const renderReturnMode = () => {
    if (returnStep === 1) {
      return renderReturnNameStep();
    }
    return renderReturnSelectStep();
  };

  /**
   * 返却 Step 1: 名前入力画面
   * @returns {JSX.Element} 名前入力UI
   */
  const renderReturnNameStep = () => (
    <View style={styles.section}>
      <Text style={[styles.returnNameTitle, { color: theme.text }]}>返却者の名前を入力してください</Text>
      <Text style={[styles.helpText, { color: theme.textSecondary }]}>
        名前や団体名で絞り込めます。空欄のまま次へ進むと全件表示します。
      </Text>

      {/* 大きな名前入力欄 */}
      <View style={[styles.returnNameInputBox, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
        <TextInput
          style={[styles.returnNameInput, { color: theme.text }]}
          value={returnNameFilter}
          onChangeText={setReturnNameFilter}
          placeholder="例：山田、企画管理部..."
          placeholderTextColor={theme.textSecondary}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => setReturnStep(2)}
        />
        {returnNameFilter.length > 0 ? (
          <TouchableOpacity onPress={() => setReturnNameFilter('')} style={styles.returnNameClear}>
            <Text style={[styles.returnFilterClearText, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 次へボタン */}
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={() => setReturnStep(2)}
      >
        <Text style={styles.primaryButtonText}>
          {returnNameFilter ? `「${returnNameFilter}」で検索 →` : '全件表示 →'}
        </Text>
      </TouchableOpacity>

      {/* 戻るボタン */}
      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: theme.border }]}
        onPress={() => {
          setSelectedLoanIds([]);
          setReturnNameFilter('');
          setMode(null);
        }}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>← モード選択に戻る</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * 返却 Step 2: 鍵選択・返却実行画面
   * @returns {JSX.Element} 鍵選択UI
   */
  const renderReturnSelectStep = () => (
    <View style={styles.section}>
      {/* フィルター状態表示 + 名前入力へ戻るリンク */}
      <View style={styles.returnStepHeader}>
        <Text style={[styles.returnStepHeaderText, { color: theme.text }]}>
          {returnNameFilter ? `「${returnNameFilter}」の貸出` : '全ての貸出中'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setSelectedLoanIds([]);
            setReturnStep(1);
          }}
          style={[styles.returnStepBackLink, { borderColor: theme.border }]}
        >
          <Text style={[styles.returnStepBackLinkText, { color: theme.primary }]}>← 名前を変更</Text>
        </TouchableOpacity>
      </View>

      {/* 件数表示 */}
      <Text style={[styles.helpText, { color: theme.textSecondary }]}>
        {returnNameFilter
          ? `${loanedItems.length}件中 ${filteredReturnLoans.length}件を表示 ／ `
          : `貸出中 ${loanedItems.length}件 ／ `}
        {selectedLoanIds.length}件選択中 ※ 返却と同時に施錠確認タスクが自動作成されます
      </Text>

      {loanedItems.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>貸出中の鍵はありません</Text>
      ) : filteredReturnLoans.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          「{returnNameFilter}」に一致する貸出はありません
        </Text>
      ) : (
        <View style={styles.loanList}>
          {filteredReturnLoans.map((loan) => {
            /** 選択中かどうか */
            const isSelected = selectedLoanIds.includes(loan.id);
            return (
              <TouchableOpacity
                key={loan.id}
                style={[
                  styles.loanCard,
                  {
                    backgroundColor: isSelected ? `${theme.primary}1A` : theme.background,
                    borderColor: isSelected ? theme.primary : theme.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => toggleLoanId(loan.id)}
              >
                <View style={styles.loanCardHeader}>
                  {isSelected ? (
                    <Text style={[styles.loanCardCheck, { color: theme.primary }]}>✓</Text>
                  ) : (
                    <Text style={[styles.loanCardCheck, { color: theme.border }]}>○</Text>
                  )}
                  <Text style={[styles.loanCardLabel, { color: theme.text }]} numberOfLines={1}>
                    {loan.key_label}
                  </Text>
                </View>
                <Text style={[styles.loanCardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  借受人: {loan.borrower_name || '-'}
                </Text>
                <Text style={[styles.loanCardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  団体: {loan.event_name || '-'}
                </Text>
                <Text style={[styles.loanCardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  貸出: {loan.loaned_at ? new Date(loan.loaned_at).toLocaleString('ja-JP') : '-'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 返却実行ボタン */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          {
            backgroundColor:
              selectedLoanIds.length > 0 && !isSubmitting ? '#1A7F37' : theme.border,
          },
        ]}
        onPress={handleReturnExecute}
        disabled={selectedLoanIds.length === 0 || isSubmitting}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? '返却処理中...' : `返却実行（${selectedLoanIds.length}件）`}
        </Text>
      </TouchableOpacity>

      {/* 戻るボタン */}
      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: theme.border }]}
        onPress={() => {
          setSelectedLoanIds([]);
          setReturnNameFilter('');
          setReturnStep(1);
          setMode(null);
        }}
        disabled={isSubmitting}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>← モード選択に戻る</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── プラットフォーム別レンダリング ──────────────────────────────────────────

  if (Platform.OS === 'web') {
    /**
     * Web: position fixed で全体を覆うオーバーレイ
     * ドロワーも含めて完全に隠す
     */
    return (
      <View
        style={[
          styles.webOverlay,
          { backgroundColor: theme.background, zIndex: TERMINAL_Z_INDEX },
        ]}
      >
        {renderContent()}
      </View>
    );
  }

  /**
   * Native: Modal コンポーネントで全画面表示
   */
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.nativeContainer, { backgroundColor: theme.background }]}>
        {renderContent()}
      </View>
    </Modal>
  );
};

// ─── スタイル ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /** Web全画面オーバーレイ */
  webOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** Native全画面コンテナ */
  nativeContainer: {
    flex: 1,
  },
  /** 内部コンテナ */
  inner: {
    flex: 1,
  },
  /** ヘッダー行（3カラムレイアウト） */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  /** 左カラム: タイトル */
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  /** 中央カラム: デジタル時計 */
  headerCenter: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  /** 右カラム: 閉じるボタン */
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  /** デジタル時計: 時刻（大） */
  clock: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
  },
  /** デジタル時計: 日付（小） */
  clockDate: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1,
    textAlign: 'center',
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /** スクロールエリア */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  /** ローディング表示 */
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
  },
  /** モード選択 */
  modeSelectContainer: {
    gap: 16,
    paddingTop: 24,
  },
  modeSelectSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  modeBigButton: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  modeBigButtonIcon: {
    fontSize: 40,
  },
  modeBigButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modeBigButtonSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  /** セクション */
  section: {
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  helpText: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 棟選択ピル */
  pillScroll: {
    flexShrink: 0,
  },
  pillScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /** 鍵グリッド */
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyCard: {
    borderRadius: 10,
    padding: 8,
    width: 100,
    minHeight: 64,
  },
  keyCardCode: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  keyCardName: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  /** ボタン */
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  /** 貸出確認 */
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  confirmCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  confirmValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  confirmKeyItem: {
    fontSize: 14,
    lineHeight: 22,
  },
  /** 返却 Step1: タイトル */
  returnNameTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  /** 返却 Step1: 名前入力ボックス */
  returnNameInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginVertical: 8,
  },
  /** 返却 Step1: 名前入力テキスト（大） */
  returnNameInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '500',
    paddingVertical: 16,
  },
  /** 返却 Step1: クリアボタン */
  returnNameClear: {
    padding: 8,
  },
  /** 返却 Step2: ヘッダー行（フィルター状態 + 名前変更リンク） */
  returnStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  returnStepHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  returnStepBackLink: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  returnStepBackLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /** 返却モード 名前フィルター行（旧・後方互換スタイル） */
  returnFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  returnFilterIcon: {
    fontSize: 16,
  },
  returnFilterInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  returnFilterClear: {
    padding: 6,
  },
  returnFilterClearText: {
    fontSize: 16,
    fontWeight: '700',
  },
  /** 返却モード */
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  loanList: {
    gap: 8,
  },
  loanCard: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  loanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loanCardCheck: {
    fontSize: 20,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  loanCardLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  loanCardMeta: {
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 34,
  },
  /** 団体の過去借用鍵ボックス */
  orgHistoryBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  orgHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  orgHistoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  orgHistorySelectAllButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  orgHistorySelectAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  orgHistoryHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: -4,
  },
  orgHistoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  orgHistoryChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 90,
    maxWidth: 140,
    gap: 2,
  },
  orgHistoryChipBuilding: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  orgHistoryChipName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  orgHistoryChipBadge: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  /** 選択中サマリー（複数棟選択対応） */
  selectedSummary: {
    marginBottom: 8,
  },
  selectedSummaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  selectedSummaryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  selectedSummaryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectedSummaryChipClose: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  /** 貸出中バッジ（鍵グリッド） */
  keyCardLoanedBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  /** 最近の貸出履歴 */
  historySection: {
    marginTop: 12,
    gap: 6,
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  historyRow: {
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  historyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyMeta: {
    fontSize: 11,
    lineHeight: 16,
  },
});

export default KeyLoanTerminalModal;
