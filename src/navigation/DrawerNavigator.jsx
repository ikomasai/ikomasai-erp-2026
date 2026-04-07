/**
 * Drawerナビゲーター
 * サイドバー付きのメインナビゲーション
 * PC：常時表示サイドバー / スマホ：ハンバーガーメニュー
 * 各画面はError Boundaryでラップされ、エラー時はフォールバック表示
 */

import React, { useRef, useEffect } from 'react';
import { Platform, useWindowDimensions, View, Animated } from 'react-native';
import { createDrawerNavigator, useDrawerStatus } from '@react-navigation/drawer';
import { useTheme } from '../shared/hooks/useTheme';
import { useTerminal } from '../shared/contexts/TerminalContext';
import CustomDrawerContent from './components/CustomDrawerContent';
import ScreenErrorBoundary from '../shared/components/ScreenErrorBoundary';

/* 各項目の画面をインポート */
import EventsStallsList01Screen from '../features/01_Events&Stalls_list/screens/EventsStallsList01Screen';
import TimeScheduleScreen from '../features/TimeSchedule/screens/TimeScheduleScreen';
import Item2Screen from '../features/item2/screens/Item2Screen';
import Item3Screen from '../features/item3/screens/Item3Screen';
import Item4Screen from '../features/item4/screens/Item4Screen';
import Item5Screen from '../features/item5/screens/Item5Screen';
import KoseibuLocationScreen from '../features/item6/screens/KoseibuLocationScreen';
import Item7Screen from '../features/item7/screens/Item7Screen';
import Item8Screen from '../features/item8/screens/Item8Screen';
import Item9Screen from '../features/item9/screens/Item9Screen';
import Item10Screen from '../features/item10/screens/Item10Screen';
import Item12Screen from '../features/item12/screens/Item12Screen';
import Item13Screen from '../features/item13/screens/Item13Screen';
import Item14Screen from '../features/item14/screens/Item14Screen';
import Item15Screen from '../features/item15/screens/Item15Screen';
import Item16Screen from '../features/item16/screens/Item16Screen';
import JimuShiftScreen from '../features/jimu-shift/screens/JimuShiftScreen';
import SettingsScreen from '../features/settings/screens/SettingsScreen';
import SettingsThemeScreen from '../features/settings/screens/SettingsThemeScreen';
import AdminTestNotificationScreen from '../features/admin/screens/AdminTestNotificationScreen';
import NotificationListScreen from '../features/notifications/screens/NotificationListScreen';

/** Drawerナビゲーター */
const Drawer = createDrawerNavigator();

/** スワイプ開始を受け付ける左端の幅 (px) */
const SWIPE_EDGE_WIDTH = 60;

/** ドロワーを開くのに必要な最低スワイプ距離 (px) */
const SWIPE_MIN_DISTANCE = 50;

/** スワイプ中にドロワーがピークする最大幅 (px) */
const PEEK_MAX_WIDTH = 30;



/** ブレークポイント（スマホ/PC切り替え） */
const MOBILE_BREAKPOINT = 768;

/** サイドバーの幅 */
const DRAWER_WIDTH = 280;

/**
 * Error Boundaryでラップされた画面を生成するファクトリ関数
 * @param {React.ComponentType} ScreenComponent - ラップする画面コンポーネント
 * @param {string} screenName - 画面名（日本語）
 * @returns {Function} ラップされた画面コンポーネント
 */
