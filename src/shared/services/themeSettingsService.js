/**
 * テーマ設定サービス
 * Supabaseとの通信を管理
 */

import { supabase } from '../../services/supabase/client';
import themeModeCompatibility from '../utils/themeModeCompatibility';

const { normalizeThemeMode } = themeModeCompatibility;

export const themeSettingsService = {
  async getThemeSettings(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('theme_mode')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to get theme settings:', error);
        return null;
      }

      if (!data?.theme_mode) {
        return null;
      }

      return normalizeThemeMode(data.theme_mode);
    } catch (error) {
      console.error('Failed to get theme settings:', error);
      return null;
    }
  },

  async saveThemeSettings(userId, themeMode) {
    try {
      const normalizedThemeMode = normalizeThemeMode(themeMode);
      const { error } = await supabase
        .from('user_profiles')
        .update({
          theme_mode: normalizedThemeMode,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Failed to save theme settings:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to save theme settings:', error);
      return false;
    }
  },
};
