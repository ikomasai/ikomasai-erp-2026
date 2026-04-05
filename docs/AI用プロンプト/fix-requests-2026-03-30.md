# 修正依頼 2026-03-30

## 前提

- 言語: JavaScript のみ（TypeScript 禁止）
- スタイル: StyleSheet のみ（Tailwind/NativeWind 禁止）
- 全関数・変数に JSDoc 日本語コメント必須
- `var` 禁止、マジックナンバー禁止
- try-catch でエラーを握りつぶさない

---

## 修正 1: 返信通知に回答本文を含める（会計対応・物品対応 共通）

### 問題

`src/services/supabase/supportNotificationService.js` の `notifySupportTicketMessageCreated` 関数で、
担当側（会計/物品）が返信を投稿した際に企画者へ送る通知に回答本文が分かりにくい。

**現状の通知構造:**
```
タイトル: 会計部から回答: 団体名 / 企画名
本文:
  団体: X
  依頼者: Y
  企画: Z
  場所: W
  件名: T
  対応者: A
  内容: [回答本文の先頭80文字]  ← 末尾に埋もれている
```

### 修正内容

**ファイル:** `src/services/supabase/supportNotificationService.js`
**対象関数:** `notifySupportTicketMessageCreated`

担当側（`normalizedAuthorId !== ticketCreatorId`）が返信した際の通知を下記に変更する。

```
タイトル: 会計部から回答: [回答本文の先頭40文字]
本文:
  [回答本文全体（buildPreviewText は使わず body をそのまま入れてよい、ただし先頭160文字まで）]
  ─
  件名: T
  団体: X / 企画: Z
  対応者: A
```

**具体的な変更箇所:**

`notifySupportTicketMessageCreated` 内、`normalizedAuthorId !== ticketCreatorId` の分岐で
`notifyUserOrOrganization` を呼ぶ部分のタイトルと本文を変更する。

変更前:
```js
title: `${buildDepartmentLabel(ticket)}から回答: ${buildTicketContextHeadline(context)}`,
body: buildNotificationBody([
  ...buildTicketContextLines(context, '対応者'),
  `内容: ${previewText}`,
]),
```

変更後:
```js
/** 回答本文プレビュー（先頭160文字） */
const replyPreview = normalizeText(body).slice(0, 160);
/** タイトル用回答抜粋（先頭40文字） */
const replyShortPreview = normalizeText(body).slice(0, 40);

title: `${buildDepartmentLabel(ticket)}から回答: ${replyShortPreview}`,
body: buildNotificationBody([
  replyPreview,
  '─',
  `件名: ${context.ticketTitle}`,
  `団体: ${context.organizationName} / 企画: ${context.eventName}`,
  context.actorName ? `対応者: ${context.actorName}` : '',
]),
```

---

## 修正 2: 会計対応画面をタブ切り替えに変更

### 問題

`SupportDeskScreen` の `ACCOUNTING` ロールでは「対象連絡案件 + 案件詳細 + 景品配布基準」が
1つの縦スクロールページに並んでいて見づらい。

企画者サポート（item16）のような下部タブ切り替えに分割したい。

### 修正内容

**ファイル:** `src/features/support/components/SupportDeskScreen.jsx`

#### 2-1. ACCOUNTING 専用タブ定数を追加（ファイル上部の定数定義部分）

```js
/** 会計対応向けタブ種別 */
const ACCOUNTING_TAB_TYPES = {
  TICKETS: 'tickets',
  PRIZES: 'prizes',
};

/** 会計対応向けタブ一覧 */
const ACCOUNTING_TABS = [
  { key: ACCOUNTING_TAB_TYPES.TICKETS, label: '連絡案件' },
  { key: ACCOUNTING_TAB_TYPES.PRIZES, label: '景品配布基準' },
];
```

#### 2-2. state を追加（SupportDeskScreen コンポーネント内の state 宣言部分）

```js
/** 会計対応向けアクティブタブ（'tickets' | 'prizes'） */
const [accountingActiveTab, setAccountingActiveTab] = useState(ACCOUNTING_TAB_TYPES.TICKETS);
```

#### 2-3. JSX に会計用タブバーを追加し、セクションを条件分岐

**タブバーの追加位置:** `isDepartmentRole` 向けのメインコンテンツ（ScrollView の中）の先頭、
既存のチケット一覧カード（`対象連絡案件` セクション）の直前に挿入する。

