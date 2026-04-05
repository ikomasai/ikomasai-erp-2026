/**
 * 臨時ヘルプ機能 Supabase アクセス層
 * このフォルダ内のみで完結させ、他ディレクトリには触れない
 */

import { getSupabaseClient } from '../../../services/supabase/client.js';
import { RINJI_STATUS, RINJI_CLOSE_REASON, OPTIONAL_FIELD_DEFAULTS } from '../constants.js';

const supabase = getSupabaseClient();
const IMMEDIATE_TIME_LABEL = '現在時刻';
const LEGACY_IMMEDIATE_TIME_LABEL = 'いますぐ';
const DELETED_RECRUIT_MARKER = '\n\n::DELETED::\n\n1';
const RECRUIT_MUTABLE_FIELDS = [
  'head_user_id',
  'department_id',
  'headcount',
  'work_date',
  'work_time',
  'location',
  'meet_place',
  'meet_time',
  'description',
  'reward',
  'belongings',
];

/**
 * `close_reason` 列が未反映の環境かどうかを判定する。
 *
 * @param {any} error
 * @returns {boolean}
 */
const isMissingCloseReasonColumnError = (error) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return text.includes('close_reason') && (text.includes('column') || text.includes('schema cache'));
};

/**
 * 期限切れ自動クローズ用 RPC 関数未作成エラーかを判定する。
 *
 * @param {any} error
 * @returns {boolean}
 */
const isMissingExpiredCloseFunctionError = (error) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return text.includes('close_expired_rinji_recruits') && (text.includes('function') || text.includes('does not exist'));
};

/**
 * 表示用の作業時間文字列から開始時刻を推定する。
 *
 * @param {string | null | undefined} workTime
 * @returns {string | null}
 */
const inferStartTime = (workTime) => {
  if (!workTime || typeof workTime !== 'string') return null;
  if (
    workTime === IMMEDIATE_TIME_LABEL ||
    workTime.startsWith(`${IMMEDIATE_TIME_LABEL}〜`) ||
    workTime === LEGACY_IMMEDIATE_TIME_LABEL ||
    workTime.startsWith(`${LEGACY_IMMEDIATE_TIME_LABEL}〜`)
  ) {
    return IMMEDIATE_TIME_LABEL;
  }
  const start = workTime.split('〜')[0]?.trim();
  if (!start) return null;
  return /^\d{2}:\d{2}$/.test(start) ? start : null;
};

/**
 * 任意項目を既定値で補完して DB へ送る payload を正規化する。
 *
 * @param {Record<string, any>} payload
 * @returns {Record<string, any>}
 */
const withOptionalDefaults = (payload = {}) => {
  const location = payload.location;
  const inferredMeetTime = inferStartTime(payload.work_time);
  // 空文字は null 扱いにするユーティリティ
  const nullIfEmpty = (v) => (v === '' ? null : v);

  const normalized = {
    ...payload,
    department_id: nullIfEmpty(payload.department_id),
    // meet_place が未入力なら location を使用
    meet_place:
      payload.meet_place === undefined || payload.meet_place === null || payload.meet_place === ''
        ? OPTIONAL_FIELD_DEFAULTS.meet_place(location)
        : payload.meet_place,
    // meet_time 未入力なら null のまま（表示しない）
    meet_time:
      payload.meet_time === undefined || payload.meet_time === ''
        ? inferredMeetTime
        : payload.meet_time,
    // belongings 未入力なら「なし」
    belongings:
      payload.belongings === undefined || payload.belongings === null || payload.belongings === ''
        ? OPTIONAL_FIELD_DEFAULTS.belongings
        : payload.belongings,
  };

  return normalized;
};

/**
 * 募集作成/更新に利用する項目だけを抽出する。
 * 一覧表示用の派生項目（applicant_count など）は除外する。
 *
 * @param {Record<string, any>} payload
 * @returns {Record<string, any>}
 */
const pickRecruitMutableFields = (payload = {}) =>
  RECRUIT_MUTABLE_FIELDS.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      acc[key] = payload[key];
    }
    return acc;
  }, {});

