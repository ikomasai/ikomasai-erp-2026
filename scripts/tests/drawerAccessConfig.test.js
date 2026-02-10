const test = require('node:test');
const assert = require('node:assert/strict');

const drawerAccessConfig = require('../../src/navigation/config/drawerAccessConfig');

const createMockCanAccessScreen = () => {
  return (userRoles, permissionName) => {
    if (!Array.isArray(userRoles) || userRoles.length === 0) {
      return false;
    }

    return userRoles.some((role) => {
      const screens = role?.permissions?.screens;
      return Array.isArray(screens) && screens.includes(permissionName);
    });
  };
};

test('項目12〜16のマッピングが正しい', () => {
  assert.equal(drawerAccessConfig.getPermissionNameByItemNumber(12), 'item12');
  assert.equal(drawerAccessConfig.getPermissionNameByItemNumber(13), 'item13');
  assert.equal(drawerAccessConfig.getPermissionNameByItemNumber(14), 'item14');
  assert.equal(drawerAccessConfig.getPermissionNameByItemNumber(15), 'item15');
  assert.equal(drawerAccessConfig.getPermissionNameByItemNumber(16), 'item16');

  assert.equal(drawerAccessConfig.getScreenNameByItemNumber(12), 'Item12');
  assert.equal(drawerAccessConfig.getScreenNameByItemNumber(13), 'Item13');
  assert.equal(drawerAccessConfig.getScreenNameByItemNumber(14), 'Item14');
  assert.equal(drawerAccessConfig.getScreenNameByItemNumber(15), 'Item15');
  assert.equal(drawerAccessConfig.getScreenNameByItemNumber(16), 'Item16');

  assert.equal(drawerAccessConfig.getLabelByItemNumber(12), '巡回');
  assert.equal(drawerAccessConfig.getLabelByItemNumber(13), '本部');
  assert.equal(drawerAccessConfig.getLabelByItemNumber(14), '会計');
  assert.equal(drawerAccessConfig.getLabelByItemNumber(15), '物品');
  assert.equal(drawerAccessConfig.getLabelByItemNumber(16), '企画者');
});

test('permissions.screens にない項目は表示されない', () => {
  const canAccessScreenFn = createMockCanAccessScreen();
  const userRoles = [
    {
      permissions: {
        screens: ['item1', 'item12'],
      },
    },
  ];

  const items = drawerAccessConfig.buildAccessibleDrawerItems({
    userRoles,
    canAccessScreenFn,
  });

  assert.deepEqual(
    items.map((item) => item.screenName),
    ['Item1', 'Item12']
  );
});

test('既存項目 item1〜item11 の表示判定が維持される', () => {
  const canAccessScreenFn = createMockCanAccessScreen();
  const userRoles = [
    {
      permissions: {
        screens: ['item5', '当日部員'],
      },
    },
  ];

  const items = drawerAccessConfig.buildAccessibleDrawerItems({
    userRoles,
    canAccessScreenFn,
  });

  const normalized = items.map((item) => ({
    number: item.number,
    label: item.label,
    screenName: item.screenName,
    permissionName: item.permissionName,
  }));

  assert.deepEqual(normalized, [
    {
      number: 5,
      label: '項目5',
      screenName: 'Item5',
      permissionName: 'item5',
    },
    {
      number: 11,
      label: '当日部員',
      screenName: 'JimuShift',
      permissionName: '当日部員',
    },
  ]);
});
