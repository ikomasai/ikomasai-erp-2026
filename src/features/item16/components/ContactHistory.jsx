/**
 * 連絡案件履歴・回答表示コンポーネント
 * 企画者側では自分の質問履歴と担当側からの回答のみを表示する。
 */

import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SUPPORT_TICKET_STATUSES } from '../../../services/supabase/supportTicketService';
import SkeletonLoader from '../../../shared/components/SkeletonLoader';
import EmptyState from '../../../shared/components/EmptyState';

/** 連絡案件ステータス表示名 */
const STATUS_LABELS = {
  [SUPPORT_TICKET_STATUSES.NEW]: '新規',
  [SUPPORT_TICKET_STATUSES.ACKNOWLEDGED]: '受領',
  [SUPPORT_TICKET_STATUSES.IN_PROGRESS]: '対応中',
  [SUPPORT_TICKET_STATUSES.WAITING_EXTERNAL]: '外部待ち',
  [SUPPORT_TICKET_STATUSES.RESOLVED]: '解決済み',
  [SUPPORT_TICKET_STATUSES.CLOSED]: 'クローズ',
};

/** 種別ごとのグループ表示情報 */
const TICKET_TYPE_GROUP_INFO = {
  emergency: { icon: 'SOS', label: '緊急呼び出し' },
  key_preapply: { icon: 'KEY', label: '鍵の事前申請' },
  start_report: { icon: 'IN', label: '企画開始報告' },
  end_report: { icon: 'OUT', label: '企画終了報告' },
  rule_question: { icon: 'QA', label: '企画ルール変更' },
  layout_change: { icon: 'MAP', label: '配置図変更' },
  distribution_change: { icon: 'ACC', label: '商品配布基準変更' },
  damage_report: { icon: 'FIX', label: '物品破損報告' },
};

/** 種別グループの表示順 */
const TICKET_TYPE_ORDER = [
  'emergency',
  'key_preapply',
  'start_report',
  'end_report',
  'rule_question',
  'layout_change',
  'distribution_change',
  'damage_report',
];

/**
 * 文字列を trim する
 * @param {string|null|undefined} value - 元の値
 * @returns {string} trim 済み文字列
 */
const normalizeText = (value) => (value || '').trim();

/**
 * バイト数を表示文字列へ変換する
 * @param {number|null|undefined} fileSizeBytes - バイト数
 * @returns {string} 表示用サイズ
 */
/**
 * 連絡案件の詳細プレビューを整形する
 * @param {string|null|undefined} value - 連絡案件詳細
 * @returns {string} 表示用プレビュー
 */
const buildDetailPreview = (value) => {
  /** 改行と連続空白をならした詳細 */
  const normalizedValue = normalizeText(value).replace(/\s+/g, ' ');
  if (!normalizedValue) {
    return '';
  }

  return normalizedValue.length > 48 ? `${normalizedValue.slice(0, 48)}...` : normalizedValue;
};

