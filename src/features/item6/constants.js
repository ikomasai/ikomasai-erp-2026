/**
 * 厚生部場所管理 Item6 の定数
 */

export const SCREEN_NAME = '厚生部場所管理';

export const ROUTE_NAME = 'Item6';

export const ROLE_NAMES = {
  welfare: '厚生部',
  manager: '部長',
  admin: '管理者',
};

export const LOCATION_ACTION_TYPES = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  selfRegister: 'self_register',
  statusChange: 'status_change',
};

/**
 * 厚生部員のステータス
 * 厚生部長が配置状況を把握するための3つの状態
 * - stationed: 特定の場所に配置中
 * - patrolling: 巡回中（移動中のため特定の場所に紐づかない）
 * - away: 一時的に持ち場を離れている
 */
export const MEMBER_STATUS = {
  /** 配置中: 特定の場所にいる */
  stationed: 'stationed',
  /** 巡回中: 複数の場所を移動中 */
  patrolling: 'patrolling',
  /** 離席中: 一時的に持ち場を離れている */
  away: 'away',
};

/**
 * ステータスの表示ラベル
 */
export const MEMBER_STATUS_LABELS = {
  stationed: '配置中',
  patrolling: '巡回中',
  away: '離席中',
};

/**
 * キャンパスマップの中心座標とズーム範囲
 * ピンの位置がずれる場合は以下の手順でキャリブレーションする:
 * 1. Google マップで map.png の四隅にある建物の緯度経度を調べる
 * 2. latitude / longitude を画像中心の座標に合わせる
 * 3. latitudeDelta / longitudeDelta を画像の南北・東西の範囲に合わせる
 * 例: 画像の北端が 34.654, 南端が 34.649 なら latitudeDelta = 0.005
 */
export const DEFAULT_MAP_REGION = {
  latitude: 34.651251510533875,
  longitude: 135.58943350065954,
  latitudeDelta: 0.0045,
  longitudeDelta: 0.0045,
};

/**
 * キャンパス画像の座標範囲（DEFAULT_MAP_REGION から自動計算）
 * この範囲が画像ピクセル [0,0]〜[900,1191] にマッピングされる
 */
export const CAMPUS_BOUNDS = {
  latitudeMin: DEFAULT_MAP_REGION.latitude - DEFAULT_MAP_REGION.latitudeDelta / 2,
  latitudeMax: DEFAULT_MAP_REGION.latitude + DEFAULT_MAP_REGION.latitudeDelta / 2,
  longitudeMin: DEFAULT_MAP_REGION.longitude - DEFAULT_MAP_REGION.longitudeDelta / 2,
  longitudeMax: DEFAULT_MAP_REGION.longitude + DEFAULT_MAP_REGION.longitudeDelta / 2,
};
