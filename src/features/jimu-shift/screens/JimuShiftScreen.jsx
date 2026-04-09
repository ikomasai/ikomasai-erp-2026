/**
 * 当日部員シフト確認画面
 * ログインユーザーのシフトをパーソナライズして表示します
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '../../../shared/components/icons';
import { useAuth } from '../../../shared/contexts/AuthContext.js';
import { useTheme } from '../../../shared/hooks/useTheme';
import { hasRole } from '../../../services/supabase/permissionService.js';
import { getSupabaseClient } from '../../../services/supabase/client.js';
import { getUnreadCount, subscribeNotificationUpdates } from '../../../shared/services/notificationService';
import { fetchShiftData } from '../../../services/gas/gasApi.js';
import {
  getUserShifts,
  formatDateToSheetName,
  hexToRgba,
} from '../services/shiftService.js';
import {
  getFestivalStartDate,
  AREA_IMAGE_MAP,
} from '../constants.js';
import { selectAllShiftChangeRequests } from '../services/shiftChangeService.js';
import ShiftChangeRequestScreen from './ShiftChangeRequestScreen.jsx';
import ShiftChangeRequestListScreen from './ShiftChangeRequestListScreen.jsx';
import ShiftChangeHistoryScreen from './ShiftChangeHistoryScreen.jsx';

/** ブレークポイント（スマホ/PC切り替え） */
const MOBILE_BREAKPOINT = 768;

/** 画面名 */
const SCREEN_NAME = '当日部員';

/**
 * 事務シフト確認画面コンポーネント（当日部員）
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationのnavigationオブジェクト
 * @param {Object} props.route - React Navigationのrouteオブジェクト
 * @param {Object} [props.route.params] - ルートパラメータ
 * @param {string} [props.route.params.initialTab] - 初期表示タブ（通知タップ時の遷移先）
 * @returns {JSX.Element} シフト確認画面
 */
