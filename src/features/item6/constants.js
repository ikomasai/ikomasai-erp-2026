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
};

export const MAP_INTERACTION_MODES = {
  move: 'move',
  pin: 'pin',
};

export const DEFAULT_MAP_REGION = {
  latitude: 34.651251510533875,
  longitude: 135.58943350065954,
  latitudeDelta: 0.0045,
  longitudeDelta: 0.0045,
};

export const CAMPUS_BOUNDS = {
  latitudeMin: DEFAULT_MAP_REGION.latitude - DEFAULT_MAP_REGION.latitudeDelta / 2,
  latitudeMax: DEFAULT_MAP_REGION.latitude + DEFAULT_MAP_REGION.latitudeDelta / 2,
  longitudeMin: DEFAULT_MAP_REGION.longitude - DEFAULT_MAP_REGION.longitudeDelta / 2,
  longitudeMax: DEFAULT_MAP_REGION.longitude + DEFAULT_MAP_REGION.longitudeDelta / 2,
};
