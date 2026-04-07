/**
 * item13 本部サポート画面
 */

import React from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { canAccessManagementSupportScreen } from '../../../services/supabase/permissionService';
import { SUPPORT_DESK_ROLE_TYPES } from '../../../services/supabase/supportTicketService';
import { SCREEN_DESCRIPTION, SCREEN_NAME } from '../constants';
import SupportDeskScreen from '../../support/components/SupportDeskScreen';
import SupportScreenAccessGuard from '../../support/components/SupportScreenAccessGuard';

/**
 * item13 画面
 * @param {Object} props - コンポーネント引数
 * @param {Object} props.navigation - React Navigation の navigation
 * @param {Object} props.route - React Navigation の route
 * @returns {JSX.Element} item13 画面
 */
const Item13Screen = ({ navigation, route }) => {
  /** ログインユーザー情報 */
  const { userInfo } = useAuth();
  /** 通知遷移用の初期タブ */
  const initialTab = route?.params?.initialTab || null;
  /** 本部サポートの閲覧権限 */
  const isRoleReady = Array.isArray(userInfo?.roles);
  const canAccess = !isRoleReady || canAccessManagementSupportScreen(userInfo?.roles || [], 'item13');

  return (
    <SupportScreenAccessGuard
      canAccess={canAccess}
      navigation={navigation}
      title={SCREEN_NAME}
      message="本部サポートは管理者のみ閲覧できます。企画管理部は巡回サポートを利用してください。"
    >
      <SupportDeskScreen
        navigation={navigation}
        screenName={SCREEN_NAME}
        screenDescription={SCREEN_DESCRIPTION}
        roleType={SUPPORT_DESK_ROLE_TYPES.HQ}
        initialTab={initialTab}
      />
    </SupportScreenAccessGuard>
  );
};

export default Item13Screen;
