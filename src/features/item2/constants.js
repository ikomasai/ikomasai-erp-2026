/**
 * 厚生部呼び出しシステムの定数
 */

/** 画面タイトル一覧 */
export const ITEM2_TITLES = {
	HOME: '厚生部呼び出し',
	CREATE: '呼び出し作成',
	LIST: '対応一覧',
	EMERGENCY: '緊急対応',
	CHAT: 'チャット',
};

/** 呼び出し種別 */
export const ITEM2_CALL_TYPES = {
	EMERGENCY: 'emergency',
	NON_URGENT: 'non_urgent',
};

/** ステータス定義 */
export const ITEM2_CALL_STATUSES = {
	UNHANDLED: 'unhandled',
	IN_PROGRESS: 'in_progress',
	RESOLVED: 'resolved',
};

/** item2 の内部表示モード */
export const ITEM2_VIEW_MODES = {
	CREATE: 'create',
	CHAT: 'chat',
	LIST: 'list',
	EMERGENCY: 'emergency',
};

/** 不急時の選択肢 */
export const ITEM2_NON_URGENT_PURPOSES = [
	'絆創膏が欲しい',
	'熱を測りたい',
	'その他',
];

/** システムメッセージ文言 */
export const ITEM2_SYSTEM_MESSAGES = {
	OTHER_PURPOSE: '厚生部に何をして欲しいのか教えてください',
	EMERGENCY_DESCRIPTION: '状況を説明してください。',
	DELETED: 'このメッセージは削除されました',
};

/** 既読操作ラベル */
export const ITEM2_READ_ACTION_LABEL = '既読にする';

/** Realtime チャンネル名のプレフィックス */
export const ITEM2_REALTIME_CHANNEL_PREFIX = 'item2-room';

/** SQLite データベース名 */
export const ITEM2_LOCAL_DB_NAME = 'item2_local_chat.db';

/** SQLite ローカルキューテーブル名 */
export const ITEM2_LOCAL_QUEUE_TABLE = 'item2_local_messages';

/** Realtime presence の TTL 参考値（秒） */
export const ITEM2_PRESENCE_TTL_SECONDS = 30;

/** バッチ再送最大回数 */
export const ITEM2_BATCH_RETRY_LIMIT = 5;

/** ステータス表示色 */
export const ITEM2_STATUS_COLORS = {
	unhandled: '#ef6c00',
	in_progress: '#1565c0',
	resolved: '#2e7d32',
	emergency: '#c62828',
};
