/**
 * 迷子検索機能の定数定義
 */

/** 性別の選択肢 */
export const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: 'その他', value: 'other' },
];

/** 保護テントの選択肢 */
export const SHELTER_TENT_OPTIONS = [
  { label: '西門前テント', value: 'west_gate' },
  { label: 'B館前テント', value: 'b_building' },
  { label: '人工芝グラウンド前テント', value: 'artificial_turf' },
  { label: '移動不可', value: 'unable_to_move' },
];

/** ステータスの定義 */
export const MISSING_CHILD_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
};

/** ステータスの日本語ラベル */
export const MISSING_CHILD_STATUS_LABELS = {
  [MISSING_CHILD_STATUS.PENDING]: '未対応',
  [MISSING_CHILD_STATUS.IN_PROGRESS]: '対応中',
  [MISSING_CHILD_STATUS.ON_HOLD]: '保留中',
  [MISSING_CHILD_STATUS.COMPLETED]: '対応完了',
};

/** ステータスのバッジ色 */
export const MISSING_CHILD_STATUS_COLORS = {
  [MISSING_CHILD_STATUS.PENDING]: '#9E9E9E',
  [MISSING_CHILD_STATUS.IN_PROGRESS]: '#2196F3',
  [MISSING_CHILD_STATUS.ON_HOLD]: '#FFC107',
  [MISSING_CHILD_STATUS.COMPLETED]: '#4CAF50',
};

/** 管理ロールが変更可能なステータス一覧 */
export const ADMIN_CHANGEABLE_STATUSES = [
  MISSING_CHILD_STATUS.IN_PROGRESS,
  MISSING_CHILD_STATUS.ON_HOLD,
  MISSING_CHILD_STATUS.COMPLETED,
];

/** 性別の日本語ラベル */
export const GENDER_LABELS = {
  male: '男',
  female: '女',
  other: 'その他',
};

/** 保護テントの日本語ラベル */
export const SHELTER_TENT_LABELS = {
  west_gate: '西門前テント',
  b_building: 'B館前テント',
  artificial_turf: '人工芝グラウンド前テント',
  unable_to_move: '移動不可',
};

/** 移動不可を示す値 */
export const UNABLE_TO_MOVE = 'unable_to_move';

/** 管理ロールのID一覧（通知送信に使用） */
export const ADMIN_ROLE_IDS = [
  '0ed76a89-e49c-4389-b029-66140f0640ca', // 実長
  '565c0702-b387-4a94-8a94-7fb50f3ffe49', // 渉外部
  '218895bb-a3bc-4754-b4e5-55ade68374a6', // 管理者
];

/** 管理ロール名一覧（権限判定に使用） */
export const ADMIN_ROLE_NAMES = ['実長', '渉外部', '管理者'];

/** 実長ロール名（全データ削除の権限判定に使用） */
export const JITCHO_ROLE_NAME = '実長';

/** 特徴入力のプレースホルダ */
export const CHARACTERISTICS_PLACEHOLDER = '服装や所持品、身長など';

/** 緊急バッジの色（移動不可時） */
export const URGENCY_BADGE_COLOR = '#F44336';

/** 緊急カードの枠線色（移動不可時） */
export const URGENCY_CARD_BORDER_COLOR = '#F44336';

/** 緊急カードの背景色（移動不可時） */
export const URGENCY_CARD_BACKGROUND_COLOR = '#FFF3F3';

/** デバッグモードフラグ（本番リリース時にfalseにする） */
export const IS_DEBUG_MODE = true;
