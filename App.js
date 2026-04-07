/**
 * アプリケーションエントリーポイント
 * React Native Expo テンプレート
 */

import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/shared/contexts/AuthContext';
import { ThemeProvider } from './src/shared/contexts/ThemeContext';
import { TerminalProvider } from './src/shared/contexts/TerminalContext';
import { FontLoaderProvider } from './src/shared/components';
import AppNavigator from './src/navigation/AppNavigator';

/**
 * アプリケーションルートコンポーネント
 * @returns {JSX.Element} アプリケーション
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <TerminalProvider>
            <FontLoaderProvider>
              <AppNavigator />
            </FontLoaderProvider>
          </TerminalProvider>
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
