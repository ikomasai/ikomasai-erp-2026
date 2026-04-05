/**
 * 迷子情報管理カスタムフック
 * 迷子データの取得・登録・更新・削除とステータス件数管理を提供する
 */

import { useState, useCallback } from 'react';
import {
  insertMissingChild,
  selectMissingChildrenByUser,
  selectAllMissingChildren,
  updateMissingChildStatus,
  deleteAllMissingChildren,
  selectMissingChildrenStatusCounts,
} from '../services/missingChildService';
import { sendNotificationToRoles, sendNotificationToUser } from '../../../shared/services/notificationService';
import { ADMIN_ROLE_IDS, UNABLE_TO_MOVE, SHELTER_TENT_LABELS, MISSING_CHILD_STATUS_LABELS } from '../constants';

/**
 * 迷子情報管理フック
 * @returns {Object} 迷子情報の状態と操作関数
 */
export const useMissingChildren = () => {
  /** 自分の申請一覧 */
  const [myChildren, setMyChildren] = useState([]);
  /** 全迷子一覧（管理ロール用） */
  const [allChildren, setAllChildren] = useState([]);
  /** ステータス別件数 */
  const [statusCounts, setStatusCounts] = useState({});
  /** 全件数 */
  const [totalCount, setTotalCount] = useState(0);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(false);
  /** エラーメッセージ */
  const [errorMessage, setErrorMessage] = useState(null);

  /**
   * 自分の申請一覧を取得する
   * @param {string} userId - ユーザーID
   */
  const fetchMyChildren = useCallback(async (userId) => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await selectMissingChildrenByUser(userId);

    if (error) {
      setErrorMessage('データの取得に失敗しました。');
    } else {
      setMyChildren(data);
    }

    setIsLoading(false);
  }, []);

  /**
   * 全迷子一覧を取得する（管理ロール用）
   * 移動不可の未対応案件を最上部に固定表示するためソートする
   * @param {string|null} statusFilter - ステータスフィルタ（nullで全件）
   */
  const fetchAllChildren = useCallback(async (statusFilter = null) => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await selectAllMissingChildren(statusFilter);

    if (error) {
      setErrorMessage('データの取得に失敗しました。');
    } else {
      /**
       * ソートロジック:
       * 1. 移動不可 かつ 未対応 → 最上位（発見時刻降順）
       * 2. それ以外 → 発見時刻降順
       */
      const sorted = [...data].sort((a, b) => {
        /** a が移動不可かつ未対応か */
        const aIsUrgent = a.shelter_tent === UNABLE_TO_MOVE && a.status === 'pending';
        /** b が移動不可かつ未対応か */
        const bIsUrgent = b.shelter_tent === UNABLE_TO_MOVE && b.status === 'pending';

        if (aIsUrgent && !bIsUrgent) return -1;
        if (!aIsUrgent && bIsUrgent) return 1;

        /* 同じ優先度の場合は発見時刻降順 */
        return new Date(b.discovered_at) - new Date(a.discovered_at);
      });

      setAllChildren(sorted);
    }

    setIsLoading(false);
  }, []);

  /**
   * ステータス別件数を取得する（削除可否判定用）
   */
  const fetchStatusCounts = useCallback(async () => {
    const { counts, total, error } = await selectMissingChildrenStatusCounts();

    if (error) {
      setErrorMessage('データの取得に失敗しました。');
    } else {
      setStatusCounts(counts);
      setTotalCount(total);
    }
  }, []);

  /**
   * 迷子情報を新規登録し、管理ロールに通知を送信する
   * @param {Object} childData - 迷子情報
   * @param {string} senderUserId - 送信者のユーザーID
   * @returns {Promise<{success: boolean, notificationError: boolean}>} 登録結果
   */
  const registerChild = useCallback(async (childData, senderUserId) => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await insertMissingChild(childData);

    if (error) {
      setErrorMessage('迷子情報の登録に失敗しました。もう一度お試しください。');
      setIsLoading(false);
      return { success: false, notificationError: false };
    }

    /* 登録成功後、管理ロールに通知を送信 */
    /** 移動不可かどうか */
    const isUrgent = childData.shelter_tent === UNABLE_TO_MOVE;

    /** 通知タイトル */
    const title = isUrgent
      ? '【緊急・迷子通知】移動不可の迷子が発見されました'
      : '【迷子通知】迷子が発見されました';

    /** 保護テントの日本語名 */
    const shelterLabel = SHELTER_TENT_LABELS[childData.shelter_tent];

    /** 通知本文 */
    const body = isUrgent
      ? `${childData.discovery_location}で移動不可の迷子が発見されました。特徴: ${childData.characteristics}、迎え場所: ${childData.pickup_location}。至急対応をお願いします。`
      : `${childData.discovery_location}で迷子が発見されました。特徴: ${childData.characteristics}、保護先: ${shelterLabel}`;

    /** 通知メタデータ */
    const metadata = {
      type: 'missing_child',
      missingChildId: data.id,
      isUrgent,
    };

    const { error: notifError } = await sendNotificationToRoles(
      ADMIN_ROLE_IDS,
      title,
      body,
      metadata,
      senderUserId
    );

    /** 通知送信に失敗したかどうか */
    let hasNotificationError = false;
    if (notifError) {
      hasNotificationError = true;
    }

    setIsLoading(false);
    return { success: true, notificationError: hasNotificationError };
  }, []);

  /**
   * 迷子情報のステータス・コメント・保護場所・名前を更新する（管理ロール用）
   * 移動不可の案件で未対応から変更された場合、登録者にステータス変更通知を送信する
   * @param {string} id - 迷子情報ID
   * @param {string} status - 新しいステータス
   * @param {string|null} adminComment - コメント
   * @param {string|null} shelterTent - 保護テント（変更する場合のみ）
   * @param {string|null} pickupLocation - 迎え場所（変更する場合のみ）
   * @param {string|null} name - 迷子の名前（管理ロールが登録する場合のみ）
   * @param {Object|null} originalChild - 変更前の迷子情報（通知判定用）
   * @param {string|null} senderUserId - 操作者のユーザーID（通知送信者）
   * @returns {Promise<boolean>} 更新成功したかどうか
   */
  const updateStatus = useCallback(async (id, status, adminComment = null, shelterTent = null, pickupLocation = null, name = null, originalChild = null, senderUserId = null) => {
    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await updateMissingChildStatus(id, status, adminComment, shelterTent, pickupLocation, name);

    if (error) {
      setErrorMessage('ステータスの更新に失敗しました。');
      setIsLoading(false);
      return false;
    }

    /**
     * ステータスが変更された場合、管理ロール全員に通知を送信する
     * 移動不可の案件の場合は、登録者にも同じ通知を送信する
     */
    if (originalChild && status !== originalChild.status) {
      /** 新しいステータスの日本語ラベル */
      const statusLabel = MISSING_CHILD_STATUS_LABELS[status] || status;
      /** 通知タイトル */
      const isUrgent = originalChild.shelter_tent === UNABLE_TO_MOVE;
      const notifTitle = isUrgent
        ? '【迷子対応】移動不可の迷子のステータスが変更されました'
        : '【迷子対応】迷子のステータスが変更されました';
      /** 通知本文（コメントがあれば含める） */
      const notifBody = adminComment
        ? `発見場所「${originalChild.discovery_location}」の迷子のステータスが「${statusLabel}」に変更されました。\nコメント: ${adminComment}`
        : `発見場所「${originalChild.discovery_location}」の迷子のステータスが「${statusLabel}」に変更されました。`;
      /** 通知メタデータ */
      const notifMetadata = {
        type: 'missing_child',
        missingChildId: id,
        isUrgent,
        discovered_at: originalChild.discovered_at,
      };

      /** 管理ロール全員に通知を送信 */
      const { error: adminNotifError } = await sendNotificationToRoles(
        ADMIN_ROLE_IDS,
        notifTitle,
        notifBody,
        notifMetadata,
        senderUserId
      );

      if (adminNotifError) {
        console.error('管理ロール通知送信失敗:', adminNotifError);
      }

      /** 移動不可の案件の場合、登録者にも通知を送信（登録者がその場で待っているため） */
      if (isUrgent && originalChild.reported_by) {
        const { error: userNotifError } = await sendNotificationToUser(
          originalChild.reported_by,
          notifTitle,
          notifBody,
          notifMetadata,
          senderUserId
        );

        if (userNotifError) {
          console.error('登録者通知送信失敗:', userNotifError);
        }
      }
    }

    setIsLoading(false);
    return true;
  }, []);

  /**
   * 全迷子情報を削除する（実長のみ）
   * @returns {Promise<boolean>} 削除成功したかどうか
   */
  const deleteAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await deleteAllMissingChildren();

    if (error) {
      setErrorMessage('データの削除に失敗しました。');
      setIsLoading(false);
      return false;
    }

    /* 削除後にリストとカウントをクリア */
    setAllChildren([]);
    setStatusCounts({});
    setTotalCount(0);

    setIsLoading(false);
    return true;
  }, []);

  /**
   * エラーメッセージをクリアする
   */
  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    myChildren,
    allChildren,
    statusCounts,
    totalCount,
    isLoading,
    errorMessage,
    fetchMyChildren,
    fetchAllChildren,
    fetchStatusCounts,
    registerChild,
    updateStatus,
    deleteAll,
    clearError,
  };
};