const formatFileSize = (fileSizeBytes) => {
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size < 0) {
    return '-';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

/**
 * 連絡案件履歴・回答表示コンポーネント
 * @param {Object} props - プロパティ
 * @param {Object} props.theme - テーマ
 * @param {Object|null} props.user - ログインユーザー
 * @param {boolean} props.isLoadingContacts - 連絡案件一覧ロード中フラグ
 * @param {Array} props.myContacts - 自分の連絡案件一覧
 * @param {string|null} props.selectedContactId - 選択中の案件 ID
 * @param {(id: string) => void} props.onSelectContact - 案件選択コールバック
 * @param {Object|null} props.selectedContact - 選択中の案件
 * @param {() => void} props.onRefreshContacts - 一覧再取得コールバック
 * @param {boolean} props.isLoadingContactMessages - 回答ロード中フラグ
 * @param {Array} props.contactMessages - 回答メッセージ一覧
 * @param {boolean} props.isLoadingContactAttachments - 添付ロード中フラグ
 * @param {Array} props.contactAttachments - 添付一覧
 * @param {(attachment: Object) => void} props.onOpenAttachment - 添付を開くコールバック
 * @param {() => void} props.onRefreshDetail - 詳細再取得コールバック
 * @param {(y: number) => void} [props.onDetailLayout] - 詳細カード座標通知コールバック
 * @param {string} props.historyTitle - 一覧セクションタイトル
 * @param {string} props.detailTitle - 詳細セクションタイトル
 * @returns {JSX.Element} 履歴表示
 */
const ContactHistory = ({
  theme,
  user,
  isLoadingContacts,
  myContacts,
  selectedContactId,
  onSelectContact,
  selectedContact,
  onRefreshContacts,
  isLoadingContactMessages,
  contactMessages,
  isLoadingContactAttachments,
  contactAttachments,
  onOpenAttachment,
  onRefreshDetail,
  onDetailLayout,
  historyTitle,
  detailTitle,
  canCloseLatestContact,
  isClosingLatestContact,
  onCloseLatestContact,
}) => {
  /** 最新案件セクションの折りたたみ状態 */
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  /**
   * 折りたたみ中の種別キー集合
   * @type {Set<string>}
   */
  const [collapsedTypes, setCollapsedTypes] = useState(new Set());

  /**
   * 最新案件セクション全体の開閉を切り替える
   * @returns {void}
   */
  const toggleHistoryCollapsed = () => {
    setIsHistoryCollapsed((prev) => !prev);
  };

  /**
   * 種別グループの開閉を切り替える
   * @param {string} typeKey - 種別キー
   * @returns {void}
   */
  const toggleType = (typeKey) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) {
        next.delete(typeKey);
      } else {
        next.add(typeKey);
      }
      return next;
    });
  };

  /**
   * 連絡案件を ticket_type でグループ化する
   * @type {Array<{typeKey: string, items: Array}>}
   */
  const groupedContacts = useMemo(() => {
    const map = {};
    (myContacts || []).forEach((contact) => {
      const typeKey = contact.ticket_type || 'other';
      if (!map[typeKey]) {
        map[typeKey] = [];
      }
      map[typeKey].push(contact);
    });

    const ordered = TICKET_TYPE_ORDER.filter((key) => map[key]).map((key) => ({
      typeKey: key,
      items: map[key],
    }));

    const knownKeys = new Set(TICKET_TYPE_ORDER);
    Object.keys(map)
      .filter((key) => !knownKeys.has(key))
      .forEach((key) => {
        ordered.push({ typeKey: key, items: map[key] });
      });

    return ordered;
  }, [myContacts]);

  /**
   * 企画者側では担当からの回答だけを表示する
   * @type {Array}
   */
  const answerMessages = useMemo(() => {
    return (contactMessages || []).filter((message) => message.author_id !== user?.id);
  }, [contactMessages, user?.id]);

  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, styles.historyTitle, { color: theme.text }]}>
            {historyTitle}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.refreshButton, { borderColor: theme.border }]}
              onPress={onRefreshContacts}
            >
              <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.refreshButton, { borderColor: theme.border }]}
              onPress={toggleHistoryCollapsed}
            >
              <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>
                {isHistoryCollapsed ? '開く' : '折りたたむ'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isHistoryCollapsed ? (
          <Text style={[styles.historyEmptyText, { color: theme.textSecondary }]}>
            {myContacts.length === 0
              ? '折りたたみ中です。対象の連絡案件はありません。'
              : `折りたたみ中です。現在 ${myContacts.length} 件あります。`}
          </Text>
        ) : isLoadingContacts ? (
          <SkeletonLoader lines={3} baseColor={theme.border} />
        ) : myContacts.length === 0 ? (
          <EmptyState icon="📝" title="連絡履歴はまだありません" theme={theme} />
        ) : (
          <View style={styles.groupList}>
            {groupedContacts.map(({ typeKey, items }) => {
              const groupInfo = TICKET_TYPE_GROUP_INFO[typeKey] || { icon: 'etc', label: typeKey };
              const isCollapsed = collapsedTypes.has(typeKey);

              return (
                <View
                  key={typeKey}
                  style={[styles.groupSection, { borderColor: theme.border, backgroundColor: theme.background }]}
                >
                  <Pressable
                    style={[styles.groupHeader, { borderBottomColor: isCollapsed ? 'transparent' : theme.border }]}
                    onPress={() => toggleType(typeKey)}
                  >
                    <View style={styles.groupHeaderLeft}>
                      <Text style={styles.groupIcon}>{groupInfo.icon}</Text>
                      <Text style={[styles.groupLabel, { color: theme.text }]}>{groupInfo.label}</Text>
                      <View style={[styles.groupBadge, { backgroundColor: `${theme.primary}22` }]}>
                        <Text style={[styles.groupCount, { color: theme.primary }]}>{items.length}</Text>
                      </View>
                    </View>
                    <Text style={[styles.collapseArrow, { color: theme.textSecondary }]}>
                      {isCollapsed ? '>' : 'v'}
                    </Text>
                  </Pressable>

                  {!isCollapsed ? (
                    <View style={styles.groupItemList}>
                      {items.map((contact) => (
                        <Pressable
                          key={contact.id}
                          style={[
                            styles.historyItem,
                            {
                              borderColor: contact.id === selectedContactId ? theme.primary : theme.border,
                              backgroundColor:
                                contact.id === selectedContactId ? `${theme.primary}14` : theme.surface,
                            },
                          ]}
                          onPress={() => onSelectContact(contact.id)}
                        >
                          <Text style={[styles.historyItemTitle, { color: theme.text }]} numberOfLines={1}>
                            {contact.title}
                          </Text>
                          <Text style={[styles.historyItemMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                            {(STATUS_LABELS[contact.ticket_status] || contact.ticket_status) +
                              ' / ' +
                              new Date(contact.created_at).toLocaleString('ja-JP')}
                          </Text>
                          {buildDetailPreview(contact.description) ? (
                            <Text style={[styles.historyItemPreview, { color: theme.textSecondary }]} numberOfLines={2}>
                              {buildDetailPreview(contact.description)}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {!isHistoryCollapsed && selectedContact ? (
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onLayout={(event) => {
            onDetailLayout?.(event.nativeEvent.layout.y);
          }}
        >
          <View style={styles.historyHeader}>
            <Text style={[styles.sectionTitle, styles.historyTitle, { color: theme.text }]}>
              {detailTitle}
            </Text>
            <View style={styles.detailHeaderActions}>
              {canCloseLatestContact ? (
                <TouchableOpacity
                  style={[styles.closeButton, { borderColor: theme.border }]}
                  onPress={onCloseLatestContact}
                  disabled={isClosingLatestContact}
                >
                  <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>
                    {isClosingLatestContact ? 'クローズ中...' : '最新案件を閉じる'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.refreshButton, { borderColor: theme.border }]}
                onPress={onRefreshDetail}
              >
                <Text style={[styles.refreshButtonText, { color: theme.textSecondary }]}>更新</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.historyItemTitle, { color: theme.text }]}>{selectedContact.title}</Text>
          <Text style={[styles.historyItemMeta, { color: theme.textSecondary }]}>
            状態: {STATUS_LABELS[selectedContact.ticket_status] || selectedContact.ticket_status}
          </Text>
          <Text style={[styles.historyItemMeta, { color: theme.textSecondary }]}>
            企画: {normalizeText(selectedContact.event_name) || '-'} / {normalizeText(selectedContact.event_location) || '-'}
          </Text>
          <Text
            style={[
              styles.requestText,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          >
            {selectedContact.description}
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>添付</Text>
          {isLoadingContactAttachments ? (
            <SkeletonLoader lines={3} baseColor={theme.border} />
          ) : contactAttachments.length === 0 ? (
            <Text style={[styles.historyEmptyText, { color: theme.textSecondary }]}>添付はありません</Text>
          ) : (
            <View style={styles.messageList}>
              {contactAttachments.map((attachment) => {
                const isImage = normalizeText(attachment.mime_type).startsWith('image/');
                const fileName = normalizeText(attachment.storage_path).split('/').pop() || 'attachment.bin';
                return (
                  <View
                    key={attachment.id}
                    style={[
                      styles.messageItem,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                  >
                    <Text style={[styles.messageBody, { color: theme.text }]}>
                      {attachment.caption || fileName}
                    </Text>
                    <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                      {fileName} / {formatFileSize(attachment.file_size_bytes)} /{' '}
                      {attachment.mime_type || 'application/octet-stream'}
                    </Text>
                    {isImage && attachment.signedUrl ? (
                      <Image
                        source={{ uri: attachment.signedUrl }}
                        style={styles.inlineAttachmentPreview}
                        resizeMode="cover"
                      />
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.attachPickerButton,
                        { borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                      onPress={() => onOpenAttachment(attachment)}
                      disabled={!attachment.signedUrl}
                    >
                      <Text style={[styles.attachPickerButtonText, { color: theme.textSecondary }]}>
                        {attachment.signedUrl ? '添付を開く' : 'URL 取得失敗'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={[styles.label, { color: theme.text }]}>担当からの回答</Text>
          {isLoadingContactMessages ? (
            <SkeletonLoader lines={3} baseColor={theme.border} />
          ) : answerMessages.length === 0 ? (
            <EmptyState icon="💬" title="回答はまだありません" theme={theme} />
          ) : (
            <View style={styles.messageList}>
              {answerMessages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageItem,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                >
                  <Text style={[styles.messageAuthor, { color: theme.textSecondary }]}>担当回答</Text>
                  <Text style={[styles.messageBody, { color: theme.text }]}>{message.body}</Text>
                  <Text style={[styles.messageDate, { color: theme.textSecondary }]}>
                    {new Date(message.created_at).toLocaleString('ja-JP')}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  historyTitle: {
    marginBottom: 0,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  groupList: {
    gap: 10,
  },
  groupSection: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  groupIcon: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 28,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  groupBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  collapseArrow: {
    fontSize: 13,
    fontWeight: '700',
  },
  groupItemList: {
    gap: 8,
    padding: 10,
  },
  historyItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyItemTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  historyItemMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  historyItemPreview: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  requestText: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  historyEmptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  messageList: {
    gap: 10,
  },
  messageItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  messageAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageDate: {
    fontSize: 12,
  },
  attachPickerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  attachPickerButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineAttachmentPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
  },
});

export default ContactHistory;
