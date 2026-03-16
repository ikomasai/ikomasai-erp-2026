/**
 * item2 緊急対応画面
 */

import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ITEM2_CALL_STATUSES } from '../constants';
import CallCard from '../components/CallCard';

/**
 * 緊急対応画面
 * @param {Object} props - プロパティ
 * @returns {JSX.Element} 画面
 */
const EmergencyDispatchScreen = ({ calls, isRefreshing, onRefresh, getResponderLabel, onOpenResponderModal, onResolveCall }) => {
  if (!calls.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>緊急呼び出しはありません。</Text>
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
          isEmergencyMode
          responderLabel={getResponderLabel(item)}
          onOpenResponderModal={onOpenResponderModal}
          onResolveCall={
            typeof onResolveCall === 'function' && item.status !== ITEM2_CALL_STATUSES.RESOLVED
              ? onResolveCall
              : undefined
          }
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

export default EmergencyDispatchScreen;