```jsx
{/* ─── 会計対応向けタブバー ─── */}
{isAccountingRole ? (
  <View style={[styles.accountingTabBar, { borderBottomColor: theme.border }]}>
    {ACCOUNTING_TABS.map((tab) => {
      /** このタブが選択中かどうか */
      const isActive = accountingActiveTab === tab.key;
      return (
        <Pressable
          key={tab.key}
          style={[
            styles.accountingTabItem,
            isActive && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setAccountingActiveTab(tab.key)}
        >
          <Text
            style={[
              styles.accountingTabLabel,
              { color: isActive ? theme.primary : theme.textSecondary },
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
) : null}
```

**既存の「対象連絡案件」カードと「案件詳細」カードを条件付きレンダリングに変更:**
これらを囲う既存の `isDepartmentRole` 条件の中で、さらに会計ロールの場合は
`accountingActiveTab === ACCOUNTING_TAB_TYPES.TICKETS` の時だけ表示する。

変更前イメージ:
```jsx
{isDepartmentRole ? (
  <>
    {/* チケット一覧 */}
    <View ...>...</View>
    {/* チケット詳細 */}
    <View ...>...</View>
  </>
) : null}
```

変更後イメージ:
```jsx
{isDepartmentRole ? (
  <>
    {/* 会計のみ: tickets タブのときだけ表示 */}
    {(!isAccountingRole || accountingActiveTab === ACCOUNTING_TAB_TYPES.TICKETS) ? (
      <>
        {/* チケット一覧 */}
        <View ...>...</View>
        {/* チケット詳細 */}
        <View ...>...</View>
      </>
    ) : null}
  </>
) : null}
```

**既存の「景品配布基準」カードを条件付きレンダリングに変更:**

変更前:
```jsx
{roleType === SUPPORT_DESK_ROLE_TYPES.ACCOUNTING ? (
  <View ...> {/* 景品配布基準 */} </View>
) : null}
```

変更後:
```jsx
{isAccountingRole && accountingActiveTab === ACCOUNTING_TAB_TYPES.PRIZES ? (
  <View ...> {/* 景品配布基準 */} </View>
) : null}
```

#### 2-4. スタイル追加

```js
accountingTabBar: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  marginBottom: 8,
},
accountingTabItem: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: 10,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
},
accountingTabLabel: {
  fontSize: 14,
  fontWeight: '600',
},
```

---

## 修正 3: 振り分け候補に進行中タスクがある場合は割り当て不可

### 問題

本部サポート（HQ）の連絡案件詳細にある「🚶 部員が向かいます」モーダルで、
担当候補者（企画管理部メンバー）が既に `accepted` または `en_route` の進行中タスクを持っている場合でも
割り当てができてしまう。

### 修正内容

**ファイル:** `src/features/support/components/SupportDeskScreen.jsx`
**対象箇所:** 振り分けモーダル内の担当者リスト（`dispatchCandidates.map` の部分）

現在 line 6632 付近にある `dispatchCandidates.map` の中で各候補者のアクティブタスクを確認し、
アクティブタスクがある場合は選択を無効化する。

```jsx
{dispatchCandidates.map((candidate) => {
  /** このメンバーが選択中かどうか */
  const isSelected = candidate.userId === dispatchAssigneeId;
  /** このメンバーが現在進行中（accepted/en_route）タスクを保持しているか */
  const activeTasks = hqPatrolTasks.filter(
    (task) =>
      task.assigned_to === candidate.userId &&
      [PATROL_TASK_STATUSES.ACCEPTED, PATROL_TASK_STATUSES.EN_ROUTE].includes(task.task_status)
  );
  /** 進行中タスクあり → 割り当て不可 */
  const hasActiveTask = activeTasks.length > 0;
  /** 進行中タスクの種別ラベル（最初の1件） */
  const activeTaskLabel = hasActiveTask
    ? PATROL_TASK_TYPE_LABELS[getPatrolTaskDisplayType(activeTasks[0])] || '対応中'
    : null;

  return (
    <Pressable
      key={candidate.userId}
      style={[
        styles.dispatchAssigneeItem,
        {
          borderColor: isSelected ? theme.primary : hasActiveTask ? '#D1242F' : theme.border,
          backgroundColor: isSelected
            ? `${theme.primary}14`
            : hasActiveTask
            ? '#FFEEF0'
            : theme.background,
          opacity: hasActiveTask ? 0.6 : 1,
        },
      ]}
      onPress={() => {
        if (!hasActiveTask) {
          setDispatchAssigneeId(candidate.userId);
        }
      }}
      disabled={hasActiveTask}
    >
      <Text style={[styles.dispatchAssigneeText, { color: isSelected ? theme.primary : hasActiveTask ? '#D1242F' : theme.text }]}>
        {candidate.name}
        {hasActiveTask ? ` （対応中: ${activeTaskLabel}）` : ''}
      </Text>
      {candidate.organization ? (
        <Text style={[styles.dispatchAssigneeSub, { color: theme.textSecondary }]}>
          {candidate.organization}
        </Text>
      ) : null}
    </Pressable>
  );
})}
```

