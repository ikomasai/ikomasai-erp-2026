import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, SafeAreaView, Animated, Dimensions, TouchableWithoutFeedback, Easing, useWindowDimensions } from 'react-native';
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
    const { width: windowWidth } = useWindowDimensions();
    const isMobile = windowWidth < 600; // 600px未満をスマホ表示（縦並び）とする


    /**
     * 数字を等幅（tabular-nums）で表示し、コロンの垂直位置を微調整するコンポーネント
     */
    const FormattedTime = ({ text, style }) => {
        if (!text || typeof text !== 'string') return null;
        
        // 時刻（HH:mm）が含まれる場合、分割してコロンの高さを微調整
        if (text.includes(':')) {
            const parts = text.split(':');
            return (
                <View style={[styles.tabularRow, { alignItems: 'center' }]}>
                    <Text style={[style, styles.tabularNums, { includeFontPadding: false }]}>{parts[0]}</Text>
                    <Text style={[style, styles.tabularNums, { paddingBottom: 1, includeFontPadding: false, textAlignVertical: 'center' }]}>:</Text>
                    <Text style={[style, styles.tabularNums, { includeFontPadding: false }]}>{parts[1]}</Text>
                </View>
            );
        }

        return <Text style={[style, styles.tabularNums, { includeFontPadding: false }]}>{text}</Text>;
    };

    /**
     * ラベル付きの時刻（例：前 09:30 〜）を等幅で表示するコンポーネント
     */
    const FormattedLabelTime = ({ text, style }) => {
        if (!text || typeof text !== 'string') return null;
        
        // 数字部分（時刻）を抽出して等幅にするため、単一のTextとして描画しつつスタイル適用
        // React NativeではネストしたTextに一部のスタイルが引き継がれる
        return (
            <Text style={[style, styles.tabularNums, { includeFontPadding: false }]}>
                {text}
            </Text>
        );
    };

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

    /**
     * 時刻を HH:mm 表記に整形する
     * @param {string|null} timeValue - 元時刻
     * @returns {string} 表示用時刻
     */
    const formatTimeToMinute = (timeValue) => {
        if (!timeValue) return '';
        const [hour = '', minute = ''] = String(timeValue).split(':');
        if (!hour || !minute) return String(timeValue);
        return `${hour}:${minute}`;
    };

    /**
     * 日付を表示用に整形する
     * @param {string|null} dateValue - YYYY-MM-DD
     * @returns {string} 表示用日付
     */
    const formatDateLabel = (dateValue) => {
        if (!dateValue) {
            return '';
        }
        const [yearText = '', monthText = '', dayText = ''] = String(dateValue).split('-');
        if (!yearText || !monthText || !dayText) {
            return String(dateValue);
        }
        const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
        if (Number.isNaN(date.getTime())) {
            return String(dateValue);
        }
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            weekday: 'short',
        });
    };

    /**
     * 開催日程の行配列を生成する
     * @param {Object} sourceItem - 対象データ
     * @returns {Array<{dateLabel: string, timeLabel: string, timeKey: string}>} 日程行
     */
    const buildScheduleRows = (sourceItem) => {
        /** 日付配列 */
        const scheduleDates = Array.isArray(sourceItem?.schedule_dates)
            ? sourceItem.schedule_dates
            : Array.isArray(sourceItem?.source_detail?.schedule_dates)
                ? sourceItem.source_detail.schedule_dates
                : [];
        /** 開始時刻配列 */
        const scheduleStartTimes = Array.isArray(sourceItem?.schedule_start_times)
            ? sourceItem.schedule_start_times
            : Array.isArray(sourceItem?.source_detail?.schedule_start_times)
                ? sourceItem.source_detail.schedule_start_times
                : [];
        /** 終了時刻配列 */
        const scheduleEndTimes = Array.isArray(sourceItem?.schedule_end_times)
            ? sourceItem.schedule_end_times
            : Array.isArray(sourceItem?.source_detail?.schedule_end_times)
                ? sourceItem.source_detail.schedule_end_times
                : [];

        /** 配列から生成できる件数 */
        const slotCount = Math.min(scheduleDates.length, scheduleStartTimes.length, scheduleEndTimes.length);

        if (slotCount > 0) {
            return Array.from({ length: slotCount }, (_, index) => {
                /** 開始時刻 */
                const startText = formatTimeToMinute(scheduleStartTimes[index]);
                /** 終了時刻 */
                const endText = formatTimeToMinute(scheduleEndTimes[index]);
                /** 時間ラベル */
                const timeLabel = startText && endText
                    ? `${startText} - ${endText}`
                    : (startText || endText || '設定なし');

                /** オプション時間 */
                const entryLabels = Array.isArray(sourceItem?.schedule_entry_labels) ? sourceItem.schedule_entry_labels : [];
                const entryStarts = Array.isArray(sourceItem?.schedule_entry_start_times) ? sourceItem.schedule_entry_start_times : [];
                const exitLabels = Array.isArray(sourceItem?.schedule_exit_labels) ? sourceItem.schedule_exit_labels : [];
                const exitEnds = Array.isArray(sourceItem?.schedule_exit_end_times) ? sourceItem.schedule_exit_end_times : [];

                const entryLabel = entryLabels[index] || '';
                const entryStartText = formatTimeToMinute(entryStarts[index]);
                const exitLabel = exitLabels[index] || '';
                const exitEndText = formatTimeToMinute(exitEnds[index]);

                return {
                    dateValue: scheduleDates[index],
                    dateLabel: formatDateLabel(scheduleDates[index]),
                    timeLabel,
                    entryText: entryStartText && startText ? `${entryLabel || '前'} ${entryStartText} \u301c` : '',
                    exitText: exitEndText && endText ? `\u301c ${exitEndText} ${exitLabel || '後'}` : '',
                    timeKey: `${startText}_${endText}`,
                };
            });
        }

        if (sourceItem?.schedule_date || sourceItem?.start_time || sourceItem?.end_time) {
            /** 単発開始時刻 */
            const startText = formatTimeToMinute(sourceItem.start_time);
            /** 単発終了時刻 */
            const endText = formatTimeToMinute(sourceItem.end_time);
            /** 時間ラベル */
            const timeLabel = startText && endText
                ? `${startText} - ${endText}`
                : (startText || endText || '設定なし');

            const entryLabel = sourceItem?.schedule_entry_labels?.[0] || sourceItem?.schedule_entry_label || '';
            const entryStartText = formatTimeToMinute(sourceItem?.schedule_entry_start_times?.[0] || sourceItem?.entry_start_time);
            const exitLabel = sourceItem?.schedule_exit_labels?.[0] || sourceItem?.schedule_exit_label || '';
            const exitEndText = formatTimeToMinute(sourceItem?.schedule_exit_end_times?.[0] || sourceItem?.exit_end_time);

            return [
                {
                    dateValue: sourceItem.schedule_date,
                    dateLabel: formatDateLabel(sourceItem.schedule_date),
                    timeLabel,
                    entryText: entryStartText && startText ? `${entryLabel || '前'} ${entryStartText} \u301c` : '',
                    exitText: exitEndText && endText ? `\u301c ${exitEndText} ${exitLabel || '後'}` : '',
                    timeKey: `${startText}_${endText}`,
                }
            ];
        }

        return [];
    };

    const startTimeText = formatTimeToMinute(item.start_time);
    const endTimeText = formatTimeToMinute(item.end_time);
    const hasEventTime = item.itemType === TABS.EVENTS && (item.start_time || item.end_time);
    const eventTimeBaseText = startTimeText && endTimeText
        ? `${startTimeText} - ${endTimeText}`
        : (startTimeText || endTimeText || '設定なし');
    /** 開催日程行 */
    const scheduleRows = item.itemType === TABS.EVENTS ? buildScheduleRows(item) : [];
    /** 日程表示が可能か */
    const hasScheduleRows = scheduleRows.length > 0 || hasEventTime;

    /**
     * YYYY-MM-DD を M月D日 へ整形する
     * @param {string} dateValue - 日付文字列
     * @returns {string} 表示用の日付
     */
    const formatDateShortLabel = (dateValue) => {
        if (!dateValue) {
            return '日付未設定';
        }

        const [yearText = '', monthText = '', dayText = ''] = String(dateValue).split('-');
        if (!yearText || !monthText || !dayText) {
            return String(dateValue);
        }

        const monthNumber = Number(monthText);
        const dayNumber = Number(dayText);
        if (Number.isNaN(monthNumber) || Number.isNaN(dayNumber)) {
            return String(dateValue);
        }

        const dateObject = new Date(Number(yearText), monthNumber - 1, dayNumber);
        if (Number.isNaN(dateObject.getTime())) {
            return `${monthNumber}月${dayNumber}日`;
        }

        const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
        const weekdayLabel = WEEKDAY_LABELS[dateObject.getDay()] || '';

        return `${monthNumber}月${dayNumber}日（${weekdayLabel}）`;
    };

    /**
     * 開催日程表示行を生成する
     * @returns {Array<{dateText: string, timeText: string}>} 表示行
     */
    const buildScheduleDisplayRows = () => {
        if (scheduleRows.length === 0) {
            return hasEventTime
                ? [{ dateText: '日付未設定', timeText: eventTimeBaseText }]
                : [];
        }

        /** schedule_rows ベースの日程行 */
        const mappedRows = scheduleRows.map((row) => ({
            dateText: formatDateShortLabel(row.dateValue),
            timeText: row.timeLabel || '設定なし',
            entryText: row.entryText,
            exitText: row.exitText,
        }));

        return mappedRows;
    };

    /** 開催日程表示行 */
    const scheduleDisplayRows = buildScheduleDisplayRows();

    /**
     * 時間レンジ文字列を開始/終了に分解する
     * @param {string} timeText - 時間表示文字列
     * @returns {{startText: string, endText: string, hasRange: boolean}} 分解結果
     */
    const splitTimeRangeText = (timeText) => {
        const parts = String(timeText || '').split(' - ');
        if (parts.length === 2) {
            return {
                startText: parts[0] || '',
                endText: parts[1] || '',
                hasRange: true,
            };
        }
        return {
            startText: String(timeText || ''),
            endText: '',
            hasRange: false,
        };
    };

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

                                {hasScheduleRows && (
                                    <>
                                        <View style={[styles.divider, { backgroundColor: theme.border }]} />

                                        <View style={styles.infoRow}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="calendar" size={20} color={theme.primary} />
                                            </View>
                                            <View style={styles.infoTextContainer}>
                                                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>開催日程</Text>
                                                {scheduleDisplayRows.map((row, index) => (
                                                    <View key={`${row.dateText}_${row.timeText}_${index}`} style={styles.scheduleRowContainer}>
                                                        <Text style={[styles.scheduleDateText, { color: theme.text }]}>
                                                            {row.dateText}
                                                        </Text>
                                                        <View style={styles.scheduleTimeContent}>
                                                            {(() => {
                                                                const timeRange = splitTimeRangeText(row.timeText);
                                                                return (
                                                                    <View style={styles.scheduleTimeRangeContainer}>
                                                                        <FormattedTime text={timeRange.startText} style={[styles.scheduleTimeStartText, { color: theme.text }]} />
                                                                        <Text style={[styles.scheduleTimeDashText, { color: theme.text }]}>
                                                                            {timeRange.hasRange ? '-' : ''}
                                                                        </Text>
                                                                        <FormattedTime text={timeRange.endText} style={[styles.scheduleTimeEndText, { color: theme.text }]} />
                                                                    </View>
                                                                );
                                                            })()}
                                                            {(row.entryText || row.exitText) ? (
                                                                <View style={[
                                                                    styles.optionalTimesContainer, 
                                                                    isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }
                                                                ]}>
                                                                    {row.entryText ? (
                                                                        <FormattedLabelTime text={row.entryText} style={[styles.optionalTimeText, { color: theme.textSecondary }]} />
                                                                    ) : null}
                                                                    {!isMobile && row.entryText && row.exitText ? (
                                                                        <Text style={[styles.optionalTimeText, { color: theme.textSecondary }]}>
                                                                            ／
                                                                        </Text>
                                                                    ) : null}
                                                                    {row.exitText ? (
                                                                        <FormattedLabelTime text={row.exitText} style={[styles.optionalTimeText, { color: theme.textSecondary }]} />
                                                                    ) : null}
                                                                </View>
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                ))}
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
    scheduleRowContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    scheduleTimeContent: {
        flex: 1,
    },
    optionalTimeText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 18,
    },
    optionalTimesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 2,
    },
    scheduleDateText: {
        fontSize: 16,
        fontWeight: '500',
        width: 114,
        marginRight: 8,
    },
    scheduleTimeRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scheduleTimeStartText: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'left',
    },
    scheduleTimeDashText: {
        fontSize: 16,
        fontWeight: '500',
        marginHorizontal: 8,
        textAlign: 'center',
    },
    scheduleTimeEndText: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'left',
    },
    tabularNums: {
        fontVariant: ['tabular-nums'],
    },
    tabularRow: {
        flexDirection: 'row',
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
