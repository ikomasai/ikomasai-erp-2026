/**
 * オフライン警告バナーコンポーネント
 * ネットワーク接続が切断された場合に画面上部に警告を表示する
 */

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

/** ネットワーク状態ポーリング間隔（ミリ秒） */
const POLL_INTERVAL_MS = 5000;

/**
 * オフライン警告バナー
 * Web: navigator.onLine + イベントリスナー
 * Native: 定期的なfetchによるネットワーク確認
 * @param {Object} props - プロパティ
 * @param {Object} [props.style] - 追加スタイル
 * @returns {JSX.Element|null} オフライン時にバナーを表示、オンライン時はnull
 */
const OfflineBanner = ({ style }) => {
  /** オフライン状態 */
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      /**
       * Web環境: navigator.onLine + online/offlineイベント
       */
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);

      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    /**
     * Native環境: 定期的なネットワーク確認
     * @react-native-community/netinfo を使わずにシンプルに実装
     */
    let isMounted = true;
    const checkNetwork = async () => {
      try {
        // Supabaseのヘルスチェック等、軽量なリクエストで確認
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (isMounted) setIsOffline(false);
      } catch {
        if (isMounted) setIsOffline(true);
      }
    };

    checkNetwork();
    const intervalId = setInterval(checkNetwork, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.bannerText}>
        {'\u26A0\uFE0F'} オフラインです。入力内容は自動保存されます。
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
});

export default OfflineBanner;
