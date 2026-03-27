/**
 * 企画者サポートサービス
 * 連絡案件（support_tickets）への登録と取得を担当
 */

import { getSupabaseClient } from '../../../services/supabase/client';
import { createKeyReservations } from '../../../services/supabase/keyReservationService.js';
import {
  createTicketAttachment,
  DEFAULT_ATTACHMENT_BUCKET,
  uploadTicketAttachmentFile,
} from '../../../services/supabase/ticketAttachmentService.js';
import { notifySupportTicketCreated } from '../../../shared/services/supportWorkflowNotificationService.js';

/** 連絡案件テーブル名 */
const SUPPORT_TICKETS_TABLE = 'support_tickets';
/** 通知に必要な連絡案件取得カラム */
const SUPPORT_TICKET_NOTIFICATION_COLUMNS =
  'id,ticket_no,ticket_type,ticket_status,priority,title,description,event_id,event_name,event_location,created_by,org_id,notify_target,metadata,created_at,updated_at,organizations(id,name)';

/**
 * 受付番号を生成する
 * 形式: T-YYYYMMDD-HHMMSS-XXXXXX
 * @returns {string} 受付番号
 */
const generateTicketNo = () => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `T-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${random}`;
};

/** 質問種別ごとの変換設定 */
const QUESTION_TYPE_CONFIG = {
  rule_change: {
    ticketType: 'rule_question',
    title: '企画ルール変更の相談',
    notifyTarget: 'hq',
  },
  layout_change: {
    ticketType: 'layout_change',
    title: '配置図変更の相談',
    notifyTarget: 'hq',
  },
  distribution_change: {
    ticketType: 'distribution_change',
    title: '商品配布基準変更の連絡',
    notifyTarget: 'accounting',
  },
  damage_report: {
    ticketType: 'damage_report',
    title: '物品破損の報告',
    notifyTarget: 'property',
  },
};

/**
 * 質問詳細の先頭をタイトル用に短く整形する
 * @param {string} detail - 質問詳細
 * @returns {string} タイトル用プレビュー
 */
const buildQuestionTitlePreview = (detail) => {
  /** 改行と連続空白をならした文字列 */
  const normalizedDetail = normalizeText(detail).replace(/\s+/g, ' ');
  if (!normalizedDetail) {
    return '';
  }

  return normalizedDetail.length > 24 ? `${normalizedDetail.slice(0, 24)}...` : normalizedDetail;
};

/**
 * 質問連絡案件のタイトルを組み立てる
 * @param {Object} config - 質問種別設定
 * @param {string} detail - 質問詳細
 * @returns {string} タイトル
 */
const buildQuestionTicketTitle = (config) => {
  return config.title;
};

/**
 * 空文字をトリムして返す
 * @param {string} value - 対象文字列
 * @returns {string} トリム済み文字列
 */
const normalizeText = (value) => (value || '').trim();
const TIME_ONLY_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * 鍵希望時刻テキストを正規化
 * @param {string} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeRequestedAtText = (value) => normalizeText(value).replace(/：/g, ':').replace(/\s+/g, ' ');

/**
 * 日付文字列の妥当性を確認
 * @param {number} year - 年
 * @param {number} month - 月
 * @param {number} day - 日
 * @returns {boolean} 妥当性
 */
const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/**
 * 鍵希望時刻をバリデーション
 * 受理形式:
 * - HH:mm
 * - YYYY-MM-DD HH:mm
 * @param {string} value - 入力値
 * @returns {string} 正規化済み希望時刻
 * @throws {Error} 入力形式エラー
 */
const validateRequestedAtText = (value) => {
  const normalized = normalizeRequestedAtText(value);
  if (!normalized) {
    throw new Error('希望時刻を入力してください');
  }

  if (TIME_ONLY_PATTERN.test(normalized)) {
    return normalized;
  }

  const dateTimeMatch = DATE_TIME_PATTERN.exec(normalized);
  if (dateTimeMatch) {
    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    if (!isValidCalendarDate(year, month, day)) {
      throw new Error('希望時刻の日付が正しくありません');
    }
    return `${dateTimeMatch[1]}-${dateTimeMatch[2]}-${dateTimeMatch[3]} ${dateTimeMatch[4]}:${dateTimeMatch[5]}`;
  }

  throw new Error('希望時刻は「HH:mm」または「YYYY-MM-DD HH:mm」で入力してください');
};

/**
 * 警告文を結果へ付与
 * @param {Object} result - 元結果
 * @param {string} warning - 追加警告
 * @returns {Object} warningを付与した結果
 */
const withWarning = (result, warning) => {
  if (!warning) {
    return result;
  }
  if (!result?.warning) {
    return { ...result, warning };
  }
  return { ...result, warning: `${result.warning}\n${warning}` };
};

