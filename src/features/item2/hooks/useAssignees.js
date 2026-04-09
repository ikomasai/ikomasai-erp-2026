/**
 * item2 担当者モーダルフック
 */

import { useCallback, useMemo, useState } from 'react';

/**
 * 担当者選択 UI を扱うフック
 * @returns {Object} モーダル状態
 */
export const useAssignees = () => {
  /** モーダル表示状態 */
  const [isVisible, setIsVisible] = useState(false);
  /** 現在選択中のユーザーID一覧 */
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  /** モーダルタイトル */
  const [title, setTitle] = useState('対応者設定');
  /** 確定時コールバック */
  const [confirmHandler, setConfirmHandler] = useState(null);

  /**
   * モーダルを開く
   * @param {Object} params - 初期表示内容
   */
  const openModal = useCallback(({ initialUserIds = [], modalTitle = '対応者設定', onConfirm }) => {
    setSelectedUserIds(Array.isArray(initialUserIds) ? initialUserIds : []);
    setTitle(modalTitle);
    setConfirmHandler(() => onConfirm);
    setIsVisible(true);
  }, []);

  /**
   * モーダルを閉じる
   */
  const closeModal = useCallback(() => {
    setIsVisible(false);
    setConfirmHandler(null);
  }, []);

  /**
   * ユーザー選択状態をトグルする
   * @param {string} userId - ユーザーID
   */
  const toggleUser = useCallback((userId) => {
    setSelectedUserIds((previousUserIds) => {
      if (previousUserIds.includes(userId)) {
        return previousUserIds.filter((item) => item !== userId);
      }
      return [...previousUserIds, userId];
    });
  }, []);

  /**
   * 現在の選択内容を確定する
   * @returns {Promise<void>} 完了 Promise
   */
  const confirm = useCallback(async () => {
    if (typeof confirmHandler === 'function') {
      await confirmHandler(selectedUserIds);
    }
    closeModal();
  }, [closeModal, confirmHandler, selectedUserIds]);

  /**
   * 選択中ID一覧を複製して返す
   */
  const selectedIds = useMemo(() => {
    return [...selectedUserIds];
  }, [selectedUserIds]);

  return {
    isVisible,
    title,
    selectedUserIds: selectedIds,
    openModal,
    closeModal,
    toggleUser,
    confirm,
  };
};
