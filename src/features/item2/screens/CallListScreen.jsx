/**
 * item2 対応一覧画面
 */

import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ITEM2_CALL_TYPES } from '../constants';
import CallCard from '../components/CallCard';

/**
 * 対応一覧画面
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} 画面
 */
const CallListScreen = ({
  calls,
  isRefreshing,
  onRefresh,
  getChatAssigneeLabel,
  getResponderLabel,
  onOpenChat,
  onOpenAssigneeSettingModal,
  onOpenChatAssigneeModal,
  onOpenResponderModal,
}) => {
  if (!calls.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>呼び出しはまだありません。</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={calls}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <CallCard
          callData={item}
          isEmergencyMode={item.call_type === ITEM2_CALL_TYPES.EMERGENCY}
          chatAssigneeLabel={getChatAssigneeLabel(item)}
          responderLabel={getResponderLabel(item)}
          onOpenChat={onOpenChat}
          onOpenAssigneeSettingModal={onOpenAssigneeSettingModal}
          onOpenChatAssigneeModal={onOpenChatAssigneeModal}
          onOpenResponderModal={onOpenResponderModal}
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#616161',
    fontSize: 15,
  },
});

export default CallListScreen;
