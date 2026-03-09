/**
 * Drawerナビゲーター
 * サイドバー付きのメインナビゲーション
 * PC：常時表示サイドバー / スマホ：ハンバーガーメニュー
 * 各画面はError Boundaryでラップされ、エラー時はフォールバック表示
 */

import React from 'react';
import { useWindowDimensions } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import CustomDrawerContent from './components/CustomDrawerContent';
import ScreenErrorBoundary from '../shared/components/ScreenErrorBoundary';

/* 各項目の画面をインポート */
import EventsStallsList01Screen from '../features/01_Events&Stalls_list/screens/EventsStallsList01Screen';
import Item2Screen from '../features/item2/screens/Item2Screen';
import Item3Screen from '../features/item3/screens/Item3Screen';
import Item4Screen from '../features/item4/screens/Item4Screen';
import Item5Screen from '../features/item5/screens/Item5Screen';
import Item6Screen from '../features/item6/screens/Item6Screen';
import Item7Screen from '../features/item7/screens/Item7Screen';
import Item8Screen from '../features/item8/screens/Item8Screen';
import Item9Screen from '../features/item9/screens/Item9Screen';
import Item10Screen from '../features/item10/screens/Item10Screen';
import JimuShiftScreen from '../features/jimu-shift/screens/JimuShiftScreen';
import SettingsThemeScreen from '../features/settings/screens/SettingsThemeScreen';
import AdminTestNotificationScreen from '../features/admin/screens/AdminTestNotificationScreen';
import NotificationListScreen from '../features/notifications/screens/NotificationListScreen';

/** Drawerナビゲーター */
const Drawer = createDrawerNavigator();

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
   * @param {Object} props - React Navigationから渡されるprops
   * @returns {JSX.Element} ラップされた画面
   */
  const WrappedScreen = (props) => {
    return (
      <ScreenErrorBoundary screenName={screenName} navigation={props.navigation}>
        <ScreenComponent {...props} />
      </ScreenErrorBoundary>
    );
  };

  return WrappedScreen;
};

/* Error Boundaryでラップした画面コンポーネント */
const WrappedEventsStallsList01Screen = createWrappedScreen(EventsStallsList01Screen, '企画・屋台一覧');
const WrappedItem2Screen = createWrappedScreen(Item2Screen, '厚生部呼び出し');
const WrappedItem3Screen = createWrappedScreen(Item3Screen, '項目3');
const WrappedItem4Screen = createWrappedScreen(Item4Screen, '落とし物検索');
const WrappedItem5Screen = createWrappedScreen(Item5Screen, '項目5');
const WrappedItem6Screen = createWrappedScreen(Item6Screen, '項目6');
const WrappedItem7Screen = createWrappedScreen(Item7Screen, '項目7');
const WrappedItem8Screen = createWrappedScreen(Item8Screen, '項目8');
const WrappedItem9Screen = createWrappedScreen(Item9Screen, '実長機能');
const WrappedItem10Screen = createWrappedScreen(Item10Screen, '本部');
const WrappedJimuShiftScreen = createWrappedScreen(JimuShiftScreen, '当日部員');
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

  return (
    <Drawer.Navigator
      initialRouteName="01_Events&Stalls_list"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isMobile ? 'front' : 'permanent',
        drawerStyle: {
          width: DRAWER_WIDTH,
          backgroundColor: '#1a1a2e',
        },
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        swipeEnabled: isMobile,
      }}
    >
      {/* 項目1〜10、事務シフト（Error Boundaryでラップ済み） */}
      <Drawer.Screen
        name="01_Events&Stalls_list"
        component={WrappedEventsStallsList01Screen}
        options={{ title: '企画・屋台一覧' }}
      />
      <Drawer.Screen name="Item2" component={WrappedItem2Screen} options={{ title: '厚生部呼び出し' }} />
      <Drawer.Screen name="Item3" component={WrappedItem3Screen} />
      <Drawer.Screen name="Item4" component={WrappedItem4Screen} options={{ title: '落とし物検索' }} />
      <Drawer.Screen name="Item5" component={WrappedItem5Screen} />
      <Drawer.Screen name="Item6" component={WrappedItem6Screen} />
      <Drawer.Screen name="Item7" component={WrappedItem7Screen} />
      <Drawer.Screen name="Item8" component={WrappedItem8Screen} />
      <Drawer.Screen name="Item9" component={WrappedItem9Screen} />
      <Drawer.Screen
        name="Item10"
        component={WrappedItem10Screen}
        options={{ title: '本部' }}
      />
      <Drawer.Screen name="JimuShift" component={WrappedJimuShiftScreen} options={{ title: '当日部員' }} />
      <Drawer.Screen name="SettingsTheme" component={WrappedSettingsThemeScreen} />
      <Drawer.Screen name="AdminTestNotification" component={WrappedAdminTestNotificationScreen} />
      <Drawer.Screen name="Notifications" component={WrappedNotificationListScreen} />
    </Drawer.Navigator>
  );
};

export default DrawerNavigator;