/**
 * 添付入力を正規化
 * @param {Array} attachments - 添付入力
 * @returns {Array} 正規化済み添付
 */
const normalizeAttachments = (attachments) => {
  const rows = Array.isArray(attachments) ? attachments : [];
  return rows
    .map((row) => {
      const file = row?.file || null;
      const fileSizeRaw = Number(row?.fileSizeBytes ?? file?.size);
      const fileSizeBytes = Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? Math.floor(fileSizeRaw) : null;

      return {
        storageBucket: normalizeText(row?.storageBucket) || DEFAULT_ATTACHMENT_BUCKET,
        storagePath: normalizeText(row?.storagePath),
        file,
        fileName: normalizeText(row?.fileName || file?.name),
        mimeType: normalizeText(row?.mimeType || file?.type) || null,
        caption: normalizeText(row?.caption) || null,
        fileSizeBytes,
      };
    })
    .filter((row) => row.storagePath || row.file)
    .slice(0, 5);
};

/**
 * 添付情報を保存
 * @param {Object} input - 入力
 * @param {string} input.ticketId - 連絡案件ID
 * @param {string} input.uploadedBy - 登録ユーザーID
 * @param {Array} input.attachments - 添付入力
 * @returns {Promise<{count: number, error: Error|null}>} 保存結果
 */
const saveTicketAttachments = async ({ ticketId, uploadedBy, attachments }) => {
  const normalizedTicketId = normalizeText(ticketId);
  const normalizedUploadedBy = normalizeText(uploadedBy);
  const normalizedAttachments = normalizeAttachments(attachments);

  if (!normalizedTicketId || !normalizedUploadedBy || normalizedAttachments.length === 0) {
    return { count: 0, error: null };
  }

  for (const attachment of normalizedAttachments) {
    let storageBucket = attachment.storageBucket || DEFAULT_ATTACHMENT_BUCKET;
    let storagePath = attachment.storagePath;
    let mimeType = attachment.mimeType;
    let fileSizeBytes = attachment.fileSizeBytes;

    if (attachment.file) {
      const uploadResult = await uploadTicketAttachmentFile({
        ticketId: normalizedTicketId,
        file: attachment.file,
        fileName: attachment.fileName,
        mimeType,
        storageBucket,
        fileSizeBytes,
      });
      if (uploadResult.error || !uploadResult.data) {
        const uploadError = uploadResult.error || new Error('添付ファイルのアップロードに失敗しました。');
        console.warn('添付ファイルのアップロードに失敗:', uploadError);
        return { count: 0, error: uploadError };
      }

      storageBucket = uploadResult.data.storageBucket;
      storagePath = uploadResult.data.storagePath;
      mimeType = uploadResult.data.mimeType;
      fileSizeBytes = uploadResult.data.fileSizeBytes;
    }

    const { error } = await createTicketAttachment({
      ticketId: normalizedTicketId,
      uploadedBy: normalizedUploadedBy,
      storageBucket,
      storagePath,
      mimeType,
      caption: attachment.caption,
      fileSizeBytes,
    });

    if (error) {
      console.warn('添付情報の保存に失敗:', error);
      return { count: 0, error };
    }
  }

  return { count: normalizedAttachments.length, error: null };
};

/**
 * 連絡案件作成後に通知を送信する
 * 通知失敗は業務登録の失敗にしない（ログ出力のみ）
 * @param {Object} result - 登録結果
 * @param {string|null} senderUserId - 送信者
 * @returns {Promise<Object>} 元の登録結果
 */
const notifyTicketCreatedIfNeeded = async (result, senderUserId) => {
  if (result?.error || !result?.data) {
    return result;
  }

  const { error: notifyError } = await notifySupportTicketCreated({
    ticket: result.data,
    senderUserId,
  });
  if (notifyError) {
    console.warn('連絡案件通知の送信に失敗:', notifyError);
  }

  return result;
};

/**
 * 作成済み連絡案件に添付登録と通知を適用
 * @param {Object} result - 作成結果
 * @param {Object} input - 入力値
 * @returns {Promise<Object>} 反映後結果
 */
const applyAttachmentAndNotify = async (result, input) => {
  if (result?.error || !result?.data) {
    return result;
  }

  const attachmentResult = await saveTicketAttachments({
    ticketId: result.data.id,
    uploadedBy: normalizeText(input.createdBy),
    attachments: input.attachments,
  });

  const notified = await notifyTicketCreatedIfNeeded(result, normalizeText(input.createdBy) || null);
  if (attachmentResult.error) {
    const attachmentMessage = attachmentResult.error.message || '添付情報の登録に失敗しました。';
    return withWarning(notified, `連絡案件は作成しましたが、添付処理に失敗しました。${attachmentMessage}`);
  }

  return notified;
};

