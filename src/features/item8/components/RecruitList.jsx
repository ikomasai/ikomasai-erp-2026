/**
 * 臨時ヘルプ募集の一覧表示コンポーネント。
 * 一覧では要約情報のみを表示し、タップで詳細モーダルを開く。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { OPTIONAL_FIELD_DEFAULTS, RINJI_STATUS, RINJI_CLOSE_REASON } from '../constants.js';
import { useTheme } from '../../../shared/hooks/useTheme';

const TITLE_SEPARATOR = '\n\n---\n\n';
const WORK_TIME_SEPARATOR = '〜';
const IMMEDIATE_TIME_LABEL = '現在時刻';
const LEGACY_IMMEDIATE_TIME_LABEL = 'いますぐ';
const META_SEPARATOR = '\n\n::META::\n\n';
const LATE_JOIN_ALLOW = 'allow';
const LATE_JOIN_DENY = 'deny';
const MOBILE_BREAKPOINT = 768;
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
  if (themeMode === 'light') return theme.surface;
  if (themeMode === 'joshi') return brightenHex(theme.surface, 0.22);
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
 * 途中参加可否を表示文字へ変換する。
 *
 * @param {string | null} value
 * @returns {string}
 */
const formatLateJoinLabel = (value) => {
  if (value === LATE_JOIN_ALLOW) return '可';
  if (value === LATE_JOIN_DENY) return '不可';
  return '未設定';
};

/**
 * ボタンの配色を返す。
 *
 * @param {'primary' | 'danger' | 'success' | 'neutral'} tone
 * @param {Record<string, any>} theme
 * @returns {{color: string, background: string, border: string, text: string}}
 */
const getActionTone = (tone, theme) => {
  if (tone === 'danger') {
    return {
      color: theme.error,
      background: withAlpha(theme.error, '16'),
      border: withAlpha(theme.error, '55'),
      text: theme.error,
    };
  }
  if (tone === 'success') {
    return {
      color: theme.success,
      background: withAlpha(theme.success, '16'),
      border: withAlpha(theme.success, '55'),
      text: theme.success,
    };
  }
  if (tone === 'neutral') {
    return {
      color: theme.textSecondary,
      background: withAlpha(theme.textSecondary, '12'),
      border: withAlpha(theme.textSecondary, '55'),
      text: theme.textSecondary,
    };
  }
  return {
    color: theme.primary,
    background: withAlpha(theme.primary, '18'),
    border: withAlpha(theme.primary, '55'),
    text: theme.primary,
  };
};

/**
 * 単一アクションボタンを描画する。
 *
 * @param {{
 *   label: string,
 *   onPress: () => void,
 *   tone?: 'primary' | 'danger' | 'success' | 'neutral',
 *   disabled?: boolean,
 *   isMobile: boolean,
 *   theme: Record<string, any>
 * }} props
 * @returns {JSX.Element}
 */
const ActionButton = ({ label, onPress, tone = 'primary', disabled = false, isMobile, theme }) => {
  const toneStyle = getActionTone(tone, theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        isMobile ? styles.mobileActionButton : styles.desktopActionButton,
        {
          borderColor: toneStyle.border,
          backgroundColor: pressed ? withAlpha(toneStyle.color, '26') : toneStyle.background,
          opacity: disabled ? 0.45 : 1,
          borderRadius: isMobile ? 8 : 999,
        },
      ]}
    >
      <Text style={[isMobile ? styles.mobileActionButtonText : styles.desktopActionButtonText, { color: toneStyle.text }]}>
        {label}
      </Text>
    </Pressable>
  );
};

/**
 * 一覧要約カード。
 *
 * @param {{
 *   recruit: Record<string, any>,
 *   theme: Record<string, any>,
 *   themeMode: string,
 *   onPress: () => void
 * }} props
 * @returns {JSX.Element}
 */
