/**
 * item14 会計対応画面
 */

import React from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { canAccessManagementSupportScreen } from '../../../services/supabase/permissionService';
import { SUPPORT_DESK_ROLE_TYPES } from '../../../services/supabase/supportTicketService';
import { SCREEN_DESCRIPTION, SCREEN_NAME } from '../constants';
import SupportDeskScreen from '../../support/components/SupportDeskScreen';
import SupportScreenAccessGuard from '../../support/components/SupportScreenAccessGuard';

/**
 * item14 画面
 * @param {Object} props - コンポーネント引数
 * @param {Object} props.navigation - React Navigation の navigation
 * @returns {JSX.Element} item14 画面
 */
const Item14Screen = ({ navigation }) => {
  /** ログインユーザー情報 */
  const { userInfo } = useAuth();
  /** 会計対応の閲覧権限 */
  const isRoleReady = Array.isArray(userInfo?.roles);
  const canAccess = !isRoleReady || canAccessManagementSupportScreen(userInfo?.roles || [], 'item14');

  return (
    <SupportScreenAccessGuard
      canAccess={canAccess}
      navigation={navigation}
      title={SCREEN_NAME}
      message="会計対応は会計部のみ閲覧できます。"
    >
      <SupportDeskScreen
        navigation={navigation}
        screenName={SCREEN_NAME}
        screenDescription={SCREEN_DESCRIPTION}
        roleType={SUPPORT_DESK_ROLE_TYPES.ACCOUNTING}
      />
    </SupportScreenAccessGuard>
  );
};

export default Item14Screen;
