/**
 * 通知機能の使用例
 * 各機能から通知を送信する実装サンプル
 */

import { sendNotification } from '../shared/services/sendNotification';
import { NOTIFICATION_TYPES } from '../features/notifications/constants/notificationType';

/**
 * 使用例1: 屋台管理機能から屋台停止を通知
 */
export const notifyVendorStop = async (vendorId, vendorName) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.VENDOR_STOP,
    message: `屋台番号${vendorId}「${vendorName}」が出店停止しました`,
    recipientRoles: '屋台部', // rolesテーブルのnameフィールドを直接指定
    title: '屋台停止のお知らせ',
    deepLink: `/item5/vendor/${vendorId}`,
    metadata: {
      vendorId,
      vendorName,
      action: 'vendor_stopped',
    },
  });

  if (result.success) {
    console.log('屋台停止通知を送信しました:', result.notificationId);
  } else {
    console.error('通知の送信に失敗しました:', result.error);
  }

  return result;
};

/**
 * 使用例2: 在庫管理機能から在庫アラートを通知
 */
export const notifyInventoryAlert = async (circleId, circleName, remainingStock) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.INVENTORY_ALERT,
    message: `${circleName}の在庫が残り${remainingStock}個です。補充が必要です。`,
    recipientRoles: '環境部',
    title: '在庫アラート',
    deepLink: `/item3/inventory/${circleId}`,
    metadata: {
      circleId,
      circleName,
      remainingStock,
      alertLevel: remainingStock < 10 ? 'critical' : 'warning',
    },
  });

  return result;
};

/**
 * 使用例3: スケジュール管理機能からスケジュール変更を通知
 */
export const notifyScheduleChange = async (venueName, changeDetails) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.SCHEDULE_CHANGE,
    message: `${venueName}のタイムテーブルが更新されました`,
    recipientRoles: '企画制作部',
    title: 'スケジュール変更のお知らせ',
    deepLink: '/item7/schedule',
    metadata: {
      venueName,
      changeDetails,
      changedAt: new Date().toISOString(),
    },
  });

  return result;
};

/**
 * 使用例4: 会計機能から日報完了を通知
 */
export const notifyDailyReportCompleted = async (reportDate) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.SUCCESS,
    message: `${reportDate}の日報提出が完了しました`,
    recipientRoles: '会計部',
    title: '日報提出完了',
    deepLink: `/item8/daily-report/${reportDate}`,
  });

  return result;
};

/**
 * 使用例5: システム管理から全員に緊急通知
 */
export const notifySystemMaintenance = async (startTime, endTime) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.WARNING,
    message: `システムメンテナンスを実施します。期間: ${startTime} ～ ${endTime}`,
    recipientRoles: ['管理者', '実長', '事務部'], // 複数のロール名を配列で指定
    title: 'システムメンテナンスのお知らせ',
    metadata: {
      maintenanceStartTime: startTime,
      maintenanceEndTime: endTime,
      type: 'scheduled_maintenance',
    },
  });

  return result;
};

/**
 * 使用例6: エラー発生時に管理者に通知
 */
export const notifySystemError = async (errorMessage, errorStack) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.ERROR,
    message: `システムエラーが発生しました: ${errorMessage}`,
    recipientRoles: '管理者',
    title: 'システムエラー',
    metadata: {
      errorMessage,
      errorStack,
      occurredAt: new Date().toISOString(),
      severity: 'high',
    },
  });

  return result;
};

/**
 * 使用例7: サークル責任者に連絡事項を通知
 */
export const notifyCircleLeaders = async (message) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.INFO,
    message: message,
    recipientRoles: '部長',
    title: '部長へのお知らせ',
  });

  return result;
};

/**
 * 使用例8: 複数のロールに同時通知
 */
export const notifyMultipleRoles = async (message, roles) => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.INFO,
    message: message,
    recipientRoles: roles, // 配列で複数ロール名を指定（例: ['環境部', '屋台部']）
    title: '重要なお知らせ',
  });

  return result;
};

/**
 * 使用例9: カスタムメタデータ付き通知
 */
export const notifyWithCustomMetadata = async () => {
  const result = await sendNotification({
    type: NOTIFICATION_TYPES.USER_ACTION,
    message: 'タスクが完了しました',
    recipientRoles: '実長',
    metadata: {
      taskId: 'task_123',
      taskName: '在庫確認',
      completedBy: 'user_456',
      completedAt: new Date().toISOString(),
      customField1: 'value1',
      customField2: 'value2',
    },
  });

  return result;
};

/**
 * 使用例10: コンポーネント内での使用
 */
export const ExampleComponent = () => {
  const handleSubmit = async () => {
    try {
      // データ処理...
      
      // 成功通知を送信
      await sendNotification({
        type: NOTIFICATION_TYPES.SUCCESS,
        message: 'データが正常に保存されました',
        recipientRoles: '事務部',
      });

      // 画面遷移など...
    } catch (error) {
      // エラー通知を送信
      await sendNotification({
        type: NOTIFICATION_TYPES.ERROR,
        message: `エラーが発生しました: ${error.message}`,
        recipientRoles: '管理者',
      });
    }
  };

  return null; // 実際のUIはここに
};
