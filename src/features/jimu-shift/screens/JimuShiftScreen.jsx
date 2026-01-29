/**
 * 当日部員シフト確認画面
 * ログインユーザーのシフトをパーソナライズして表示します
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../../shared/contexts/AuthContext.js';
import { fetchShiftData } from '../../../services/gas/gasApi.js';
import {
  getUserShifts,
  formatDateToSheetName,
  hexToRgba,
} from '../services/shiftService.js';
import {
  getFestivalStartDate,
  getFestivalEndDate,
} from '../constants.js';

/** ブレークポイント（スマホ/PC切り替え） */
const MOBILE_BREAKPOINT = 768;

/** 画面名 */
const SCREEN_NAME = '当日部員';

/**
 * 事務シフト確認画面コンポーネント（当日部員）
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @returns {JSX.Element} シフト確認画面
 */
const JimuShiftScreen = ({ navigation }) => {
  /** 認証コンテキストからユーザー情報を取得 */
  const { userInfo } = useAuth();

  /** 祭り開催期間 */
  const festivalStartDate = useMemo(() => getFestivalStartDate(), []);
  const festivalEndDate = useMemo(() => getFestivalEndDate(), []);

  /**
   * 今日が祭り期間内なら今日、そうでなければ開始日を初期値にする
   * @returns {Date} 初期選択日
   */
  const getInitialDate = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today >= festivalStartDate && today <= festivalEndDate) {
      return today;
    }
    return new Date(festivalStartDate);
  }, [festivalStartDate, festivalEndDate]);

  /** 選択中の日付 */
  const [selectedDate, setSelectedDate] = useState(getInitialDate);
  /** シフトデータ */
  const [shifts, setShifts] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * ユーザーの所属団体リストを取得
   * rolesからロール名を団体名として使用する
   * @returns {Array<string>} 所属団体名リスト
   */
  const getUserOrganizations = useCallback(() => {
    if (!userInfo || !userInfo.roles) {
      return [];
    }

    // ロール名を団体名として返す
    return userInfo.roles.map((role) => role.name);
  }, [userInfo]);

  /**
   * シフトデータを読み込む
   */
  const loadShifts = useCallback(async () => {
    if (!userInfo) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // 日付をシート名形式に変換
      const sheetName = formatDateToSheetName(selectedDate);

      // GAS APIからシフトデータを取得
      const shiftData = await fetchShiftData(sheetName);

      // ユーザーの所属団体を取得
      const organizations = getUserOrganizations();

      // ユーザー名を取得
      const userName = userInfo.name || '';

      // シフトを抽出
      const userShifts = getUserShifts(shiftData, userName, organizations);
      setShifts(userShifts);
    } catch (error) {
      console.error('シフトデータの取得に失敗:', error);
      setErrorMessage('シフトデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, userInfo, getUserOrganizations]);

  /**
   * 日付またはユーザー情報が変更されたらシフトを再読み込み
   */
  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  /**
   * 開始日かどうかを判定
   * @returns {boolean} 開始日の場合true
   */
  const isFirstDay = selectedDate.getTime() <= festivalStartDate.getTime();

  /**
   * 最終日かどうかを判定
   * @returns {boolean} 最終日の場合true
   */
  const isLastDay = selectedDate.getTime() >= festivalEndDate.getTime();

  /**
   * 日付を1日進める（最終日以降は無効）
   */
  const goToNextDay = () => {
    if (isLastDay) return;
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    setSelectedDate(nextDate);
  };

  /**
   * 日付を1日戻す（開始日以前は無効）
   */
  const goToPreviousDay = () => {
    if (isFirstDay) return;
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    setSelectedDate(prevDate);
  };

  /**
   * 日付の表示用文字列を生成
   * @returns {string} 表示用の日付文字列（例: "11月3日（月）"）
   */
  const getDisplayDate = () => {
    /** 曜日の配列 */
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    /** 月（1始まり） */
    const month = selectedDate.getMonth() + 1;
    /** 日 */
    const day = selectedDate.getDate();
    /** 曜日 */
    const dayOfWeek = dayNames[selectedDate.getDay()];

    return `${month}月${day}日（${dayOfWeek}）`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* コンテンツ */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* 日付選択（祭り期間内のみ移動可能） */}
        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={[styles.dateArrowButton, isFirstDay && styles.dateArrowButtonDisabled]}
            onPress={goToPreviousDay}
            disabled={isFirstDay}
          >
            <Text style={[styles.dateArrowText, isFirstDay && styles.dateArrowTextDisabled]}>◀</Text>
          </TouchableOpacity>

          <View style={styles.dateDisplay}>
            <Text style={styles.dateText}>{getDisplayDate()}</Text>
          </View>

          <TouchableOpacity
            style={[styles.dateArrowButton, isLastDay && styles.dateArrowButtonDisabled]}
            onPress={goToNextDay}
            disabled={isLastDay}
          >
            <Text style={[styles.dateArrowText, isLastDay && styles.dateArrowTextDisabled]}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* シフト表示エリア */}
        <View style={styles.shiftArea}>
          <Text style={styles.shiftAreaTitle}>あなたのシフト</Text>

          {/* ローディング中 */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>読み込み中...</Text>
            </View>
          )}

          {/* エラーメッセージ */}
          {!isLoading && errorMessage !== '' && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadShifts}
              >
                <Text style={styles.retryButtonText}>再試行</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* シフトなし */}
          {!isLoading && errorMessage === '' && shifts.length === 0 && (
            <View style={styles.noShiftContainer}>
              <Text style={styles.noShiftText}>
                この日はシフトがありません
              </Text>
            </View>
          )}

          {/* シフト一覧 */}
          {!isLoading &&
            errorMessage === '' &&
            shifts.map((shift, index) => (
              <View
                key={`${shift.timeSlot}-${shift.areaName}-${index}`}
                style={[
                  styles.shiftCard,
                  {
                    backgroundColor: hexToRgba(shift.backgroundColor, 0.2),
                    borderLeftColor: shift.backgroundColor,
                  },
                ]}
              >
                {/* 時間帯 */}
                <Text style={styles.shiftTime}>{shift.timeSlot}</Text>
                {/* エリア名 */}
                <Text style={styles.shiftAreaName}>{shift.areaName}</Text>
              </View>
            ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  /* 日付選択 */
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dateArrowButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateArrowText: {
    fontSize: 16,
    color: '#007AFF',
  },
  dateArrowButtonDisabled: {
    opacity: 0.3,
  },
  dateArrowTextDisabled: {
    color: '#999999',
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginHorizontal: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
  },
  /* シフト表示エリア */
  shiftArea: {
    marginTop: 8,
  },
  shiftAreaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 12,
  },
  /* ローディング */
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  /* エラー */
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  errorText: {
    fontSize: 14,
    color: '#ff3b30',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  /* シフトなし */
  noShiftContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  noShiftText: {
    fontSize: 14,
    color: '#999999',
  },
  /* シフトカード */
  shiftCard: {
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
  },
  shiftTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  shiftAreaName: {
    fontSize: 15,
    color: '#333333',
  },
});

export default JimuShiftScreen;
