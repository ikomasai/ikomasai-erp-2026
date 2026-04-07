/**
 * 設定画面
 * パスワード変更・テーマ設定・管理者通知送信を1ページに統合した設定画面
 * 各セクションが縦に並び、ScrollViewでスクロール表示する
 */

import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { isAdmin } from '../../../services/supabase/permissionService';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import SettingsSection from '../components/SettingsSection';
import SettingsPasswordSection from '../components/SettingsPasswordSection';
import SettingsThemeSection from '../components/SettingsThemeSection';
import SettingsAdminNotificationSection from '../components/SettingsAdminNotificationSection';
import {
  SETTINGS_SCREEN_TITLE,
  SETTINGS_SECTION_TITLES,
} from '../constants';

/**
 * 設定画面コンポーネント
 * 全設定セクションを1ページに統合して表示する
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.navigation - React Navigationオブジェクト
 * @returns {JSX.Element} 設定画面
 */
const SettingsScreen = ({ navigation }) => {
  /** テーマコンテキスト */
  const { theme } = useTheme();
  /** 認証コンテキスト */
  const { userInfo } = useAuth();
  /** 管理者権限の有無 */
  const isUserAdmin = useMemo(() => isAdmin(userInfo?.roles || []), [userInfo?.roles]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ヘッダー */}
      <ThemedHeader title={SETTINGS_SCREEN_TITLE} navigation={navigation} />

      {/* セクション一覧（ScrollView） */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* アカウントセクション: パスワード変更 */}
          <SettingsSection title={SETTINGS_SECTION_TITLES.ACCOUNT}>
            <SettingsPasswordSection />
          </SettingsSection>

          {/* 表示セクション: テーマ設定 */}
          <SettingsSection title={SETTINGS_SECTION_TITLES.DISPLAY}>
            <SettingsThemeSection />
          </SettingsSection>

          {/* 管理者セクション: 通知送信（管理者のみ表示） */}
          {isUserAdmin && (
            <SettingsSection title={SETTINGS_SECTION_TITLES.ADMIN}>
              <SettingsAdminNotificationSection />
            </SettingsSection>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  /** 画面全体のコンテナ */
  container: {
    flex: 1,
  },
  /** スクロールビュー */
  scrollView: {
    flex: 1,
  },
  /** スクロールビューのコンテンツ */
  scrollContent: {
    paddingVertical: 20,
  },
  /** コンテンツエリア（最大幅制限） */
  content: {
    paddingHorizontal: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
});

export default SettingsScreen;
