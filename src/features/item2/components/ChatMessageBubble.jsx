/**
 * チャット吹き出し
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ITEM2_SYSTEM_MESSAGES } from '../constants';

/**
 * 時刻文字列へ整形する
 * @param {string} value - ISO文字列
 * @returns {string} 整形結果
 */
const formatTime = (value) => {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

/**
 * チャット吹き出し
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} 吹き出し
 */
const ChatMessageBubble = ({ message, isOwnMessage, canDelete, onDelete }) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 表示本文 */
  const displayBody = message.is_deleted ? ITEM2_SYSTEM_MESSAGES.DELETED : message.body;
  /** 送信者名 */
  const senderName = message.is_system_message
    ? 'システム'
    : (message.author_name || (isOwnMessage ? 'あなた' : '名称未設定'));

  return (
    <View style={[styles.wrapper, isOwnMessage ? styles.wrapperOwn : styles.wrapperOther]}>
      <Text style={[styles.authorName, { color: theme.textSecondary }, isOwnMessage ? styles.authorNameOwn : styles.authorNameOther]}>
        {senderName}
      </Text>
      <View
        style={[
          styles.bubble,
          message.is_system_message
            ? [styles.systemBubble, styles.systemBubbleWrap, { backgroundColor: theme.surface, borderColor: theme.border }]
            : isOwnMessage
              ? [styles.ownBubble, styles.ownBubbleWrap, { backgroundColor: theme.primaryVariant }]
              : [styles.otherBubble, styles.otherBubbleWrap, { backgroundColor: theme.surface, borderColor: theme.border }],
        ]}
      >
        <Text style={[styles.body, { color: isOwnMessage && !message.is_system_message ? '#ffffff' : theme.text }, message.is_deleted ? [styles.deletedBody, { color: theme.textSecondary }] : null]}>{displayBody}</Text>
      </View>
      <View style={[styles.metaRow, isOwnMessage ? styles.metaRowOwn : styles.metaRowOther]}>
        <Text style={[styles.timeText, { color: theme.textSecondary }]}>{formatTime(message.created_at ?? message.client_created_at)}</Text>
        {canDelete && !message.is_deleted ? (
          <TouchableOpacity onPress={() => onDelete?.(message)}>
            <Text style={[styles.deleteText, { color: theme.error }]}>削除</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    maxWidth: '78%',
  },
  wrapperOwn: {
    alignSelf: 'flex-end',
  },
  wrapperOther: {
    alignSelf: 'flex-start',
  },
  authorName: {
    fontSize: 12,
    marginBottom: 4,
  },
  authorNameOwn: {
    textAlign: 'right',
  },
  authorNameOther: {
    textAlign: 'left',
  },
  bubble: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ownBubbleWrap: {
    alignSelf: 'flex-end',
  },
  otherBubbleWrap: {
    alignSelf: 'flex-start',
  },
  systemBubbleWrap: {
    alignSelf: 'center',
  },
  ownBubble: {
    backgroundColor: '#1565c0',
  },
  otherBubble: {
    backgroundColor: '#f1f3f5',
  },
  body: {
    lineHeight: 20,
  },
  deletedBody: {
    fontStyle: 'italic',
    color: '#757575',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  metaRowOwn: {
    justifyContent: 'flex-end',
  },
  metaRowOther: {
    justifyContent: 'flex-start',
  },
  timeText: {
    color: '#757575',
    fontSize: 11,
  },
  deleteText: {
    color: '#c62828',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default ChatMessageBubble;
