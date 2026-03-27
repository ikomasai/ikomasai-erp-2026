/**
 * 団体別企画一覧向けユーティリティ
 * organizations_events を画面表示用に整形する処理をまとめる
 */

/**
 * 文字列の前後空白を除去する
 * @param {string|null|undefined} value - 対象文字列
 * @returns {string} 正規化後文字列
 */
const normalizeText = (value) => (value || '').trim();

/** 全団体を表す選択値 */
export const ALL_ORGANIZATION_EVENT_FILTER = '__all__';

/** 団体候補の最大表示件数 */
export const ORGANIZATION_EVENT_OPTION_LIMIT = 24;

/**
 * 団体候補検索文字列を正規化する
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化済み文字列
 */
export const normalizeOrganizationEventSearchValue = (value) => {
  return normalizeText(value).replace(/[\s\u3000]+/g, '').toLowerCase();
};

/**
 * 団体候補検索キーワードに一致するかを判定する
 * 部分一致に加えて、略称入力向けに文字の順序一致も許可する
 * @param {string|null|undefined} source - 候補文字列
 * @param {string|null|undefined} keyword - 検索キーワード
 * @returns {boolean} 一致する場合はtrue
 */
export const matchesOrganizationEventSearchKeyword = (source, keyword) => {
  /** 正規化済み候補文字列 */
  const normalizedSource = normalizeOrganizationEventSearchValue(source);
  /** 正規化済み検索キーワード */
  const normalizedKeyword = normalizeOrganizationEventSearchValue(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  if (!normalizedSource) {
    return false;
  }

  if (normalizedSource.includes(normalizedKeyword)) {
    return true;
  }

  /** 候補文字列の探索開始位置 */
  let sourceIndex = 0;

  for (const keywordCharacter of normalizedKeyword) {
    /** 次に一致する文字位置 */
    const nextIndex = normalizedSource.indexOf(keywordCharacter, sourceIndex);

    if (nextIndex === -1) {
      return false;
    }

    sourceIndex = nextIndex + 1;
  }

  return true;
};

/**
 * 団体候補一覧を生成する
 * 同名団体をまとめ、団体ごとの企画件数も表示する
 * @param {Array<{organization_name?: string}>} organizationEvents - 団体別企画一覧
 * @returns {Array<{value: string, label: string, count: number}>} 団体候補一覧
 */
export const buildOrganizationEventOptions = (organizationEvents) => {
  /** 団体名ごとの集計マップ */
  const optionMap = new Map();

  (organizationEvents || []).forEach((item) => {
    /** 団体名 */
    const organizationName = normalizeText(item?.organization_name);
    if (!organizationName) {
      return;
    }

    /** 現在の集計値 */
    const current = optionMap.get(organizationName) || {
      value: organizationName,
      label: organizationName,
      count: 0,
    };

    optionMap.set(organizationName, {
      ...current,
      count: current.count + 1,
    });
  });

  return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'ja'));
};