---

## 修正 4: 連絡案件の依頼内容（description）を巡回担当部員が確認できるようにする

### 問題

本部（HQ）が連絡案件から「部員が向かいます」で振り分けタスクを生成した際、
巡回担当部員（item12）がタスク詳細を見ても依頼内容の本文（`description`）が表示されない。
タスクの `notes` に `種別: タイトル` しか保存されておらず、何の対応が必要か分からない。

### 修正内容

#### 4-1. 振り分けタスク生成時に description を notes に含める

**ファイル:** `src/services/supabase/patrolTaskService.js`
**対象関数:** `createDispatchPatrolTask`

変更前（line 743付近）:
```js
const taskNotes = `${ticketTypeLabel || '連絡案件'}: ${ticket.title || ''}`.trim();
```

変更後:
```js
/** タスク notes に連絡案件のタイトルと本文をまとめて格納する */
const taskNoteLines = [
  `${ticketTypeLabel || '連絡案件'}: ${ticket.title || ''}`,
];
if (ticket.description && ticket.description.trim()) {
  taskNoteLines.push(`依頼内容: ${ticket.description.trim()}`);
}
/** タスク notes 文字列 */
const taskNotes = taskNoteLines.join('\n').trim();
```

#### 4-2. listPatrolTasks の source_ticket select に description を追加

**ファイル:** `src/services/supabase/patrolTaskService.js`
**対象関数:** `listPatrolTasks`（line 350付近）

変更前:
```js
source_ticket:support_tickets!patrol_tasks_source_ticket_id_fkey(
  id,
  ticket_no,
  title,
  event_id,
  event_name,
  event_location
)
```

変更後:
```js
source_ticket:support_tickets!patrol_tasks_source_ticket_id_fkey(
  id,
  ticket_no,
  title,
  description,
  event_id,
  event_name,
  event_location
)
```

#### 4-3. PatrolTaskDetail に元連絡案件の依頼内容を表示

**ファイル:** `src/features/item12/components/PatrolTaskDetail.jsx`
**対象箇所:** `selectedTask.source_ticket_id` がある場合の表示ブロック（line 173付近）

元連絡案件のバッジ表示の後ろ（または元連絡案件メッセージの直前）に
`source_ticket.description` が存在する場合は表示する。

```jsx
{/* 元連絡案件の依頼内容 */}
{selectedTask.source_ticket?.description ? (
  <View style={[styles.sourceTicketDescriptionBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
    <Text style={[styles.label, { color: theme.text }]}>依頼内容</Text>
    <Text style={[styles.sourceTicketDescriptionText, { color: theme.text }]}>
      {selectedTask.source_ticket.description}
    </Text>
  </View>
) : null}
```

スタイル追加:
```js
sourceTicketDescriptionBox: {
  borderWidth: 1,
  borderRadius: 6,
  padding: 10,
  marginTop: 8,
  marginBottom: 4,
},
sourceTicketDescriptionText: {
  fontSize: 13,
  lineHeight: 20,
},
```

---

## 修正 5: 本部サポート 概況確認 — 企画開始終了報告が表示されない

### 問題

「概況確認」タブの「企画報告確認」セクションは `confirm_start` / `confirm_end` の
**巡回タスク**を元に表示しているが、実際の開始/終了報告は企画者が送る
`start_report` / `end_report` の **連絡案件（support_tickets）** として届く。

巡回タスクが手動で作成されない限りセクションが空になり、実運用で機能しない。

### 修正内容

**ファイル:** `src/features/support/components/SupportDeskScreen.jsx`

#### 5-1. 概況用の企画報告チケット一覧を tickets state から派生させる

既存の `overviewReportTasks` useMemo を削除し、代わりに support_tickets ベースの
`overviewReportTickets` を useMemo で定義する。

