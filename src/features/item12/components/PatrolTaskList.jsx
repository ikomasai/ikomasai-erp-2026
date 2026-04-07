/**
 * 巡回タスク一覧コンポーネント
 * タスクを種別（task_type）ごとにグループ化して表示する
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  getEvaluationPatrolTaskItemName,
  getPatrolTaskDisplayType,
  PATROL_TASK_DISPLAY_TYPES,
  PATROL_TASK_STATUSES,
  PATROL_TASK_TYPES,
} from '../../../services/supabase/patrolTaskService';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';
/** 表示専用の評価タスクラベル */
const EVALUATION_TASK_LABEL = '企画評価';
/** 表示専用の評価タスクアイコン */
const EVALUATION_TASK_ICON = '◎';
/** 表示専用の評価タスク強調色 */
const EVALUATION_TASK_ACCENT_COLOR = '#1A7F37';
/** 表示専用の評価タスク背景色 */
const EVALUATION_TASK_BG_COLOR = '#EAF8ED';
/** 表示順制御用の種別配列 */
const DISPLAY_TASK_TYPE_ORDER = [
  PATROL_TASK_TYPES.EMERGENCY_SUPPORT,
  PATROL_TASK_TYPES.CONFIRM_START,
  PATROL_TASK_TYPES.CONFIRM_END,
  PATROL_TASK_DISPLAY_TYPES.EVALUATION,
  PATROL_TASK_TYPES.LOCK_CHECK,
  PATROL_TASK_TYPES.ROUTINE_PATROL,
  PATROL_TASK_TYPES.OTHER,
];

/** タスク状態表示名 */
const TASK_STATUS_LABELS = {
  [PATROL_TASK_STATUSES.OPEN]: '未対応',
  [PATROL_TASK_STATUSES.ACCEPTED]: '受諾',
  [PATROL_TASK_STATUSES.EN_ROUTE]: '移動中',
  [PATROL_TASK_STATUSES.DONE]: '完了',
  [PATROL_TASK_STATUSES.CANCELED]: '取消',
};

/** タスク種別表示名 */
const TASK_TYPE_LABELS = {
  [PATROL_TASK_TYPES.CONFIRM_START]: '企画開始確認',
  [PATROL_TASK_TYPES.CONFIRM_END]: '企画終了確認',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '施錠確認',
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '緊急対応',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '定常巡回',
  [PATROL_TASK_TYPES.OTHER]: 'その他',
};

/** タスク種別表示アイコン */
const TASK_TYPE_ICONS = {
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '🚨',
  [PATROL_TASK_TYPES.CONFIRM_START]: '▶️',
  [PATROL_TASK_TYPES.CONFIRM_END]: '⏹️',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '🔒',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '🚶',
  [PATROL_TASK_TYPES.OTHER]: '📋',
};

/**
 * タスク種別ごとの左アクセントボーダー色
 * Material 3 風のカラーリング
 */
const TASK_TYPE_ACCENT_COLORS = {
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '#D1242F',
  [PATROL_TASK_TYPES.CONFIRM_START]: '#0969DA',
  [PATROL_TASK_TYPES.CONFIRM_END]: '#0969DA',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '#BF6A02',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '#57606A',
  [PATROL_TASK_TYPES.OTHER]: '#57606A',
};

/**
 * タスク種別ごとのセクションヘッダー背景色（薄色）
 */
const TASK_TYPE_BG_COLORS = {
  [PATROL_TASK_TYPES.EMERGENCY_SUPPORT]: '#FEF2F2',
  [PATROL_TASK_TYPES.CONFIRM_START]: '#EFF6FF',
  [PATROL_TASK_TYPES.CONFIRM_END]: '#EFF6FF',
  [PATROL_TASK_TYPES.LOCK_CHECK]: '#FFFBEA',
  [PATROL_TASK_TYPES.ROUTINE_PATROL]: '#F6F8FA',
  [PATROL_TASK_TYPES.OTHER]: '#F6F8FA',
};

/**
 * 種別の表示優先順（上にあるほど優先度高）
 * 緊急対応を最上位にし、定常巡回・その他を末尾に配置
 */
const TASK_TYPE_ORDER = [
  PATROL_TASK_TYPES.EMERGENCY_SUPPORT,
  PATROL_TASK_TYPES.CONFIRM_START,
  PATROL_TASK_TYPES.CONFIRM_END,
  PATROL_TASK_TYPES.LOCK_CHECK,
  PATROL_TASK_TYPES.ROUTINE_PATROL,
  PATROL_TASK_TYPES.OTHER,
];

/**
 * 入力値を検索しやすい形へ正規化する
 * @param {string|null|undefined} value - 入力値
 * @returns {string} 正規化済み文字列
 */
