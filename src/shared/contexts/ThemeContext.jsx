/**
 * テーマコンテキスト
 * アプリ全体のテーマ状態を管理
 */

import React, { createContext, useState, useEffect, useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_MODES, getThemeTokens } from '../utils/themeTokens';
import themeModeCompatibility from '../utils/themeModeCompatibility';
import { themeSettingsService } from '../services/themeSettingsService';
import { AuthContext } from './AuthContext';

export const ThemeContext = createContext();

const THEME_STORAGE_KEY = '@ikomasai_theme';
const { normalizeThemeMode } = themeModeCompatibility;

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(THEME_MODES.LIGHT);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    loadTheme();
  }, [user]);

  const loadTheme = async () => {
    try {
      if (user?.id) {
        const savedTheme = await themeSettingsService.getThemeSettings(user.id);
        if (savedTheme) {
          const normalizedSavedTheme = normalizeThemeMode(savedTheme, THEME_MODES.LIGHT);
          setThemeMode(normalizedSavedTheme);
          await AsyncStorage.setItem(THEME_STORAGE_KEY, normalizedSavedTheme);
        } else {
          const localTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
          if (localTheme) {
            const normalizedLocalTheme = normalizeThemeMode(localTheme, THEME_MODES.LIGHT);
            setThemeMode(normalizedLocalTheme);
            if (normalizedLocalTheme !== localTheme) {
              await AsyncStorage.setItem(THEME_STORAGE_KEY, normalizedLocalTheme);
            }
          }
        }
      } else {
        const localTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (localTheme) {
          const normalizedLocalTheme = normalizeThemeMode(localTheme, THEME_MODES.LIGHT);
          setThemeMode(normalizedLocalTheme);
          if (normalizedLocalTheme !== localTheme) {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, normalizedLocalTheme);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeTheme = async (newMode) => {
    try {
      const normalizedNewMode = normalizeThemeMode(newMode, THEME_MODES.LIGHT);
      // 光過敏性てんかん対策: ゆっくりフェード処理
      setIsTransitioning(true);
      
      // フェードアウト開始（透明度を徐々に上げる）
      setOverlayOpacity(0);
      await new Promise(resolve => setTimeout(resolve, 50));
      setOverlayOpacity(0.95);
      
      // フェードアウト完了を待つ
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // テーマ変更
      setThemeMode(normalizedNewMode);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, normalizedNewMode);

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // フェードイン開始（透明度を徐々に下げる）
      setOverlayOpacity(0);
      
      // フェードイン完了を待つ
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setIsTransitioning(false);

      if (user?.id) {
        const success = await themeSettingsService.saveThemeSettings(user.id, normalizedNewMode);
        return success;
      }
      return true;
    } catch (error) {
      console.error('Failed to change theme:', error);
      setIsTransitioning(false);
      setOverlayOpacity(0);
      return false;
    }
  };

  const theme = getThemeTokens(themeMode);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        theme,
        changeTheme,
        loading,
        isTransitioning,
      }}
    >
      <>
        {children}
        {isTransitioning && (
          <View style={[styles.globalOverlay, { opacity: overlayOpacity }]} />
        )}
      </>
    </ThemeContext.Provider>
  );
};

const styles = StyleSheet.create({
  globalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 99999,
    transition: 'opacity 800ms ease-in-out',
  },
});
