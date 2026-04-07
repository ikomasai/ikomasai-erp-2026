/**
 * 落とし物データ取得サービス
 * Google スプレッドシートからCSV形式で落とし物データを取得・パースする
 * 個人情報（学籍番号・連絡先・紛失者名）はパース時に除外する
 */

import { fetchCsvData } from '../../../services/gas/gasApi';
import {
  LOSTITEM_SPREADSHEET_ID,
  SHEET_NAMES,
  HEADER_ROW_INDEX,
  DRIVE_THUMBNAIL_BASE_URL,
  THUMBNAIL_WIDTH,
} from '../constants';

/**
 * 指定シートの落とし物データをCSVで取得する
 * @param {string} sheetName - シート名（'一般', '緊急', '落とし主'）
 * @returns {Promise<Object>} { sheetName, exists, values }
 */
export const fetchLostItemSheet = async (sheetName) => {
  if (!LOSTITEM_SPREADSHEET_ID) {
    throw new Error('EXPO_PUBLIC_LOSTITEM_SPREADSHEET_IDが設定されていません');
  }

  return fetchCsvData(LOSTITEM_SPREADSHEET_ID, sheetName);
};

/**
 * 3シート（一般・緊急・落とし主）のデータを一括取得する
 * @returns {Promise<Object>} { normal, urgent, owner } 各シートのパース済みデータ
 */
export const fetchAllLostItemData = async () => {
  /** 3シートを並列でCSV取得 */
  const [normalResult, urgentResult, ownerResult] = await Promise.all([
    fetchLostItemSheet(SHEET_NAMES.NORMAL),
    fetchLostItemSheet(SHEET_NAMES.URGENT),
    fetchLostItemSheet(SHEET_NAMES.OWNER),
  ]);

  /** 一般シートのパース済みデータ */
  const normalItems = normalResult.exists
    ? parseLostItems(normalResult.values, false)
    : [];

  /** 緊急シートのパース済みデータ */
  const urgentItems = urgentResult.exists
    ? parseLostItems(urgentResult.values, true)
    : [];

  /** 落とし主シートのパース済みデータ */
  const ownerInquiries = ownerResult.exists
    ? parseOwnerInquiries(ownerResult.values)
    : [];

  return {
    normal: normalItems,
    urgent: urgentItems,
    owner: ownerInquiries,
  };
};

/**
 * 一般・緊急シートの生データから表示用データに変換する
 * 個人情報（G列: 学籍番号）を除外する
 *
 * CSV列構成:
 *   A(0): 識別タグ, B(1): 写真=IMAGE()【CSV空文字・スキップ】, C(2): 拾得物名, D(3): 拾得時間,
 *   E(4): 発見場所, F(5): 預かり場所, G(6): 学籍番号（除外）, H(7): 返却日, I(8): 写真URL（プレーンテキスト）,
 *   J(9): 学生部預かり（チェックボックス: TRUE/FALSE）
 *
 * @param {string[][]} rawValues - CSVパース後の2次元配列
 * @param {boolean} isUrgent - 緊急フラグ
 * @returns {Array<Object>} 表示用落とし物データ配列
 */
export const parseLostItems = (rawValues, isUrgent) => {
  /** ヘッダー行以降のデータ行のみ抽出 */
  const dataRows = rawValues.slice(HEADER_ROW_INDEX + 1);

  return dataRows
    .filter((row) => row[0] && row[0].trim()) // タグが空の行はスキップ
    .map((row) => {
      /** 識別タグ（A列） */
      const tag = (row[0] || '').trim();
      // B列は =IMAGE() 関数のためCSVでは空文字になる。I列のプレーンテキストURLを使用する
      /** 写真URL（I列）からサムネイルURLを抽出 */
      const imageUrl = extractImageUrl(row[8] || '');
      /** 拾得物の名前（C列） */
      const itemName = (row[2] || '').trim();
      /** 拾得時間（D列） */
      const foundTime = (row[3] || '').trim();
      /** 発見場所（E列） */
      const location = (row[4] || '').trim();
      /** 預かり場所（F列） */
      const storageLocation = (row[5] || '').trim();
      // G列（学籍番号）は個人情報のため意図的にスキップ
      /** 返却日（H列） */
      const returnDate = (row[7] || '').trim();
      /** 返却済みかどうか */
      const isReturned = returnDate.length > 0;
      /** 学生部預かりフラグ（J列チェックボックス: "TRUE" 文字列 = ON） */
      const isStudentDept = (row[9] || '').trim().toUpperCase() === 'TRUE';
      /** 実際の預かり場所（学生部預かりがONなら「学生部預かり」に上書き） */
      const resolvedStorageLocation = isStudentDept ? '学生部預かり' : storageLocation;

      return {
        tag,
        imageUrl,
        itemName,
        foundTime,
        location,
        storageLocation: resolvedStorageLocation,
        returnDate,
        isReturned,
        isUrgent,
        isStudentDept,
      };
    })
    .filter((item) => !item.isReturned); // 返却済みは表示対象外
};

