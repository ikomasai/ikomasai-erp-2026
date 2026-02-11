/**
 * 認証コンテキスト
 * アプリケーション全体で認証状態を管理します
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signIn,
  signOut,
  getSession,
  onAuthStateChange,
} from '../../services/supabase/authService.js';
import { selectUserInfo } from '../../services/supabase/userService.js';

/**
 * 認証コンテキスト
 */
const AuthContext = createContext({
  user: null,
  userInfo: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

/**
 * 認証コンテキストプロバイダー
 * @param {Object} props - プロパティ
 * @param {React.ReactNode} props.children - 子コンポーネント
 */
export const AuthProvider = ({ children }) => {
  // ユーザー情報（auth.users）
  const [user, setUser] = useState(null);
  // ユーザー詳細情報（user_profiles + roles）
  const [userInfo, setUserInfo] = useState(null);
  // セッション情報
  const [session, setSession] = useState(null);
  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 初回マウント時にセッションをチェック
   */
  useEffect(() => {
    checkSession();
  }, []);

  /**
   * 認証状態の変化を監視
   */
  useEffect(() => {
    const subscription = onAuthStateChange(async (event, session) => {
      console.log('認証状態変化:', event);

      if (session) {
        setSession(session);
        setUser(session.user);
        await loadUserInfo(session.user.id);
      } else {
        setSession(null);
        setUser(null);
        setUserInfo(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  /**
   * 現在のセッションをチェック
   */
  const checkSession = async () => {
    try {
      setIsLoading(true);
      const { session, error } = await getSession();

      if (error) {
        console.error('セッションチェックエラー:', error);
        setSession(null);
        setUser(null);
        setUserInfo(null);
        return;
      }

      if (session) {
        setSession(session);
        setUser(session.user);
        await loadUserInfo(session.user.id);
      }
    } catch (error) {
      console.error('セッションチェック処理でエラーが発生:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ユーザー情報を読み込む
   * @param {String} userId - ユーザーID
   */
  const loadUserInfo = async (userId) => {
    try {
      const { userInfo, error } = await selectUserInfo(userId);

      if (error) {
        console.error('ユーザー情報読み込みエラー:', error);
        return;
      }

      setUserInfo(userInfo);
    } catch (error) {
      console.error('ユーザー情報読み込み処理でエラーが発生:', error);
    }
  };

  /**
   * ログイン処理
   * @param {String} email - メールアドレス
   * @param {String} password - パスワード
   * @returns {Promise<Object>} ログイン結果
   */
  const login = async (email, password) => {
    try {
      const { user, session, error } = await signIn(email, password);

      if (error) {
        return { success: false, error };
      }

      setSession(session);
      setUser(user);
      await loadUserInfo(user.id);

      return { success: true, error: null };
    } catch (error) {
      console.error('ログイン処理でエラーが発生:', error);
      return { success: false, error };
    }
  };

  /**
   * ログアウト処理
   * @returns {Promise<Object>} ログアウト結果
   */
  const logout = async () => {
    try {
      setIsLoading(true);
      const { error } = await signOut();

      if (error) {
        return { success: false, error };
      }

      setSession(null);
      setUser(null);
      setUserInfo(null);

      return { success: true, error: null };
    } catch (error) {
      console.error('ログアウト処理でエラーが発生:', error);
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 認証済みかどうか
   */
  const isAuthenticated = !!user && !!session;

  /**
   * コンテキストの値
   */
  const value = {
    user,
    userInfo,
    session,
    isLoading,
    isAuthenticated,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * 認証コンテキストを使用するカスタムフック
 * @returns {Object} 認証コンテキストの値
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