/**
 * 募集 description に論理削除マーカーが付与されているか判定する。
 *
 * @param {string | null | undefined} description
 * @returns {boolean}
 */
const isDeletedRecruitDescription = (description) =>
  typeof description === 'string' && description.includes(DELETED_RECRUIT_MARKER);

/**
 * 募集配列から論理削除済み募集を除外する。
 *
 * @param {Array<Record<string, any>> | null | undefined} recruits
 * @returns {Array<Record<string, any>>}
 */
const excludeDeletedRecruits = (recruits) =>
  (recruits || []).filter((recruit) => !isDeletedRecruitDescription(recruit?.description));

/**
 * description に論理削除マーカーを付与する。
 *
 * @param {string | null | undefined} description
 * @returns {string}
 */
const appendDeletedMarker = (description) => {
  const base = typeof description === 'string' ? description : '';
  if (isDeletedRecruitDescription(base)) {
    return base;
  }
  return `${base}${DELETED_RECRUIT_MARKER}`;
};

/**
 * 募集配列に応募人数（applicant_count）を付与する。
 *
 * @param {Array<Record<string, any>> | null | undefined} recruits
 * @returns {Promise<{ data: Array<Record<string, any>> | null, error: any }>}
 */
const withApplicantCounts = async (recruits) => {
  const list = recruits || [];
  if (list.length === 0) {
    return { data: [], error: null };
  }

  const recruitIds = [...new Set(list.map((item) => item?.id).filter(Boolean))];
  if (recruitIds.length === 0) {
    return { data: list, error: null };
  }

  const { data: applications, error } = await supabase
    .from('rinji_help_applications')
    .select('recruit_id')
    .in('recruit_id', recruitIds);

  if (error) {
    return { data: null, error };
  }

  const counts = (applications || []).reduce((acc, row) => {
    const key = row?.recruit_id;
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const enriched = list.map((recruit) => ({
    ...recruit,
    applicant_count: counts[recruit.id] || 0,
  }));
  return { data: enriched, error: null };
};

/**
 * 募集配列に作成者の所属組織（head_organization）を付与する。
 *
 * @param {Array<Record<string, any>> | null | undefined} recruits
 * @returns {Promise<{ data: Array<Record<string, any>> | null, error: any }>}
 */
const withCreatorOrganizations = async (recruits) => {
  const list = recruits || [];
  if (list.length === 0) {
    return { data: [], error: null };
  }

  const headUserIds = [...new Set(list.map((item) => item?.head_user_id).filter(Boolean))];
  if (headUserIds.length === 0) {
    return {
      data: list.map((recruit) => ({
        ...recruit,
        head_organization: null,
      })),
      error: null,
    };
  }

  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('user_id, organization')
    .in('user_id', headUserIds);

  if (error) {
    // 組織名取得が失敗しても募集一覧本体は表示する。
    return {
      data: list.map((recruit) => ({
        ...recruit,
        head_organization: null,
      })),
      error: null,
    };
  }

  const organizationByUserId = (profiles || []).reduce((acc, row) => {
    if (!row?.user_id) return acc;
    acc[row.user_id] = row.organization || null;
    return acc;
  }, {});

  return {
    data: list.map((recruit) => ({
      ...recruit,
      head_organization: organizationByUserId[recruit.head_user_id] || null,
    })),
    error: null,
  };
};

/**
 * 募集配列へ応募人数と作成者組織情報を付与する。
 *
 * @param {Array<Record<string, any>> | null | undefined} recruits
 * @returns {Promise<{ data: Array<Record<string, any>> | null, error: any }>}
 */
const enrichRecruits = async (recruits) => {
  const { data: withCounts, error: countError } = await withApplicantCounts(recruits || []);
  if (countError) {
    return { data: null, error: countError };
  }
  return withCreatorOrganizations(withCounts || []);
};

/**
 * 対象募集の応募件数を取得する。
 *
 * @param {string} recruitId
 * @returns {Promise<{ count: number | null, error: any }>}
 */
const fetchApplicantCount = async (recruitId) => {
  const { count, error } = await supabase
    .from('rinji_help_applications')
    .select('id', { count: 'exact', head: true })
    .eq('recruit_id', recruitId);

  if (error) {
    return { count: null, error };
  }
  return { count: count || 0, error: null };
};

/**
 * 自動終了/自動再開判定に必要な募集情報を取得する。
 * `close_reason` 未反映環境では後方互換のためフォールバック取得する。
 *
 * @param {string} recruitId
 * @returns {Promise<{ data: ({id: string, status: string, headcount: number, close_reason: string | null, hasCloseReasonColumn: boolean}) | null, error: any }>}
 */
const fetchRecruitForAutoControl = async (recruitId) => {
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .select('id, status, headcount, close_reason')
    .eq('id', recruitId)
    .single();

  if (!error) {
    return {
      data: {
        ...data,
        hasCloseReasonColumn: true,
      },
      error: null,
    };
  }

  if (!isMissingCloseReasonColumnError(error)) {
    return { data: null, error };
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('rinji_help_recruits')
    .select('id, status, headcount')
    .eq('id', recruitId)
    .single();

  if (fallbackError) {
    return { data: null, error: fallbackError };
  }

  return {
    data: {
      ...fallback,
      close_reason: null,
      hasCloseReasonColumn: false,
    },
    error: null,
  };
};

/**
 * 応募人数が募集人数に達していれば募集を自動終了する。
 *
 * @param {string} recruitId
 * @returns {Promise<{ error: any }>}
 */
const autoCloseRecruitWhenFull = async (recruitId) => {
  const { data: recruit, error: recruitError } = await fetchRecruitForAutoControl(recruitId);
  if (recruitError || !recruit) {
    return { error: recruitError };
  }

  if (recruit.status !== RINJI_STATUS.OPEN) {
    return { error: null };
  }

  const headcount = Number(recruit.headcount);
  if (!Number.isFinite(headcount) || headcount <= 0) {
    return { error: null };
  }

  const { count, error: countError } = await fetchApplicantCount(recruitId);
  if (countError || count === null) {
    return { error: countError };
  }

  if (count < headcount) {
    return { error: null };
  }

  const payload = {
    status: RINJI_STATUS.CLOSED,
    updated_at: new Date().toISOString(),
  };
  if (recruit.hasCloseReasonColumn) {
    payload.close_reason = RINJI_CLOSE_REASON.AUTO_FULL;
  }

  const { error } = await supabase
    .from('rinji_help_recruits')
    .update(payload)
    .eq('id', recruitId)
    .eq('status', RINJI_STATUS.OPEN);

  return { error };
};

/**
 * 応募取り消し後に、満員自動終了だった募集のみ必要に応じて自動再開する。
 *
 * @param {string} recruitId
 * @returns {Promise<{ error: any }>}
 */
const autoReopenRecruitWhenBelowCapacity = async (recruitId) => {
  const { data: recruit, error: recruitError } = await fetchRecruitForAutoControl(recruitId);
  if (recruitError || !recruit) {
    return { error: recruitError };
  }

  // close_reason 列が無い環境では手動終了との区別ができないため再開しない。
  if (!recruit.hasCloseReasonColumn) {
    return { error: null };
  }

  if (recruit.status !== RINJI_STATUS.CLOSED || recruit.close_reason !== RINJI_CLOSE_REASON.AUTO_FULL) {
    return { error: null };
  }

  const headcount = Number(recruit.headcount);
  if (!Number.isFinite(headcount) || headcount <= 0) {
    return { error: null };
  }

  const { count, error: countError } = await fetchApplicantCount(recruitId);
  if (countError || count === null) {
    return { error: countError };
  }

  if (count >= headcount) {
    return { error: null };
  }

  const { error } = await supabase
    .from('rinji_help_recruits')
    .update({
      status: RINJI_STATUS.OPEN,
      close_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recruitId)
    .eq('status', RINJI_STATUS.CLOSED)
    .eq('close_reason', RINJI_CLOSE_REASON.AUTO_FULL);

  return { error };
};

/**
 * 募集日の翌日 00:00 を過ぎた open 募集を自動クローズに同期する。
 * DB 側の security definer RPC が存在しない環境では何もしない。
 *
 * @returns {Promise<{ error: any }>}
 */
export const syncExpiredRecruitStatuses = async () => {
  const { error } = await supabase.rpc('close_expired_rinji_recruits');
  if (!error) {
    return { error: null };
  }
  if (isMissingExpiredCloseFunctionError(error)) {
    return { error: null };
  }
  return { error };
};

/**
 * 募集検索共通フィルタをクエリに適用する。
 *
 * @param {any} query
 * @param {{ location?: string, department_id?: string }} filters
 * @returns {any}
 */
const applyRecruitFilters = (query, filters = {}) => {
  let next = query;
  if (filters.location) {
    next = next.ilike('location', `%${filters.location}%`);
  }
  if (filters.department_id) {
    next = next.eq('department_id', filters.department_id);
  }
  return next;
};

/**
 * 募集一覧を取得する。
 *
 * @param {{ includeClosed?: boolean, includeAutoFullClosed?: boolean, filters?: { location?: string, department_id?: string } }} params
 * @returns {Promise<{ data: any, error: any }>}
 */
export const fetchRecruits = async ({ includeClosed = false, includeAutoFullClosed = false, filters = {} } = {}) => {
  let query = supabase.from('rinji_help_recruits').select('*').order('updated_at', { ascending: false });

  if (!includeClosed) {
    if (includeAutoFullClosed) {
      const openQuery = applyRecruitFilters(
        supabase
          .from('rinji_help_recruits')
          .select('*')
          .eq('status', RINJI_STATUS.OPEN)
          .order('updated_at', { ascending: false }),
        filters
      );
      const autoFullClosedQuery = applyRecruitFilters(
        supabase
          .from('rinji_help_recruits')
          .select('*')
          .eq('status', RINJI_STATUS.CLOSED)
          .in('close_reason', [RINJI_CLOSE_REASON.AUTO_FULL, RINJI_CLOSE_REASON.AUTO_DATE_PASSED])
          .order('updated_at', { ascending: false }),
        filters
      );

      const [{ data: openRows, error: openError }, { data: autoClosedRows, error: autoClosedError }] =
        await Promise.all([openQuery, autoFullClosedQuery]);

      if (openError) {
        return { data: null, error: openError };
      }

      if (autoClosedError) {
        if (!isMissingCloseReasonColumnError(autoClosedError)) {
          return { data: null, error: autoClosedError };
        }
        return enrichRecruits(excludeDeletedRecruits(openRows || []));
      }

      const merged = [...(openRows || []), ...(autoClosedRows || [])]
        .filter((recruit) => !isDeletedRecruitDescription(recruit?.description))
        .sort((a, b) => {
          const at = new Date(a.updated_at || 0).getTime();
          const bt = new Date(b.updated_at || 0).getTime();
          return bt - at;
        });
      return enrichRecruits(merged);
    }

    query = query.eq('status', RINJI_STATUS.OPEN);
  }

  query = applyRecruitFilters(query, filters);
  const { data, error } = await query;
  if (error) {
    return { data, error };
  }
  return enrichRecruits(excludeDeletedRecruits(data || []));
};

/**
 * 募集を新規作成する。
 *
 * @param {Record<string, any>} payload
 * @returns {Promise<{ data: any, error: any }>}
 */
export const createRecruit = async (payload) => {
  const body = withOptionalDefaults(pickRecruitMutableFields(payload));
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .insert(body)
    .select()
    .single();
  return { data, error };
};

/**
 * 募集を更新する。
 *
 * @param {string} id
 * @param {Record<string, any>} payload
 * @returns {Promise<{ data: any, error: any }>}
 */
export const updateRecruit = async (id, payload) => {
  const body = withOptionalDefaults(pickRecruitMutableFields(payload));
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    return { data, error };
  }

  // 編集で募集人数を下げた場合も、定員到達なら自動クローズを適用する。
  const { error: autoCloseError } = await autoCloseRecruitWhenFull(id);
  if (autoCloseError) {
    console.warn('[item8] auto close after update skipped:', autoCloseError.message || autoCloseError);
  }

  return { data, error: null };
};

/**
 * 募集ステータスを closed に更新する。
 *
 * @param {string} id
 * @returns {Promise<{ data: any, error: any }>}
 */
export const closeRecruit = async (id) => {
  const payload = {
    status: RINJI_STATUS.CLOSED,
    close_reason: RINJI_CLOSE_REASON.MANUAL,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .update(payload)
    .eq('id', id);

  if (!error || !isMissingCloseReasonColumnError(error)) {
    return { data, error };
  }

  // close_reason 列が未反映の環境向けフォールバック
  const fallback = await supabase
    .from('rinji_help_recruits')
    .update({ status: RINJI_STATUS.CLOSED, updated_at: new Date().toISOString() })
    .eq('id', id);
  return fallback;
};

/**
 * 募集ステータスを open に戻す。
 *
 * @param {string} id
 * @returns {Promise<{ data: any, error: any }>}
 */
export const reopenRecruit = async (id) => {
  const { data: recruit, error: recruitError } = await fetchRecruitForAutoControl(id);
  if (recruitError) {
    return { data: null, error: recruitError };
  }

  const headcount = Number(recruit?.headcount);
  if (Number.isFinite(headcount) && headcount > 0) {
    const { count, error: countError } = await fetchApplicantCount(id);
    if (countError) {
      return { data: null, error: countError };
    }
    if ((count || 0) >= headcount) {
      return {
        data: null,
        error: {
          code: 'RINJI_REOPEN_BLOCKED_FULL',
          message: '応募人数が募集人数に達しているため再開できません。',
        },
      };
    }
  }

  const payload = {
    status: RINJI_STATUS.OPEN,
    close_reason: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .update(payload)
    .eq('id', id);

  if (!error || !isMissingCloseReasonColumnError(error)) {
    return { data, error };
  }

  // close_reason 列が未反映の環境向けフォールバック
  const fallback = await supabase
    .from('rinji_help_recruits')
    .update({ status: RINJI_STATUS.OPEN, updated_at: new Date().toISOString() })
    .eq('id', id);
  return fallback;
};

/**
 * 募集を論理削除する（description に削除マーカーを付与し、一覧から非表示にする）。
 *
 * @param {string} id
 * @returns {Promise<{ data: any, error: any }>}
 */
export const logicalDeleteRecruit = async (id) => {
  const { data: current, error: currentError } = await supabase
    .from('rinji_help_recruits')
    .select('id, description')
    .eq('id', id)
    .single();

  if (currentError) {
    return { data: null, error: currentError };
  }

  const payload = {
    status: RINJI_STATUS.CLOSED,
    close_reason: RINJI_CLOSE_REASON.MANUAL,
    description: appendDeletedMarker(current?.description),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('rinji_help_recruits')
    .update(payload)
    .eq('id', id);

  if (!error || !isMissingCloseReasonColumnError(error)) {
    return { data, error };
  }

  // close_reason 列が未反映の環境向けフォールバック
  const fallback = await supabase
    .from('rinji_help_recruits')
    .update({
      status: RINJI_STATUS.CLOSED,
      description: appendDeletedMarker(current?.description),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return fallback;
};

/**
 * 指定募集への応募一覧を取得する。
 *
 * @param {string} recruitId
 * @returns {Promise<{ data: any, error: any }>}
 */
export const fetchApplications = async (recruitId) => {
  const { data, error } = await supabase
    .from('rinji_help_applications')
    .select('*')
    .eq('recruit_id', recruitId)
    .order('created_at', { ascending: false });
  if (error) {
    return { data, error };
  }

  const applications = data || [];
  const userIds = [...new Set(applications.map((item) => item.applicant_user_id).filter(Boolean))];
  if (userIds.length === 0) {
    return { data: applications, error: null };
  }

  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, name, organization')
    .in('user_id', userIds);

  if (profileError) {
    // プロフィール取得に失敗しても応募情報本体は返す
    return {
      data: applications.map((item) => ({
        ...item,
        applicant_name: item.applicant_user_id,
        applicant_organization: null,
      })),
      error: null,
    };
  }

  const profileByUserId = (profiles || []).reduce((acc, row) => {
    if (!row?.user_id) return acc;
    acc[row.user_id] = {
      name: row.name || row.user_id,
      organization: row.organization || null,
    };
    return acc;
  }, {});

  return {
    data: applications.map((item) => ({
      ...item,
      applicant_name: profileByUserId[item.applicant_user_id]?.name || item.applicant_user_id,
      applicant_organization: profileByUserId[item.applicant_user_id]?.organization || null,
    })),
    error: null,
  };
};

/**
 * 募集へ応募する。
 *
 * @param {string} recruitId
 * @param {string} applicantUserId
 * @returns {Promise<{ data: any, error: any }>}
 */
export const applyRecruit = async (recruitId, applicantUserId) => {
  const { data, error } = await supabase
    .from('rinji_help_applications')
    .insert({
      recruit_id: recruitId,
      applicant_user_id: applicantUserId,
    })
    .select()
    .single();

  if (error) {
    return { data, error };
  }

  const { error: autoCloseError } = await autoCloseRecruitWhenFull(recruitId);
  if (autoCloseError) {
    // 応募登録自体は完了しているため、ここでは失敗扱いにしない。
    console.warn('[item8] auto close skipped:', autoCloseError.message || autoCloseError);
  }

  return { data, error: null };
};

/**
 * 募集への応募を取り消す。
 *
 * @param {string} recruitId
 * @param {string} applicantUserId
 * @returns {Promise<{ data: any, error: any }>}
 */
export const cancelRecruitApplication = async (recruitId, applicantUserId) => {
  const { data, error } = await supabase
    .from('rinji_help_applications')
    .delete()
    .eq('recruit_id', recruitId)
    .eq('applicant_user_id', applicantUserId)
    .select('id');

  if (error) {
    return { data, error };
  }

  if ((data || []).length > 0) {
    const { error: autoReopenError } = await autoReopenRecruitWhenBelowCapacity(recruitId);
    if (autoReopenError) {
      // 取り消し自体は成功しているため、ここでは失敗扱いにしない。
      console.warn('[item8] auto reopen skipped:', autoReopenError.message || autoReopenError);
    }
  }

  return { data, error: null };
};

/**
 * 指定ユーザーが応募済みの募集一覧を取得する。
 *
 * @param {string} applicantUserId
 * @returns {Promise<{ data: any, error: any }>}
 */
export const fetchAppliedRecruits = async (applicantUserId) => {
  if (!applicantUserId) {
    return { data: [], error: null };
  }

  const { data: applications, error: applicationsError } = await supabase
    .from('rinji_help_applications')
    .select('recruit_id, created_at')
    .eq('applicant_user_id', applicantUserId)
    .order('created_at', { ascending: false });

  if (applicationsError) {
    return { data: null, error: applicationsError };
  }

  const recruitIds = [...new Set((applications || []).map((row) => row.recruit_id).filter(Boolean))];
  if (recruitIds.length === 0) {
    return { data: [], error: null };
  }

  const orderByAppliedAt = new Map(recruitIds.map((id, index) => [id, index]));
  const { data: recruits, error } = await supabase
    .from('rinji_help_recruits')
    .select('*')
    .in('id', recruitIds);

  if (error) {
    return { data: null, error };
  }
  const { data: enrichedRecruits, error: enrichError } = await enrichRecruits(excludeDeletedRecruits(recruits || []));
  if (enrichError) {
    return { data: null, error: enrichError };
  }

  const sorted = (enrichedRecruits || []).sort((a, b) => {
    const ai = orderByAppliedAt.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderByAppliedAt.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
  return { data: sorted, error: null };
};