/**
 * 落とし主シートの生データから表示用データに変換する
 * 個人情報（E列: 連絡先、F列: 学籍番号、G列: 紛失者名）を除外する
 *
 * CSV列構成:
 *   A(0): 識別番号, B(1): 紛失物名, C(2): 場所, D(3): 気づいた時間,
 *   E(4): 連絡先（除外）, F(5): 学籍番号（除外）, G(6): 紛失者名（除外）,
 *   H(7): 返却日
 *
 * @param {string[][]} rawValues - CSVパース後の2次元配列
 * @returns {Array<Object>} 表示用落とし主データ配列
 */
export const parseOwnerInquiries = (rawValues) => {
  /** ヘッダー行以降のデータ行のみ抽出 */
  const dataRows = rawValues.slice(HEADER_ROW_INDEX + 1);

  return dataRows
    .filter((row) => row[0] && row[0].toString().trim()) // 識別番号が空の行はスキップ
    .map((row) => {
      /** 識別番号（A列） */
      const id = (row[0] || '').toString().trim();
      /** 紛失物の名前（B列） */
      const lostItemName = (row[1] || '').trim();
      /** 落とした可能性のある場所（C列） */
      const location = (row[2] || '').trim();
      /** 気づいた時間（D列） */
      const noticedTime = (row[3] || '').trim();
      // E列（連絡先）は個人情報のため意図的にスキップ
      // F列（学籍番号）は個人情報のため意図的にスキップ
      // G列（紛失者名）は個人情報のため意図的にスキップ
      /** 返却日（H列） */
      const returnDate = (row[7] || '').trim();
      /** 対応済みかどうか */
      const isResolved = returnDate.length > 0;

      return {
        id,
        lostItemName,
        location,
        noticedTime,
        returnDate,
        isResolved,
      };
    })
    .filter((item) => !item.isResolved); // 対応済みは表示対象外
};

/**
 * CSVのI列セル値からGoogle DriveファイルIDを抽出し、サムネイル表示用URLに変換する
 *
 * ℹ️ B列は =IMAGE() 関数でスプレッドシート上の職員向け視認用。
 * CSVエクスポート（gviz/tq?tqx=out:csv）は =IMAGE() の値を取得できず空文字になるため、
 * GASは I列にプレーンテキストURLを別途保存している。本関数はI列の値を受け取る。
 *
 * 対応するURL形式:
 *   - https://drive.google.com/uc?export=view&id={fileId}  （GAS標準出力）
 *   - https://drive.google.com/file/d/{fileId}/view
 *   - https://drive.google.com/thumbnail?id={fileId}
 *
 * @param {string} cellValue - セルの値（Drive URL文字列）
 * @returns {string|null} サムネイル表示用画像URL。抽出できない場合はnull
 */
export const extractImageUrl = (cellValue) => {
  if (!cellValue || typeof cellValue !== 'string') {
    return null;
  }

  /** セル値の前後空白を除去した文字列 */
  const trimmed = cellValue.trim();
  if (!trimmed) {
    return null;
  }

  /** Google DriveファイルIDの正規表現パターン（複数URL形式に対応） */
  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]+)/, // ?id=xxx または &id=xxx 形式
    /\/d\/([a-zA-Z0-9_-]+)/,   // /d/xxx/ 形式
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      // Google Drive サムネイルURLに変換して返す
      return `${DRIVE_THUMBNAIL_BASE_URL}?id=${match[1]}&sz=w${THUMBNAIL_WIDTH}`;
    }
  }

  // URLパターンに一致しない場合はnull
  return null;
};
