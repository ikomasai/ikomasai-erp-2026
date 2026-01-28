import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Platform } from 'react-native';
import { sendNotification } from '../../../shared/services/sendNotification';
import { NOTIFICATION_TYPES } from '../constants/notificationType';
import { USER_ROLES } from '../../../shared/constants/userRoles';

/**
 * 通知機能テスト画面
 * 通知の送信と動作確認を行うための開発用画面
 * 
 * @returns {JSX.Element}
 */
export const NotificationTestScreen = () => {
  const [selectedType, setSelectedType] = useState(NOTIFICATION_TYPES.INFO);
  const [selectedRole, setSelectedRole] = useState(USER_ROLES.STAFF);
  const [message, setMessage] = useState('これはテスト通知です');
  const [title, setTitle] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState([]);

  const handleSendNotification = async () => {
    if (!message.trim()) {
      Alert.alert('エラー', 'メッセージを入力してください');
      return;
    }

    try {
      setIsSending(true);
      
      const result = await sendNotification({
        type: selectedType,
        message: message.trim(),
        recipientRoles: selectedRole,
        title: title.trim() || undefined,
        deepLink: '/notifications',
        metadata: {
          testMode: true,
          sentAt: new Date().toISOString(),
        },
      });

      if (result.success) {
        Alert.alert('成功', '通知を送信しました！');
        setHistory([
          {
            id: result.notificationId,
            type: selectedType,
            message: message.trim(),
            role: selectedRole,
            timestamp: new Date().toLocaleTimeString('ja-JP'),
          },
          ...history,
        ]);
        setMessage('');
      } else {
        Alert.alert('エラー', `送信に失敗しました: ${result.error}`);
      }
    } catch (error) {
      Alert.alert('エラー', `送信に失敗しました: ${error.message}`);
      console.error('通知送信エラー:', error);
    } finally {
      setIsSending(false);
    }
  };

  const quickTests = [
    {
      label: '情報',
      icon: 'ℹ️',
      type: NOTIFICATION_TYPES.INFO,
      message: '新しい情報があります',
      bgColor: '#3B82F6',
    },
    {
      label: '成功',
      icon: '✅',
      type: NOTIFICATION_TYPES.SUCCESS,
      message: '処理が正常に完了しました',
      bgColor: '#10B981',
    },
    {
      label: '警告',
      icon: '⚠️',
      type: NOTIFICATION_TYPES.WARNING,
      message: '注意が必要な事項があります',
      bgColor: '#F59E0B',
    },
    {
      label: 'エラー',
      icon: '❌',
      type: NOTIFICATION_TYPES.ERROR,
      message: 'エラーが発生しました',
      bgColor: '#EF4444',
    },
  ];

  const handleQuickTest = async (test) => {
    setSelectedType(test.type);
    setMessage(test.message);
    
    try {
      const result = await sendNotification({
        type: test.type,
        message: test.message,
        recipientRoles: selectedRole,
      });

      if (result.success) {
        Alert.alert('送信完了', `${test.label}を送信しました`);
      }
    } catch (error) {
      Alert.alert('エラー', error.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🔔 通知機能テスト</Text>
          <Text style={styles.headerSubtitle}>
            通知の送信と動作を確認できます
          </Text>
        </View>

        {/* クイックテスト */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⚡ クイックテスト</Text>
          <View style={styles.quickTestGrid}>
            {quickTests.map((test, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleQuickTest(test)}
                style={[styles.quickTestButton, { backgroundColor: test.bgColor }]}
              >
                <Text style={styles.quickTestIcon}>{test.icon}</Text>
                <Text style={styles.quickTestLabel}>{test.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* カスタム通知作成 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>✏️ カスタム通知</Text>

          {/* 通知タイプ選択 */}
          <View style={styles.section}>
            <Text style={styles.label}>通知タイプ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Object.entries(NOTIFICATION_TYPES).map(([key, value]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSelectedType(value)}
                  style={[
                    styles.typeButton,
                    selectedType === value && styles.typeButtonActive
                  ]}
                >
                  <Text style={[
                    styles.typeButtonText,
                    selectedType === value && styles.typeButtonTextActive
                  ]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ロール選択 */}
          <View style={styles.section}>
            <Text style={styles.label}>送信先ロール</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Object.entries(USER_ROLES).map(([key, value]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSelectedRole(value)}
                  style={[
                    styles.roleButton,
                    selectedRole === value && styles.roleButtonActive
                  ]}
                >
                  <Text style={[
                    styles.roleButtonText,
                    selectedRole === value && styles.roleButtonTextActive
                  ]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* タイトル入力 */}
          <View style={styles.section}>
            <Text style={styles.label}>タイトル（任意）</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="通知のタイトルを入力"
              style={styles.input}
            />
          </View>

          {/* メッセージ入力 */}
          <View style={styles.section}>
            <Text style={styles.label}>メッセージ</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="通知メッセージを入力"
              multiline
              numberOfLines={4}
              style={[styles.input, styles.textArea]}
            />
          </View>

          {/* 送信ボタン */}
          <TouchableOpacity
            onPress={handleSendNotification}
            disabled={isSending}
            style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>
              {isSending ? '送信中...' : '📤 通知を送信'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 送信履歴 */}
        {history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📋 送信履歴</Text>
            {history.map((item, index) => {
              const typeColors = {
                [NOTIFICATION_TYPES.INFO]: { border: '#3B82F6', bg: '#EFF6FF' },
                [NOTIFICATION_TYPES.SUCCESS]: { border: '#10B981', bg: '#F0FDF4' },
                [NOTIFICATION_TYPES.WARNING]: { border: '#F59E0B', bg: '#FFFBEB' },
                [NOTIFICATION_TYPES.ERROR]: { border: '#EF4444', bg: '#FEF2F2' },
              };
              
              const colors = typeColors[item.type] || { border: '#6B7280', bg: '#F9FAFB' };
              
              return (
                <View
                  key={index}
                  style={[
                    styles.historyItem,
                    { borderLeftColor: colors.border, backgroundColor: colors.bg }
                  ]}
                >
                  <View style={styles.historyHeader}>
                    <View style={styles.historyType}>
                      <Text style={styles.historyTypeText}>{item.type}</Text>
                    </View>
                    <Text style={styles.historyTime}>{item.timestamp}</Text>
                  </View>
                  <Text style={styles.historyMessage}>{item.message}</Text>
                  <View style={styles.historyFooter}>
                    <Text style={styles.historyRole}>
                      👤 送信先: <Text style={styles.historyRoleBold}>{item.role}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 使い方ガイド */}
        <View style={styles.guide}>
          <Text style={styles.guideTitle}>💡 使い方ガイド</Text>
          <View style={styles.guideItem}>
            <Text style={styles.guideNumber}>1.</Text>
            <Text style={styles.guideText}>
              クイックテストボタンで素早くテスト通知を送信
            </Text>
          </View>
          <View style={styles.guideItem}>
            <Text style={styles.guideNumber}>2.</Text>
            <Text style={styles.guideText}>
              通知タイプとロールを選択してカスタム通知を作成
            </Text>
          </View>
          <View style={styles.guideItem}>
            <Text style={styles.guideNumber}>3.</Text>
            <Text style={styles.guideText}>
              送信した通知は画面上部の通知センターで確認できます
            </Text>
          </View>
          <View style={styles.guideItem}>
            <Text style={styles.guideNumber}>4.</Text>
            <Text style={styles.guideText}>
              ブラウザ通知の権限を許可すると、OS通知も表示されます
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E0E7FF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  quickTestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickTestButton: {
    minWidth: 120,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  quickTestIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  quickTestLabel: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  typeButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  typeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  typeButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  roleButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  roleButtonActive: {
    backgroundColor: '#10B981',
  },
  roleButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  roleButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyItem: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyType: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  historyTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111827',
  },
  historyTime: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  historyMessage: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    marginBottom: 8,
  },
  historyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyRole: {
    fontSize: 12,
    color: '#6B7280',
  },
  historyRoleBold: {
    fontWeight: '600',
  },
  guide: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 16,
  },
  guideItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  guideNumber: {
    color: '#3B82F6',
    fontWeight: 'bold',
    marginRight: 8,
    fontSize: 14,
  },
  guideText: {
    flex: 1,
    fontSize: 14,
    color: '#1E3A8A',
  },
});
