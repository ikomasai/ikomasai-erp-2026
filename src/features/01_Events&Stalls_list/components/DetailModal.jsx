import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, SafeAreaView, Animated, Dimensions, TouchableWithoutFeedback, Easing } from 'react-native';
import { Ionicons } from '../../../shared/components/icons';
import { useTheme } from '../../../shared/hooks/useTheme';
import { TABS } from '../constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * 企画・屋台の詳細情報を表示するモーダルコンポーネント
 * 
 * @param {boolean} visible モーダルの表示状態
 * @param {Object} item 表示するデータオブジェクト
 * @param {Function} onClose モーダルを閉じる関数
 */
const DetailModal = ({ visible, item, onClose }) => {
    const { theme } = useTheme();
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // 表示時は一斉に開始（背景は速く、コンテンツは少し後から追うような滑らかなスライド）
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 150, // 背景フェードは速く
                    useNativeDriver: true
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 250, // スライドもキビキビと
                    easing: Easing.out(Easing.quad), // 余韻（バウンス）なし
                    useNativeDriver: true
                })
            ]).start();
        } else {
            // 非表示時は位置をリセット
            fadeAnim.setValue(0);
            slideAnim.setValue(SCREEN_HEIGHT);
        }
    }, [visible]);

    if (!item) return null;

    /**
     * アニメーション付きで閉じる
     */
    const handleClose = () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true
            }),
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 200,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true
            })
        ]).start(() => {
            onClose();
        });
    };

    const typeBadgeColor = item.itemType === TABS.STALLS ? '#f97316' : '#3b82f6';
    const typeLabel = item.itemType === TABS.STALLS ? '屋台' : '企画';
    const formatTimeToMinute = (timeValue) => {
        if (!timeValue) return '';
        const [hour = '', minute = ''] = String(timeValue).split(':');
        if (!hour || !minute) return String(timeValue);
        return `${hour}:${minute}`;
    };

    const startTimeText = formatTimeToMinute(item.start_time);
    const endTimeText = formatTimeToMinute(item.end_time);
    const hasEventTime = item.itemType === TABS.EVENTS && (item.start_time || item.end_time);
    const eventTimeText = startTimeText && endTimeText
        ? `${startTimeText} - ${endTimeText}`
        : (startTimeText || endTimeText || '設定なし');

    return (
        <Modal
            visible={visible}
            animationType="none"
            transparent={true}
            onRequestClose={handleClose}
        >
            <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback onPress={handleClose}>
                    <Animated.View style={[styles.touchableBackground, { opacity: fadeAnim }]} />
                </TouchableWithoutFeedback>
                <View style={styles.contentContainer} pointerEvents="box-none">
                    <Animated.View
                        style={[
                            styles.modalContent,
                            {
                                backgroundColor: theme.background,
                                transform: [{ translateY: slideAnim }]
                            }
                        ]}
                    >

                        {/* ヘッダーエリア */}
                        <View style={[styles.header, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                                詳細情報
                            </Text>
                            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* コンテンツエリア */}
                        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>

                            {/* タイトル部 */}
                            <View style={styles.titleSection}>
                                <Text style={[styles.mainTitle, { color: theme.text }]}>
                                    {item.displayName}
                                </Text>

                                <View style={styles.badgesWrapper}>
                                    <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor }]}>
                                        <Text style={styles.badgeText}>{typeLabel}</Text>
                                    </View>
                                    <View style={styles.categoryBadge}>
                                        <Text style={styles.categoryText}>{item.categoryName || 'カテゴリなし'}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* 詳細情報部 */}
                            <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>

                                <View style={styles.infoRow}>
                                    <View style={styles.iconContainer}>
                                        <Ionicons name="location" size={20} color={theme.primary} />
                                    </View>
                                    <View style={styles.infoTextContainer}>
                                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>場所</Text>
                                        <Text style={[styles.infoValue, { color: theme.text }]}>{item.locationName || '設定なし'}</Text>
                                    </View>
                                </View>

                                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                                <View style={styles.infoRow}>
                                    <View style={styles.iconContainer}>
                                        <Ionicons name="people" size={20} color={theme.primary} />
                                    </View>
                                    <View style={styles.infoTextContainer}>
                                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>団体名</Text>
                                        <Text style={[styles.infoValue, { color: theme.text }]}>{item.groupName || '設定なし'}</Text>
                                    </View>
                                </View>

                                {hasEventTime && (
                                    <>
                                        <View style={[styles.divider, { backgroundColor: theme.border }]} />

                                        <View style={styles.infoRow}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="time" size={20} color={theme.primary} />
                                            </View>
                                            <View style={styles.infoTextContainer}>
                                                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>開催時間</Text>
                                                <Text style={[styles.infoValue, { color: theme.text }]}>{eventTimeText}</Text>
                                            </View>
                                        </View>
                                    </>
                                )}

                            </View>

                            {/* 説明文エリア */}
                            <View style={styles.descriptionSection}>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>説明・詳細</Text>
                                <View style={[styles.descriptionBox, { backgroundColor: theme.surface }]}>
                                    {item.description ? (
                                        <Text style={[styles.descriptionText, { color: theme.text }]}>
                                            {item.description}
                                        </Text>
                                    ) : (
                                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                                            説明文は登録されていません。
                                        </Text>
                                    )}
                                </View>
                            </View>

                        </ScrollView>

                        {/* フッターエリア (閉じるボタン) */}
                        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
                            <TouchableOpacity
                                style={[styles.fullWidthButton, { backgroundColor: theme.primary }]}
                                onPress={handleClose}
                            >
                                <Text style={styles.buttonText}>閉じる</Text>
                            </TouchableOpacity>
                        </View>

                    </Animated.View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
    },
    touchableBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: '80%', // 以前の85%より少し短くし、上に行きすぎないように調整
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 4,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    titleSection: {
        marginBottom: 24,
    },
    mainTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    badgesWrapper: {
        flexDirection: 'row',
        gap: 8,
    },
    typeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    categoryBadge: {
        backgroundColor: '#e5e7eb', // gray-200
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    categoryText: {
        color: '#374151', // gray-700
        fontSize: 14,
        fontWeight: '500',
    },
    infoCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        marginBottom: 24,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0, 122, 255, 0.1)', // primaryの薄い版を想定
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoTextContainer: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '500',
    },
    divider: {
        height: 1,
        marginVertical: 12,
        marginLeft: 48, // アイコンの幅分インデント
    },
    descriptionSection: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    descriptionBox: {
        padding: 16,
        borderRadius: 12,
        minHeight: 120,
    },
    descriptionText: {
        fontSize: 15,
        lineHeight: 24,
    },
    emptyText: {
        fontSize: 15,
        fontStyle: 'italic',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    fullWidthButton: {
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default DetailModal;
