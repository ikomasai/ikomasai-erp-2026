/**
 * 臨時ヘルプ機能の画面状態と操作をまとめて提供するカスタムフック。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../../../services/supabase/client.js';
import {
  fetchRecruits,
  createRecruit,
  updateRecruit,
  closeRecruit,
  reopenRecruit,
  logicalDeleteRecruit,
  fetchApplications,
  applyRecruit,
  cancelRecruitApplication,
  fetchAppliedRecruits,
  syncExpiredRecruitStatuses,
} from '../services/rinjiHelpService.js';
import { isManager, RINJI_CLOSE_REASON, RINJI_STATUS } from '../constants.js';
import { sendNotificationToUser } from '../../../shared/services/notificationService.js';

const TITLE_SEPARATOR = '\n\n---\n\n';
const META_SEPARATOR = '\n\n::META::\n\n';
const RECRUIT_APPLIED_NOTIFICATION_TYPE = 'rinji_help_recruit_applied';
const RECRUIT_CANCELLED_NOTIFICATION_TYPE = 'rinji_help_recruit_apply_cancelled';
const RECRUIT_UPDATED_NOTIFICATION_TYPE = 'rinji_help_recruit_updated';
const RECRUIT_AUTO_FULL_NOTIFICATION_TYPE = 'rinji_help_recruit_auto_full_closed';
const RECRUIT_DELETED_NOTIFICATION_TYPE = 'rinji_help_recruit_deleted';
const RECRUIT_DELETED_MARKER = '::DELETED::';
const REQUEST_RETRY_MAX_COUNT = 3;
const REQUEST_RETRY_INTERVAL_MS = 2000;
const QUEUE_ITEM_CREATE = 'create';
const QUEUE_ITEM_APPLY = 'apply';
const RETRY_QUEUE_STORAGE_KEY = 'item8_rinji_help_retry_queue_v1';
const supabase = getSupabaseClient();

/**
 * 非同期待機用ユーティリティ。
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 応募の重複エラーかどうかを判定する。
 *
 * @param {any} error
 * @returns {boolean}
 */
const isDuplicateApplyError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();
  return (
    error?.code === '23505' ||
    message.includes('uq_rinji_apps_recruit_applicant') ||
    message.includes('duplicate key')
  );
};

/**
 * 通信断など、再送対象とみなすエラーかどうかを判定する。
 *
 * @param {any} error
 * @returns {boolean}
 */
const isRetryableNetworkError = (error) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return [
    'failed to fetch',
    'network request failed',
    'networkerror',
    'timeout',
    'timed out',
    'connection',
    'offline',
    'unreachable',
    'load failed',
    'xhr',
    'fetch failed',
    'socket',
  ].some((token) => text.includes(token));
};

/**
 * 例外オブジェクトをユーザー表示向けメッセージへ変換する。
 *
 * @param {any} error
 * @param {string} fallback
 * @returns {string}
 */
const toUserErrorMessage = (error, fallback = '処理に失敗しました。') => {
  if (isRetryableNetworkError(error)) {
    return '通信エラーが発生しました。接続を確認して再度お試しください。';
  }
  const message = error?.message;
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }
  return fallback;
};

/**
 * description 文字列を「タイトル / 業務内容 / 途中参加可否」に分解する。
 *
 * @param {string | null | undefined} rawDescription
 * @returns {{ title: string, body: string, lateJoin: string }}
 */
const parseRecruitDescriptionParts = (rawDescription) => {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { title: '', body: '', lateJoin: '' };
  }

  const metaIdx = rawDescription.indexOf(META_SEPARATOR);
  const plain = metaIdx === -1 ? rawDescription : rawDescription.slice(0, metaIdx);
  const lateJoin = metaIdx === -1 ? '' : rawDescription.slice(metaIdx + META_SEPARATOR.length).trim();
  const titleIdx = plain.indexOf(TITLE_SEPARATOR);

  if (titleIdx === -1) {
    return {
      title: '',
      body: plain.trim(),
      lateJoin,
    };
  }

  return {
    title: plain.slice(0, titleIdx).trim(),
    body: plain.slice(titleIdx + TITLE_SEPARATOR.length).trim(),
    lateJoin,
  };
};

/**
 * 通知本文向けに表示値を正規化する。
 *
 * @param {any} value
 * @param {string} fallback
 * @returns {string}
 */
const normalizeDisplayValue = (value, fallback = '未設定') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? fallback : trimmed;
  }
  return `${value}`;
};

/**
 * 比較用に値を文字列へ正規化する。
 *
 * @param {any} value
 * @returns {string}
 */
const normalizeComparableValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return `${value}`;
};

/**
 * 途中参加可否コードを表示文言へ変換する。
 *
 * @param {string} value
 * @returns {string}
 */
const formatLateJoinValue = (value) => {
  if (value === 'allow') return '可';
  if (value === 'deny') return '不可';
  return '未設定';
};

/**
 * 更新前後の募集情報から、通知本文用の簡易差分を生成する。
 * 業務内容は本文そのものを出さず、変更有無のみ通知する。
 *
 * @param {Record<string, any> | null} previousRecruit
 * @param {Record<string, any>} nextRecruit
 * @returns {{ title: string, lines: string[] }}
 */
