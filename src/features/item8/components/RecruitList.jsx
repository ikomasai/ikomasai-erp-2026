/**
 * 臨時ヘルプ募集の一覧表示コンポーネント。
 * 募集カードの描画、管理者操作ボタン、ステータス表示を担当する。
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList, Button, Pressable } from 'react-native';
import { OPTIONAL_FIELD_DEFAULTS, RINJI_STATUS, RINJI_CLOSE_REASON } from '../constants.js';
import { useTheme } from '../../../shared/hooks/useTheme';

const TITLE_SEPARATOR = '\n\n---\n\n';
const WORK_TIME_SEPARATOR = '〜';
const IMMEDIATE_TIME_LABEL = '現在時刻';
const LEGACY_IMMEDIATE_TIME_LABEL = 'いますぐ';
const META_SEPARATOR = '\n\n::META::\n\n';
const LATE_JOIN_ALLOW = 'allow';
const LATE_JOIN_DENY = 'deny';
const STATUS_LABELS = {
  [RINJI_STATUS.OPEN]: '募集中',
  [RINJI_STATUS.CLOSED]: '受付終了',
};

/**
 * 16進カラーにアルファ値を付与する。
 *
 * @param {string} hexColor
 * @param {string} alpha
 * @returns {string}
 */
const withAlpha = (hexColor, alpha) => {
  if (typeof hexColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return `${hexColor}${alpha}`;
  }
  return hexColor;
};

/**
 * カラーを明るくする。
 *
 * @param {string} hexColor
 * @param {number} ratio
 * @returns {string}
 */
const brightenHex = (hexColor, ratio = 0.08) => {
  if (typeof hexColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return hexColor;
  }
  const value = hexColor.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const lift = (v) => Math.min(255, Math.round(v + (255 - v) * ratio));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(lift(r))}${toHex(lift(g))}${toHex(lift(b))}`;
};

/**
 * テーマモードごとのカード背景色を決定する。
 *
 * @param {{surface: string}} theme
 * @param {string} themeMode
 * @returns {string}
 */
const getCardBackgroundColor = (theme, themeMode) => {
  if (themeMode === 'light') {
    // light は元の surface をそのまま使う（デフォルト色）
    return theme.surface;
  }
  if (themeMode === 'joshi') {
    // joshi は少し白っぽさを強める
    return brightenHex(theme.surface, 0.22);
  }
  return brightenHex(theme.surface, 0.08);
};

/**
 * 作業時間文字列から開始時刻を推定する。
 *
 * @param {string | null | undefined} workTime
 * @returns {string | null}
 */
const inferStartTime = (workTime) => {
  if (!workTime || typeof workTime !== 'string') return null;
  if (
    workTime === IMMEDIATE_TIME_LABEL ||
    workTime.startsWith(`${IMMEDIATE_TIME_LABEL}${WORK_TIME_SEPARATOR}`) ||
    workTime === LEGACY_IMMEDIATE_TIME_LABEL ||
    workTime.startsWith(`${LEGACY_IMMEDIATE_TIME_LABEL}${WORK_TIME_SEPARATOR}`)
  ) {
    return IMMEDIATE_TIME_LABEL;
  }
  const start = workTime.split(WORK_TIME_SEPARATOR)[0]?.trim();
  if (!start) return null;
  return /^\d{2}:\d{2}$/.test(start) ? start : null;
};

/**
 * DB の任意項目を画面表示用に補完する。
 *
 * @param {Record<string, any>} recruit
 * @returns {{meet_place: string, meet_time: string | null, belongings: string}}
 */
const formatOptional = (recruit) => ({
  meet_place: recruit.meet_place || OPTIONAL_FIELD_DEFAULTS.meet_place(recruit.location),
  meet_time: recruit.meet_time || inferStartTime(recruit.work_time) || null,
  belongings: recruit.belongings || OPTIONAL_FIELD_DEFAULTS.belongings,
});

/**
 * description 文字列からタイトル・本文・途中参加可否メタデータを分解する。
 *
 * @param {string | null | undefined} raw
 * @returns {{title: string, body: string, lateJoin: string | null}}
 */
const parseTitleAndDescription = (raw) => {
  if (!raw || typeof raw !== 'string') return { title: '募集', body: '', lateJoin: null };
  const metaIdx = raw.indexOf(META_SEPARATOR);
  const plain = metaIdx === -1 ? raw : raw.slice(0, metaIdx);
  const metaRaw = metaIdx === -1 ? '' : raw.slice(metaIdx + META_SEPARATOR.length).trim();
  const idx = plain.indexOf(TITLE_SEPARATOR);
  const lateJoin = metaRaw === LATE_JOIN_ALLOW || metaRaw === LATE_JOIN_DENY ? metaRaw : null;
  if (idx === -1) {
    return { title: '募集', body: plain, lateJoin };
  }
  return {
    title: plain.slice(0, idx) || '募集',
    body: plain.slice(idx + TITLE_SEPARATOR.length),
    lateJoin,
  };
};

/**
 * 内部ステータス値を表示用ラベルへ変換する。
 *
 * @param {string} status
 * @returns {string}
 */
const getStatusLabel = (status) => STATUS_LABELS[status] || status;

/**
 * 募集人数表示を「応募数 / 募集人数」の形式に整える。
 *
 * @param {Record<string, any>} recruit
 * @returns {string}
 */
const formatHeadcountValue = (recruit) => {
  const required = recruit?.headcount ?? '—';
  const applicants = Number.isFinite(Number(recruit?.applicant_count))
    ? Number(recruit.applicant_count)
    : 0;
  return `${applicants} / ${required}`;
};

/**
 * 応募日時を「YYYY/MM/DD HH:mm」形式へ変換する。
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
const formatAppliedAt = (value) => {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}`;
};

