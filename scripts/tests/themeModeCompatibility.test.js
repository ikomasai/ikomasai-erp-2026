const test = require('node:test');
const assert = require('node:assert/strict');

const themeModeCompatibility = require('../../src/shared/utils/themeModeCompatibility');

test('正規テーマ一覧が5件である', () => {
  assert.deepEqual(themeModeCompatibility.CANONICAL_THEME_MODES, [
    'light',
    'dark',
    'joshi',
    'cyber',
    'neon',
  ]);
});

test('正規値は normalizeThemeMode でそのまま使える', () => {
  assert.equal(themeModeCompatibility.normalizeThemeMode('light'), 'light');
  assert.equal(themeModeCompatibility.normalizeThemeMode('dark'), 'dark');
  assert.equal(themeModeCompatibility.normalizeThemeMode('joshi'), 'joshi');
  assert.equal(themeModeCompatibility.normalizeThemeMode('cyber'), 'cyber');
  assert.equal(themeModeCompatibility.normalizeThemeMode('neon'), 'neon');
});

test('旧値 world_trigger/eva は cyber/neon に変換される', () => {
  assert.equal(themeModeCompatibility.normalizeThemeMode('world_trigger'), 'cyber');
  assert.equal(themeModeCompatibility.normalizeThemeMode('eva'), 'neon');
});

test('不正値はフォールバックへ変換される', () => {
  assert.equal(themeModeCompatibility.normalizeThemeMode('unknown'), 'light');
  assert.equal(themeModeCompatibility.normalizeThemeMode(null), 'light');
  assert.equal(themeModeCompatibility.normalizeThemeMode('', 'dark'), 'dark');
  assert.equal(themeModeCompatibility.normalizeThemeMode('unknown', 'joshi'), 'joshi');
});

test('正規値判定と旧値判定ができる', () => {
  assert.equal(themeModeCompatibility.isCanonicalThemeMode('cyber'), true);
  assert.equal(themeModeCompatibility.isCanonicalThemeMode('world_trigger'), false);
  assert.equal(themeModeCompatibility.isLegacyThemeMode('world_trigger'), true);
  assert.equal(themeModeCompatibility.isLegacyThemeMode('neon'), false);
});

test('UI表示名の対応が取得できる', () => {
  assert.equal(themeModeCompatibility.getThemeModeDisplayName('light'), 'ライトモード');
  assert.equal(themeModeCompatibility.getThemeModeDisplayName('world_trigger'), 'サイバーモード');
  assert.equal(themeModeCompatibility.getThemeModeDisplayName('eva'), 'ネオンモード');
  assert.equal(themeModeCompatibility.getThemeModeDisplayName('unknown'), 'ライトモード');
});
