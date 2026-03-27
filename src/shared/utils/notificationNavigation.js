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
  /** 迷子通知（実長・渉外部向け：迷子管理タブへ） */
  missing_child: { screen: 'Item5', tab: 'manage' },
  /** 鍵の事前申請（本部向け：本部サポートの鍵管理タブへ） */
  key_preapply: { screen: 'Item13', tab: 'keys' },
};

/**
 * 通知タイプから遷移先情報を返す
 * @param {string|undefined} type - 通知タイプ（notification.metadata.type）
 * @returns {{ screen: string, tab: string } | null} 遷移先情報（遷移先が未定義の場合null）
 */
export const getNavigationTargetByType = (type) => {
  if (!type) {
    return null;
  }
  return NAVIGATION_TARGET_BY_TYPE[type] ?? null;
};

/**
 * 通知タイプに対応する「確認する」ボタンのラベルを返す
 * 遷移先が未定義の場合は null を返す（ボタンを非表示にする）
 * @param {string|undefined} type - 通知タイプ
 * @returns {string|null} ボタンラベル
 */
export const getNavigationButtonLabel = (type) => {
  if (!getNavigationTargetByType(type)) {
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
    case 'missing_child':
      return '申請を確認する';
    case 'key_preapply':
      return '鍵申請を確認する';
    default:
      return '確認する';
  }
};
