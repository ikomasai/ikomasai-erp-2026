/**
 * 項目3の定数
 */

/** 配布方式の定義 */
export const DISTRIBUTION_TYPES = {
	/** 順次案内制 */
	SEQUENTIAL: 'sequential',
	/** 時間枠定員制 */
	TIME_SLOT: 'time_slot',
};

/** ステータス表示ラベル */
export const STATUS_LABELS = {
	/** 未開始 */
	not_started: '案内前',
	/** 発券中 */
	active: '案内中',
	/** 一時停止 */
	paused: '一時停止',
	/** 満員 */
	full: '満員',
	/** 終了 */
	ended: '終了',
};

/** ステータス色 */
export const STATUS_COLORS = {
	/** 未開始 */
	not_started: '#95a5a6',
	/** 発券中 */
	active: '#2ecc71',
	/** 一時停止 */
	paused: '#f1c40f',
	/** 満員 */
	full: '#e74c3c',
	/** 終了 */
	ended: '#95a5a6',
};

/** 画面表示用ラベル */
export const SCREEN_LABELS = {
	/** 画面タイトル */
	title: 'チケット配布率',
	/** 順次案内制 */
	sequential: '順次案内制',
	/** 時間枠定員制 */
	timeSlot: '時間枠定員制',
	/** 全て */
	all: '全て',
	/** 表示フィルタ */
	filterLabel: '表示フィルタ',
	/** 日付検索 */
	dateSearch: '日付検索',
	/** 日付選択の全件表示 */
	allDates: '全ての日付',
	/** 時間検索 */
	timeSearch: '時間検索',
	/** 全ての時間 */
	allTimes: '全ての時間',
	/** 適用中 */
	activeFilters: '適用中',
};