```js
/**
 * 概況ダッシュボード: 企画報告確認チケット一覧
 * tickets state から start_report / end_report を抽出してステータス・種別フィルターを適用する
 */
const overviewReportTickets = useMemo(() => {
  /** 開始・終了報告チケットに限定 */
  const base = tickets.filter(
    (t) => t.ticket_type === 'start_report' || t.ticket_type === 'end_report'
  );
  /** ステータスフィルター */
  const statusFiltered = base.filter((t) => {
    if (overviewStatusFilter === 'active') {
      /** 未対応・対応中・外部待ちを「対応中」とみなす */
      return [
        SUPPORT_TICKET_STATUSES.NEW,
        SUPPORT_TICKET_STATUSES.ACKNOWLEDGED,
        SUPPORT_TICKET_STATUSES.IN_PROGRESS,
        SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL,
      ].includes(t.ticket_status);
    }
    if (overviewStatusFilter === 'done') {
      return [SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(
        t.ticket_status
      );
    }
    return true;
  });
  /** 種別フィルター */
  if (overviewReportTypeFilter === 'all') {
    return statusFiltered;
  }
  /** 種別フィルターキーを ticket_type に変換: 'confirm_start' → 'start_report' */
  const ticketTypeMap = {
    confirm_start: 'start_report',
    confirm_end: 'end_report',
  };
  const targetTicketType = ticketTypeMap[overviewReportTypeFilter];
  if (!targetTicketType) {
    return statusFiltered;
  }
  return statusFiltered.filter((t) => t.ticket_type === targetTicketType);
}, [tickets, overviewStatusFilter, overviewReportTypeFilter]);
```

#### 5-2. 企画報告確認セクションの表示を変更

概況タブの「企画報告確認」セクション内のタスクリスト表示を
`overviewReportTasks.map` → `overviewReportTickets.map` に変更する。

各アイテムの表示内容を以下に対応させる:

| 旧（patrol task フィールド） | 新（support ticket フィールド） |
|---|---|
| `task.task_type` → 「企画開始確認」等 | `ticket.ticket_type` → 「開始報告」/「終了報告」 |
| `task.task_status` → patrol status | `ticket.ticket_status` → `STATUS_LABELS` を使う |
| `task.event_name` | `ticket.event_name` |
| `task.event_location` | `ticket.event_location` |
| `overviewProfileMap[task.assigned_to]` | `ticket.organizations?.name` |

```jsx
{overviewReportTickets.map((ticket) => {
  /** ステータス色 */
  const statusColor = getDepartmentStatusColor(ticket.ticket_status);
  /** 種別ラベル */
  const typeLabel = ticket.ticket_type === 'start_report' ? '開始報告' : '終了報告';
  /** ステータスラベル */
  const statusLabel = STATUS_LABELS[ticket.ticket_status] || ticket.ticket_status;
  /** 時刻文字列 */
  const timeStr = new Date(ticket.created_at).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      key={ticket.id}
      style={[
        styles.overviewTaskCard,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
          borderLeftColor: statusColor,
        },
      ]}
    >
      <View style={styles.overviewTaskHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
        <Text style={[styles.overviewTaskType, { color: theme.text }]}>{typeLabel}</Text>
      </View>
      <Text style={[styles.overviewTaskLocation, { color: theme.text }]} numberOfLines={1}>
        {ticket.event_name || '-'} / {ticket.event_location || '-'}
      </Text>
      <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
        {ticket.organizations?.name || '団体名未設定'} / {timeStr}
      </Text>
    </View>
  );
})}
```

**補助関数を追加:**
```js
/**
 * チケットステータスに対応する概況表示色を返す
 * @param {string} status - チケットステータス
 * @returns {string} 色コード
 */
const getDepartmentStatusColor = (status) => {
  if ([SUPPORT_TICKET_STATUSES.RESOLVED, SUPPORT_TICKET_STATUSES.CLOSED].includes(status)) {
    return '#1A7F37';
  }
  if ([SUPPORT_TICKET_STATUSES.IN_PROGRESS, SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL].includes(status)) {
    return '#BF6A02';
  }
  return '#57606A';
};
```

#### 5-3. 空表示テキストを変更

企画報告確認セクションの `EmptyState` の `description` を変更:
```
"対応中の開始/終了報告はありません。企画者から報告が届くとここに表示されます。"
```

---

## 修正 6: 本部サポート 概況確認 — 施錠確認の完了済みフィルターが空になる

### 問題

「概況確認」タブの「施錠確認」セクションで「確認済み」フィルターを選ぶと常に0件になる。
原因: `loadHqPatrolTasks` が `open`/`accepted`/`en_route` のタスクしか取得しておらず、
`done` タスクがロードされていないため。

### 修正内容

**ファイル:** `src/features/support/components/SupportDeskScreen.jsx`

#### 6-1. 概況用の施錠確認タスクを別途ロードする state/関数を追加