/**
 * 共通項目のバリデーション
 * @param {Object} input - 入力値
 * @throws {Error} バリデーションエラー
 */
const validateCommonInput = (input) => {
  const eventName = normalizeText(input.eventName);
  const eventLocation = normalizeText(input.eventLocation);
  const createdBy = normalizeText(input.createdBy);

  if (!eventName) {
    throw new Error('企画名が未入力です');
  }
  if (!eventLocation) {
    throw new Error('企画場所が未入力です');
  }
  if (!createdBy) {
    throw new Error('ログインユーザー情報が取得できません');
  }
};

/**
 * 連絡案件を登録
 * @param {Object} payload - 登録用データ
 * @returns {Promise<Object>} 登録結果
 */
const createSupportTicket = async (payload) => {
  try {
    const input = {
      ...payload,
      ticket_no: payload.ticket_no || generateTicketNo(),
    };

    const { data, error } = await getSupabaseClient()
      .from(SUPPORT_TICKETS_TABLE)
      .insert(input)
      .select(SUPPORT_TICKET_NOTIFICATION_COLUMNS)
      .single();

    if (error) {
      console.error('連絡案件登録エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('連絡案件登録処理でエラー:', error);
    return { data: null, error };
  }
};

/**
 * 質問系統の連絡案件を作成
 * @param {Object} input - 入力値
 * @returns {Promise<Object>} 作成結果
 */
const createQuestionContact = async (input) => {
  try {
    validateCommonInput(input);

    const detail = normalizeText(input.detail);
    if (!detail) {
      throw new Error('質問内容を入力してください');
    }

    const typeKey = normalizeText(input.questionType) || 'rule_change';
    const config = QUESTION_TYPE_CONFIG[typeKey] || QUESTION_TYPE_CONFIG.rule_change;

    const payload = {
      ticket_type: config.ticketType,
      ticket_status: 'new',
      priority: 'normal',
      title: buildQuestionTicketTitle(config, detail),
      description: detail,
      event_id: normalizeText(input.eventId) || null,
      event_name: normalizeText(input.eventName),
      event_location: normalizeText(input.eventLocation),
      created_by: normalizeText(input.createdBy),
      org_id: input.orgId || null,
      notify_target: config.notifyTarget,
      metadata: {
        question_type: typeKey,
      },
    };

    const result = await createSupportTicket(payload);
    return applyAttachmentAndNotify(result, input);
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 緊急呼び出しを作成
 * @param {Object} input - 入力値
 * @param {string} input.emergencyLocation - 現在地・場所（必須）
 * @param {string} [input.detail] - 緊急内容（任意）
 * @returns {Promise<Object>} 作成結果
 */
const createEmergencyContact = async (input) => {
  try {
    validateCommonInput(input);

    /** 現在地・場所（必須）: 本部側が「どこ・誰か」を即判断するための情報 */
    const emergencyLocation = normalizeText(input.emergencyLocation);
    if (!emergencyLocation) {
      throw new Error('現在地・場所を入力してください');
    }

    /** 緊急内容（任意）: 空文字の場合はデフォルトメッセージを使用 */
    const detail = normalizeText(input.detail) || '緊急呼び出し';

    /** 優先度は常に high 固定（緊急呼び出しは最高優先度） */
    const priority = 'high';

    const payload = {
      ticket_type: 'emergency',
      ticket_status: 'new',
      priority,
      title: '緊急呼び出し',
      description: detail,
      event_id: normalizeText(input.eventId) || null,
      event_name: normalizeText(input.eventName),
      /** event_location: プロフィールの場所ではなく現在地・場所を使用 */
      event_location: emergencyLocation,
      created_by: normalizeText(input.createdBy),
      org_id: input.orgId || null,
      notify_target: 'hq',
      metadata: {
        /** 現在地・場所情報をメタデータにも保持 */
        emergency_location: emergencyLocation,
      },
    };

    const result = await createSupportTicket(payload);
    return applyAttachmentAndNotify(result, input);
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 鍵の事前申請を作成
 * @param {Object} input - 入力値
 * @returns {Promise<Object>} 作成結果
 */
const createKeyPreapply = async (input) => {
  try {
    validateCommonInput(input);

    const keyTargets = Array.isArray(input.keyTargets)
      ? input.keyTargets
          .map((item) => {
            const id = normalizeText(item?.id);
            const keyCode = normalizeText(item?.keyCode || id);
            const name = normalizeText(item?.name);
            const building = normalizeText(item?.building);
            const location = normalizeText(item?.location);

            if (!name) {
              return null;
            }

            return {
              id: id || keyCode || name,
              keyCode: keyCode || id || name,
              name,
              building,
              location: location || [building, name].filter(Boolean).join(' '),
            };
          })
          .filter(Boolean)
      : [];

    // Backward compatibility for old single-text input UI.
    if (keyTargets.length === 0) {
      const fallbackKeyTarget = normalizeText(input.keyTarget);
      if (fallbackKeyTarget) {
        keyTargets.push({
          id: fallbackKeyTarget,
          keyCode: fallbackKeyTarget,
          name: fallbackKeyTarget,
          building: '',
          location: fallbackKeyTarget,
        });
      }
    }

    if (keyTargets.length === 0) {
      throw new Error('対象の鍵を選択してください');
    }

    const keySummaryForTitle = keyTargets.length === 1 ? keyTargets[0].name : `${keyTargets.length}件`;
    const keySummaryLines = keyTargets.map((keyItem) => `- ${keyItem.location || keyItem.name}`).join('\n');
    const description = `対象鍵\n${keySummaryLines}`;

    const payload = {
      ticket_type: 'key_preapply',
      ticket_status: 'new',
      priority: 'normal',
      title: `鍵の事前申請: ${keySummaryForTitle}`,
      description,
      event_id: normalizeText(input.eventId) || null,
      event_name: normalizeText(input.eventName),
      event_location: normalizeText(input.eventLocation),
      created_by: normalizeText(input.createdBy),
      org_id: input.orgId || null,
      notify_target: 'hq',
      metadata: {
        key_target: keySummaryForTitle,
        key_targets: keyTargets,
      },
    };

    const result = await createSupportTicket(payload);
    if (result.error || !result.data) {
      return result;
    }

    const reservationResult = await createKeyReservations({
      requestedBy: normalizeText(input.createdBy),
      orgId: input.orgId || null,
      ticketId: result.data.id,
      eventName: normalizeText(input.eventName),
      eventLocation: normalizeText(input.eventLocation),
      requestedAtText: '',
      reason: '',
      keyTargets,
    });

    let nextResult = await applyAttachmentAndNotify(result, input);
    if (reservationResult.error) {
      console.warn('鍵予約テーブルへの保存に失敗:', reservationResult.error);
      nextResult = withWarning(
        nextResult,
        '連絡案件は作成しましたが、鍵予約テーブルへの保存に失敗しました。'
      );
    }

    return nextResult;
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 開始/終了報告を作成
 * @param {Object} input - 入力値
 * @returns {Promise<Object>} 作成結果
 */
const createEventStatusReport = async (input) => {
  try {
    validateCommonInput(input);

    const status = normalizeText(input.status) || 'start';
    const isStart = status === 'start';
    const ticketType = isStart ? 'start_report' : 'end_report';
    const title = isStart ? '企画開始報告' : '企画終了報告';
    const description = isStart ? '企画開始を報告します。' : '企画終了を報告します。';

    const payload = {
      ticket_no: generateTicketNo(),
      ticket_type: ticketType,
      ticket_status: 'new',
      priority: 'normal',
      title,
      description,
      event_id: normalizeText(input.eventId) || null,
      event_name: normalizeText(input.eventName),
      event_location: normalizeText(input.eventLocation),
      created_by: normalizeText(input.createdBy),
      org_id: input.orgId || null,
      notify_target: 'hq',
      metadata: {
        event_status: status,
        reported_at: new Date().toISOString(),
      },
    };

    const { data: rpcData, error: rpcError } = await getSupabaseClient().rpc('rpc_create_ticket_and_auto_tasks', {
      ticket_payload: payload,
    });

    if (!rpcError) {
      const result = {
        data: rpcData?.ticket || rpcData || null,
        error: null,
      };
      return applyAttachmentAndNotify(result, input);
    }

    // RPC未適用環境では従来どおり直接登録へフォールバックする。
    const fallbackResult = await createSupportTicket(payload);
    return applyAttachmentAndNotify(fallbackResult, input);
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 自分の連絡案件を取得
 * @param {Object} params - 取得条件
 * @param {string} params.createdBy - 作成者ユーザーID
 * @param {number} [params.limit=20] - 取得件数
 * @returns {Promise<Object>} 取得結果
 */
const listMyContacts = async ({ createdBy, limit = 20 }) => {
  try {
    const userId = normalizeText(createdBy);
    if (!userId) {
      return { data: [], error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from(SUPPORT_TICKETS_TABLE)
      .select(
        'id,ticket_no,ticket_type,ticket_status,priority,title,description,event_id,event_name,event_location,created_at,updated_at'
      )
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('連絡案件一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('連絡案件一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};

export const exhibitorSupportService = {
  createQuestionContact,
  createEmergencyContact,
  createKeyPreapply,
  createEventStatusReport,
  listMyContacts,
};