const JimuShiftScreen = ({ navigation, route }) => {
  /** 画面サイズ取得 */
  const { width } = useWindowDimensions();
  /** モバイル判定 */
  const isMobile = width < MOBILE_BREAKPOINT;
  /** 認証コンテキストからユーザー情報を取得 */
  const { userInfo, user } = useAuth();
  /** テーマを取得 */
  const { theme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const previousUnreadCountRef = useRef(0);
  const subscriptionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  /** 初期タブの設定済みフラグ（userInfo非同期ロード対応） */
  const hasSetInitialTabRef = useRef(false);
  /** Drawerフォーカス時の初回スキップフラグ（初期表示時のデータは mount 時に取得済みのためスキップ） */
  const hasInitialFocusFiredRef = useRef(false);
  /** シフト変更申請タブのリロードトリガー（Drawerフォーカス復帰時にインクリメント） */
  const [changeRequestRefreshTrigger, setChangeRequestRefreshTrigger] = useState(0);
  /** リロードボタンが押せる状態かどうか（5秒クールダウン制御） */
  const [canRefresh, setCanRefresh] = useState(true);
  /** リロードボタンのクールダウンタイマー */
  const refreshCooldownTimer = useRef(null);

  /** シフト変更申請タブの表示権限があるか（祭実長・部長） */
  const canAccessChangeRequest = useMemo(() => {
    if (!userInfo || !userInfo.roles) {
      return false;
    }
    return hasRole(userInfo.roles, '祭実長') || hasRole(userInfo.roles, '部長');
  }, [userInfo]);

  /** 事務部タブの表示権限があるか */
  const canAccessJimuTab = useMemo(() => {
    if (!userInfo || !userInfo.roles) {
      return false;
    }
    return hasRole(userInfo.roles, '事務部');
  }, [userInfo]);

  /** 選択中のタブ（'myShift' | 'changeRequest' | 'jimuRequests'） */
  const [activeTab, setActiveTab] = useState('myShift');

  /** 未対応のシフト変更申請件数（事務部向けバッジ用） */
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  /** 祭り開始日（当年） */
  const festivalStartDate = useMemo(() => getFestivalStartDate(), []);

  /**
   * 初期日付として当年の祭り開始日を返す
   * @returns {Date} 初期選択日
   */
  const getInitialDate = useCallback(() => {
    return new Date(festivalStartDate);
  }, [festivalStartDate]);

  /** 選択中の日付（マイシフトタブ用） */
  const [selectedDate, setSelectedDate] = useState(getInitialDate);
  /** 選択中の日付（シフト変更申請タブ用：タブ切り替え時に保持） */
  const [changeRequestDate, setChangeRequestDate] = useState(getInitialDate);
  /** シフトデータ */
  const [shifts, setShifts] = useState([]);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState('');
  /** 画像モーダルの表示状態 */
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  /** 選択されたエリア名 */
  const [selectedAreaName, setSelectedAreaName] = useState('');

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
   * リロードボタンのハンドラ
   * アクティブタブに応じてデータを再取得し、5秒間のクールダウンを設ける
   */
  const handleRefreshPress = useCallback(() => {
    if (!canRefresh) {
      return;
    }
    setCanRefresh(false);
    // アクティブタブに応じたリロード処理
    if (activeTab === 'myShift') {
      loadShifts();
    } else {
      setChangeRequestRefreshTrigger((n) => n + 1);
    }
    refreshCooldownTimer.current = setTimeout(() => setCanRefresh(true), 5000);
  }, [canRefresh, activeTab, loadShifts]);

  /**
   * ドロワーを開く
   */
  const openDrawer = () => {
    navigation.openDrawer();
  };

  const goToNotifications = () => {
    navigation.navigate('Notifications');
  };

  const ensureAudioUnlocked = useCallback(() => {
    if (audioUnlockedRef.current) {
      return;
    }
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    if (!(navigator?.userActivation && navigator.userActivation.isActive)) {
      return;
    }
    const context = new AudioCtx();
    try {
      if (context.state === 'suspended') {
        context.resume().catch(() => {});
      }
      audioContextRef.current = context;
      audioUnlockedRef.current = true;
    } catch (error) {
      // keep locked if resume fails
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    const context = audioContextRef.current;
    if (!context) {
      return;
    }
    if (context.state === 'suspended') {
      context.resume();
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
    }, 150);
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      previousUnreadCountRef.current = 0;
      return;
    }
    const { count } = await getUnreadCount(user.id);
    setUnreadCount(count);
    if (audioUnlockedRef.current && count > previousUnreadCountRef.current) {
      playNotificationSound();
    }
    previousUnreadCountRef.current = count;
  }, [user?.id, playNotificationSound]);

  /**
   * 未対応のシフト変更申請件数を取得・更新
   */
  const refreshPendingRequestCount = useCallback(async () => {
    if (!canAccessJimuTab) {
      return;
    }
    const { requests } = await selectAllShiftChangeRequests();
    /** status が 'pending' のもののみカウント */
    const count = requests.filter((r) => r.status === 'pending').length;
    setPendingRequestCount(count);
  }, [canAccessJimuTab]);

  useEffect(() => {
    const unlockAudio = (event) => {
      if (event && event.isTrusted) {
        ensureAudioUnlocked();
      }
    };

    const options = { once: true, capture: true };
    window.addEventListener('pointerdown', unlockAudio, options);
    window.addEventListener('keydown', unlockAudio, options);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio, options);
      window.removeEventListener('keydown', unlockAudio, options);
    };
  }, [ensureAudioUnlocked]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!user?.id) {
      return () => {};
    }
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`notification_recipients_${user.id}`);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_recipients',
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        refreshUnreadCount();
        if (audioUnlockedRef.current) {
          playNotificationSound();
        }
      }
    );
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notification_recipients',
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        refreshUnreadCount();
      }
    );
    channel.subscribe();
    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [user?.id, playNotificationSound, refreshUnreadCount]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refreshUnreadCount();
      // 初回フォーカス（初期表示）は mount 時に各タブがデータ取得済みのためスキップ
      if (!hasInitialFocusFiredRef.current) {
        hasInitialFocusFiredRef.current = true;
        return;
      }
      // 他のDrawer項目から戻ってきた時にデータをリロード
      loadShifts();
      refreshPendingRequestCount();
      setChangeRequestRefreshTrigger((n) => n + 1);
    });
    return unsubscribe;
  }, [navigation, refreshUnreadCount, loadShifts, refreshPendingRequestCount]);

  useEffect(() => {
    const handler = () => {
      refreshUnreadCount();
    };
    const unsubscribe = subscribeNotificationUpdates(handler);
    return unsubscribe;
  }, [refreshUnreadCount]);

  /** 初回マウント時に未対応件数を取得 */
  useEffect(() => {
    refreshPendingRequestCount();
  }, [refreshPendingRequestCount]);

  /**
   * 祭実長・部長はマイシフトを使わないため、初期タブをシフト変更申請に設定する
   * userInfo が非同期でロードされるため useEffect で対応
   */
  useEffect(() => {
    if (!hasSetInitialTabRef.current && canAccessChangeRequest) {
      setActiveTab('changeRequest');
      hasSetInitialTabRef.current = true;
    }
  }, [canAccessChangeRequest]);

  /**
   * 通知タップからの画面遷移に対応する
   * route.params.initialTab が設定されていればタブを切り替える
   * 適用後はパラメータをクリアして、再フォーカス時に再適用されないようにする
   */
  useEffect(() => {
    /** 遷移先タブキー */
    const newTab = route?.params?.initialTab;
    if (!newTab) {
      return;
    }
    /** 権限チェック：そのタブが表示可能かを確認 */
    const isValidTab =
      (newTab === 'myShift' && !canAccessChangeRequest) ||
      (newTab === 'changeRequest' && canAccessChangeRequest) ||
      (newTab === 'requestHistory' && canAccessChangeRequest) ||
      (newTab === 'jimuRequests' && canAccessJimuTab);

    if (isValidTab) {
      setActiveTab(newTab);
      hasSetInitialTabRef.current = true;
      // パラメータをクリアして次回フォーカス時の誤再適用を防ぐ
      navigation.setParams({ initialTab: undefined });
    }
  }, [route?.params?.initialTab, canAccessChangeRequest, canAccessJimuTab, navigation]);

  /** shift_change_requests の変更をリアルタイムで監視してカウントを更新 */
  useEffect(() => {
    if (!canAccessJimuTab) {
      return () => {};
    }
    const supabase = getSupabaseClient();
    const channel = supabase.channel('shift_change_requests_count');
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shift_change_requests' },
      () => {
        refreshPendingRequestCount();
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [canAccessJimuTab, refreshPendingRequestCount]);

  /**
   * 日付を1日進める
   */
  const goToNextDay = () => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    setSelectedDate(nextDate);
  };

  /**
   * 日付を1日戻す
   */
  const goToPreviousDay = () => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    setSelectedDate(prevDate);
  };

  /**
   * 今日の日付にジャンプ
   */
  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
  };

  /**
   * 祭り期間（開始日）にジャンプ
   */
  const goToFestival = () => {
    setSelectedDate(new Date(festivalStartDate));
  };

  /**
   * 日付の表示用文字列を生成
   * @returns {string} 表示用の日付文字列（例: "11月3日（月）"）
   */
  const getDisplayDate = () => {
    /** 曜日の配列 */
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    /** 年 */
    const year = selectedDate.getFullYear();
    /** 月（1始まり） */
    const month = selectedDate.getMonth() + 1;
    /** 日 */
    const day = selectedDate.getDate();
    /** 曜日 */
    const dayOfWeek = dayNames[selectedDate.getDay()];

    return `${year}年${month}月${day}日（${dayOfWeek}）`;
  };

  /**
   * シフトカードをタップした時の処理
   * エリアの場所を示す画像をモーダルで表示
   * @param {string} areaName - エリア名
   */
  const handleShiftCardPress = (areaName) => {
    setSelectedAreaName(areaName);
    setIsImageModalVisible(true);
  };

  /**
   * 画像モーダルを閉じる
   * モーダルのアニメーションが完了するまで、エリア名はクリアしない
   */
  const closeImageModal = () => {
    setIsImageModalVisible(false);
  };

  /**
   * モーダルの表示状態が変わったら、閉じた後にエリア名をクリア
   */
  useEffect(() => {
    if (!isImageModalVisible && selectedAreaName) {
      // フェードアニメーション完了を待つ（300ms）
      const timer = setTimeout(() => {
        setSelectedAreaName('');
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isImageModalVisible, selectedAreaName]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {isMobile ? (
          <TouchableOpacity style={styles.menuButton} onPress={openDrawer}>
            <Text style={[styles.menuButtonText, { color: theme.text }]}>☰</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.menuButton} />
        )}
        <Text style={[styles.headerTitle, { color: theme.text }]}>{SCREEN_NAME}</Text>
        <TouchableOpacity style={styles.menuButton} onPress={goToNotifications}>
          <Image
            source={require('../../../../assets/icons/bell.png')}
            style={styles.bellIcon}
            resizeMode="contain"
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* タブバーなし（一般部員向け）のリロードボタン */}
      {!canAccessChangeRequest && !canAccessJimuTab && (
        <View style={[styles.reloadOnlyRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.reloadButton,
              { borderColor: theme.border, opacity: canRefresh ? 1 : 0.4 },
            ]}
            onPress={handleRefreshPress}
            disabled={!canRefresh}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color={theme.primary} />
            <Text style={[styles.reloadButtonText, { color: theme.primary }]}>更新</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* タブバー（祭実長・部長・事務部のみ表示） */}
      {(canAccessChangeRequest || canAccessJimuTab) && (
        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {/* 祭実長・部長はマイシフトを使わないため非表示 */}
          {!canAccessChangeRequest && (
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'myShift' && [styles.tabButtonActive, { borderBottomColor: theme.primary }],
              ]}
              onPress={() => {
                setActiveTab('myShift');
                refreshPendingRequestCount();
              }}
            >
              <Text style={[
                styles.tabButtonText,
                { color: activeTab === 'myShift' ? theme.primary : theme.textSecondary },
              ]}>
                マイシフト
              </Text>
            </TouchableOpacity>
          )}
          {/* 祭実長・部長向け：シフト変更申請タブ */}
          {canAccessChangeRequest && (
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'changeRequest' && [styles.tabButtonActive, { borderBottomColor: theme.primary }],
              ]}
              onPress={() => setActiveTab('changeRequest')}
            >
              <Text style={[
                styles.tabButtonText,
                { color: activeTab === 'changeRequest' ? theme.primary : theme.textSecondary },
              ]}>
                シフト変更申請
              </Text>
            </TouchableOpacity>
          )}
          {/* 祭実長・部長向け：申請履歴タブ */}
          {canAccessChangeRequest && (
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'requestHistory' && [styles.tabButtonActive, { borderBottomColor: theme.primary }],
              ]}
              onPress={() => setActiveTab('requestHistory')}
            >
              <Text style={[
                styles.tabButtonText,
                { color: activeTab === 'requestHistory' ? theme.primary : theme.textSecondary },
              ]}>
                申請履歴
              </Text>
            </TouchableOpacity>
          )}
          {/* 事務部向け：申請一覧タブ */}
          {canAccessJimuTab && (
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'jimuRequests' && [styles.tabButtonActive, { borderBottomColor: theme.primary }],
              ]}
              onPress={() => {
                setActiveTab('jimuRequests');
                refreshPendingRequestCount();
              }}
            >
              <View style={styles.tabButtonContent}>
                <Text style={[
                  styles.tabButtonText,
                  { color: activeTab === 'jimuRequests' ? theme.primary : theme.textSecondary },
                ]}>
                  変更申請管理
                </Text>
                {pendingRequestCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          {/* リロードボタン（タブバー右端） */}
          <TouchableOpacity
            style={[
              styles.tabReloadButton,
              { borderLeftColor: theme.border, opacity: canRefresh ? 1 : 0.4 },
            ]}
            onPress={handleRefreshPress}
            disabled={!canRefresh}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color={theme.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* シフト変更申請タブの内容（祭実長・部長向け） */}
      {canAccessChangeRequest && activeTab === 'changeRequest' && (
        <ShiftChangeRequestScreen
          selectedDate={changeRequestDate}
          onDateChange={setChangeRequestDate}
          refreshTrigger={changeRequestRefreshTrigger}
          onNavigateToHistory={() => setActiveTab('requestHistory')}
        />
      )}

      {/* 申請履歴タブの内容（祭実長・部長向け） */}
      {canAccessChangeRequest && activeTab === 'requestHistory' && (
        <ShiftChangeHistoryScreen
          userId={user?.id}
          refreshTrigger={changeRequestRefreshTrigger}
        />
      )}

      {/* 変更申請管理タブの内容（事務部向け） */}
      {canAccessJimuTab && activeTab === 'jimuRequests' && (
        <ShiftChangeRequestListScreen
          onRequestProcessed={refreshPendingRequestCount}
          refreshTrigger={changeRequestRefreshTrigger}
        />
      )}

      {/* マイシフトタブの内容（祭実長・部長には非表示） */}
      {activeTab === 'myShift' && !canAccessChangeRequest && (
      <ScrollView
        style={styles.content}
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

        {/* シフト表示エリア */}
        <View style={styles.shiftArea}>
          <Text style={[styles.shiftAreaTitle, { color: theme.text }]}>あなたのシフト</Text>

          {/* ローディング中 */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>読み込み中...</Text>
            </View>
          )}

          {/* エラーメッセージ */}
          {!isLoading && errorMessage !== '' && (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: theme.primary }]}
                onPress={loadShifts}
              >
                <Text style={styles.retryButtonText}>再試行</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* シフトなし */}
          {!isLoading && errorMessage === '' && shifts.length === 0 && (
            <View style={styles.noShiftContainer}>
              <Text style={[styles.noShiftText, { color: theme.textSecondary }]}>
                この日はシフトがありません
              </Text>
            </View>
          )}

          {/* シフト一覧 */}
          {!isLoading &&
            errorMessage === '' &&
            shifts.map((shift, index) => (
              <TouchableOpacity
                key={`${shift.timeSlot}-${shift.areaName}-${index}`}
                style={[
                  styles.shiftCard,
                  {
                    backgroundColor: hexToRgba(shift.backgroundColor, 0.2),
                    borderLeftColor: shift.backgroundColor,
                  },
                ]}
                onPress={() => handleShiftCardPress(shift.areaName)}
                activeOpacity={0.7}
              >
                {/* 時間帯 */}
                <Text style={[styles.shiftTime, { color: theme.text }]}>{shift.timeSlot}</Text>
                {/* エリア名 */}
                <Text style={[styles.shiftAreaName, { color: theme.text }]}>{shift.areaName}</Text>
              </TouchableOpacity>
            ))}
        </View>
      </ScrollView>
      )}

      {/* エリア画像表示モーダル */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              { maxWidth: isMobile ? 600 : 800, backgroundColor: theme.surface },
            ]}
          >
            {/* モーダルヘッダー */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedAreaName}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeImageModal}
              >
                <Text style={[styles.modalCloseButtonText, { color: theme.text }]}>×</Text>
              </TouchableOpacity>
            </View>

            {/* 画像表示エリア */}
            <View style={styles.modalImageContainer}>
              {AREA_IMAGE_MAP[selectedAreaName] ? (
                <Image
                  source={AREA_IMAGE_MAP[selectedAreaName]}
                  style={[
                    styles.modalImage,
                    { height: isMobile ? 400 : 600 },
                  ]}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.noImageContainer}>
                  <Text style={styles.noImageText}>📷</Text>
                  <Text style={[styles.noImageDescription, { color: theme.textSecondary }]}>
                    エリア場所の画像が登録されていないか、
                  </Text>
                  <Text style={[styles.noImageDescription, { color: theme.textSecondary }]}>
                    正常に読み込めませんでした。
                  </Text>
                  <Text style={[styles.noImageHint, { color: theme.textSecondary }]}>
                    リロードしても改善されない場合は、
                  </Text>
                  <Text style={[styles.noImageHint, { color: theme.textSecondary }]}>
                    システム部または事務部までお問い合わせください。
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    fontSize: 26,
  },
  /* タブなし一般部員向けリロード行 */
  reloadOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  reloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  reloadButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  /* タブバー右端のリロードボタン */
  tabReloadButton: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  /* タブバー */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabBadge: {
    backgroundColor: '#e53935',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  bellIcon: {
    width: 22,
    height: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
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
    color: '#007AFF',
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginHorizontal: 12,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
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
  /* シフト表示エリア */
  shiftArea: {
    marginTop: 8,
  },
  shiftAreaTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  },
  /* エラー */
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    borderRadius: 8,
  },
  noShiftText: {
    fontSize: 14,
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
    marginBottom: 4,
  },
  shiftAreaName: {
    fontSize: 15,
  },
  /* モーダル */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  modalCloseButtonText: {
    fontSize: 28,
    lineHeight: 32,
  },
  modalImageContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  modalImage: {
    width: '100%',
    height: 400,
  },
  noImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  noImageText: {
    fontSize: 64,
    marginBottom: 16,
  },
  noImageDescription: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  noImageHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default JimuShiftScreen;
