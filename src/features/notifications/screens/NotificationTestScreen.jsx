import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { sendNotification } from '../../../shared/services/sendNotification';
import { NOTIFICATION_TYPES } from '../constants/notificationType';
import { supabase } from '../../../services/supabase/client';

/**
 * 通知機能テスト画面
 * 開発・テスト用の通知送信画面
 */
export const NotificationTestScreen = () => {
  const [availableRoles, setAvailableRoles] = useState([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [notificationType, setNotificationType] = useState(NOTIFICATION_TYPES.INFO);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState(null);

  /**
   * Supabaseのrolesテーブルから全ロールを取得
   */
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setIsLoadingRoles(true);
        const { data, error } = await supabase
          .from('roles')
          .select('id, name, display_name')
          .order('name');

        if (error) {
          console.error('ロール取得エラー:', error);
          setResult({ success: false, message: `ロール取得エラー: ${error.message}` });
        } else {
          setAvailableRoles(data || []);
        }
      } catch (error) {
        console.error('ロール取得処理エラー:', error);
        setResult({ success: false, message: `ロール取得エラー: ${error.message}` });
      } finally {
        setIsLoadingRoles(false);
      }
    };

    fetchRoles();
  }, []);

  /**
   * ロールの選択/解除を切り替え
   */
  const toggleRole = (roleName) => {
    setSelectedRoles(prev => 
      prev.includes(roleName) 
        ? prev.filter(r => r !== roleName)
        : [...prev, roleName]
    );
  };

  /**
   * 通知を送信
   */
  const handleSendNotification = async () => {
    if (selectedRoles.length === 0) {
      setResult({ success: false, message: '送信先ロールを選択してください' });
      return;
    }

    if (!message.trim()) {
      setResult({ success: false, message: 'メッセージを入力してください' });
      return;
    }

    try {
      setIsSending(true);
      setResult(null);

      const response = await sendNotification({
        type: notificationType,
        message: message.trim(),
        recipientRoles: selectedRoles, // rolesテーブルのnameを直接指定
        title: title.trim() || undefined,
      });

      if (response.success) {
        setResult({ 
          success: true, 
          message: `✅ 通知送信成功！ID: ${response.notificationId}` 
        });
        // フォームをリセット
        setMessage('');
        setTitle('');
      } else {
        setResult({ 
          success: false, 
          message: `❌ 送信失敗: ${response.error}` 
        });
      }
    } catch (error) {
      setResult({ 
        success: false, 
        message: `❌ エラー: ${error.message}` 
      });
    } finally {
      setIsSending(false);
    }
  };

  /**
   * 通知タイプの選択肢
   */
  const notificationTypes = [
    { value: NOTIFICATION_TYPES.INFO, label: 'ℹ️ 情報', color: '#3B82F6' },
    { value: NOTIFICATION_TYPES.SUCCESS, label: '✅ 成功', color: '#10B981' },
    { value: NOTIFICATION_TYPES.WARNING, label: '⚠️ 警告', color: '#F59E0B' },
    { value: NOTIFICATION_TYPES.ERROR, label: '❌ エラー', color: '#EF4444' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.pageTitle}>🔔 通知送信テスト</Text>
        <Text style={styles.description}>
          Supabaseのrolesテーブルから取得したロールに通知を送信できます
        </Text>

        {/* ロール選択 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>送信先ロール（複数選択可）</Text>
          {isLoadingRoles ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.loadingText}>ロール取得中...</Text>
            </View>
          ) : (
            <View style={styles.roleList}>
              {availableRoles.map(role => (
                <TouchableOpacity
                  key={role.id}
                  style={[
                    styles.roleButton,
                    selectedRoles.includes(role.name) && styles.roleButtonSelected
                  ]}
                  onPress={() => toggleRole(role.name)}
                >
                  <Text style={[
                    styles.roleButtonText,
                    selectedRoles.includes(role.name) && styles.roleButtonTextSelected
                  ]}>
                    {selectedRoles.includes(role.name) ? '✓ ' : ''}{role.display_name || role.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {selectedRoles.length > 0 && (
            <Text style={styles.selectedInfo}>
              選択中: {selectedRoles.join(', ')}
            </Text>
          )}
        </View>

        {/* 通知タイプ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通知タイプ</Text>
          <View style={styles.typeList}>
            {notificationTypes.map(type => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeButton,
                  notificationType === type.value && { 
                    backgroundColor: type.color,
                    borderColor: type.color 
                  }
                ]}
                onPress={() => setNotificationType(type.value)}
              >
                <Text style={[
                  styles.typeButtonText,
                  notificationType === type.value && styles.typeButtonTextSelected
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* タイトル */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>タイトル（省略可）</Text>
          <TextInput
            style={styles.input}
            placeholder="省略時は通知タイプから自動生成"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* メッセージ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>メッセージ *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="通知メッセージを入力"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* 送信ボタン */}
        <TouchableOpacity
          style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
          onPress={handleSendNotification}
          disabled={isSending}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? '送信中...' : '📤 通知を送信'}
          </Text>
        </TouchableOpacity>

        {/* 結果表示 */}
        {result && (
          <View style={[
            styles.result,
            result.success ? styles.resultSuccess : styles.resultError
          ]}>
            <Text style={styles.resultText}>{result.message}</Text>
          </View>
        )}
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
    padding: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  loadingText: {
    marginLeft: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  roleList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
  },
  roleButtonSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  roleButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  roleButtonTextSelected: {
    color: '#FFFFFF',
  },
  selectedInfo: {
    marginTop: 8,
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
  typeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
  },
  typeButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  typeButtonTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px rgba(99, 102, 241, 0.3)',
      },
      default: {
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 5,
      },
    }),
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  result: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  resultSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  resultError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