/**
 * 作成日時を「YYYY-MM-DD HH:mm」形式へ変換する。
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
const formatCreatedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

/**
 * 募集カード内の情報行を描画する。
 *
 * @param {{
 *   items: Array<{label: string, value: any}>,
 *   size?: 'half' | 'third',
 *   theme: Record<string, any>
 * }} props
 * @returns {JSX.Element}
 */
const InfoRow = ({ items, size = 'half', theme }) => (
  <View style={styles.row}>
    {items.map((item) => (
      <View
        key={item.label}
        style={[
          size === 'third' ? styles.third : styles.half,
          styles.infoBox,
          {
            borderColor: theme.border,
            backgroundColor: theme.background,
            borderRadius: theme.borderRadius,
          },
        ]}
      >
        <Text style={[styles.label, { color: theme.textSecondary }]}>{item.label}</Text>
        <Text style={[styles.value, { color: theme.text }]}>{item.value || '—'}</Text>
      </View>
    ))}
  </View>
);

/**
 * 募集1件分のカード UI。
 *
 * @param {Record<string, any>} props
 * @returns {JSX.Element}
 */
const RecruitCard = ({
  recruit,
  isManager,
  onApply,
  onCancelApply,
  onEdit,
  onClose,
  onDelete,
  onReopen,
  onFinalizeAutoClose,
  onToggleApplicants,
  theme,
  showStatus = false,
  themeMode,
  showApplyButton = true,
  showCancelButton = false,
  isAlreadyApplied = false,
  applications = [],
  isApplicantsOpen = false,
  applicantsLoading = false,
  showApplicantsToggle = false,
  showAutoClosedBadge = false,
  currentUserId = null,
}) => {
  const optional = formatOptional(recruit);
  const text = parseTitleAndDescription(recruit.description);
  const shouldShowActions = isManager || showApplyButton || showCancelButton;
  const shouldShowApplicants = isManager && showApplicantsToggle && isApplicantsOpen;
  const isAutoClosedByCapacity =
    recruit.status === RINJI_STATUS.CLOSED && recruit.close_reason === RINJI_CLOSE_REASON.AUTO_FULL;
  const isAutoClosedByDate =
    recruit.status === RINJI_STATUS.CLOSED &&
    recruit.close_reason === RINJI_CLOSE_REASON.AUTO_DATE_PASSED;
  const canManageRecruit = Boolean(currentUserId) && recruit.head_user_id === currentUserId;
  const canDelete = Boolean(onDelete) && canManageRecruit;
  const createdDate = formatCreatedDate(recruit.created_at);

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme.border,
          backgroundColor: getCardBackgroundColor(theme, themeMode),
          borderRadius: theme.borderRadius,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text, fontWeight: theme.fontWeight }]}>{text.title}</Text>
        {text.lateJoin === LATE_JOIN_ALLOW ? (
          <View
            style={[
              styles.lateJoinBadge,
              {
                backgroundColor: withAlpha(theme.success, '22'),
                borderColor: theme.success,
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <Text style={[styles.lateJoinBadgeText, { color: theme.success }]}>途中参加可</Text>
          </View>
        ) : null}
        {recruit.head_organization ? (
          <View
            style={[
              styles.organizationBadge,
              {
                backgroundColor: '#FFFFFF',
                borderColor: withAlpha(theme.text, '33'),
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <Text style={[styles.organizationBadgeText, { color: '#1F2937' }]}>{recruit.head_organization}</Text>
          </View>
        ) : null}
        {text.lateJoin === LATE_JOIN_DENY ? (
          <View
            style={[
              styles.lateJoinBadgeDeny,
              {
                backgroundColor: withAlpha(theme.primary, '22'),
                borderColor: theme.primary,
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <Text style={[styles.lateJoinBadgeDenyText, { color: theme.primary }]}>途中参加不可</Text>
          </View>
        ) : null}
        {showAutoClosedBadge && isAutoClosedByCapacity ? (
          <View
            style={[
              styles.autoCloseBadge,
              {
                backgroundColor: withAlpha(theme.error, '22'),
                borderColor: theme.error,
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <Text style={[styles.autoCloseBadgeText, { color: theme.error }]}>募集人数到達済み</Text>
          </View>
        ) : null}
        {showAutoClosedBadge && isAutoClosedByDate ? (
          <View
            style={[
              styles.autoDateBadge,
              {
                backgroundColor: withAlpha(theme.primary, '22'),
                borderColor: theme.primary,
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <Text style={[styles.autoDateBadgeText, { color: theme.primary }]}>募集日経過</Text>
          </View>
        ) : null}
      </View>

      {/* 行1: 募集人数 / 場所 / 集合場所 */}
      <InfoRow
        size="third"
        theme={theme}
        items={[
          { label: '募集人数', value: formatHeadcountValue(recruit) },
          { label: '場所', value: recruit.location },
          { label: '集合場所', value: optional.meet_place },
        ]}
      />

      {/* 行2: 募集日 / 募集時間帯 / 集合時間 */}
      <InfoRow
        size="third"
        theme={theme}
        items={[
          { label: '募集日', value: recruit.work_date },
          { label: '募集時間帯', value: recruit.work_time },
          { label: '集合時間', value: optional.meet_time || '—' },
        ]}
      />

      {/* 報酬 + 持ち物 */}
      <InfoRow
        theme={theme}
        items={[
          { label: '報酬', value: recruit.reward },
          { label: '持ち物', value: optional.belongings },
        ]}
      />

      {/* 業務内容 */}
      <View style={styles.rowColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>業務内容</Text>
        <Text style={[styles.value, { color: theme.text }]}>{text.body || '—'}</Text>
      </View>

      {showStatus ? (
        <Text style={[styles.status, { color: theme.textSecondary }]}>
          ステータス: {getStatusLabel(recruit.status)}
        </Text>
      ) : null}

      {shouldShowActions ? (
        <View style={styles.actions}>
          {isManager ? (
            <>
              {canManageRecruit ? (
                <Button title="編集" color={theme.primary} onPress={() => onEdit?.(recruit)} />
              ) : null}
              {canManageRecruit ? (
                recruit.status === RINJI_STATUS.OPEN ? (
                  <Button title="終了" color={theme.error} onPress={() => onClose?.(recruit.id)} />
                ) : isAutoClosedByCapacity && onFinalizeAutoClose ? (
                  <Button title="募集を終了" color={theme.error} onPress={() => onFinalizeAutoClose?.(recruit.id)} />
                ) : (
                  <Button title="再開" color={theme.success} onPress={() => onReopen?.(recruit.id)} />
                )
              ) : null}
              {showApplicantsToggle ? (
                <Button
                  title={isApplicantsOpen ? '応募者一覧を閉じる' : '応募者一覧を開く'}
                  color={theme.textSecondary}
                  onPress={() => onToggleApplicants?.(recruit.id)}
                />
              ) : null}
              {canDelete ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteInline,
                    {
                      borderColor: theme.error,
                      backgroundColor: pressed ? withAlpha(theme.error, '1A') : 'transparent',
                      borderRadius: theme.borderRadius,
                    },
                  ]}
                  onPress={() => onDelete?.(recruit)}
                  hitSlop={8}
                >
                  <Text style={[styles.deleteInlineText, { color: theme.error }]}>削除</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              {showApplyButton ? (
                <Button
                  title={isAlreadyApplied ? '応募済み' : '応募する'}
                  color={theme.primary}
                  onPress={() => onApply?.(recruit.id)}
                  disabled={recruit.status !== RINJI_STATUS.OPEN || isAlreadyApplied}
                />
              ) : null}
              {showCancelButton ? (
                <Button
                  title="応募取り消し"
                  color={theme.error}
                  onPress={() => onCancelApply?.(recruit.id)}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {shouldShowApplicants ? (
        <View
          style={[
            styles.applicantsBox,
            {
              borderColor: theme.border,
              backgroundColor: theme.background,
              borderRadius: theme.borderRadius,
            },
          ]}
        >
          <Text style={[styles.applicantsTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>
            応募者一覧
          </Text>
          {applicantsLoading ? (
            <Text style={[styles.applicantsRow, { color: theme.textSecondary }]}>読み込み中...</Text>
          ) : null}
          {!applicantsLoading && applications.length === 0 ? (
            <Text style={[styles.applicantsRow, { color: theme.textSecondary }]}>応募者がいません</Text>
          ) : null}
          {!applicantsLoading &&
            applications.map((application) => (
              <Text
                key={application.id || `${recruit.id}-${application.applicant_user_id}`}
                style={[styles.applicantsRow, { color: theme.text }]}
              >
                ・{application.applicant_organization || '所属不明'}　{application.applicant_name || application.applicant_user_id || '不明なユーザー'}　{formatAppliedAt(application.created_at)}
              </Text>
            ))}
        </View>
      ) : null}
      {createdDate ? (
        <Text style={[styles.createdAt, { color: theme.textSecondary }]}>{createdDate}</Text>
      ) : null}
    </View>
  );
};

/**
 * 募集一覧を表示する。
 *
 * @param {Record<string, any>} props
 * @returns {JSX.Element}
 */
export const RecruitList = ({
  data,
  isManager = false,
  onApply,
  onCancelApply,
  onEdit,
  onClose,
  onDelete,
  onReopen,
  onFinalizeAutoClose,
  onToggleApplicants,
  refreshing = false,
  onRefresh,
  emptyText = '募集がありません',
  showStatus = false,
  showApplyButton = true,
  showCancelButton = false,
  appliedRecruitIds = [],
  applicationsByRecruitId = {},
  openApplicantsByRecruitId = {},
  loadingApplicantsByRecruitId = {},
  showApplicantsToggle = false,
  showAutoClosedBadge = false,
  currentUserId = null,
}) => {
  const { theme, themeMode } = useTheme();

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={<Text style={[styles.empty, { color: theme.textSecondary }]}>{emptyText}</Text>}
      renderItem={({ item }) => (
        <RecruitCard
          recruit={item}
          isManager={isManager}
          onApply={onApply}
          onCancelApply={onCancelApply}
          onEdit={onEdit}
          onClose={onClose}
          onDelete={onDelete}
          onReopen={onReopen}
          onFinalizeAutoClose={onFinalizeAutoClose}
          onToggleApplicants={onToggleApplicants}
          theme={theme}
          showStatus={showStatus}
          themeMode={themeMode}
          showApplyButton={showApplyButton}
          showCancelButton={showCancelButton}
          isAlreadyApplied={appliedRecruitIds.includes(item.id)}
          applications={applicationsByRecruitId[item.id] || []}
          isApplicantsOpen={Boolean(openApplicantsByRecruitId[item.id])}
          applicantsLoading={Boolean(loadingApplicantsByRecruitId[item.id])}
          showApplicantsToggle={showApplicantsToggle}
          showAutoClosedBadge={showAutoClosedBadge}
          currentUserId={currentUserId}
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  title: {
    fontSize: 16,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  lateJoinBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lateJoinBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lateJoinBadgeDeny: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lateJoinBadgeDenyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  autoCloseBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  autoCloseBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  autoDateBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  autoDateBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  organizationBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  organizationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowColumn: {
    gap: 4,
  },
  half: {
    flex: 1,
  },
  third: {
    flex: 1,
  },
  status: {
    marginTop: 4,
    fontSize: 12,
  },
  infoBox: {
    borderWidth: 1,
    padding: 8,
  },
  actions: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteInline: {
    marginLeft: 'auto',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteInlineText: {
    fontSize: 14,
    fontWeight: '700',
  },
  applicantsBox: {
    marginTop: 8,
    borderWidth: 1,
    padding: 8,
    gap: 4,
  },
  applicantsTitle: {
    fontSize: 13,
  },
  applicantsRow: {
    fontSize: 13,
    lineHeight: 18,
  },
  createdAt: {
    marginTop: 6,
    fontSize: 12,
    alignSelf: 'flex-end',
  },
  empty: {
    textAlign: 'center',
    padding: 20,
  },
});

export default RecruitList;