const createWrappedScreen = (ScreenComponent, screenName) => {
  /**
   * Error Boundaryでラップされた画面
   * スワイプでドロワーを開く機能をdocumentのtouch/mouseイベントとして登録する
   * （ラッパーView自体にはpanHandlersを付けず、画面左端エリアでのスワイプをグローバルリスナーで検知する）
   * @param {Object} props - React Navigationから渡されるprops
   * @returns {JSX.Element} ラップされた画面
   */
  const WrappedScreen = (props) => {
    /** テーマ */
    const { theme } = useTheme();
    /** 画面幅 */
    const { width } = useWindowDimensions();
    /** モバイル判定 */
    const isMobile = width < MOBILE_BREAKPOINT;
    /** ドロワーの開閉状態 */
    const drawerStatus = useDrawerStatus();
    /** ドロワーが開いているかどうか */
    const isDrawerOpen = drawerStatus === 'open';

    /** navigationをrefで保持してuseEffect内から最新状態を参照可能にする */
    const navigationRef = useRef(props.navigation);
    navigationRef.current = props.navigation;

    /** ドロワー開閉状態をrefで保持してtouchイベント内から参照可能にする */
    const isDrawerOpenRef = useRef(false);
    isDrawerOpenRef.current = isDrawerOpen;

    /**
     * ピーク表示のtranslateX
     * -DRAWER_WIDTH = 完全に画面外（非表示）
     * -DRAWER_WIDTH + PEEK_MAX_WIDTH = 少しはみ出した状態
     */
    const peekTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

    /**
     * ドロワーが開いたときにピークをリセットする
     */
    useEffect(() => {
      if (isDrawerOpen) {
        peekTranslateX.setValue(-DRAWER_WIDTH);
      }
    }, [isDrawerOpen, peekTranslateX]);

    /**
     * ドキュメントレベルのタッチイベントで左端スワイプを検知してドロワーを開く
     * React Nativeのresponderシステムを使わないためUI要素のタッチを一切ブロックしない
     * モバイル幅かつwebプラットフォームのときのみ登録する
     */
    useEffect(() => {
      if (!isMobile || Platform.OS !== 'web') return;

      /** タッチ開始座標 */
      let startX = 0;
      let startY = 0;

      /** touchstart: 開始座標を記録 */
      const handleTouchStart = (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      };

      /** touchmove: 左端起点の右スワイプ中にピーク表示を更新 */
      const handleTouchMove = (e) => {
        if (isDrawerOpenRef.current) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        /** 水平方向が支配的なスワイプのみ反応 */
        if (startX < SWIPE_EDGE_WIDTH && dx > 0 && Math.abs(dx) > Math.abs(dy)) {
          const peekAmount = Math.min(dx * 0.3, PEEK_MAX_WIDTH);
          peekTranslateX.setValue(-DRAWER_WIDTH + peekAmount);
        }
      };

      /** touchend: 距離が十分なら開く、足りなければピークをアニメーションで戻す */
      const handleTouchEnd = (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (isDrawerOpenRef.current || startX >= SWIPE_EDGE_WIDTH) return;
        if (dx > SWIPE_MIN_DISTANCE) {
          peekTranslateX.setValue(-DRAWER_WIDTH);
          navigationRef.current.openDrawer();
        } else if (peekTranslateX._value > -DRAWER_WIDTH) {
          Animated.timing(peekTranslateX, {
            toValue: -DRAWER_WIDTH,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
      };

      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }, [isMobile, peekTranslateX]);

    return (
      <View style={{ flex: 1 }}>
        <ScreenErrorBoundary screenName={screenName} navigation={props.navigation}>
          <ScreenComponent {...props} />
        </ScreenErrorBoundary>
        {/* ピーク表示（pointerEvents="none" でタッチを遮断しない） */}
        {isMobile && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: DRAWER_WIDTH,
              backgroundColor: theme.surface,
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              transform: [{ translateX: peekTranslateX }],
              zIndex: 998,
              /** 右端ボーダーでピーク時の縁を強調（影と違い要素外にはみ出さないため常時表示でも安全） */
              borderRightWidth: 4,
              borderRightColor: theme.border,
            }}
          />
        )}
      </View>
    );
  };

  return WrappedScreen;
};

/* Error Boundaryでラップした画面コンポーネント */
const WrappedEventsStallsList01Screen = createWrappedScreen(EventsStallsList01Screen, '企画・屋台一覧');
const WrappedTimeScheduleScreen = createWrappedScreen(TimeScheduleScreen, 'タイムスケジュール');
const WrappedItem2Screen = createWrappedScreen(Item2Screen, '項目2');
const WrappedItem3Screen = createWrappedScreen(Item3Screen, '項目3');
const WrappedItem4Screen = createWrappedScreen(Item4Screen, '落とし物検索');
const WrappedItem5Screen = createWrappedScreen(Item5Screen, '迷子検索');
const WrappedItem6Screen = createWrappedScreen(KoseibuLocationScreen, '厚生部場所管理');
const WrappedItem7Screen = createWrappedScreen(Item7Screen, 'アクセス権限制御');
const WrappedItem8Screen = createWrappedScreen(Item8Screen, '項目8');
const WrappedItem9Screen = createWrappedScreen(Item9Screen, '実長機能');
const WrappedItem10Screen = createWrappedScreen(Item10Screen, '本部');
const WrappedItem12Screen = createWrappedScreen(Item12Screen, '巡回サポート');
const WrappedItem13Screen = createWrappedScreen(Item13Screen, '本部サポート');
const WrappedItem14Screen = createWrappedScreen(Item14Screen, '会計対応');
const WrappedItem15Screen = createWrappedScreen(Item15Screen, '物品対応');
const WrappedItem16Screen = createWrappedScreen(Item16Screen, '企画者サポート');
const WrappedJimuShiftScreen = createWrappedScreen(JimuShiftScreen, '当日部員');
const WrappedSettingsScreen = createWrappedScreen(SettingsScreen, '設定');
const WrappedSettingsThemeScreen = createWrappedScreen(SettingsThemeScreen, 'テーマ設定');
const WrappedAdminTestNotificationScreen = createWrappedScreen(AdminTestNotificationScreen, '通知送信（管理者）');
const WrappedNotificationListScreen = createWrappedScreen(NotificationListScreen, '通知一覧');

