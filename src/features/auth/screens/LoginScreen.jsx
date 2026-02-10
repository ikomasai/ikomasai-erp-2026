/**
 * ログイン画面
 * メールアドレスとパスワードでログインする。
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../shared/contexts/AuthContext.js';
import { useTheme } from '../../../shared/hooks/useTheme';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const { theme } = useTheme();

  const handleLogin = async () => {
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('メールアドレスとパスワードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const { success } = await login(email.trim(), password);
      if (!success) {
        setErrorMessage('メールアドレスまたはパスワードが正しくありません。');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('ログイン処理でエラーが発生:', error);
      setErrorMessage('ログイン処理中にエラーが発生しました。');
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.backdropArea} pointerEvents="none">
        <View style={[styles.backdropCircleA, { backgroundColor: `${theme.primary}20` }]} />
        <View style={[styles.backdropCircleB, { backgroundColor: `${theme.accent || theme.secondary}18` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.loginCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.brandRow}>
            <View
              style={[
                styles.brandIcon,
                {
                  backgroundColor: `${theme.primary}18`,
                  borderColor: `${theme.primary}50`,
                },
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={24} color={theme.primary} />
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={[styles.brandTitle, { color: theme.text }]}>生駒祭 ERP</Text>
              <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
                企画管理部統合システム 2026
              </Text>
            </View>
          </View>

          <Text style={[styles.heading, { color: theme.text }]}>ログイン</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            割り当てられたアカウントでログインしてください。
          </Text>

          {errorMessage ? (
            <View
              style={[
                styles.errorContainer,
                {
                  backgroundColor: `${theme.error}14`,
                  borderColor: `${theme.error}4A`,
                },
              ]}
            >
              <Ionicons name="warning-outline" size={16} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>メールアドレス</Text>
            <View
              style={[
                styles.inputShell,
                {
                  backgroundColor: theme.surfaceSecondary || theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="example@example.com"
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>パスワード</Text>
            <View
              style={[
                styles.inputShell,
                {
                  backgroundColor: theme.surfaceSecondary || theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="パスワードを入力"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: isSubmitting ? theme.textSecondary : theme.primary,
                opacity: isSubmitting ? 0.7 : 1,
              },
            ]}
            onPress={handleLogin}
            disabled={isSubmitting}
            activeOpacity={0.9}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                <Text style={styles.buttonText}>ログインする</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[styles.footerInfo, { borderTopColor: theme.divider || theme.border }]}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              アカウント発行や初期パスワードは管理者へお問い合わせください。
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdropArea: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backdropCircleA: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -120,
    left: -80,
  },
  backdropCircleB: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -120,
    right: -60,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  heading: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '800',
  },
  description: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 20,
  },
  errorContainer: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  inputGroup: {
    marginTop: 14,
    gap: 7,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  button: {
    marginTop: 18,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  footerInfo: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
  },
});

export default LoginScreen;
