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
  /** 厚生部呼び出し作成（対応一覧へ） */
  item2_call_created: { screen: 'Item2', tab: 'list' },
  /** 厚生部呼び出しの対応者設定（呼び出し履歴/対応一覧へ） */
  item2_responder_assigned: { screen: 'Item2', tab: 'list' },
  /** 迷子通知（実長・渉外部向け：迷子管理タブへ） */
  missing_child: { screen: 'Item5', tab: 'manage' },
  /** 鍵の事前申請（本部向け：本部サポートの鍵管理タブへ） */
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
 * support_contact_update（返信・ステータス変更）の遷移先を返す
 * この通知は連絡案件の作成者（企画者）に送られるため、
 * 常に企画者サポート（Item16）の質問タブへ遷移する
 * @returns {{ screen: string, tab: string }}
 */
const getSupportContactUpdateTarget = () => {
  // 企画者（チケット作成者）への通知なので常に企画者サポートへ遷移する
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

  /** 企画者への返信・ステータス変更通知は常に企画者サポートへ */
  if (type === 'support_contact_update') {
    return getSupportContactUpdateTarget();
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
    case 'item2_call_created':
      return '対応一覧を確認する';
    case 'item2_responder_assigned':
      return '呼び出し状況を確認する';
    case 'missing_child':
      return '申請を確認する';
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
    case 'support_contact_update':
      // 企画者サポートへの遷移なので固定ラベル
      return '連絡案件を確認する';
    default:
      return '確認する';
  }
};
