/**
 * 鍵管理ボードモーダル
 * 全鍵の貸出状態を棟ごとにグリッド表示する全体表示用モーダル
 * 保管中カードタップ → 貸出登録、貸出中カードタップ → 返却確認
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { listKeys } from '../../../services/supabase/keyMasterService';
import {
  createKeyLoan,
  listKeyLoans,
  returnKeyAndCreateLockTask,
} from '../../../services/supabase/keyLoanService';

/** 貸出中バッジ背景色 */
const STATUS_COLOR_LOANED = '#FEECEB';
/** 貸出中バッジ文字色 */
const STATUS_TEXT_LOANED = '#C0392B';
/** 保管中バッジ背景色 */
const STATUS_COLOR_AVAILABLE = '#EAFAF1';
/** 保管中バッジ文字色 */
const STATUS_TEXT_AVAILABLE = '#1E8449';

const normalizeText = (value) => (value || '').trim();

/**
 * 鍵管理ボードモーダルコンポーネント
 * @param {Object} props - プロパティ
 * @param {boolean} props.visible - 表示するか
 * @param {Function} props.onClose - 閉じるコールバック
 * @param {Object} props.theme - テーマ
 * @param {Object|null} [props.user] - ログインユーザー
 * @param {Function} [props.onLoanCreated] - 貸出登録後コールバック
 * @param {Function} [props.onLoanReturned] - 返却後コールバック
 * @returns {JSX.Element} 鍵管理ボードモーダル
 */