const buildRecruitUpdateDiffSummary = (previousRecruit, nextRecruit) => {
  const previousParts = parseRecruitDescriptionParts(previousRecruit?.description);
  const nextParts = parseRecruitDescriptionParts(nextRecruit?.description);
  const nextTitle = normalizeDisplayValue(nextParts.title, '新しい臨時ヘルプ募集');
  const lines = [];

  const pushDiff = (label, beforeValue, afterValue) => {
    const beforeText = normalizeDisplayValue(beforeValue);
    const afterText = normalizeDisplayValue(afterValue);
    if (beforeText !== afterText) {
      lines.push(`・${label}: ${beforeText} → ${afterText}`);
    }
  };

  if (previousRecruit) {
    pushDiff('募集タイトル', previousParts.title, nextParts.title);
    pushDiff('募集人数', previousRecruit.headcount, nextRecruit.headcount);
    pushDiff('募集日', previousRecruit.work_date, nextRecruit.work_date);
    pushDiff('開始時刻', previousRecruit.work_time, nextRecruit.work_time);
    pushDiff('場所', previousRecruit.location, nextRecruit.location);
    pushDiff('集合場所', previousRecruit.meet_place, nextRecruit.meet_place);
    pushDiff('集合時間', previousRecruit.meet_time, nextRecruit.meet_time);
    pushDiff('途中参加可否', formatLateJoinValue(previousParts.lateJoin), formatLateJoinValue(nextParts.lateJoin));

    const beforeDescriptionBody = normalizeComparableValue(previousParts.body);
    const nextDescriptionBody = normalizeComparableValue(nextParts.body);
    if (beforeDescriptionBody !== nextDescriptionBody) {
      lines.push('・業務内容欄が変更されました');
    }
  } else {
    lines.push('・募集内容が更新されました（詳細は募集画面をご確認ください）');
  }

  return { title: nextTitle, lines };
};

/**
 * description から募集タイトルを抽出する。
 *
 * @param {string | null | undefined} rawDescription
 * @returns {string}
 */
const parseRecruitTitle = (rawDescription) => {
  return normalizeDisplayValue(parseRecruitDescriptionParts(rawDescription).title, '新しい臨時ヘルプ募集');
};

/**
 * 募集一覧・履歴・応募操作を管理し、画面から利用しやすい API を返す。
 *
 * @returns {{
 *   manager: boolean,
 *   currentUserId: string | null | undefined,
 *   authLoading: boolean,
 *   loading: boolean,
 *   error: string | null,
 *   roles: Array<any>,
 *   userInfo: any,
 *   recruits: Array<any>,
 *   historyRecruits: Array<any>,
 *   appliedRecruits: Array<any>,
 *   applications: Record<string, Array<any>>,
 *   retrySuccessEvent: { id: number, type: 'create' | 'apply', message: string } | null,
 *   clearRetrySuccessEvent: () => void,
 *   refresh: () => Promise<void>,
 *   handleCreate: (payload: Record<string, any>) => Promise<boolean>,
 *   handleUpdate: (id: string, payload: Record<string, any>) => Promise<boolean>,
 *   handleDelete: (id: string) => Promise<boolean>,
 *   handleClose: (id: string) => Promise<boolean>,
 *   handleReopen: (id: string) => Promise<{ok: boolean, message?: string}>,
 *   handleApply: (id: string) => Promise<boolean>,
 *   handleCancelApply: (id: string) => Promise<boolean>,
 *   loadApplications: (recruitId: string) => Promise<void>,
 *   RINJI_STATUS: typeof RINJI_STATUS
 * }}
 */