const RecruitSummaryCard = ({
  recruit,
  theme,
  themeMode,
  onPress,
}) => {
  const text = parseTitleAndDescription(recruit.description);
  const organization = `${recruit?.head_organization || ''}`.trim();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="タップすると募集の詳細を表示します"
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.border,
          backgroundColor: pressed
            ? withAlpha(theme.primary, '12')
            : getCardBackgroundColor(theme, themeMode),
          borderRadius: theme.borderRadius,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text, fontWeight: theme.fontWeight }]} numberOfLines={2}>
          {text.title}
        </Text>
        {organization ? (
          <View
            style={[
              styles.organizationBadge,
              {
                backgroundColor: withAlpha(theme.primary, '12'),
                borderColor: withAlpha(theme.primary, '44'),
              },
            ]}
          >
            <Text style={[styles.organizationBadgeText, { color: theme.primary }]} numberOfLines={1}>
              {organization}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.summaryLines}>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          <Text style={styles.summaryLabel}>場所: </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{recruit.location || '—'}</Text>
        </Text>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          <Text style={styles.summaryLabel}>募集人数: </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{formatHeadcountValue(recruit)}</Text>
        </Text>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          <Text style={styles.summaryLabel}>募集日: </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{recruit.work_date || '—'}</Text>
        </Text>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          <Text style={styles.summaryLabel}>募集時間帯: </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{recruit.work_time || '—'}</Text>
        </Text>
      </View>
      <View style={styles.summaryFooter}>
        <Text style={[styles.summaryHintText, { color: theme.textSecondary }]}>タップで詳細を見る</Text>
        <Text style={[styles.summaryHintArrow, { color: theme.textSecondary }]}>›</Text>
      </View>
    </Pressable>
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
  showAutoClosedBadge: _showAutoClosedBadge = false,
  currentUserId = null,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const { theme, themeMode } = useTheme();
  const [selectedRecruitId, setSelectedRecruitId] = useState(null);

  const selectedRecruit = useMemo(
    () => (data || []).find((item) => item?.id === selectedRecruitId) || null,
    [data, selectedRecruitId]
  );

  useEffect(() => {
    if (selectedRecruitId && !selectedRecruit) {
      setSelectedRecruitId(null);
    }
  }, [selectedRecruit, selectedRecruitId]);

  const detailText = useMemo(
    () => parseTitleAndDescription(selectedRecruit?.description),
    [selectedRecruit?.description]
  );
  const detailOptional = useMemo(
    () => formatOptional(selectedRecruit || {}),
    [selectedRecruit]
  );
  const selectedRecruitOrganization = `${selectedRecruit?.head_organization || ''}`.trim();

  const canManageSelectedRecruit = Boolean(currentUserId) && selectedRecruit?.head_user_id === currentUserId;
  const isSelectedAlreadyApplied = selectedRecruit ? appliedRecruitIds.includes(selectedRecruit.id) : false;
  const selectedApplications = selectedRecruit ? applicationsByRecruitId[selectedRecruit.id] || [] : [];
  const isSelectedApplicantsOpen = selectedRecruit ? Boolean(openApplicantsByRecruitId[selectedRecruit.id]) : false;
  const selectedApplicantsLoading = selectedRecruit
    ? Boolean(loadingApplicantsByRecruitId[selectedRecruit.id])
    : false;

  const handleCloseDetail = () => setSelectedRecruitId(null);

  const handleEdit = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onEdit?.(selectedRecruit);
  };

  const handleCloseRecruit = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onClose?.(selectedRecruit.id);
  };

  const handleFinalizeAutoClose = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onFinalizeAutoClose?.(selectedRecruit.id);
  };

  const handleReopen = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onReopen?.(selectedRecruit.id);
  };

  const handleDelete = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onDelete?.(selectedRecruit);
  };

  const handleApply = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onApply?.(selectedRecruit.id);
  };

  const handleCancelApply = () => {
    if (!selectedRecruit) return;
    handleCloseDetail();
    onCancelApply?.(selectedRecruit.id);
  };

  const handleToggleApplicants = () => {
    if (!selectedRecruit) return;
    onToggleApplicants?.(selectedRecruit.id);
  };

  return (
    <>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textSecondary }]}>{emptyText}</Text>}
        renderItem={({ item }) => (
          <RecruitSummaryCard
            recruit={item}
            theme={theme}
            themeMode={themeMode}
            onPress={() => setSelectedRecruitId(item.id)}
          />
        )}
      />

      <Modal
        visible={Boolean(selectedRecruit)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDetail}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderRadius: theme.borderRadius,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <Text style={[styles.modalTitle, { color: theme.text, fontWeight: theme.fontWeight }]} numberOfLines={2}>
                  {detailText.title}
                </Text>
              </View>
              {selectedRecruitOrganization ? (
                <View
                  style={[
                    styles.organizationBadge,
                    styles.modalOrganizationBadge,
                    {
                      backgroundColor: withAlpha(theme.primary, '12'),
                      borderColor: withAlpha(theme.primary, '44'),
                    },
                  ]}
                >
                  <Text style={[styles.organizationBadgeText, { color: theme.primary }]} numberOfLines={1}>
                    {selectedRecruitOrganization}
                  </Text>
                </View>
              ) : null}
              <Pressable onPress={handleCloseDetail} style={styles.modalCloseButton}>
                <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>閉じる</Text>
              </Pressable>
            </View>

            {selectedRecruit ? (
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>場所: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{selectedRecruit.location || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>募集人数: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{formatHeadcountValue(selectedRecruit)}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>募集日: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{selectedRecruit.work_date || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>募集時間帯: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{selectedRecruit.work_time || '—'}</Text>
                  </Text>
                </View>

                <View style={styles.detailDivider} />

                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>集合場所: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{detailOptional.meet_place || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>集合時間: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{detailOptional.meet_time || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>報酬: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{selectedRecruit.reward || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>持ち物: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{detailOptional.belongings || '—'}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                    <Text style={styles.detailInlineLabel}>途中参加可否: </Text>
                    <Text style={[styles.detailInlineValue, { color: theme.text }]}>{formatLateJoinLabel(detailText.lateJoin)}</Text>
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>業務内容</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{detailText.body || '—'}</Text>
                </View>

                {showStatus ? (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                      <Text style={styles.detailInlineLabel}>ステータス: </Text>
                      <Text style={[styles.detailInlineValue, { color: theme.text }]}>{getStatusLabel(selectedRecruit.status)}</Text>
                    </Text>
                  </View>
                ) : null}

                {formatCreatedDate(selectedRecruit.created_at) ? (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailInlineText, { color: theme.textSecondary }]}>
                      <Text style={styles.detailInlineLabel}>作成日時: </Text>
                      <Text style={[styles.detailInlineValue, { color: theme.text }]}>{formatCreatedDate(selectedRecruit.created_at)}</Text>
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailDivider} />

                <View style={styles.actions}>
                  {isManager ? (
                    <>
                      {canManageSelectedRecruit ? (
                        <ActionButton label="編集" tone="primary" onPress={handleEdit} isMobile={isMobile} theme={theme} />
                      ) : null}

                      {canManageSelectedRecruit ? (
                        selectedRecruit.status === RINJI_STATUS.OPEN ? (
                          <ActionButton label="終了" tone="danger" onPress={handleCloseRecruit} isMobile={isMobile} theme={theme} />
                        ) : selectedRecruit.close_reason === RINJI_CLOSE_REASON.AUTO_FULL && onFinalizeAutoClose ? (
                          <ActionButton label="募集を終了" tone="danger" onPress={handleFinalizeAutoClose} isMobile={isMobile} theme={theme} />
                        ) : (
                          <ActionButton label="再開" tone="success" onPress={handleReopen} isMobile={isMobile} theme={theme} />
                        )
                      ) : null}

                      {showApplicantsToggle ? (
                        <ActionButton
                          label={isSelectedApplicantsOpen ? '応募者一覧を閉じる' : '応募者一覧を開く'}
                          tone="neutral"
                          onPress={handleToggleApplicants}
                          isMobile={isMobile}
                          theme={theme}
                        />
                      ) : null}

                      {canManageSelectedRecruit ? (
                        <ActionButton label="削除" tone="danger" onPress={handleDelete} isMobile={isMobile} theme={theme} />
                      ) : null}
                    </>
                  ) : (
                    <>
                      {showApplyButton ? (
                        <ActionButton
                          label={isSelectedAlreadyApplied ? '応募済み' : '応募する'}
                          tone="primary"
                          disabled={selectedRecruit.status !== RINJI_STATUS.OPEN || isSelectedAlreadyApplied}
                          onPress={handleApply}
                          isMobile={isMobile}
                          theme={theme}
                        />
                      ) : null}

                      {showCancelButton ? (
                        <ActionButton
                          label="応募取り消し"
                          tone="danger"
                          onPress={handleCancelApply}
                          isMobile={isMobile}
                          theme={theme}
                        />
                      ) : null}
                    </>
                  )}
                </View>

                {isManager && showApplicantsToggle && isSelectedApplicantsOpen ? (
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
                    <Text style={[styles.applicantsTitle, { color: theme.text, fontWeight: theme.fontWeight }]}>応募者一覧</Text>
                    {selectedApplicantsLoading ? (
                      <Text style={[styles.applicantsRow, { color: theme.textSecondary }]}>読み込み中...</Text>
                    ) : null}
                    {!selectedApplicantsLoading && selectedApplications.length === 0 ? (
                      <Text style={[styles.applicantsRow, { color: theme.textSecondary }]}>応募者がいません</Text>
                    ) : null}
                    {!selectedApplicantsLoading &&
                      selectedApplications.map((application) => (
                        <Text
                          key={application.id || `${selectedRecruit.id}-${application.applicant_user_id}`}
                          style={[styles.applicantsRow, { color: theme.text }]}
                        >
                          ・{application.applicant_organization || '所属不明'}　{application.applicant_name || application.applicant_user_id || '不明なユーザー'}　{formatAppliedAt(application.created_at)}
                        </Text>
                      ))}
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  organizationBadge: {
    maxWidth: '42%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  organizationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryLines: {
    gap: 3,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryLabel: {
    fontWeight: '400',
  },
  summaryValue: {
    fontWeight: '600',
  },
  summaryFooter: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  summaryHintText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryHintArrow: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '88%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.12)',
    gap: 8,
  },
  modalHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 17,
  },
  modalOrganizationBadge: {
    maxWidth: '34%',
  },
  modalCloseButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexShrink: 0,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: 14,
    gap: 8,
  },
  detailSection: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailInlineText: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailInlineLabel: {
    fontWeight: '400',
  },
  detailInlineValue: {
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  detailDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginVertical: 2,
  },
  actions: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  desktopActionButton: {
    minWidth: 96,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopActionButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mobileActionButton: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileActionButtonText: {
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
  empty: {
    textAlign: 'center',
    padding: 20,
  },
});

export default RecruitList;