const KeyStatusBoardModal = ({
  visible,
  onClose,
  theme,
  user,
  onLoanCreated,
  onLoanReturned,
}) => {
  /** 全鍵一覧 */
  const [keys, setKeys] = useState([]);
  /** 貸出中の鍵一覧 */
  const [loanedKeys, setLoanedKeys] = useState([]);
  /** 読み込み中フラグ */
  const [isLoading, setIsLoading] = useState(false);
  /** 処理中フラグ */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 貸出登録ミニフォームの対象鍵
   * null のとき非表示
   * @type {Object|null}
   */
  const [loanTarget, setLoanTarget] = useState(null);
  /** 貸出登録フォームの企画名 */
  const [loanEventName, setLoanEventName] = useState('');
  /** 貸出登録フォームの借受人名 */
  const [loanBorrowerName, setLoanBorrowerName] = useState('');

  /**
   * 返却確認の対象貸出
   * null のとき非表示
   * @type {Object|null}
   */
  const [returnTarget, setReturnTarget] = useState(null);

  /**
   * メッセージ表示（プラットフォーム対応）
   * @param {string} title - タイトル
   * @param {string} message - 本文
   * @returns {void}
   */
  const showMessage = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  /**
   * データを読み込む
   * @returns {Promise<void>} 読み込み処理
   */
  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [keysResult, loansResult] = await Promise.all([
      listKeys({ activeOnly: true, limit: 500 }),
      listKeyLoans({ status: 'loaned', limit: 300 }),
    ]);
    setIsLoading(false);

    if (!keysResult.error) {
      setKeys(keysResult.data || []);
    }
    if (!loansResult.error) {
      setLoanedKeys(loansResult.data || []);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  /**
   * 貸出中の鍵コードをキーにしたマップ（key_code → loan）
   */
  const loanedMapByCode = useMemo(() => {
    /** @type {Map<string, Object>} */
    const map = new Map();
    loanedKeys.forEach((loan) => {
      if (loan.key_code) {
        map.set(loan.key_code, loan);
      }
    });
    return map;
  }, [loanedKeys]);

  /**
   * 鍵を棟ごとにグループ化する
   * building カラム優先で棟名を取得し、未設定の場合は「その他」グループに入れる
   */
  const groupedByBuilding = useMemo(() => {
    /** @type {Map<string, Array>} */
    const groups = new Map();

    keys.forEach((key) => {
      /** building カラム優先、なければ metadata.building を使用 */
      const building =
        normalizeText(key.building) ||
        (key.metadata && typeof key.metadata === 'object'
          ? normalizeText(key.metadata.building)
          : '') ||
        'その他';
      if (!groups.has(building)) {
        groups.set(building, []);
      }
      groups.get(building).push(key);
    });

    /** 棟名でソート（「その他」は末尾） */
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'その他') return 1;
      if (b === 'その他') return -1;
      return a.localeCompare(b, 'ja');
    });

    return sorted;
  }, [keys]);

  /** 貸出中の鍵数 */
  const loanedCount = loanedKeys.length;
  /** 全有効鍵数 */
  const totalCount = keys.length;

  /**
   * 保管中カードをタップして貸出フォームを開く
   * @param {Object} key - 鍵情報
   * @returns {void}
   */
  const handleOpenLoanForm = (key) => {
    setLoanTarget(key);
    setLoanEventName('');
    setLoanBorrowerName('');
  };

  /**
   * 貸出フォームをキャンセルする
   * @returns {void}
   */
  const handleCancelLoan = () => {
    setLoanTarget(null);
    setLoanEventName('');
    setLoanBorrowerName('');
  };

  /**
   * 貸出を登録する
   * @returns {Promise<void>} 登録処理
   */
  const handleConfirmLoan = async () => {
    if (!loanTarget) {
      return;
    }

    setIsSubmitting(true);
    const { error } = await createKeyLoan({
      keyCode: loanTarget.key_code,
      keyLabel: loanTarget.display_name || loanTarget.key_code,
      eventName: loanEventName.trim(),
      borrowerName: loanBorrowerName.trim(),
    });
    setIsSubmitting(false);

    if (error) {
      showMessage('登録エラー', error.message || '貸出登録に失敗しました');
      return;
    }

    setLoanTarget(null);
    await loadData();
    onLoanCreated?.();
    showMessage('登録完了', `「${loanTarget.display_name || loanTarget.key_code}」の貸出を登録しました`);
  };

  /**
   * 貸出中カードをタップして返却確認対象をセットする
   * @param {Object} loan - 貸出情報
   * @returns {void}
   */
  const handleOpenReturnConfirm = (loan) => {
    setReturnTarget(loan);
  };

  /**
   * 返却処理を実行する
   * @param {boolean} createLockTask - 施錠確認タスクを作るか
   * @returns {Promise<void>} 返却処理
   */
  const handleConfirmReturn = async (createLockTask) => {
    if (!returnTarget || !user?.id) {
      showMessage('操作エラー', 'ログイン情報が取得できません');
      return;
    }

    setIsSubmitting(true);
    const { error } = await returnKeyAndCreateLockTask({
      loanId: returnTarget.id,
      createLockTask,
      returnUserId: user.id,
      optionalAssignee: null,
    });
    setIsSubmitting(false);

    if (error) {
      showMessage('返却エラー', error.message || '返却処理に失敗しました');
      return;
    }

    const keyLabel = returnTarget.key_label || '鍵';
    setReturnTarget(null);
    await loadData();
    onLoanReturned?.();
    showMessage(
      '返却完了',
      createLockTask
        ? `「${keyLabel}」を返却し、施錠確認タスクを作成しました`
        : `「${keyLabel}」の返却を登録しました`
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.background },
          ]}
        >
          {/* ヘッダー */}
          <View
            style={[
              styles.header,
              { backgroundColor: theme.surface, borderBottomColor: theme.border },
            ]}
          >
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>鍵管理ボード</Text>
              <Text style={[styles.headerSummary, { color: theme.textSecondary }]}>
                貸出中 {loanedCount} / 全{totalCount}本
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={loadData}
                disabled={isLoading}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                  {isLoading ? '読込中' : '更新'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 凡例 */}
          <View style={[styles.legend, { borderBottomColor: theme.border }]}>
            <View style={[styles.legendBadge, { backgroundColor: STATUS_COLOR_LOANED }]}>
              <Text style={[styles.legendText, { color: STATUS_TEXT_LOANED }]}>貸出中（タップで返却）</Text>
            </View>
            <View style={[styles.legendBadge, { backgroundColor: STATUS_COLOR_AVAILABLE }]}>
              <Text style={[styles.legendText, { color: STATUS_TEXT_AVAILABLE }]}>保管中（タップで貸出）</Text>
            </View>
          </View>

          {/* ボード本体 */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {groupedByBuilding.length === 0 && !isLoading ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                鍵データがありません
              </Text>
            ) : null}

            {groupedByBuilding.map(([building, buildingKeys]) => (
              <View key={building} style={styles.buildingSection}>
                <View style={[styles.buildingHeader, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.buildingTitle, { color: theme.text }]}>{building}</Text>
                  <Text style={[styles.buildingCount, { color: theme.textSecondary }]}>
                    {buildingKeys.filter((k) => loanedMapByCode.has(k.key_code)).length} /{' '}
                    {buildingKeys.length} 本貸出中
                  </Text>
                </View>

                <View style={styles.keyGrid}>
                  {buildingKeys.map((key) => {
                    /** この鍵の現在の貸出情報 */
                    const loan = loanedMapByCode.get(key.key_code) || null;
                    /** 貸出中かどうか */
                    const isLoaned = loan !== null;

                    return (
                      <Pressable
                        key={key.id}
                        style={[
                          styles.keyCard,
                          {
                            backgroundColor: isLoaned
                              ? STATUS_COLOR_LOANED
                              : STATUS_COLOR_AVAILABLE,
                            borderColor: isLoaned ? '#E74C3C' : '#27AE60',
                          },
                        ]}
                        onPress={() => {
                          if (isLoaned) {
                            /** 貸出中カードタップ → 返却確認 */
                            handleOpenReturnConfirm(loan);
                          } else {
                            /** 保管中カードタップ → 貸出フォーム */
                            handleOpenLoanForm(key);
                          }
                        }}
                        disabled={isSubmitting}
                      >
                        {/* 鍵コード */}
                        <Text
                          style={[
                            styles.keyCode,
                            { color: isLoaned ? STATUS_TEXT_LOANED : STATUS_TEXT_AVAILABLE },
                          ]}
                          numberOfLines={1}
                        >
                          {key.key_code}
                        </Text>

                        {/* 表示名 */}
                        <Text
                          style={[
                            styles.keyName,
                            {
                              color: isLoaned ? '#7B241C' : '#1A5632',
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {key.display_name || key.key_code}
                        </Text>

                        {/* 貸出中の場合：貸出先情報 */}
                        {isLoaned ? (
                          <View style={styles.loanInfo}>
                            {loan.event_name ? (
                              <Text
                                style={[styles.loanMeta, { color: STATUS_TEXT_LOANED }]}
                                numberOfLines={1}
                              >
                                {loan.event_name}
                              </Text>
                            ) : null}
                            {loan.borrower_name ? (
                              <Text
                                style={[styles.loanMeta, { color: STATUS_TEXT_LOANED }]}
                                numberOfLines={1}
                              >
                                {loan.borrower_name}
                              </Text>
                            ) : null}
                            <Text style={[styles.loanTime, { color: '#C0392B' }]}>
                              {loan.loaned_at
                                ? new Date(loan.loaned_at).toLocaleTimeString('ja-JP', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </Text>
                            <Text style={[styles.tapHint, { color: '#C0392B' }]}>→ 返却</Text>
                          </View>
                        ) : (
                          <View>
                            <Text style={[styles.statusLabel, { color: STATUS_TEXT_AVAILABLE }]}>
                              保管中
                            </Text>
                            <Text style={[styles.tapHint, { color: STATUS_TEXT_AVAILABLE }]}>→ 貸出</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── 貸出登録ミニフォーム ── */}
        {loanTarget ? (
          <View style={styles.actionOverlay}>
            <View style={[styles.actionSheet, { backgroundColor: theme.surface }]}>
              <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
                貸出登録: {loanTarget.display_name || loanTarget.key_code}
              </Text>
              <TextInput
                value={loanEventName}
                onChangeText={setLoanEventName}
                placeholder="企画名（任意）"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.actionInput,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              />
              <TextInput
                value={loanBorrowerName}
                onChangeText={setLoanBorrowerName}
                placeholder="借受人名（任意）"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.actionInput,
                  { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
                ]}
              />
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionConfirmButton, { backgroundColor: theme.primary }]}
                  onPress={handleConfirmLoan}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionConfirmButtonText}>
                    {isSubmitting ? '登録中...' : '貸出登録'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionCancelButton, { borderColor: theme.border }]}
                  onPress={handleCancelLoan}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.actionCancelButtonText, { color: theme.textSecondary }]}>
                    キャンセル
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 返却確認シート ── */}
        {returnTarget ? (
          <View style={styles.actionOverlay}>
            <View style={[styles.actionSheet, { backgroundColor: theme.surface }]}>
              <Text style={[styles.actionSheetTitle, { color: theme.text }]}>
                返却確認: {returnTarget.key_label || returnTarget.key_code || '鍵'}
              </Text>
              {returnTarget.event_name ? (
                <Text style={[styles.actionSheetMeta, { color: theme.textSecondary }]}>
                  企画: {returnTarget.event_name}
                </Text>
              ) : null}
              {returnTarget.borrower_name ? (
                <Text style={[styles.actionSheetMeta, { color: theme.textSecondary }]}>
                  借受人: {returnTarget.borrower_name}
                </Text>
              ) : null}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionConfirmButton, { backgroundColor: '#1E8449' }]}
                  onPress={() => handleConfirmReturn(true)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionConfirmButtonText}>
                    {isSubmitting ? '処理中...' : '返却+施錠確認依頼'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionConfirmButton, { backgroundColor: theme.primary }]}
                  onPress={() => handleConfirmReturn(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.actionConfirmButtonText}>
                    {isSubmitting ? '処理中...' : '返却のみ'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionCancelButton, { borderColor: theme.border }]}
                  onPress={() => setReturnTarget(null)}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.actionCancelButtonText, { color: theme.textSecondary }]}>
                    キャンセル
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          marginHorizontal: 'auto',
          width: '100%',
          maxWidth: 1200,
        }
      : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSummary: {
    fontSize: 13,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  legendBadge: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 20,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  buildingSection: {
    gap: 10,
  },
  buildingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  buildingTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  buildingCount: {
    fontSize: 12,
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    width: 110,
    minHeight: 80,
  },
  keyCode: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  keyName: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  loanInfo: {
    gap: 2,
  },
  loanMeta: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  loanTime: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tapHint: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    opacity: 0.8,
  },
  /* アクションオーバーレイ（貸出フォーム・返却確認） */
  actionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  actionSheet: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
    ...(Platform.OS === 'web'
      ? {
          marginHorizontal: 'auto',
          width: '100%',
          maxWidth: 480,
        }
      : {}),
    /** シャドウ */
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  actionSheetMeta: {
    fontSize: 13,
  },
  actionInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  actionButtons: {
    gap: 8,
  },
  actionConfirmButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  actionCancelButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default KeyStatusBoardModal;
