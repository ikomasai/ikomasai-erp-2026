/**
 * 全画面端末モーダルの開閉状態を管理するContext
 * DrawerNavigator がサイドバー幅を動的に制御するために使用する
 */

import React, { createContext, useCallback, useContext, useState } from 'react';

/** Context オブジェクト */
const TerminalContext = createContext({
  /** 端末モーダルが開いているか */
  isTerminalOpen: false,
  /** 端末を開く */
  openTerminal: () => {},
  /** 端末を閉じる */
  closeTerminal: () => {},
});

/**
 * 全画面端末Context プロバイダー
 * @param {Object} props - プロパティ
 * @param {React.ReactNode} props.children - 子要素
 * @returns {JSX.Element} プロバイダー
 */
export const TerminalProvider = ({ children }) => {
  /** 端末モーダルが開いているか */
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  /**
   * 端末を開く
   * @returns {void}
   */
  const openTerminal = useCallback(() => {
    setIsTerminalOpen(true);
  }, []);

  /**
   * 端末を閉じる
   * @returns {void}
   */
  const closeTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  return (
    <TerminalContext.Provider value={{ isTerminalOpen, openTerminal, closeTerminal }}>
      {children}
    </TerminalContext.Provider>
  );
};

/**
 * TerminalContext を使用するカスタムフック
 * @returns {{ isTerminalOpen: boolean, openTerminal: Function, closeTerminal: Function }} Context値
 */
export const useTerminal = () => useContext(TerminalContext);