/**
 * Drawerナビゲーターコンポーネント
 * @returns {JSX.Element} Drawerナビゲーター
 */
const DrawerNavigator = () => {
  /** 画面サイズ取得 */
  const { width } = useWindowDimensions();
  /** モバイル判定 */
  const isMobile = width < MOBILE_BREAKPOINT;
  /** 全画面端末が開いているかどうか */
  const { isTerminalOpen } = useTerminal();

  /**
   * 全画面端末が開いているとき（Web PC のみ）サイドバーを非表示にする
   * 端末モーダルは position: fixed でビューポート全体を覆うが、
   * permanent drawer がその上に描画されるため、幅を 0 にして完全に隠す
   */
  const shouldHideSidebar = isTerminalOpen && !isMobile && Platform.OS === 'web';

  return (
    <Drawer.Navigator
      initialRouteName="01_Events&Stalls_list"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isMobile ? 'front' : 'permanent',
        drawerStyle: {
          width: shouldHideSidebar ? 0 : DRAWER_WIDTH,
          backgroundColor: '#1a1a2e',
          /** 幅0のとき内容がはみ出さないようにクリップ */
          overflow: 'hidden',
        },
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        swipeEnabled: isMobile,
        /** スワイプ開始を認識する左端の幅（デフォルト32pxより広く設定してスワイプしやすくする） */
        swipeEdgeWidth: 60,
      }}
    >
      {/* 項目1〜10、事務シフト（Error Boundaryでラップ済み） */}
      <Drawer.Screen name="01_Events&Stalls_list" component={WrappedEventsStallsList01Screen} options={{ title: '企画・屋台一覧' }}　/>
      <Drawer.Screen name="TimeSchedule" component={WrappedTimeScheduleScreen} options={{ title: 'タイムスケジュール' }} />
      <Drawer.Screen name="Item2" component={WrappedItem2Screen} />
      <Drawer.Screen name="Item3" component={WrappedItem3Screen} />
      <Drawer.Screen name="Item4" component={WrappedItem4Screen} options={{ title: '落とし物検索' }} />
      <Drawer.Screen name="Item5" component={WrappedItem5Screen} options={{ title: '迷子検索' }} />
      <Drawer.Screen name="Item6" component={WrappedItem6Screen} options={{ title: '厚生部場所管理' }}/>
      <Drawer.Screen name="Item7" component={WrappedItem7Screen} options={{ title: 'アクセス権限制御' }} />
      <Drawer.Screen name="Item8" component={WrappedItem8Screen} />
      <Drawer.Screen name="Item9" component={WrappedItem9Screen} />
      <Drawer.Screen name="Item10" component={WrappedItem10Screen} options={{ title: '本部' }} />
      <Drawer.Screen name="Item12" component={WrappedItem12Screen} options={{ title: '巡回サポート' }} />
      <Drawer.Screen name="Item13" component={WrappedItem13Screen} options={{ title: '本部サポート' }} />
      <Drawer.Screen name="Item14" component={WrappedItem14Screen} options={{ title: '会計対応' }} />
      <Drawer.Screen name="Item15" component={WrappedItem15Screen} options={{ title: '物品対応' }} />
      <Drawer.Screen name="Item16" component={WrappedItem16Screen} options={{ title: '企画者サポート' }} />
      <Drawer.Screen name="JimuShift" component={WrappedJimuShiftScreen} options={{ title: '当日部員' }} />
      <Drawer.Screen name="Settings" component={WrappedSettingsScreen} options={{ title: '設定' }} />
      <Drawer.Screen name="SettingsTheme" component={WrappedSettingsThemeScreen} />
      <Drawer.Screen name="AdminTestNotification" component={WrappedAdminTestNotificationScreen} />
      <Drawer.Screen name="Notifications" component={WrappedNotificationListScreen} />
    </Drawer.Navigator>
  );
};

export default DrawerNavigator;
