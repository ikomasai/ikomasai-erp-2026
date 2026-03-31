/**
 * シフト変更申請画面
 * 祭実長・部長が自団体のシフトをグリッド表示し、
 * セル操作でシフト変更を事務部に申請します
 *
 * 対応申請種別:
 *   1. 通常申請: 1コマ単位で交換/移動/救援を申請
 *   2. 人ごと移送: 指定メンバーの全シフトを別メンバーへ一括申請
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAuth } from '../../../shared/contexts/AuthContext.js';
import { useTheme } from '../../../shared/hooks/useTheme';
import { fetchShiftData } from '../../../services/gas/gasApi.js';
import {
  formatDateToSheetName,
  getOrganizationGridData,
} from '../services/shiftService.js';
import { insertShiftChangeRequest } from '../services/shiftChangeService.js';
import { getFestivalStartDate } from '../constants.js';
import ShiftGrid from '../components/ShiftGrid.jsx';
import ShiftChangeRequestModal from '../components/ShiftChangeRequestModal.jsx';
import ShiftBulkTransferModal from '../components/ShiftBulkTransferModal.jsx';
import useShiftChangeRequest from '../hooks/useShiftChangeRequest.js';

/** 団体判定から除外する職位ロール名（部名ロールは含めない） */
const SPECIAL_ROLE_NAMES = ['祭実長', '部長', '管理者', '実長', '副実', '企画者'];

/**
 * グリッドデータリストから指定メンバーのセル一覧を取得
 * @param {string} memberName - メンバー名
 * @param {Array<Object>} gridDataList - グリッドデータ一覧
 * @returns {Array<Object>|null} セル一覧 { colIndex, timeSlot, areaName }[]
 */
const findMemberCells = (memberName, gridDataList) => {
  for (const gridData of gridDataList) {
    const member = gridData.members.find((m) => m.name === memberName);
    if (member) {
      return member.cells;
    }
  }
  return null;
};

/**
 * グリッドデータ内の全列インデックスを取得
 * isCellDisabled を無効化するために全列インデックスを返す
 * @param {Object} gridData - グリッドデータ
 * @returns {number[]} 全列インデックスの配列
 */
const getAllColIndices = (gridData) => {
  if (!gridData || !gridData.timeSlots) {
    return [];
  }
  return gridData.timeSlots.map((_, i) => i);
};

/**
 * 移送コマ一覧を生成
 * ソースメンバーのシフトあるコマについて、同じ時間帯の宛先メンバーのシフト状況を対応付けする
 * @param {Array<Object>} sourceCells - 移送元セル一覧
 * @param {Array<Object>} destCells - 移送先セル一覧
 * @returns {Array<Object>} 移送コマ一覧 [{ timeSlot, sourceAreaName, destAreaName }]
 */
const buildTransferList = (sourceCells, destCells) => {
  return sourceCells
    .filter((c) => c.areaName)
    .map((sourceCell) => {
      const destCell = destCells.find((c) => c.colIndex === sourceCell.colIndex);
      return {
        timeSlot: sourceCell.timeSlot,
        sourceAreaName: sourceCell.areaName,
        destAreaName: destCell?.areaName || null,
      };
    });
};

/**
 * シフト変更申請画面コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Date} props.selectedDate - 選択中の日付（親コンポーネントで保持）
 * @param {Function} props.onDateChange - 日付変更コールバック
 * @param {number} props.refreshTrigger - リロードトリガー（インクリメントで再取得を実行）
 * @param {Function} [props.onNavigateToHistory] - 申請履歴タブへの遷移コールバック
 * @returns {JSX.Element} シフト変更申請画面
 */
