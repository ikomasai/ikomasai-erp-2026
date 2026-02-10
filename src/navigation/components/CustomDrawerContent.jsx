/**
 * カスタムDrawerコンテンツ
 * 役割別に使う画面へ最短で遷移できるよう、情報密度と視認性を重視した構成。
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../shared/contexts/AuthContext';
import { useTheme } from '../../shared/hooks/useTheme';
import { canAccessScreen } from '../../services/supabase/permissionService';
import drawerAccessConfig from '../config/drawerAccessConfig';

const { buildAccessibleDrawerItems } = drawerAccessConfig;

const ITEM_ICON_MAP = Object.freeze({
  Item1: 'grid-outline',
  Item2: 'list-outline',
  Item3: 'chatbubbles-outline',
  Item4: 'construct-outline',
  Item5: 'business-outline',
  Item6: 'folder-open-outline',
  Item7: 'analytics-outline',
  Item8: 'map-outline',
  Item9: 'document-text-outline',
  Item10: 'archive-outline',
  JimuShift: 'calendar-outline',
  Item12: 'walk-outline',
  Item13: 'desktop-outline',
  Item14: 'calculator-outline',
  Item15: 'cube-outline',
  Item16: 'megaphone-outline',
  SettingsTheme: 'color-palette-outline',
});

const SectionTitle = ({ label, theme }) => (
  <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{label}</Text>
);

const DrawerItem = ({ label, iconName, isActive, onPress, theme }) => (
  <TouchableOpacity
    style={[
      styles.drawerItem,
      {
        borderColor: isActive ? theme.primary : theme.border,
        backgroundColor: isActive ? theme.primary : theme.drawerSurface || theme.surface,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.86}
  >
    <Ionicons
      name={iconName || 'ellipse-outline'}
      size={18}
      color={isActive ? theme.white || '#FFFFFF' : theme.textSecondary}
    />
    <Text
      style={[
        styles.drawerItemText,
        {
          color: isActive ? theme.white || '#FFFFFF' : theme.text,
          fontWeight: isActive ? '700' : '600',
        },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const confirmLogout = (onConfirm) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm('ログアウトしますか？')) {
      onConfirm();
    }
    return;
  }

  Alert.alert('ログアウト', 'ログアウトしますか？', [
    { text: 'キャンセル', style: 'cancel' },
    { text: 'ログアウト', style: 'destructive', onPress: onConfirm },
  ]);
};

const CustomDrawerContent = (props) => {
  const insets = useSafeAreaInsets();
  const currentRouteName = props.state.routeNames[props.state.index];
  const { userInfo, logout } = useAuth();
  const { theme } = useTheme();

  const navigateTo = (screenName) => {
    props.navigation.navigate(screenName);
  };

  const handleLogout = async () => {
    const run = async () => {
      const { success } = await logout();
      if (!success && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('ログアウトに失敗しました。');
      }
    };
    confirmLogout(run);
  };

  const accessibleItems = buildAccessibleDrawerItems({
    userRoles: userInfo?.roles || [],
    canAccessScreenFn: canAccessScreen,
  });

  const opsItems = accessibleItems.filter((item) => ['Item12', 'Item13', 'Item14', 'Item15', 'Item16'].includes(item.screenName));
  const basicItems = accessibleItems.filter((item) => !['Item12', 'Item13', 'Item14', 'Item15', 'Item16'].includes(item.screenName));

  return (
    <View style={[styles.container, { backgroundColor: theme.drawerBackground || theme.surface }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 14,
            borderBottomColor: theme.border,
            backgroundColor: theme.drawerSurface || theme.surface,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>生駒祭 ERP</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>企画管理部統合システム 2026</Text>
        <View style={[styles.userPanel, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary || theme.surface }]}>
          <Ionicons name="person-circle-outline" size={20} color={theme.primary} />
          <View style={styles.userMeta}>
            <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
              {userInfo?.name || 'ユーザー'}
            </Text>
            <Text style={[styles.userRoleText, { color: theme.textSecondary }]} numberOfLines={2}>
              {(userInfo?.roles || []).map((role) => role.name).join(' / ') || 'ロール未設定'}
            </Text>
          </View>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {opsItems.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionTitle label="業務メニュー" theme={theme} />
            {opsItems.map((item) => (
              <DrawerItem
                key={item.screenName}
                label={item.label}
                iconName={ITEM_ICON_MAP[item.screenName]}
                isActive={currentRouteName === item.screenName}
                onPress={() => navigateTo(item.screenName)}
                theme={theme}
              />
            ))}
          </View>
        ) : null}

        {basicItems.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionTitle label="その他" theme={theme} />
            {basicItems.map((item) => (
              <DrawerItem
                key={item.screenName}
                label={item.label}
                iconName={ITEM_ICON_MAP[item.screenName]}
                isActive={currentRouteName === item.screenName}
                onPress={() => navigateTo(item.screenName)}
                theme={theme}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.sectionBlock}>
          <SectionTitle label="設定" theme={theme} />
          <DrawerItem
            label="テーマ設定"
            iconName={ITEM_ICON_MAP.SettingsTheme}
            isActive={currentRouteName === 'SettingsTheme'}
            onPress={() => navigateTo('SettingsTheme')}
            theme={theme}
          />
        </View>
      </DrawerContentScrollView>

      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + 14,
            backgroundColor: theme.drawerSurface || theme.surface,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.error }]}
          onPress={handleLogout}
          activeOpacity={0.88}
        >
          <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>ログアウト</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>Version 1.0.0</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  userPanel: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  userMeta: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
  },
  userRoleText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  scrollContent: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 16,
  },
  sectionBlock: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 4,
    marginBottom: 2,
  },
  drawerItem: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerItemText: {
    flex: 1,
    fontSize: 14,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 8,
  },
  logoutButton: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default CustomDrawerContent;

