/**
 * item15 物品対応画面
 */

import React from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { canAccessManagementSupportScreen } from '../../../services/supabase/permissionService';
import { SUPPORT_DESK_ROLE_TYPES } from '../../../services/supabase/supportTicketService';
import { SCREEN_DESCRIPTION, SCREEN_NAME } from '../constants';
import SupportDeskScreen from '../../support/components/SupportDeskScreen';
import SupportScreenAccessGuard from '../../support/components/SupportScreenAccessGuard';

/**
 * item15 画面
 * @param {Object} props - コンポーネント引数
 * @param {Object} props.navigation - React Navigation の navigation
 * @returns {JSX.Element} item15 画面
 */
const Item15Screen = ({ navigation }) => {
  /** ログインユーザー情報 */
  const { userInfo } = useAuth();
  /** 物品対応の閲覧権限 */
  const isRoleReady = Array.isArray(userInfo?.roles);
  const canAccess = !isRoleReady || canAccessManagementSupportScreen(userInfo?.roles || [], 'item15');

  return (
    <SupportScreenAccessGuard
      canAccess={canAccess}
      navigation={navigation}
      title={SCREEN_NAME}
      message="物品対応は物品部のみ閲覧できます。"
    >
      <SupportDeskScreen
        navigation={navigation}
        screenName={SCREEN_NAME}
        screenDescription={SCREEN_DESCRIPTION}
        roleType={SUPPORT_DESK_ROLE_TYPES.PROPERTY}
      />
    </SupportScreenAccessGuard>
  );
};

export default Item15Screen;