export const useRinjiHelp = () => {
  const { user, userInfo, isLoading: authLoading } = useAuth();
  const [recruits, setRecruits] = useState([]);
  const [historyRecruits, setHistoryRecruits] = useState([]);
  const [appliedRecruits, setAppliedRecruits] = useState([]);
  const [applications, setApplications] = useState({});
  const [retrySuccessEvent, setRetrySuccessEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [managerFlag, setManagerFlag] = useState(false);
  const retryQueueRef = useRef([]);
  const processingRetryQueueRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    []
  );

  /**
   * 再送キューをローカルストレージへ保存する。
   *
   * @returns {Promise<void>}
   */
  const persistRetryQueue = useCallback(async () => {
    try {
      await AsyncStorage.setItem(RETRY_QUEUE_STORAGE_KEY, JSON.stringify(retryQueueRef.current));
    } catch (storageError) {
      console.warn('[item8] retry queue persist failed:', storageError?.message || storageError);
    }
  }, []);

  // ロール情報が到着したら一度だけ評価し、ユーザーが変わったらリセット
  useEffect(() => {
    if (!user) {
      setManagerFlag(false);
      return;
    }
    const roles = userInfo?.roles || [];
    console.log('[item8] roles:', roles?.map?.((r) => r?.name)?.join(', ') || 'なし');
    setManagerFlag(isManager(roles));
  }, [user, userInfo]);

  const manager = managerFlag;

  /**
   * 募集作成時に、作成者以外の全ユーザーへ通知する。
   *
   * @param {Record<string, any> | null} createdRecruit
   * @param {Record<string, any>} payload
   * @returns {Promise<void>}
   */
  const notifyRecruitCreatedToOthers = useCallback(
    async (createdRecruit, payload) => {
      const creatorUserId = user?.id;
      if (!creatorUserId) return;

      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .neq('user_id', creatorUserId);
      if (profileError) {
        console.warn('[item8] notify recipients fetch failed:', profileError.message || profileError);
        return;
      }

      const recipientUserIds = [
        ...new Set((profiles || []).map((row) => row?.user_id).filter(Boolean)),
      ];
      if (recipientUserIds.length === 0) return;

      const recruitTitle = parseRecruitTitle(createdRecruit?.description || payload?.description);
      const workDate = createdRecruit?.work_date || payload?.work_date || '未設定';
      const workTime = createdRecruit?.work_time || payload?.work_time || '未設定';
      const location = createdRecruit?.location || payload?.location || '未設定';
      const body = `${recruitTitle}\n募集日時: ${workDate} ${workTime}\n場所: ${location}`;
      const metadata = {
        type: 'rinji_help_recruit_created',
        source: 'item8_rinji_help',
        event: 'recruit_created',
        recruit_id: createdRecruit?.id || null,
        creator_user_id: creatorUserId,
      };

      const results = await Promise.allSettled(
        recipientUserIds.map((recipientUserId) =>
          sendNotificationToUser(
            recipientUserId,
            '新しい臨時ヘルプ募集が作成されました',
            body,
            metadata,
            creatorUserId
          )
        )
      );

      let failedCount = 0;
      results.forEach((result) => {
        if (result.status === 'rejected' || result?.value?.error) {
          failedCount += 1;
        }
      });
      if (failedCount > 0) {
        console.warn(`[item8] recruit create notification failed: ${failedCount}/${recipientUserIds.length}`);
      }
    },
    [user?.id]
  );

  /**
   * 募集応募時に、募集作成者へ通知する。
   * 応募登録は DB の一意制約で重複を防いでいるため、同一応募の重複通知は発生しない。
   *
   * @param {{ recruitId: string, applicationId?: string | null, applicantUserId: string }} params
   * @returns {Promise<void>}
   */
  const notifyRecruitOwnerOnApply = useCallback(
    async ({ recruitId, applicationId = null, applicantUserId }) => {
      if (!recruitId || !applicantUserId) return;

      const { data: recruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id, description')
        .eq('id', recruitId)
        .single();
      if (recruitError || !recruit?.head_user_id) {
        console.warn('[item8] recruit apply notify recruit fetch failed:', recruitError?.message || recruitError);
        return;
      }

      const creatorUserId = recruit.head_user_id;
      if (creatorUserId === applicantUserId) {
        // 自分の操作で自分に通知しない
        return;
      }

      const { data: applicantProfile, error: applicantProfileError } = await supabase
        .from('user_profiles')
        .select('name, organization')
        .eq('user_id', applicantUserId)
        .single();
      if (applicantProfileError) {
        console.warn(
          '[item8] recruit apply notify applicant profile fetch failed:',
          applicantProfileError?.message || applicantProfileError
        );
      }

      const recruitTitle = parseRecruitTitle(recruit.description);
      const applicantName = applicantProfile?.name || userInfo?.name || applicantUserId;
      const applicantOrganization = applicantProfile?.organization || userInfo?.organization || '所属不明';
      const title = `[臨時ヘルプ]「${recruitTitle}」に応募がありました`;
      const body = `募集タイトル: ${recruitTitle}\n応募者: ${applicantOrganization} ${applicantName}`;
      const metadata = {
        type: RECRUIT_APPLIED_NOTIFICATION_TYPE,
        source: 'item8_rinji_help',
        event: 'recruit_applied',
        recruit_id: recruitId,
        application_id: applicationId,
        applicant_user_id: applicantUserId,
        creator_user_id: creatorUserId,
      };

      const { error: notifyError } = await sendNotificationToUser(
        creatorUserId,
        title,
        body,
        metadata,
        applicantUserId
      );
      if (notifyError) {
        console.warn('[item8] recruit apply notify failed:', notifyError?.message || notifyError);
      }
    },
    [userInfo?.name, userInfo?.organization]
  );

  /**
   * 応募取り消し時に、募集作成者へ通知する。
   *
   * @param {{ recruitId: string, cancelledApplicationIds?: string[], applicantUserId: string }} params
   * @returns {Promise<void>}
   */
  const notifyRecruitOwnerOnCancelApply = useCallback(
    async ({ recruitId, cancelledApplicationIds = [], applicantUserId }) => {
      if (!recruitId || !applicantUserId) return;

      const { data: recruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id, description')
        .eq('id', recruitId)
        .single();
      if (recruitError || !recruit?.head_user_id) {
        console.warn('[item8] recruit cancel notify recruit fetch failed:', recruitError?.message || recruitError);
        return;
      }

      const creatorUserId = recruit.head_user_id;
      if (creatorUserId === applicantUserId) {
        // 自分の操作で自分に通知しない
        return;
      }

      const { data: applicantProfile, error: applicantProfileError } = await supabase
        .from('user_profiles')
        .select('name, organization')
        .eq('user_id', applicantUserId)
        .single();
      if (applicantProfileError) {
        console.warn(
          '[item8] recruit cancel notify applicant profile fetch failed:',
          applicantProfileError?.message || applicantProfileError
        );
      }

      const recruitTitle = parseRecruitTitle(recruit.description);
      const applicantName = applicantProfile?.name || userInfo?.name || applicantUserId;
      const applicantOrganization = applicantProfile?.organization || userInfo?.organization || '所属不明';
      const title = `[臨時ヘルプ]「${recruitTitle}」の応募が取り消されました`;
      const body = `募集タイトル: ${recruitTitle}\n取消者: ${applicantOrganization} ${applicantName}`;
      const metadata = {
        type: RECRUIT_CANCELLED_NOTIFICATION_TYPE,
        source: 'item8_rinji_help',
        event: 'recruit_apply_cancelled',
        recruit_id: recruitId,
        cancelled_application_ids: cancelledApplicationIds,
        applicant_user_id: applicantUserId,
        creator_user_id: creatorUserId,
      };

      const { error: notifyError } = await sendNotificationToUser(
        creatorUserId,
        title,
        body,
        metadata,
        applicantUserId
      );
      if (notifyError) {
        console.warn('[item8] recruit cancel notify failed:', notifyError?.message || notifyError);
      }
    },
    [userInfo?.name, userInfo?.organization]
  );

  /**
   * 募集が満員で自動終了に遷移した際、募集作成者へ通知する。
   * すでに auto_full だった募集は通知しない（重複抑止）。
   *
   * @param {{
   *   recruitId: string,
   *   actorUserId?: string,
   *   previousRecruit?: Record<string, any> | null
   * }} params
   * @returns {Promise<void>}
   */
  const notifyRecruitOwnerOnAutoFullClose = useCallback(
    async ({ recruitId, actorUserId, previousRecruit = null }) => {
      if (!recruitId) return;

      const { data: latestRecruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id, description, headcount, status, close_reason')
        .eq('id', recruitId)
        .single();
      if (recruitError || !latestRecruit?.head_user_id) {
        console.warn('[item8] auto full notify recruit fetch failed:', recruitError?.message || recruitError);
        return;
      }

      const isLatestAutoFullClosed =
        latestRecruit.status === RINJI_STATUS.CLOSED &&
        latestRecruit.close_reason === RINJI_CLOSE_REASON.AUTO_FULL;
      if (!isLatestAutoFullClosed) return;

      const wasAlreadyAutoFullClosed =
        previousRecruit?.status === RINJI_STATUS.CLOSED &&
        previousRecruit?.close_reason === RINJI_CLOSE_REASON.AUTO_FULL;
      if (wasAlreadyAutoFullClosed) return;

      const creatorUserId = latestRecruit.head_user_id;
      if (actorUserId && creatorUserId === actorUserId) {
        // 自分の操作で自分に通知しない
        return;
      }

      const { count, error: countError } = await supabase
        .from('rinji_help_applications')
        .select('id', { count: 'exact', head: true })
        .eq('recruit_id', recruitId);
      if (countError) {
        console.warn('[item8] auto full notify count fetch failed:', countError?.message || countError);
      }

      const recruitTitle = parseRecruitTitle(latestRecruit.description);
      const applicantCount = Number.isFinite(count) ? count : null;
      const headcount = Number(latestRecruit.headcount);
      const ratioText =
        applicantCount !== null && Number.isFinite(headcount) && headcount > 0
          ? `（${applicantCount}/${headcount}）`
          : '';
      const title = '[臨時ヘルプ] 募集が定員に達しました';
      const body = `募集タイトル: ${recruitTitle}\n応募人数が募集人数に到達しました${ratioText}`;
      const metadata = {
        type: RECRUIT_AUTO_FULL_NOTIFICATION_TYPE,
        source: 'item8_rinji_help',
        event: 'recruit_auto_full_closed',
        recruit_id: recruitId,
        creator_user_id: creatorUserId,
        applicant_count: applicantCount,
        headcount: Number.isFinite(headcount) ? headcount : null,
      };

      const { error: notifyError } = await sendNotificationToUser(
        creatorUserId,
        title,
        body,
        metadata,
        actorUserId || null
      );
      if (notifyError) {
        console.warn('[item8] auto full notify failed:', notifyError?.message || notifyError);
      }
    },
    []
  );

  /**
   * 募集更新時に、応募済みユーザーへ通知する。
   *
   * @param {{ recruitId: string, payload?: Record<string, any>, updaterUserId?: string }} params
   * @returns {Promise<void>}
   */
  const notifyRecruitApplicantsOnUpdate = useCallback(
    async ({ recruitId, payload = {}, updaterUserId, previousRecruit = null }) => {
      if (!recruitId || !updaterUserId) return;

      const { data: applications, error: applicationsError } = await supabase
        .from('rinji_help_applications')
        .select('applicant_user_id')
        .eq('recruit_id', recruitId);
      if (applicationsError) {
        console.warn(
          '[item8] recruit update notify recipients fetch failed:',
          applicationsError?.message || applicationsError
        );
        return;
      }

      const recipientUserIds = [
        ...new Set(
          (applications || [])
            .map((row) => row?.applicant_user_id)
            .filter((userId) => Boolean(userId) && userId !== updaterUserId)
        ),
      ];
      if (recipientUserIds.length === 0) return;

      const { data: latestRecruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, description, headcount, work_date, work_time, location, meet_place, meet_time')
        .eq('id', recruitId)
        .single();
      if (recruitError) {
        console.warn('[item8] recruit update notify recruit fetch failed:', recruitError?.message || recruitError);
      }

      const sourceRecruit = latestRecruit || payload || {};
      const { title: recruitTitle, lines: diffLines } = buildRecruitUpdateDiffSummary(previousRecruit, sourceRecruit);
      if (diffLines.length === 0) {
        // 変更点が検出できない場合は通知を送らない
        return;
      }

      const title = `[臨時ヘルプ]「${recruitTitle}」の募集内容が更新されました`;
      const body = `募集タイトル: ${recruitTitle}\n変更点:\n${diffLines.join('\n')}`;
      const metadata = {
        type: RECRUIT_UPDATED_NOTIFICATION_TYPE,
        source: 'item8_rinji_help',
        event: 'recruit_updated',
        recruit_id: recruitId,
        updater_user_id: updaterUserId,
      };

      const results = await Promise.allSettled(
        recipientUserIds.map((recipientUserId) =>
          sendNotificationToUser(recipientUserId, title, body, metadata, updaterUserId)
        )
      );

      let failedCount = 0;
      results.forEach((result) => {
        if (result.status === 'rejected' || result?.value?.error) {
          failedCount += 1;
        }
      });
      if (failedCount > 0) {
        console.warn(`[item8] recruit update notification failed: ${failedCount}/${recipientUserIds.length}`);
      }
    },
    []
  );

  /**
   * 募集削除時に、応募者へ通知する。
   *
   * @param {{
   *   recruitId: string,
   *   recruitTitle: string,
   *   workDate?: string | null,
   *   workTime?: string | null,
   *   location?: string | null,
   *   actorUserId?: string | null
   * }} params
   * @returns {Promise<void>}
   */
  const notifyApplicantsOnRecruitDeleted = useCallback(
    async ({ recruitId, recruitTitle, workDate, workTime, location, actorUserId = null }) => {
      if (!recruitId) return;

      const { data: applications, error: applicationsError } = await supabase
        .from('rinji_help_applications')
        .select('applicant_user_id')
        .eq('recruit_id', recruitId);
      if (applicationsError) {
        console.warn('[item8] recruit delete notify recipients fetch failed:', applicationsError?.message || applicationsError);
        return;
      }

      const recipientUserIds = [
        ...new Set(
          (applications || [])
            .map((row) => row?.applicant_user_id)
            .filter((userId) => Boolean(userId) && userId !== actorUserId)
        ),
      ];
      if (recipientUserIds.length === 0) return;

      const title = `[臨時ヘルプ]「${recruitTitle}」の募集が削除されました`;
      const body = `募集が削除されたため、この募集への参加は不要になりました\n募集名: ${recruitTitle}\n募集日時: ${normalizeDisplayValue(workDate)} ${normalizeDisplayValue(workTime)}\n場所: ${normalizeDisplayValue(location)}`;
      const metadata = {
        type: RECRUIT_DELETED_NOTIFICATION_TYPE,
        source: 'item8_rinji_help',
        event: 'recruit_deleted',
        recruit_id: recruitId,
        deleted_by: actorUserId,
      };

      const results = await Promise.allSettled(
        recipientUserIds.map((recipientUserId) =>
          sendNotificationToUser(recipientUserId, title, body, metadata, actorUserId)
        )
      );

      let failedCount = 0;
      results.forEach((result) => {
        if (result.status === 'rejected' || result?.value?.error) {
          failedCount += 1;
        }
      });
      if (failedCount > 0) {
        console.warn(`[item8] recruit delete notification failed: ${failedCount}/${recipientUserIds.length}`);
      }
    },
    []
  );

  /**
   * 募集データを取得して、通常一覧または履歴一覧に振り分ける。
   *
   * @param {{ includeClosed?: boolean }} params
   * @returns {Promise<void>}
   */
  const loadRecruits = useCallback(
    async ({ includeClosed = false, includeAutoFullClosed = false } = {}) => {
      setLoading(true);
      setError(null);
      const { data, error } = await fetchRecruits({ includeClosed, includeAutoFullClosed });
      if (error) {
        setError(toUserErrorMessage(error, '募集一覧の取得に失敗しました。'));
      } else {
        includeClosed ? setHistoryRecruits(data || []) : setRecruits(data || []);
      }
      setLoading(false);
    },
    []
  );

  /**
   * 画面表示に必要な一覧データを再取得する。
   *
   * @returns {Promise<void>}
   */
  const refresh = useCallback(async () => {
    setApplications({});
    const { error: syncError } = await syncExpiredRecruitStatuses();
    if (syncError) {
      console.warn('[item8] sync expired recruits skipped:', syncError.message || syncError);
    }
    await loadRecruits({ includeClosed: false, includeAutoFullClosed: manager });
    if (manager) {
      await loadRecruits({ includeClosed: true });
      setAppliedRecruits([]);
    } else {
      setHistoryRecruits([]);
      const { data, error: appliedError } = await fetchAppliedRecruits(user?.id);
      if (appliedError) {
        setError(toUserErrorMessage(appliedError, '応募済み一覧の取得に失敗しました。'));
      } else {
        setAppliedRecruits(data || []);
      }
    }
  }, [loadRecruits, manager, user?.id]);

  useEffect(() => {
    if (!authLoading) {
      refresh();
    }
  }, [authLoading, refresh, manager]);

  /**
   * 募集作成処理を1回実行する。
   *
   * @param {{ createPayload: Record<string, any>, notifyAllOnCreate: boolean }} params
   * @returns {Promise<{ ok: boolean, retryable: boolean, message?: string }>}
   */
  const performCreateRequest = useCallback(
    async ({ createPayload, notifyAllOnCreate }) => {
      try {
        if (!user?.id) {
          return { ok: false, retryable: false, message: 'ユーザー情報を確認できませんでした。再ログインしてください。' };
        }

        const { data: createdRecruit, error: createError } = await createRecruit({
          ...createPayload,
          head_user_id: user.id,
        });
        if (createError) {
          return {
            ok: false,
            retryable: isRetryableNetworkError(createError),
            message: toUserErrorMessage(createError, '募集の作成に失敗しました。'),
          };
        }

        if (notifyAllOnCreate) {
          notifyRecruitCreatedToOthers(createdRecruit || null, createPayload).catch((notifyError) => {
            console.warn('[item8] recruit create notify skipped:', notifyError?.message || notifyError);
          });
        }

        await refresh();
        return { ok: true, retryable: false };
      } catch (unexpectedError) {
        return {
          ok: false,
          retryable: isRetryableNetworkError(unexpectedError),
          message: toUserErrorMessage(unexpectedError, '募集の作成に失敗しました。'),
        };
      }
    },
    [notifyRecruitCreatedToOthers, refresh, user?.id]
  );

  /**
   * 応募処理を1回実行する。
   *
   * @param {{
   *   recruitId: string,
   *   applicantUserId: string | null | undefined,
   *   treatDuplicateAsSuccess?: boolean
   * }} params
   * @returns {Promise<{ ok: boolean, retryable: boolean, message?: string }>}
   */
  const performApplyRequest = useCallback(
    async ({ recruitId, applicantUserId, treatDuplicateAsSuccess = false }) => {
      try {
        if (!recruitId || !applicantUserId) {
          return { ok: false, retryable: false, message: '応募に必要なユーザー情報が不足しています。' };
        }

        const { data: previousRecruit, error: previousRecruitError } = await supabase
          .from('rinji_help_recruits')
          .select('id, status, close_reason')
          .eq('id', recruitId)
          .single();
        if (previousRecruitError) {
          console.warn('[item8] apply previous recruit fetch failed:', previousRecruitError?.message || previousRecruitError);
        }

        const { data: application, error: applyError } = await applyRecruit(recruitId, applicantUserId);
        if (applyError) {
          if (isDuplicateApplyError(applyError)) {
            if (!treatDuplicateAsSuccess) {
              return {
                ok: false,
                retryable: false,
                message: 'すでに応募済みです。応募済みタブをご確認ください。',
              };
            }
            notifyRecruitOwnerOnApply({
              recruitId,
              applicationId: null,
              applicantUserId,
            }).catch((notifyError) => {
              console.warn('[item8] recruit apply notify skipped:', notifyError?.message || notifyError);
            });
            notifyRecruitOwnerOnAutoFullClose({
              recruitId,
              actorUserId: applicantUserId,
              previousRecruit: previousRecruit || null,
            }).catch((notifyError) => {
              console.warn('[item8] auto full notify skipped:', notifyError?.message || notifyError);
            });
            await refresh();
            return { ok: true, retryable: false };
          }

          return {
            ok: false,
            retryable: isRetryableNetworkError(applyError),
            message: toUserErrorMessage(applyError, '応募に失敗しました。'),
          };
        }

        notifyRecruitOwnerOnApply({
          recruitId,
          applicationId: application?.id || null,
          applicantUserId,
        }).catch((notifyError) => {
          console.warn('[item8] recruit apply notify skipped:', notifyError?.message || notifyError);
        });
        notifyRecruitOwnerOnAutoFullClose({
          recruitId,
          actorUserId: applicantUserId,
          previousRecruit: previousRecruit || null,
        }).catch((notifyError) => {
          console.warn('[item8] auto full notify skipped:', notifyError?.message || notifyError);
        });
        await refresh();
        return { ok: true, retryable: false };
      } catch (unexpectedError) {
        return {
          ok: false,
          retryable: isRetryableNetworkError(unexpectedError),
          message: toUserErrorMessage(unexpectedError, '応募に失敗しました。'),
        };
      }
    },
    [notifyRecruitOwnerOnApply, notifyRecruitOwnerOnAutoFullClose, refresh]
  );

  /**
   * キュー済みリクエストを先頭から順に再送する。
   * 通信系エラーは最大3回までリトライし、それ以外は即失敗通知する。
   *
   * @returns {Promise<void>}
   */
  const processRetryQueue = useCallback(async () => {
    if (processingRetryQueueRef.current) return;
    processingRetryQueueRef.current = true;

    try {
      while (!unmountedRef.current && retryQueueRef.current.length > 0) {
        const current = retryQueueRef.current[0];
        const attemptNumber = Math.max(1, Number(current.retryCount || 0) + 1);
        const targetLabel = current.type === QUEUE_ITEM_CREATE ? '募集作成' : '応募';
        if (!unmountedRef.current) {
          setError(`通信エラーのため${targetLabel}を再送中です（${attemptNumber}/${REQUEST_RETRY_MAX_COUNT}）。`);
        }
        const result =
          current.type === QUEUE_ITEM_CREATE
            ? await performCreateRequest(current.payload)
            : await performApplyRequest({ ...current.payload, treatDuplicateAsSuccess: true });

        if (result.ok) {
          if (!unmountedRef.current) {
            setError(null);
            setRetrySuccessEvent({
              id: Date.now(),
              type: current.type === QUEUE_ITEM_CREATE ? QUEUE_ITEM_CREATE : QUEUE_ITEM_APPLY,
              message: current.type === QUEUE_ITEM_CREATE ? '募集を作成しました' : '応募しました',
            });
          }
          retryQueueRef.current.shift();
          await persistRetryQueue();
          continue;
        }

        if (result.retryable && attemptNumber < REQUEST_RETRY_MAX_COUNT) {
          current.retryCount = attemptNumber;
          await persistRetryQueue();
          if (!unmountedRef.current) {
            setError(
              `通信エラーのため${targetLabel}の再送に失敗しました。${REQUEST_RETRY_INTERVAL_MS / 1000}秒後に再試行します（${attemptNumber}/${REQUEST_RETRY_MAX_COUNT}）。`
            );
          }
          await sleep(REQUEST_RETRY_INTERVAL_MS);
          continue;
        }

        retryQueueRef.current.shift();
        await persistRetryQueue();
        if (!unmountedRef.current) {
          const fallbackMessage =
            current.type === QUEUE_ITEM_CREATE
              ? `通信失敗のため募集作成の再送に${REQUEST_RETRY_MAX_COUNT}回失敗しました。再度お試しください。`
              : `通信失敗のため応募の再送に${REQUEST_RETRY_MAX_COUNT}回失敗しました。再度お試しください。`;
          setError(result.message || fallbackMessage);
        }
      }
    } finally {
      processingRetryQueueRef.current = false;
    }
  }, [performApplyRequest, performCreateRequest, persistRetryQueue]);

  /**
   * 通信失敗したリクエストをキューに積み、自動再送を開始する。
   *
   * @param {{ type: string, queueKey: string, payload: any }} item
   * @param {string} queuedMessage
   */
  const enqueueRetryItem = useCallback(
    (item, queuedMessage) => {
      const exists = retryQueueRef.current.some((queued) => queued.queueKey === item.queueKey);
      if (!exists) {
        retryQueueRef.current.push({
          ...item,
          retryCount: 0,
        });
        void persistRetryQueue();
      }
      setError(queuedMessage);
      void processRetryQueue();
    },
    [persistRetryQueue, processRetryQueue]
  );

  /**
   * 自動再送の成功通知イベントをクリアする。
   */
  const clearRetrySuccessEvent = useCallback(() => {
    setRetrySuccessEvent(null);
  }, []);

  /**
   * 永続化された再送キューを復元し、存在する場合は自動再送を開始する。
   */
  useEffect(() => {
    let cancelled = false;

    const restoreRetryQueue = async () => {
      try {
        const raw = await AsyncStorage.getItem(RETRY_QUEUE_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          retryQueueRef.current = [];
          await AsyncStorage.removeItem(RETRY_QUEUE_STORAGE_KEY);
          return;
        }

        const restored = parsed
          .filter(
            (item) =>
              item &&
              (item.type === QUEUE_ITEM_CREATE || item.type === QUEUE_ITEM_APPLY) &&
              typeof item.queueKey === 'string' &&
              item.payload
          )
          .map((item) => ({
            ...item,
            retryCount: Number.isFinite(Number(item.retryCount))
              ? Math.min(Math.max(0, Number(item.retryCount)), REQUEST_RETRY_MAX_COUNT - 1)
              : 0,
          }));

        retryQueueRef.current = restored;
        await persistRetryQueue();

        if (restored.length === 0) {
          return;
        }

        if (!cancelled && !unmountedRef.current) {
          setError('未送信のリクエストを検出したため、自動で再送を試行します。');
        }
        void processRetryQueue();
      } catch (restoreError) {
        console.warn('[item8] retry queue restore failed:', restoreError?.message || restoreError);
      }
    };

    void restoreRetryQueue();
    return () => {
      cancelled = true;
    };
  }, [persistRetryQueue, processRetryQueue]);

  /**
   * 募集を作成して一覧を更新する。
   *
   * @param {Record<string, any>} payload
   * @returns {Promise<boolean>}
   */
  const handleCreate = useCallback(
    async (payload) => {
      const {
        notify_all_on_create: notifyAllOnCreate = false,
        notify_applicants_on_update: _notifyApplicantsOnUpdate,
        ...createPayload
      } = payload || {};
      const result = await performCreateRequest({ createPayload, notifyAllOnCreate });
      if (result.ok) return true;

      if (result.retryable) {
        const queueKey = `${QUEUE_ITEM_CREATE}:${user?.id || 'unknown'}:${JSON.stringify(createPayload)}`;
        enqueueRetryItem(
          {
            type: QUEUE_ITEM_CREATE,
            queueKey,
            payload: { createPayload, notifyAllOnCreate },
          },
          '通信エラーのため募集作成をキューに保存しました。自動で再送を試行します。'
        );
        return false;
      }

      setError(result.message || '募集の作成に失敗しました。');
      return false;
    },
    [enqueueRetryItem, performCreateRequest, user?.id]
  );

  /**
   * 募集を更新して一覧を更新する。
   *
   * @param {string} id
   * @param {Record<string, any>} payload
   * @returns {Promise<boolean>}
   */
  const handleUpdate = useCallback(
    async (id, payload) => {
      const {
        notify_applicants_on_update: notifyApplicantsOnUpdate = true,
        notify_all_on_create: _notifyAllOnCreate,
        ...updatePayload
      } = payload || {};
      const { data: previousRecruit, error: previousRecruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id, description, headcount, work_date, work_time, location, meet_place, meet_time, status, close_reason')
        .eq('id', id)
        .single();
      if (previousRecruitError || !previousRecruit) {
        setError(toUserErrorMessage(previousRecruitError, '募集の取得に失敗しました。'));
        return false;
      }
      if (!user?.id || previousRecruit.head_user_id !== user.id) {
        setError('募集を編集できるのは作成者のみです。');
        return false;
      }
      const { error } = await updateRecruit(id, updatePayload);
      if (error) {
        setError(toUserErrorMessage(error, '募集の更新に失敗しました。'));
        return false;
      }
      if (notifyApplicantsOnUpdate) {
        notifyRecruitApplicantsOnUpdate({
          recruitId: id,
          payload: updatePayload,
          updaterUserId: user?.id,
          previousRecruit: previousRecruit || null,
        }).catch((notifyError) => {
          console.warn('[item8] recruit update notify skipped:', notifyError?.message || notifyError);
        });
      }
      notifyRecruitOwnerOnAutoFullClose({
        recruitId: id,
        actorUserId: user?.id,
        previousRecruit: previousRecruit || null,
      }).catch((notifyError) => {
        console.warn('[item8] auto full notify after update skipped:', notifyError?.message || notifyError);
      });
      await refresh();
      return true;
    },
    [notifyRecruitApplicantsOnUpdate, notifyRecruitOwnerOnAutoFullClose, refresh, user?.id]
  );

  /**
   * 募集を論理削除して一覧を更新する。
   * 作成者のみ削除可能。
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  const handleDelete = useCallback(
    async (id) => {
      if (!id) return false;

      const { data: recruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id, description, work_date, work_time, location')
        .eq('id', id)
        .single();
      if (recruitError || !recruit) {
        setError(toUserErrorMessage(recruitError, '募集の取得に失敗しました。'));
        return false;
      }

      if (!user?.id || recruit.head_user_id !== user.id) {
        setError('募集を削除できるのは作成者のみです。');
        return false;
      }

      if (typeof recruit.description === 'string' && recruit.description.includes(RECRUIT_DELETED_MARKER)) {
        await refresh();
        return true;
      }

      const recruitTitle = parseRecruitTitle(recruit.description);
      const { error } = await logicalDeleteRecruit(id);
      if (error) {
        setError(toUserErrorMessage(error, '募集の削除に失敗しました。'));
        return false;
      }

      notifyApplicantsOnRecruitDeleted({
        recruitId: id,
        recruitTitle,
        workDate: recruit.work_date,
        workTime: recruit.work_time,
        location: recruit.location,
        actorUserId: user.id,
      }).catch((notifyError) => {
        console.warn('[item8] recruit delete notify skipped:', notifyError?.message || notifyError);
      });

      await refresh();
      return true;
    },
    [notifyApplicantsOnRecruitDeleted, refresh, user?.id]
  );

  /**
   * 募集を終了して一覧を更新する。
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  const handleClose = useCallback(
    async (id) => {
      const { data: recruit, error: recruitError } = await supabase
        .from('rinji_help_recruits')
        .select('id, head_user_id')
        .eq('id', id)
        .single();
      if (recruitError || !recruit) {
        setError(toUserErrorMessage(recruitError, '募集の取得に失敗しました。'));
        return false;
      }
      if (!user?.id || recruit.head_user_id !== user.id) {
        setError('募集を終了できるのは作成者のみです。');
        return false;
      }
      const { error } = await closeRecruit(id);
      if (error) {
        setError(toUserErrorMessage(error, '募集の終了に失敗しました。'));
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, user?.id]
  );

  /**
   * 募集を再開して一覧を更新する。
   *
   * @param {string} id
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  const handleReopen = useCallback(
    async (id) => {
      const { error } = await reopenRecruit(id);
      if (error) {
        const message = toUserErrorMessage(error, '募集の再開に失敗しました。');
        setError(message);
        return { ok: false, message };
      }
      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  /**
   * 指定募集に応募して一覧を更新する。
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  const handleApply = useCallback(
    async (id) => {
      const applicantUserId = user?.id;
      const result = await performApplyRequest({
        recruitId: id,
        applicantUserId,
        treatDuplicateAsSuccess: false,
      });
      if (result.ok) return true;

      if (result.retryable) {
        const queueKey = `${QUEUE_ITEM_APPLY}:${id}:${applicantUserId || 'unknown'}`;
        enqueueRetryItem(
          {
            type: QUEUE_ITEM_APPLY,
            queueKey,
            payload: { recruitId: id, applicantUserId },
          },
          '通信エラーのため応募をキューに保存しました。自動で再送を試行します。'
        );
        return false;
      }

      setError(result.message || '応募に失敗しました。');
      return false;
    },
    [enqueueRetryItem, performApplyRequest, user?.id]
  );

  /**
   * 指定募集への応募を取り消して一覧を更新する。
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  const handleCancelApply = useCallback(
    async (id) => {
      const { data, error } = await cancelRecruitApplication(id, user?.id);
      if (error) {
        setError(toUserErrorMessage(error, '応募の取り消しに失敗しました。'));
        return false;
      }
      if (!data || data.length === 0) {
        setError('応募の取り消しに失敗しました。時間をおいて再度お試しください。');
        return false;
      }
      notifyRecruitOwnerOnCancelApply({
        recruitId: id,
        cancelledApplicationIds: (data || []).map((row) => row?.id).filter(Boolean),
        applicantUserId: user?.id,
      }).catch((notifyError) => {
        console.warn('[item8] recruit cancel notify skipped:', notifyError?.message || notifyError);
      });
      await refresh();
      return true;
    },
    [notifyRecruitOwnerOnCancelApply, refresh, user?.id]
  );

  /**
   * 募集単位の応募者一覧を取得してキャッシュする。
   *
   * @param {string} recruitId
   * @returns {Promise<void>}
   */
  const loadApplications = useCallback(async (recruitId) => {
    const { data, error } = await fetchApplications(recruitId);
    if (error) {
      setError(toUserErrorMessage(error, '応募者一覧の取得に失敗しました。'));
      return;
    }
    setApplications((prev) => ({ ...prev, [recruitId]: data || [] }));
  }, []);

  return {
    manager,
    currentUserId: user?.id,
    authLoading,
    loading,
    error,
    roles: userInfo?.roles || [],
    userInfo,
    recruits,
    historyRecruits,
    appliedRecruits,
    applications,
    retrySuccessEvent,
    clearRetrySuccessEvent,
    refresh,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleClose,
    handleReopen,
    handleApply,
    handleCancelApply,
    loadApplications,
    RINJI_STATUS,
  };
};
