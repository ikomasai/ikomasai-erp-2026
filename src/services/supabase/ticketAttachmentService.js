/**
 * 連絡案件添付サービス
 * ticket_attachments の登録・取得を担当
 */

import { getSupabaseClient } from './client.js';

const TICKET_ATTACHMENTS_TABLE = 'ticket_attachments';
export const DEFAULT_ATTACHMENT_BUCKET = 'ticket_attachments';
export const MAX_ATTACHMENT_FILE_BYTES = 5 * 1024 * 1024;
const TICKET_ATTACHMENT_COLUMNS =
  'id,ticket_id,uploaded_by,storage_bucket,storage_path,mime_type,file_size_bytes,caption,created_at';

const normalizeText = (value) => (value || '').trim();

/**
 * 添付情報を作成（ファイル実体のアップロードは別処理）
 * @param {Object} input - 入力
 * @param {string} input.ticketId - 連絡案件ID
 * @param {string} input.uploadedBy - 登録ユーザーID
 * @param {string} [input.storageBucket='ticket_attachments'] - バケット名
 * @param {string} input.storagePath - Storage内パス
 * @param {string} [input.mimeType] - MIMEタイプ
 * @param {number|null} [input.fileSizeBytes] - ファイルサイズ
 * @param {string} [input.caption] - 備考
 * @returns {Promise<{data: Object|null, error: Error|null}>} 登録結果
 */
export const createTicketAttachment = async (input) => {
  try {
    const ticketId = normalizeText(input.ticketId);
    const uploadedBy = normalizeText(input.uploadedBy);
    const storageBucket = normalizeText(input.storageBucket) || DEFAULT_ATTACHMENT_BUCKET;
    const storagePath = normalizeText(input.storagePath);
    const mimeType = normalizeText(input.mimeType) || null;
    const caption = normalizeText(input.caption) || null;
    const fileSizeRaw = Number(input.fileSizeBytes);
    const fileSizeBytes = Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? Math.floor(fileSizeRaw) : null;

    if (!ticketId) {
      throw new Error('ticketId が未指定です');
    }
    if (!uploadedBy) {
      throw new Error('uploadedBy が未指定です');
    }
    if (!storagePath) {
      throw new Error('storagePath が未指定です');
    }

    const payload = {
      ticket_id: ticketId,
      uploaded_by: uploadedBy,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      caption,
    };

    const { data, error } = await getSupabaseClient()
      .from(TICKET_ATTACHMENTS_TABLE)
      .insert(payload)
      .select(TICKET_ATTACHMENT_COLUMNS)
      .single();

    if (error) {
      console.error('添付登録エラー:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 添付ファイル名をStorage安全な形式へ変換
 * @param {string} fileName - 元ファイル名
 * @returns {string} サニタイズ後ファイル名
 */
const sanitizeFileName = (fileName) => {
  const normalized = normalizeText(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return normalized || 'attachment.bin';
};

/**
 * 添付ファイルをStorageへアップロード
 * @param {Object} input - アップロード入力
 * @param {string} input.ticketId - 連絡案件ID
 * @param {File|Blob} input.file - ファイル本体
 * @param {string} [input.fileName] - ファイル名
 * @param {string} [input.mimeType] - MIMEタイプ
 * @param {string} [input.storageBucket='ticket_attachments'] - バケット名
 * @returns {Promise<{data: Object|null, error: Error|null}>} アップロード結果
 */
/**
 * Storage に渡せるアップロード本体へ変換する
 * React Native の Blob / File はそのまま渡すと失敗しやすいため ArrayBuffer 化する
 * @param {File|Blob|ArrayBuffer|Uint8Array} file - 元ファイル
 * @returns {Promise<ArrayBuffer|Uint8Array>} アップロード本体
 */
const buildUploadBody = async (file) => {
  if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
    return file;
  }

  if (file && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  throw new Error('アップロードできない添付形式です');
};

export const uploadTicketAttachmentFile = async (input) => {
  try {
    const ticketId = normalizeText(input.ticketId);
    const storageBucket = normalizeText(input.storageBucket) || DEFAULT_ATTACHMENT_BUCKET;
    const file = input.file || null;
    const fileName = sanitizeFileName(input.fileName || file?.name || 'attachment.bin');
    const mimeType = normalizeText(input.mimeType || file?.type) || 'application/octet-stream';
    const fileSizeRaw = Number(input.fileSizeBytes ?? file?.size ?? 0);
    const fileSizeBytes = Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? Math.floor(fileSizeRaw) : 0;

    if (!ticketId) {
      throw new Error('ticketId が未指定です');
    }
    if (!file) {
      throw new Error('file が未指定です');
    }
    if (fileSizeBytes > MAX_ATTACHMENT_FILE_BYTES) {
      throw new Error(`添付サイズは5MB以下にしてください（現在: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB）`);
    }

    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const storagePath = `${ticketId}/${timestamp}-${randomSuffix}-${fileName}`;
    const uploadBody = await buildUploadBody(file);

    const { error } = await getSupabaseClient().storage.from(storageBucket).upload(storagePath, uploadBody, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      console.error('添付ファイルアップロードエラー:', error);
      return { data: null, error };
    }

    return {
      data: {
        storageBucket,
        storagePath,
        mimeType,
        fileSizeBytes,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 添付ファイルの署名付きURLを生成
 * @param {Object} input - 生成入力
 * @param {string} [input.storageBucket='ticket_attachments'] - バケット名
 * @param {string} input.storagePath - Storage内パス
 * @param {number} [input.expiresIn=3600] - 有効期限（秒）
 * @returns {Promise<{data: {signedUrl: string}|null, error: Error|null}>} 生成結果
 */
export const createAttachmentSignedUrl = async (input) => {
  try {
    const storageBucket = normalizeText(input.storageBucket) || DEFAULT_ATTACHMENT_BUCKET;
    const storagePath = normalizeText(input.storagePath);
    const expiresInRaw = Number(input.expiresIn);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? Math.floor(expiresInRaw) : 3600;

    if (!storagePath) {
      throw new Error('storagePath が未指定です');
    }

    const { data, error } = await getSupabaseClient()
      .storage.from(storageBucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('添付署名URL生成エラー:', error);
      return { data: null, error };
    }

    return { data: { signedUrl: data?.signedUrl || '' }, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

/**
 * 添付一覧を取得
 * @param {Object} params - 取得条件
 * @param {string} params.ticketId - 連絡案件ID
 * @param {number} [params.limit=20] - 最大件数
 * @returns {Promise<{data: Array, error: Error|null}>} 取得結果
 */
export const listTicketAttachments = async ({ ticketId, limit = 20 }) => {
  try {
    const normalizedTicketId = normalizeText(ticketId);
    if (!normalizedTicketId) {
      return { data: [], error: null };
    }

    const { data, error } = await getSupabaseClient()
      .from(TICKET_ATTACHMENTS_TABLE)
      .select(TICKET_ATTACHMENT_COLUMNS)
      .eq('ticket_id', normalizedTicketId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('添付一覧取得エラー:', error);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('添付一覧取得処理でエラー:', error);
    return { data: [], error };
  }
};