const ShiftChangeRequestScreen = ({ selectedDate, onDateChange, refreshTrigger, onNavigateToHistory }) => {
  /** 認証コンテキストからユーザー情報を取得 */
  const { userInfo, user } = useAuth();
  /** テーマを取得 */
  const { theme } = useTheme();

  /** 祭り開催期間 */
  const festivalStartDate = useMemo(() => getFestivalStartDate(), []);
  /** グリッドデータ */
  const [gridDataList, setGridDataList] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [loadErrorMessage, setLoadErrorMessage] = useState('');

  /** ===== 申請モード ===== */
  /** true: 人ごと移送モード, false: 通常申請モード */
  const [isBulkMode, setIsBulkMode] = useState(false);

  /** 申請完了モーダルの表示状態 */
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);

  /** ===== 人ごと移送モード用の状態 ===== */
  /** 移送元メンバー情報 { memberName, cells } */
  const [bulkSourceMember, setBulkSourceMember] = useState(null);
  /** 移送先メンバー情報 { memberName, cells } */
  const [bulkDestMember, setBulkDestMember] = useState(null);
  /** 人ごと移送確認モーダルの表示状態 */
  const [isBulkModalVisible, setIsBulkModalVisible] = useState(false);
  /** 人ごと移送の送信中状態 */
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  /** 人ごと移送の備考 */
  const [bulkNote, setBulkNote] = useState('');
  /** 人ごと移送の成功メッセージ */
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState('');
  /** 人ごと移送のエラーメッセージ */
  const [bulkErrorMessage, setBulkErrorMessage] = useState('');

  /** ===== 通常申請モード用フック ===== */
  const {
    selectedSource,
    selectedDestination,
    isModalVisible,
    isSubmitting,
    guideMessage,
    note,
    setNote,
    successMessage,
    errorMessage,
    handleCellPress,
    resetSelection,
    submitRequest,
    cancelModal,
    isRescueModalVisible,
    openRescueModal,
    cancelRescueModal,
    submitRescueRequest,
  } = useShiftChangeRequest();

  /**
   * ユーザーの団体ロール名リストを取得
   * 祭実長・部長等の特別ロール以外のロール名を団体名として扱う
   * @returns {Array<string>} 団体名リスト
   */
  const getUserOrganizations = useCallback(() => {
    if (!userInfo || !userInfo.roles) {
      return [];
    }

    return userInfo.roles
      .map((role) => role.name)
      .filter((name) => !SPECIAL_ROLE_NAMES.includes(name));
  }, [userInfo]);

  /**
   * 人ごと移送モードの選択状態をリセット
   */
  const resetBulkSelection = useCallback(() => {
    setBulkSourceMember(null);
    setBulkDestMember(null);
    setIsBulkModalVisible(false);
    setBulkNote('');
    setBulkSuccessMessage('');
    setBulkErrorMessage('');
  }, []);

  /**
   * グリッドデータを読み込む
   */
  const loadGridData = useCallback(async () => {
    if (!userInfo) {
      return;
    }

    setIsLoading(true);
    setLoadErrorMessage('');
    resetSelection();
    resetBulkSelection();

    try {
      /** シート名形式の日付 */
      const sheetName = formatDateToSheetName(selectedDate);
      /** GAS APIからシフトデータを取得 */
      const shiftData = await fetchShiftData(sheetName);
      /** ユーザーの所属団体名リスト */
      const organizations = getUserOrganizations();
      /** グリッドデータを生成 */
      const data = getOrganizationGridData(shiftData, organizations);
      setGridDataList(data);
    } catch (error) {
      console.error('シフトデータの取得に失敗:', error);
      setLoadErrorMessage('シフトデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, userInfo, getUserOrganizations, resetSelection, resetBulkSelection, refreshTrigger]);

  /**
   * 日付またはユーザー情報が変更されたらデータを再読み込み
   */
  useEffect(() => {
    loadGridData();
  }, [loadGridData]);

  /**
   * モードを切り替える
   * @param {boolean} bulk - trueで人ごと移送モード
   */
  const switchMode = useCallback((bulk) => {
    setIsBulkMode(bulk);
    resetSelection();
    resetBulkSelection();
  }, [resetSelection, resetBulkSelection]);

  /**
   * 日付を1日進める
   */
  const goToNextDay = () => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    onDateChange(nextDate);
  };

  /**
   * 日付を1日戻す
   */
  const goToPreviousDay = () => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    onDateChange(prevDate);
  };

  /**
   * 今日の日付にジャンプ
   */
  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    onDateChange(today);
  };

  /**
   * 祭り期間（開始日）にジャンプ
   */
  const goToFestival = () => {
    onDateChange(new Date(festivalStartDate));
  };

  /**
   * 表示用日付文字列を生成
   * @returns {string} 日付文字列（例: "11月3日（月）"）
   */
  const getDisplayDate = () => {
    /** 曜日の配列 */
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    /** 年 */
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();
    const dayOfWeek = dayNames[selectedDate.getDay()];
    return `${year}年${month}月${day}日（${dayOfWeek}）`;
  };

  /**
   * 通常申請の送信処理
   */
  const handleSubmit = useCallback(async () => {
    if (!user?.id || gridDataList.length === 0) {
      return;
    }

    /** 最初のグリッドデータの団体名を使用 */
    const organizationName = gridDataList[0].organizationName;
    await submitRequest(user.id, organizationName, selectedDate);
  }, [user?.id, gridDataList, selectedDate, submitRequest]);

  /**
   * 救援申請の送信処理
   */
  const handleRescueSubmit = useCallback(async () => {
    if (!user?.id || gridDataList.length === 0) {
      return;
    }

    /** 最初のグリッドデータの団体名を使用 */
    const organizationName = gridDataList[0].organizationName;
    await submitRescueRequest(user.id, organizationName, selectedDate);
  }, [user?.id, gridDataList, selectedDate, submitRescueRequest]);

  /**
   * 人ごと移送モードのセルタップ処理
   * @param {Object} block - タップされたセルのブロック情報
   */
  const handleBulkCellPress = useCallback((block) => {
    const { memberName } = block;

    setBulkSuccessMessage('');
    setBulkErrorMessage('');

    if (!bulkSourceMember) {
      // ステップ1: 移送元メンバーを選択
      /** 選択メンバーのセル一覧 */
      const cells = findMemberCells(memberName, gridDataList);
      if (!cells || cells.every((c) => !c.areaName)) {
        return; // シフトのないメンバーは選択不可
      }
      setBulkSourceMember({ memberName, cells });
    } else {
      // ステップ2: 移送先メンバーを選択
      if (memberName === bulkSourceMember.memberName) {
        // 同じメンバーをタップしたら選択解除
        setBulkSourceMember(null);
        return;
      }
      /** 移送先メンバーのセル一覧 */
      const destCells = findMemberCells(memberName, gridDataList);
      setBulkDestMember({ memberName, cells: destCells || [] });
      setIsBulkModalVisible(true);
    }
  }, [bulkSourceMember, gridDataList]);

  /**
   * 人ごと移送モーダルのキャンセル処理
   */
  const handleBulkCancel = useCallback(() => {
    setBulkDestMember(null);
    setIsBulkModalVisible(false);
  }, []);

  /**
   * 人ごと移送申請の送信処理
   * 移送元の全シフトについて個別にinsertShiftChangeRequestを呼び出す
   */
  const handleBulkSubmit = useCallback(async () => {
    if (!user?.id || !bulkSourceMember || !bulkDestMember || gridDataList.length === 0) {
      return;
    }

    /** 移送コマ一覧 */
    const transferList = buildTransferList(bulkSourceMember.cells, bulkDestMember.cells);
    if (transferList.length === 0) {
      return;
    }

    setIsBulkSubmitting(true);
    setBulkErrorMessage('');

    /** 団体名 */
    const organizationName = gridDataList[0].organizationName;
    /** 日付をYYYY-MM-DD形式に変換 */
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    /** エラーが発生したコマ数 */
    let errorCount = 0;

    // 各コマについて順番に申請を送信
    for (const transfer of transferList) {
      const { error } = await insertShiftChangeRequest({
        requesterUserId: user.id,
        organizationName,
        shiftDate: dateStr,
        sourceMemberName: bulkSourceMember.memberName,
        sourceTimeSlot: transfer.timeSlot,
        sourceAreaName: transfer.sourceAreaName,
        destinationMemberName: bulkDestMember.memberName,
        destinationTimeSlot: transfer.timeSlot,
        destinationAreaName: transfer.destAreaName,
        requesterNote: bulkNote.trim() || null,
      });
      if (error) {
        errorCount += 1;
      }
    }

    setIsBulkSubmitting(false);
    setIsBulkModalVisible(false);

    if (errorCount === 0) {
      setBulkSuccessMessage(`${transferList.length}件のシフト変更申請を送信しました`);
      setBulkSourceMember(null);
      setBulkDestMember(null);
      setBulkNote('');
    } else {
      setBulkErrorMessage(`${errorCount}件の申請送信に失敗しました`);
      setBulkDestMember(null);
    }
  }, [user?.id, bulkSourceMember, bulkDestMember, gridDataList, selectedDate, bulkNote]);

  /**
   * 人ごと移送モード用の selectedSource を生成する
   * 全列インデックスを含めることで他のセルを無効化しない（isCellDisabled = false 相当）
   */
  const bulkGridSelectedSource = useMemo(() => {
    if (!bulkSourceMember || gridDataList.length === 0) {
      return null;
    }
    /** 全列インデックス（isCellDisabled を無効化するために全列を含める） */
    const colIndices = getAllColIndices(gridDataList[0]);
    return {
      memberName: bulkSourceMember.memberName,
      colIndices,
      timeSlots: [],
      timeSlot: '',
      areaName: 'BULK',
    };
  }, [bulkSourceMember, gridDataList]);

  /**
   * 人ごと移送モード用の selectedDestination を生成する
   */
  const bulkGridSelectedDest = useMemo(() => {
    if (!bulkDestMember || gridDataList.length === 0) {
      return null;
    }
    /** 全列インデックス */
    const colIndices = getAllColIndices(gridDataList[0]);
    return {
      memberName: bulkDestMember.memberName,
      colIndices,
      timeSlots: [],
      timeSlot: '',
      areaName: 'BULK',
    };
  }, [bulkDestMember, gridDataList]);

  /**
   * 人ごと移送モードのガイドメッセージ
   */
  const bulkGuideMessage = useMemo(() => {
    if (!bulkSourceMember) {
      return '移送元のメンバーのコマを選択してください';
    }
    return `${bulkSourceMember.memberName}さんの移送先メンバーを選択してください`;
  }, [bulkSourceMember]);

  /** 現在のモード用のガイドメッセージ */
  const currentGuideMessage = isBulkMode ? bulkGuideMessage : guideMessage;
  /** 現在のモード用の成功メッセージ */
  const currentSuccessMessage = isBulkMode ? bulkSuccessMessage : successMessage;
  /** 現在のモード用のエラーメッセージ */
  const currentErrorMessage = isBulkMode ? bulkErrorMessage : errorMessage;

  /**
   * 成功メッセージが設定されたら完了モーダルを表示する
   */
  useEffect(() => {
    if (currentSuccessMessage !== '') {
      setIsSuccessModalVisible(true);
    }
  }, [currentSuccessMessage]);

  /**
   * 人ごと移送モードの移送コマ一覧
   */
  const bulkTransferList = useMemo(() => {
    if (!bulkSourceMember || !bulkDestMember) {
      return [];
    }
    return buildTransferList(bulkSourceMember.cells, bulkDestMember.cells);
  }, [bulkSourceMember, bulkDestMember]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* 日付選択 */}
      <View style={[styles.dateSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.dateArrowButton}
          onPress={goToPreviousDay}
        >
          <Text style={[styles.dateArrowText, { color: theme.primary }]}>◀</Text>
        </TouchableOpacity>

        <View style={styles.dateDisplay}>
          <Text style={[styles.dateText, { color: theme.text }]}>{getDisplayDate()}</Text>
        </View>

        <TouchableOpacity
          style={styles.dateArrowButton}
          onPress={goToNextDay}
        >
          <Text style={[styles.dateArrowText, { color: theme.primary }]}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* ジャンプボタン */}
      <View style={styles.jumpButtonRow}>
        <TouchableOpacity
          style={[styles.jumpButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={goToToday}
        >
          <Text style={[styles.jumpButtonText, { color: theme.primary }]}>今日にジャンプ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.jumpButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={goToFestival}
        >
          <Text style={[styles.jumpButtonText, { color: theme.primary }]}>祭期間にジャンプ</Text>
        </TouchableOpacity>
      </View>

      {/* 申請モード切り替え */}
      <View style={[styles.modeToggleRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            styles.modeToggleButton,
            !isBulkMode && { backgroundColor: theme.primary },
          ]}
          onPress={() => switchMode(false)}
        >
          <Text style={[styles.modeToggleText, { color: !isBulkMode ? '#FFFFFF' : theme.textSecondary }]}>
            通常申請
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeToggleButton,
            isBulkMode && { backgroundColor: theme.primary },
          ]}
          onPress={() => switchMode(true)}
        >
          <Text style={[styles.modeToggleText, { color: isBulkMode ? '#FFFFFF' : theme.textSecondary }]}>
            人ごと移送
          </Text>
        </TouchableOpacity>
      </View>

      {/* 操作ガイド */}
      <View style={[styles.guideContainer, { backgroundColor: theme.surface, borderLeftColor: theme.primary }]}>
        <Text style={[styles.guideIcon, { color: theme.primary }]}>ℹ</Text>
        <Text style={[styles.guideText, { color: theme.text }]}>{currentGuideMessage}</Text>
        {(selectedSource || bulkSourceMember) && (
          <TouchableOpacity
            onPress={isBulkMode ? resetBulkSelection : resetSelection}
            style={styles.resetButton}
          >
            <Text style={[styles.resetButtonText, { color: theme.error }]}>リセット</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 救援申請ボタン（通常モードかつ移動元選択済み時のみ表示） */}
      {!isBulkMode && selectedSource && (
        <TouchableOpacity
          style={styles.rescueButton}
          onPress={openRescueModal}
        >
          <Text style={styles.rescueButtonTitle}>交代者なし・救援申請</Text>
          <Text style={styles.rescueButtonSubtitle}>交代者が見つからない場合に事務部へ手配を依頼します</Text>
        </TouchableOpacity>
      )}

      {/* 申請完了モーダル */}
      <Modal
        visible={isSuccessModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={[styles.successModalContainer, { backgroundColor: theme.surface }]}>
            {/* アイコン */}
            <Text style={styles.successModalIcon}>✅</Text>
            {/* タイトル */}
            <Text style={[styles.successModalTitle, { color: theme.text }]}>申請完了</Text>
            {/* メッセージ */}
            <Text style={[styles.successModalMessage, { color: theme.textSecondary }]}>
              {currentSuccessMessage}
            </Text>
            {/* ボタン */}
            <TouchableOpacity
              style={[styles.successModalHistoryButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                setIsSuccessModalVisible(false);
                if (onNavigateToHistory) {
                  onNavigateToHistory();
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.successModalHistoryButtonText}>申請履歴を表示する</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.successModalCloseButton, { borderColor: theme.border }]}
              onPress={() => setIsSuccessModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.successModalCloseButtonText, { color: theme.textSecondary }]}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* エラーメッセージ */}
      {currentErrorMessage !== '' && (
        <View style={[styles.messageContainer, styles.errorContainer]}>
          <Text style={styles.errorText}>{currentErrorMessage}</Text>
        </View>
      )}

      {/* ローディング */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>読み込み中...</Text>
        </View>
      )}

      {/* データ取得エラー */}
      {!isLoading && loadErrorMessage !== '' && (
        <View style={styles.loadErrorContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{loadErrorMessage}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={loadGridData}
          >
            <Text style={styles.retryButtonText}>再試行</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* データなし */}
      {!isLoading && loadErrorMessage === '' && gridDataList.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            この日のシフトデータが見つかりません
          </Text>
        </View>
      )}

      {/* シフトグリッド */}
      {!isLoading && gridDataList.map((gridData) => (
        <ShiftGrid
          key={gridData.organizationName}
          gridData={gridData}
          selectedSource={isBulkMode ? bulkGridSelectedSource : selectedSource}
          selectedDestination={isBulkMode ? bulkGridSelectedDest : selectedDestination}
          onCellPress={isBulkMode ? handleBulkCellPress : handleCellPress}
          theme={theme}
        />
      ))}

      {/* 通常申請確認モーダル */}
      <ShiftChangeRequestModal
        visible={isModalVisible}
        source={selectedSource}
        destination={selectedDestination}
        displayDate={getDisplayDate()}
        isSubmitting={isSubmitting}
        note={note}
        onNoteChange={setNote}
        onSubmit={handleSubmit}
        onCancel={cancelModal}
        theme={theme}
      />

      {/* 救援申請確認モーダル */}
      <ShiftChangeRequestModal
        visible={isRescueModalVisible}
        source={selectedSource}
        destination={null}
        displayDate={getDisplayDate()}
        isSubmitting={isSubmitting}
        note={note}
        onNoteChange={setNote}
        onSubmit={handleRescueSubmit}
        onCancel={cancelRescueModal}
        isRescue
        theme={theme}
      />

      {/* 人ごと移送確認モーダル */}
      <ShiftBulkTransferModal
        visible={isBulkModalVisible}
        sourceMemberName={bulkSourceMember?.memberName}
        destMemberName={bulkDestMember?.memberName}
        transferList={bulkTransferList}
        displayDate={getDisplayDate()}
        isSubmitting={isBulkSubmitting}
        note={bulkNote}
        onNoteChange={setBulkNote}
        onSubmit={handleBulkSubmit}
        onCancel={handleBulkCancel}
        theme={theme}
      />
    </ScrollView>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  /* 日付選択 */
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateArrowButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dateArrowText: {
    fontSize: 16,
  },
  dateDisplay: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginHorizontal: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
  },
  /* 申請モード切り替え */
  modeToggleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /* 操作ガイド */
  guideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderRadius: 4,
    gap: 8,
    marginBottom: 8,
  },
  guideIcon: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  guideText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(198, 40, 40, 0.1)',
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  /* 救援申請ボタン */
  rescueButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FF9800',
    marginBottom: 12,
  },
  rescueButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  rescueButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  /* 申請完了モーダル */
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successModalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  successModalIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  successModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  successModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  successModalHistoryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  successModalHistoryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  successModalCloseButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  successModalCloseButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  /* メッセージ */
  messageContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorContainer: {
    backgroundColor: 'rgba(198, 40, 40, 0.08)',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
  },
  /* ローディング */
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  /* データ取得エラー */
  loadErrorContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  /* データなし */
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
  },
  /* ジャンプボタン */
  jumpButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  jumpButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  jumpButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  /* 再試行 */
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

export default ShiftChangeRequestScreen;
