import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  canAccessScreen,
  canUseFeature,
  getAccessibleScreens,
} from '../../src/services/supabase/permissionService.js';

const require = createRequire(import.meta.url);
const drawerAccessConfig = require('../../src/navigation/config/drawerAccessConfig');

const sampleRoles = [
  {
    name: 'HQ',
    permissions: {
      screens: ['item1', 'item13'],
      features: {
        item13: ['read', 'write'],
      },
    },
  },
  {
    name: 'Patrol',
    permissions: {
      screens: ['item12'],
      features: {
        item12: ['accept', 'complete'],
      },
    },
  },
];

test('permissionService: canAccessScreen is false for ungranted screens and true for granted screens', () => {
  assert.equal(canAccessScreen(sampleRoles, 'item14'), false);
  assert.equal(canAccessScreen(sampleRoles, 'item13'), true);
  assert.equal(canAccessScreen(sampleRoles, 'item12'), true);
});

test('permissionService: canUseFeature validates screen-level feature permissions', () => {
  assert.equal(canUseFeature(sampleRoles, 'item13', 'write'), true);
  assert.equal(canUseFeature(sampleRoles, 'item13', 'delete'), false);
  assert.equal(canUseFeature(sampleRoles, 'item15', 'read'), false);
});

test('permissionService: getAccessibleScreens merges all role screens without duplicates', () => {
  const screens = getAccessibleScreens([
    ...sampleRoles,
    {
      name: 'AnotherRole',
      permissions: {
        screens: ['item13', 'item16'],
      },
    },
  ]);

  assert.deepEqual(screens.sort(), ['item1', 'item12', 'item13', 'item16']);
});

test('drawerAccessConfig + permissionService: screens not in permissions.screens stay hidden', () => {
  const items = drawerAccessConfig.buildAccessibleDrawerItems({
    userRoles: sampleRoles,
    canAccessScreenFn: canAccessScreen,
  });
  const itemNumbers = items.map((item) => item.number).sort((left, right) => left - right);

  assert.deepEqual(itemNumbers, [1, 12, 13]);
  assert.equal(itemNumbers.includes(14), false);
  assert.equal(itemNumbers.includes(15), false);
  assert.equal(itemNumbers.includes(16), false);
});