const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * 巡回タスク一覧コンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.theme - テーマオブジェクト
 * @param {Object|null} props.user - ログインユーザー情報
 * @param {Array} props.tasks - タスク一覧
 * @param {boolean} props.isLoadingTasks - タスク読み込み中フラグ
 * @param {string|null} props.selectedTaskId - 選択中タスクID
 * @param {Function} props.onSelectTask - タスク選択時コールバック
 * @param {Function} props.onRefresh - 更新ボタン押下時コールバック
 * @returns {JSX.Element} 巡回タスク一覧UI
 */
const PatrolTaskList = ({
  theme,
  user,
  tasks,
  isLoadingTasks,
  selectedTaskId,
  onSelectTask,
  onRefresh,
  title = '巡回タスク一覧',
  searchPlaceholder = '企画名・場所・種別・鍵名で検索',
  emptyTitle = '巡回タスクはありません',
  emptyDescription = '現在対応が必要なタスクはありません',
}) => {
  /** 画面幅（レスポンシブ対応用） */
  const { width: windowWidth } = useWindowDimensions();
  /** スマホ幅かどうか（768px 未満） */
  const isMobile = windowWidth < 768;
  /** 一覧検索キーワード */
  const [searchText, setSearchText] = useState('');
  /** 種別ごとの折りたたみ状態 */
  const [collapsedGroupMap, setCollapsedGroupMap] = useState({});

  /**
   * タスクを task_type ごとにグループ化し、優先順で並べた配列を生成
   * 優先順に定義されていない種別は末尾に追加される
   */
  const groupedTasks = useMemo(() => {
    /** task_type → タスク配列 のマップを構築 */
    const typeMap = new Map();
    tasks.forEach((task) => {
      const type = getPatrolTaskDisplayType(task);
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type).push(task);
    });

    /** 定義順でフィルタリングし、存在する種別のみ出力 */
    const orderedGroups = DISPLAY_TASK_TYPE_ORDER
      .filter((type) => typeMap.has(type))
      .map((type) => ({ type, tasks: typeMap.get(type) }));

    /** 定義外の種別が存在する場合は末尾に追加 */
    typeMap.forEach((groupTasks, type) => {
      if (!DISPLAY_TASK_TYPE_ORDER.includes(type)) {
        orderedGroups.push({ type, tasks: groupTasks });
      }
    });

    return orderedGroups;
  }, [tasks]);

  /**
   * タスク種別の増減に追従して折りたたみ状態を補正する
   * 既存の開閉状態は維持しつつ、新しい種別は展開状態で追加する
   */
  useEffect(() => {
    setCollapsedGroupMap((previousMap) => {
      const nextMap = { ...previousMap };

      groupedTasks.forEach(({ type }) => {
        if (typeof nextMap[type] !== 'boolean') {
          nextMap[type] = false;
        }
      });

      Object.keys(nextMap).forEach((type) => {
        if (!groupedTasks.some((group) => group.type === type)) {
          delete nextMap[type];
        }
      });

      return nextMap;
    });
  }, [groupedTasks]);

  /** 検索キーワード */
  const normalizedSearchKeyword = useMemo(() => {
    return normalizeText(searchText);
  }, [searchText]);

  /**
   * 検索を反映したタスクグループ
   * 企画名・場所・種別・鍵名・評価項目・メモで部分一致させる
   */
  const filteredGroupedTasks = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return groupedTasks;
    }

    return groupedTasks
      .map((group) => {
        const groupLabel =
          group.type === PATROL_TASK_DISPLAY_TYPES.EVALUATION
            ? EVALUATION_TASK_LABEL
            : TASK_TYPE_LABELS[group.type] || group.type;

        const filteredGroupTasks = group.tasks.filter((task) => {
          const evaluationItemName = getEvaluationPatrolTaskItemName(task);
          const searchSource = [
            groupLabel,
            task.task_no,
            task.source_ticket?.ticket_no,
            task.source_ticket?.title,
            task.event_name,
            task.event_location,
            task.location_text,
            task.notes,
            evaluationItemName,
          ]
            .map(normalizeText)
            .filter(Boolean)
            .join(' ');

          return searchSource.includes(normalizedSearchKeyword);
        });

        return {
          ...group,
          tasks: filteredGroupTasks,
        };
      })
      .filter((group) => group.tasks.length > 0);
  }, [groupedTasks, normalizedSearchKeyword]);

  /** 自分担当の進行中件数 */
  const myTaskCount = useMemo(() => {
    if (!user?.id) {
      return 0;
    }

    return tasks.filter((task) => task.assigned_to === user.id).length;
  }, [tasks, user?.id]);

  /** 緊急対応件数 */
  const emergencyTaskCount = useMemo(() => {
    return tasks.filter((task) => task.task_type === PATROL_TASK_TYPES.EMERGENCY_SUPPORT).length;
  }, [tasks]);

  /** 検索結果件数 */
  const filteredTaskCount = useMemo(() => {
    return filteredGroupedTasks.reduce((count, group) => count + group.tasks.length, 0);
  }, [filteredGroupedTasks]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, isMobile && styles.cardMobile]}>
      {/* ── ヘッダー ── */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: `${theme.primary}15` }]}
          onPress={onRefresh}
        >
          <Text style={[styles.refreshButtonText, { color: theme.primary }]}>更新</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View
          style={[
            styles.summaryChip,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.summaryChipValue, { color: theme.text }]}>{tasks.length}</Text>
          <Text style={[styles.summaryChipLabel, { color: theme.textSecondary }]}>進行中</Text>
        </View>
        <View
          style={[
            styles.summaryChip,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.summaryChipValue, { color: theme.text }]}>{myTaskCount}</Text>
          <Text style={[styles.summaryChipLabel, { color: theme.textSecondary }]}>あなた担当</Text>
        </View>
        <View
          style={[
            styles.summaryChip,
            {
              borderColor: emergencyTaskCount > 0 ? theme.error : theme.border,
              backgroundColor: emergencyTaskCount > 0 ? `${theme.error}10` : theme.background,
            },
          ]}
        >
          <Text
            style={[
              styles.summaryChipValue,
              { color: emergencyTaskCount > 0 ? theme.error : theme.text },
            ]}
          >
            {emergencyTaskCount}
          </Text>
          <Text style={[styles.summaryChipLabel, { color: theme.textSecondary }]}>緊急対応</Text>
        </View>
      </View>

      <View
        style={[
          styles.searchRow,
          { borderColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>🔍</Text>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {searchText ? (
          <TouchableOpacity
            style={[styles.searchClearButton, { borderColor: theme.border }]}
            onPress={() => setSearchText('')}
          >
            <Text style={[styles.searchClearButtonText, { color: theme.textSecondary }]}>クリア</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {normalizedSearchKeyword ? (
        <Text style={[styles.searchMetaText, { color: theme.textSecondary }]}>
          {filteredTaskCount}件ヒット
        </Text>
      ) : null}

      {isLoadingTasks ? (
        <SkeletonLoader lines={3} baseColor={theme.border} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="📋"
          title={emptyTitle}
          description={emptyDescription}
          theme={theme}
        />
      ) : filteredGroupedTasks.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="検索条件に一致するタスクはありません"
          description="検索条件を変えるか、クリアして全件を確認してください。"
          theme={theme}
        />
      ) : (
        <View style={styles.groupList}>
          {filteredGroupedTasks.map(({ type, tasks: groupTasks }) => {
            /** 種別アイコン */
            const icon = type === PATROL_TASK_DISPLAY_TYPES.EVALUATION ? EVALUATION_TASK_ICON : TASK_TYPE_ICONS[type] || '📋';
            /** 種別表示ラベル */
            const label = type === PATROL_TASK_DISPLAY_TYPES.EVALUATION ? EVALUATION_TASK_LABEL : TASK_TYPE_LABELS[type] || type;
            /** 緊急対応は強調表示 */
            const isEmergency = type === PATROL_TASK_TYPES.EMERGENCY_SUPPORT;
            /** 検索中は自動展開する */
            const isCollapsed = normalizedSearchKeyword ? false : Boolean(collapsedGroupMap[type]);

            return (
              <View key={type} style={styles.typeGroup}>
                {/* 種別セクションヘッダー */}
                <Pressable
                  style={[
                    styles.typeHeader,
                    {
                      backgroundColor: type === PATROL_TASK_DISPLAY_TYPES.EVALUATION ? EVALUATION_TASK_BG_COLOR : TASK_TYPE_BG_COLORS[type] || '#F6F8FA',
                    },
                  ]}
                  onPress={() =>
                    setCollapsedGroupMap((previousMap) => ({
                      ...previousMap,
                      [type]: !previousMap[type],
                    }))
                  }
                >
                  <View style={styles.typeHeaderLead}>
                    <Text style={styles.typeHeaderIcon}>{icon}</Text>
                    <View style={styles.typeHeaderTextBlock}>
                      <Text
                        style={[
                          styles.typeHeaderLabel,
                          { color: isEmergency ? theme.error : theme.text },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text style={[styles.typeHeaderSubLabel, { color: theme.textSecondary }]}>
                        {isEmergency
                          ? '最優先で確認してください'
                          : isCollapsed
                          ? 'タップで展開'
                          : 'タップで折りたたみ'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.typeHeaderActions}>
                    <View
                      style={[
                        styles.countBadge,
                        { backgroundColor: isEmergency ? theme.error : theme.primary },
                      ]}
                    >
                      <Text style={styles.countBadgeText}>{groupTasks.length}件</Text>
                    </View>
                    <Text style={[styles.collapseLabel, { color: theme.textSecondary }]}>
                      {isCollapsed ? '▶' : '▼'}
                    </Text>
                  </View>
                </Pressable>

                {/* グループ内タスク一覧 */}
                {!isCollapsed ? (
                  <View style={styles.ticketList}>
                    {groupTasks.map((task) => {
                      /** 選択中かどうか */
                      const isActive = task.id === selectedTaskId;
                      const evaluationItemName = getEvaluationPatrolTaskItemName(task);
                      /** 担当者ラベル */
                      const assigneeLabel = !task.assigned_to
                        ? '未割当'
                        : task.assigned_to === user?.id
                          ? 'あなた'
                          : '他担当';
                      return (
                        <Pressable
                          key={task.id}
                          style={[
                            styles.ticketItem,
                            isMobile && styles.ticketItemMobile,
                            {
                              borderColor: isActive ? theme.primary : theme.border,
                              borderLeftColor:
                                type === PATROL_TASK_DISPLAY_TYPES.EVALUATION
                                  ? EVALUATION_TASK_ACCENT_COLOR
                                  : TASK_TYPE_ACCENT_COLORS[type] || '#57606A',
                              backgroundColor: isActive ? `${theme.primary}14` : theme.background,
                            },
                          ]}
                          onPress={() => onSelectTask(task.id)}
                        >
                          <View style={styles.ticketHeaderRow}>
                            <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>
                              {task.event_name || '企画名未設定'}
                            </Text>
                            {isActive ? (
                              <View
                                style={[
                                  styles.selectedBadge,
                                  { backgroundColor: theme.primary, borderColor: theme.primary },
                                ]}
                              >
                                <Text style={styles.selectedBadgeText}>選択中</Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={styles.badgeRow}>
                            <View
                              style={[
                                styles.metaBadge,
                                {
                                  borderColor: theme.border,
                                  backgroundColor: `${theme.primary}10`,
                                },
                              ]}
                            >
                              <Text style={[styles.metaBadgeText, { color: theme.primary }]}>
                                {TASK_STATUS_LABELS[task.task_status] || task.task_status}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.metaBadge,
                                {
                                  borderColor: theme.border,
                                  backgroundColor: task.assigned_to ? theme.surface : `${theme.error}10`,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.metaBadgeText,
                                  { color: task.assigned_to ? theme.textSecondary : theme.error },
                                ]}
                              >
                                担当: {assigneeLabel}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.ticketLocation, { color: theme.text }]} numberOfLines={1}>
                            📍 {task.event_location || task.location_text || '場所未設定'}
                          </Text>
                          {evaluationItemName ? (
                            <Text
                              style={[
                                styles.keyLabel,
                                {
                                  color:
                                    type === PATROL_TASK_DISPLAY_TYPES.EVALUATION
                                      ? EVALUATION_TASK_ACCENT_COLOR
                                      : theme.primary,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              評価項目: {evaluationItemName}
                            </Text>
                          ) : task.task_type === PATROL_TASK_TYPES.LOCK_CHECK && task.notes ? (
                            /** 施錠確認タスクは notes から鍵名を抽出してインライン表示 */
                            <Text style={[styles.keyLabel, { color: theme.primary }]} numberOfLines={1}>
                              🔑 {task.notes.includes(':') ? task.notes.split(':').slice(1).join(':').trim() : task.notes}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /** 外枠カード: shadow で浮かせる */
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** スマホ向けカード: 余白を小さく */
  cardMobile: {
    padding: 10,
    borderRadius: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  /** 更新ボタン: primary薄め背景 */
  refreshButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchClearButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchClearButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  searchMetaText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  /** サマリーチップ: より丸みを増す */
  summaryChip: {
    minWidth: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryChipValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  summaryChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  /** グループ全体を縦に並べるコンテナ */
  groupList: {
    gap: 14,
  },
  /** 種別グループ */
  typeGroup: {
    gap: 6,
  },
  /** 種別セクションヘッダー: タスク種別色の薄い背景 */
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  typeHeaderLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  typeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeHeaderTextBlock: {
    flex: 1,
  },
  typeHeaderIcon: {
    fontSize: 18,
  },
  typeHeaderLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  typeHeaderSubLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  /** 件数バッジ */
  countBadge: {
    borderRadius: 999,
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  collapseLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  ticketList: {
    gap: 8,
    paddingLeft: 2,
  },
  /** タスク行: 左アクセントボーダー + shadow */
  ticketItem: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** スマホ向けタスク行: 余白・角丸を小さく */
  ticketItemMobile: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  ticketTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  /** 選択中バッジ */
  selectedBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketLocation: {
    fontSize: 13,
    fontWeight: '600',
  },
  ticketMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  /** 施錠確認タスクの鍵名インライン表示 */
  keyLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default PatrolTaskList;
