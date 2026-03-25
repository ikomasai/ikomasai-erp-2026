/**
 * 通知ナビゲーションユーティリティ
 * 通知タイプから遷移先画面・タブを解決するユーティリティ関数を提供します
 *
 * 新しい通知タイプで別の画面への遷移が必要になった場合は、
 * NAVIGATION_TARGET_BY_TYPE にエントリを追加してください
 */

/**
 * 通知タイプに対応する遷移先設定の一覧
 * key: metadata.type の値
 * screen: Drawerナビゲーター上の画面名
 * tab: 画面内タブのキー（タブ付き画面の場合）
 */
const NAVIGATION_TARGET_BY_TYPE = {
  /** シフト変更申請（事務部向け：変更申請管理タブへ） */
  shift_change_request: { screen: 'JimuShift', tab: 'jimuRequests' },
  /** 救援申請（事務部向け：変更申請管理タブへ） */
  shift_rescue_request: { screen: 'JimuShift', tab: 'jimuRequests' },
  /** シフト変更完了通知（申請者向け：申請履歴タブへ） */
  shift_change_completed: { screen: 'JimuShift', tab: 'requestHistory' },
  /** シフト変更却下通知（申請者向け：申請履歴タブへ） */
  shift_change_rejected: { screen: 'JimuShift', tab: 'requestHistory' },
  /** シフトリマインド（マイシフトタブへ） */
  shift_reminder: { screen: 'JimuShift', tab: 'myShift' },
  /** 鍵の事前申請（本部サポートの鍵管理タブへ） */
  key_preapply: { screen: 'Item13', tab: 'keys' },
  /** 企画ルール変更・配置図変更（本部サポートへ） */
  rule_question: { screen: 'Item13', tab: 'tickets' },
  layout_change: { screen: 'Item13', tab: 'tickets' },
  /** 企画開始・終了報告（本部サポートへ） */
  start_report: { screen: 'Item13', tab: 'tickets' },
  end_report: { screen: 'Item13', tab: 'tickets' },
  /** 緊急呼び出し（本部サポートへ） */
  emergency: { screen: 'Item13', tab: 'tickets' },
  /** 商品配布基準変更（会計対応へ） */
  distribution_change: { screen: 'Item14', tab: 'tickets' },
  /** 物品破損報告（物品対応へ） */
  damage_report: { screen: 'Item15', tab: 'tickets' },
  /** 担当者への巡回タスク割当（巡回タスク画面へ） */
  patrol_task_assigned: { screen: 'Item12', tab: 'tasks' },
};

/**
 * support_contact_update（返信・ステータス変更）の遷移先を
 * metadata の notify_target から解決する
 * - accounting → Item14（会計対応）
 * - property   → Item15（物品対応）
 * - その他     → Item16（企画者サポート）
 * @param {string|undefined} notifyTarget - metadata.notify_target の値
 * @returns {{ screen: string, tab: string }}
 */
const getSupportContactUpdateTarget = (notifyTarget) => {
  if (notifyTarget === 'accounting') {
    return { screen: 'Item14', tab: 'tickets' };
  }
  if (notifyTarget === 'property') {
    return { screen: 'Item15', tab: 'tickets' };
  }
  return { screen: 'Item16', tab: 'question' };
};

/**
 * 通知メタデータから遷移先情報を返す
 * type が support_contact_update の場合は notify_target も参照して振り分ける
 * @param {string|undefined} type - 通知タイプ（notification.metadata.type）
 * @param {Object|undefined} [metadata={}] - 通知メタデータ全体
 * @returns {{ screen: string, tab: string } | null} 遷移先情報（遷移先が未定義の場合null）
 */
export const getNavigationTargetByType = (type, metadata = {}) => {
  if (!type) {
    return null;
  }

  /** 企画者への返信・ステータス変更通知は notify_target で振り分け */
  if (type === 'support_contact_update') {
    return getSupportContactUpdateTarget(metadata?.notify_target);
  }

  return NAVIGATION_TARGET_BY_TYPE[type] ?? null;
};

/**
 * 通知タイプに対応する「確認する」ボタンのラベルを返す
 * 遷移先が未定義の場合は null を返す（ボタンを非表示にする）
 * @param {string|undefined} type - 通知タイプ
 * @param {Object|undefined} [metadata={}] - 通知メタデータ全体
 * @returns {string|null} ボタンラベル
 */
export const getNavigationButtonLabel = (type, metadata = {}) => {
  if (!getNavigationTargetByType(type, metadata)) {
    return null;
  }
  switch (type) {
    case 'shift_change_request':
    case 'shift_rescue_request':
      return '申請を確認する';
    case 'shift_change_completed':
    case 'shift_change_rejected':
      return '申請履歴を確認する';
    case 'shift_reminder':
      return 'マイシフトを確認する';
    case 'key_preapply':
      return '鍵申請を確認する';
    case 'rule_question':
    case 'layout_change':
    case 'start_report':
    case 'end_report':
    case 'emergency':
      return '本部サポートを確認する';
    case 'distribution_change':
      return '会計対応を確認する';
    case 'damage_report':
      return '物品対応を確認する';
    case 'patrol_task_assigned':
      return '巡回タスクを確認する';
    case 'support_contact_update': {
      /** notify_target によってラベルを変える */
      const notifyTarget = metadata?.notify_target;
      if (notifyTarget === 'accounting') return '会計対応を確認する';
      if (notifyTarget === 'property') return '物品対応を確認する';
      return '連絡案件を確認する';
    }
    default:
      return '確認する';
  }
};
