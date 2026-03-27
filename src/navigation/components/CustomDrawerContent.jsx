/**
 * カスタムDrawerコンテンツ
 * サイドバーのUI・スタイルをカスタマイズ
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../shared/contexts/AuthContext';
import { useTheme } from '../../shared/hooks/useTheme';
import {
  canAccessManagementSupportScreen,
  canAccessScreen,
} from '../../services/supabase/permissionService';

/**
 * ドロワーアイテムコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.label - 表示ラベル
 * @param {boolean} props.isActive - アクティブ状態かどうか
 * @param {Function} props.onPress - タップ時のコールバック
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} ドロワーアイテム
 */
const DrawerItem = ({ label, isActive, onPress, theme }) => {
  return (
    <TouchableOpacity
      style={[
        styles.drawerItem,
        {
          backgroundColor: isActive ? theme.primary : 'transparent',
        }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.drawerItemText,
        {
          color: isActive ? '#FFFFFF' : theme.textSecondary,
          fontWeight: isActive ? '600' : 'normal',
        }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

/**
 * カスタムDrawerコンテンツコンポーネント
 * @param {Object} props - React Navigationから渡されるprops
 * @returns {JSX.Element} カスタムDrawer
 */
const CustomDrawerContent = (props) => {
  /** 画面サイズを取得 */
  const { width } = useWindowDimensions();
  /** SafeAreaのInsets */
  const insets = useSafeAreaInsets();
  /** 現在のルート名 */
  const currentRouteName = props.state.routeNames[props.state.index];
  /** 認証コンテキスト */
  const { userInfo, logout } = useAuth();
  /** テーマコンテキスト */
  const { theme } = useTheme();

  /**
   * 画面遷移処理
   * @param {string} screenName - 遷移先画面名
   */
  const navigateTo = (screenName) => {
    props.navigation.navigate(screenName);
  };

  /**
   * ログアウト処理
   */
  const handleLogout = async () => {
    // Web版での確認ダイアログ
    const confirmed = window.confirm('ログアウトしますか？');

    if (!confirmed) {
      return;
    }

    const { success, error } = await logout();
    if (!success) {
      window.alert('ログアウトに失敗しました');
    }
  };

  /**
   * 項目ラベルのマッピング
   * 項目番号に対応する表示名を定義
   */
  const ITEM_LABELS = {
    1: '企画・屋台一覧',
    3: 'チケット配布率',
    4: '落とし物検索',
    5: '迷子検索',
    9: '実長機能',
    10: '本部',
    11: '当日部員',
    12: '巡回サポート',
    13: '本部サポート',
    14: '会計対応',
    15: '物品対応',
    16: '企画者サポート',
  };

  /**
   * アクセス可能な項目をフィルタリング
   */
  /**
   * 画面名のマッピング
   * 項目番号に対応するナビゲーション画面名を定義
   */
  const SCREEN_NAME_MAP = {
    1: '01_Events&Stalls_list',
    11: 'JimuShift',
  };

  /**
   * 権限チェック用のスクリーン名マッピング
   * Supabaseのpermissions.screensに格納されている名前と対応
   */
  const PERMISSION_NAME_MAP = {
    1: '企画・屋台一覧',
    4: '落とし物検索',
    5: '迷子検索',
    9: '実長機能',
    10: '本部',
    11: '当日部員',
  };

  const accessibleItems = Array.from({ length: 16 }, (_, index) => {
    const itemNumber = index + 1;
    // カスタム権限名があればそれを使用、なければデフォルト
    const permissionName = PERMISSION_NAME_MAP[itemNumber] || `item${itemNumber}`;
    const isManagementSupportScreen = ['item12', 'item13', 'item14', 'item15'].includes(permissionName);
    const isAccessible = isManagementSupportScreen
      ? canAccessManagementSupportScreen(userInfo?.roles || [], permissionName)
      : canAccessScreen(userInfo?.roles || [], permissionName);
    // カスタムラベルがあればそれを使用、なければデフォルト
    const label = ITEM_LABELS[itemNumber] || `項目${itemNumber}`;
    // カスタム画面名があればそれを使用、なければデフォルト
    const navigationName = SCREEN_NAME_MAP[itemNumber] || `Item${itemNumber}`;

    return {
      number: itemNumber,
      label: label,
      screenName: navigationName,
      isAccessible,
    };
  }).filter((item) => item.isAccessible);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>生駒祭 ERP</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>2026</Text>
        {userInfo && (
          <View style={[styles.userInfo, { borderTopColor: theme.border }]}>
            <Text style={[styles.userName, { color: theme.text }]}>{userInfo.name}</Text>
            {userInfo.roles && userInfo.roles.length > 0 && (
              <Text style={[styles.userOrganization, { color: theme.textSecondary }]}>
                {userInfo.roles.map((role) => role.name).join(', ')}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* メニューアイテム */}
      <ScrollView
        style={styles.menuContainer}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        {/* アクセス可能な項目のみ表示 */}
        {accessibleItems.length > 0 ? (
          accessibleItems.map((item) => (
            <DrawerItem
              key={item.screenName}
              label={item.label}
              isActive={currentRouteName === item.screenName}
              onPress={() => navigateTo(item.screenName)}
              theme={theme}
            />
          ))
        ) : (
          <View style={styles.noAccessContainer}>
            <Text style={[styles.noAccessText, { color: theme.textSecondary }]}>
              アクセス可能な項目がありません
            </Text>
          </View>
        )}

        {/* 設定セクション */}
        <View style={[styles.settingsSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.settingsSectionTitle, { color: theme.textSecondary }]}>設定</Text>
          <DrawerItem
            label="設定"
            isActive={currentRouteName === 'Settings'}
            onPress={() => navigateTo('Settings')}
            theme={theme}
          />
        </View>
      </ScrollView>

      {/* フッター */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: theme.border }]}>
        {/* ログアウトボタン */}
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: theme.error }]} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>ログアウト</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>v1.0.0</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  userInfo: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userOrganization: {
    fontSize: 12,
    marginTop: 4,
  },
  menuContainer: {
    flex: 1,
  },
  menuContent: {
    paddingVertical: 12,
  },
  drawerItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  drawerItemText: {
    fontSize: 16,
  },
  noAccessContainer: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
  },
  noAccessText: {
    fontSize: 14,
    textAlign: 'center',
  },
  settingsSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  logoutButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 12,
  },
});

export default CustomDrawerContent;