**state 追加（既存 state 宣言ブロックに追記）:**
```js
/** 概況ダッシュボード用: 施錠確認タスク全ステータス（done 含む） */
const [overviewLockAllTasks, setOverviewLockAllTasks] = useState([]);
/** 概況ダッシュボード: 施錠確認タスク読み込み中フラグ */
const [isLoadingOverviewLockTasks, setIsLoadingOverviewLockTasks] = useState(false);
```

**関数追加:**
```js
/**
 * 概況ダッシュボード用の施錠確認タスクを全ステータスで取得する
 * done 含む全件を取得して overviewLockAllTasks に保存する
 * @returns {Promise<void>} 取得処理
 */
const loadOverviewLockTasks = async () => {
  if (!isHQRole) {
    return;
  }
  setIsLoadingOverviewLockTasks(true);
  const { data, error } = await listPatrolTasks({
    taskTypes: [PATROL_TASK_TYPES.LOCK_CHECK],
    statuses: [
      PATROL_TASK_STATUSES.OPEN,
      PATROL_TASK_STATUSES.ACCEPTED,
      PATROL_TASK_STATUSES.EN_ROUTE,
      PATROL_TASK_STATUSES.DONE,
      PATROL_TASK_STATUSES.CANCELED,
    ],
    limit: 200,
  });
  setIsLoadingOverviewLockTasks(false);
  if (error) {
    console.error('概況用施錠確認タスク取得に失敗:', error);
    return;
  }
  setOverviewLockAllTasks(data || []);
};
```

#### 6-2. overviewLockTasks の参照先を変更

既存の `overviewLockTasks` useMemo を変更し、`hqPatrolTasks` の代わりに `overviewLockAllTasks` を参照する。

```js
const overviewLockTasks = useMemo(() => {
  const base = overviewLockAllTasks.filter((t) => t.task_type === PATROL_TASK_TYPES.LOCK_CHECK);
  // ... 以降のフィルターロジックは変更なし
}, [overviewLockAllTasks, overviewLockAssigneeFilter, overviewLockConfirmationFilter]);
```

#### 6-3. 概況タブを開いたときに loadOverviewLockTasks を呼ぶ

既存の `activeTab` 変化を監視する `useEffect` または概況タブ表示条件の中で
`loadOverviewLockTasks()` を呼ぶ。

具体的には、施錠確認セクションの「更新」ボタンの `onPress` を以下に変更:
```jsx
onPress={() => {
  loadHqPatrolTasks();
  loadOverviewLockTasks();
}}
```

また、HQRole 向けのデータロード初期化（`useEffect` など）にも `loadOverviewLockTasks()` を追加する。
概況タブ (`overview`) が `activeTab` になったときに呼ぶ形でも可。

#### 6-4. overviewProfileMap の構築に overviewLockAllTasks も含める

概況用プロフィールマップを構築している箇所（`overviewProfileMap` の `useMemo` または `useEffect`）に
`overviewLockAllTasks` のデータも含める。

```js
const allOverviewTaskAssigneeIds = [
  ...new Set([
    ...hqPatrolTasks.filter((t) => t.assigned_to).map((t) => t.assigned_to),
    ...overviewLockAllTasks.filter((t) => t.assigned_to).map((t) => t.assigned_to),
  ]),
];
```

---

## 変更ファイル一覧

| ファイル | 修正番号 | 変更内容 |
|---|---|---|
| `src/services/supabase/supportNotificationService.js` | 1 | 返信通知のタイトル・本文を回答内容優先に変更 |
| `src/services/supabase/patrolTaskService.js` | 4-1, 4-2 | dispatch task notes に description 追加、source_ticket select に description 追加 |
| `src/features/item12/components/PatrolTaskDetail.jsx` | 4-3 | source_ticket.description 表示を追加 |
| `src/features/support/components/SupportDeskScreen.jsx` | 2, 3, 5, 6 | 会計タブ分割・dispatch候補制限・概況修正 |

---

## 実装時の注意

1. `SupportDeskScreen.jsx` は304KBの大ファイル。変更は局所的に行い、既存の他ロール（HQ/PROPERTY）の動作を壊さないこと
2. 修正2（タブ分割）の変更は `isAccountingRole` フラグで完全に分岐させること（他ロールの表示に影響しないこと）
3. 修正5で `overviewReportTickets` に変更した後は、旧 `overviewReportTasks` の useMemo は削除してよい
   （ただし OVERVIEW_REPORT_TYPE_FILTERS の種別キー `confirm_start`/`confirm_end` は `ticketTypeMap` で対応しているので定数自体は残してよい）
4. 修正6では `loadOverviewLockTasks` は overview タブを開いたときのみ呼ぶのが望ましい（常時ポーリング不要）
5. 全ての新規関数・変数に JSDoc 日本語コメントを付けること
