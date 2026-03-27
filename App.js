/**
 * アプリケーションエントリーポイント
 * React Native Expo テンプレート
 */

import React from 'react';
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
    <AuthProvider>
      <ThemeProvider>
        <TerminalProvider>
          <FontLoaderProvider>
            <AppNavigator />
          </FontLoaderProvider>
        </TerminalProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
