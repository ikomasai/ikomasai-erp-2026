import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '../../../shared/components/icons';
import { useTheme } from '../../../shared/hooks/useTheme';
import { AREA_ALL } from '../constants';

/**
 * 検索・ファセット絞り込みのUIを提供するバーコンポーネント
 * カテゴリはチップ形式で複数選択可能、企画と屋台で分離表示
 */
const FilterBar = ({
    searchQuery,
    onSearchChange,
    selectedCategories,
    onToggleCategory,
    onClearCategories,
    stallCategories,
    eventCategories,
    selectedArea,
    onAreaChange,
    areas,
    buildings,
    selectedBuilding,
    onBuildingChange,
    stallAreaLetters,
    selectedStallLetter,
    onStallLetterChange,
    showFilters,
    onToggleFilters,
}) => {
    const { theme } = useTheme();
    const { width, height: SCREEN_HEIGHT } = useWindowDimensions();
    const isMobile = Platform.OS !== 'web' || width < 768;
    const [showBuildingFilter, setShowBuildingFilter] = useState(false);

    const hasFilters = selectedCategories.length > 0 ||
        selectedArea !== AREA_ALL ||
        (selectedBuilding && selectedBuilding !== 'すべて') ||
        (selectedStallLetter && selectedStallLetter !== 'すべて');

    const renderCategoryChip = (cat) => {
        const isSelected = selectedCategories.includes(cat.id);
        return (
            <TouchableOpacity
                key={cat.id}
                style={[
                    styles.chip,
                    {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: theme.borderRadius,
                    }
                ]}
                onPress={() => onToggleCategory(cat.id)}
                activeOpacity={0.7}
            >
                <Text style={[
                    styles.chipText,
                    { color: isSelected ? 'white' : theme.text }
                ]}>
                    {cat.name}
                </Text>
                {isSelected && (
                    <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 2 }} />
                )}
            </TouchableOpacity>
        );
    };

    const renderAreaChip = (areaId, areaName) => {
        const isSelected = selectedArea === areaId;
        return (
            <TouchableOpacity
                key={areaId}
                style={[
                    styles.chip,
                    {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: theme.borderRadius,
                    }
                ]}
                onPress={() => onAreaChange(areaId)}
                activeOpacity={0.7}
            >
                <Text style={[
                    styles.chipText,
                    { color: isSelected ? 'white' : theme.text }
                ]}>
                    {areaName}
                </Text>
                {isSelected && (
                    <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 2 }} />
                )}
            </TouchableOpacity>
        );
    };

    const renderBuildingChip = (building) => {
        const isSelected = selectedBuilding === building.id;
        return (
            <TouchableOpacity
                key={building.id}
                style={[
                    styles.chip,
                    {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: theme.borderRadius,
                    }
                ]}
                onPress={() => onBuildingChange(building.id)}
                activeOpacity={0.7}
            >
                <Text style={[
                    styles.chipText,
                    { color: isSelected ? 'white' : theme.text }
                ]}>
                    {building.name}
                </Text>
                {isSelected && (
                    <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 2 }} />
                )}
            </TouchableOpacity>
        );
    };

    const renderLetterChip = (letterInfo) => {
        const isSelected = selectedStallLetter === letterInfo.area_letter;
        return (
            <TouchableOpacity
                key={letterInfo.id}
                style={[
                    styles.chip,
                    {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: theme.borderRadius,
                    }
                ]}
                onPress={() => onStallLetterChange(isSelected ? 'すべて' : letterInfo.area_letter)}
                activeOpacity={0.7}
            >
                <Text style={[
                    styles.chipText,
                    { color: isSelected ? 'white' : theme.text }
                ]}>
                    {letterInfo.area_letter}
                </Text>
                {isSelected && (
                    <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 2 }} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>

            {/* 上段：検索バーとフィルター表示トグル */}
            <View style={styles.topRow}>
                <View style={[styles.searchContainer, { backgroundColor: theme.background, borderRadius: theme.borderRadius }]}>
                    <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder="キーワードで検索 (名前・団体名・エリア・建物)"
                        placeholderTextColor={theme.textSecondary}
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        autoCapitalize="none"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearButton}>
                            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity
                    style={[
                        styles.filterToggleBtn,
                        {
                            backgroundColor: (showFilters || hasFilters) ? theme.primary : theme.background,
                            borderRadius: theme.borderRadius,
                        }
                    ]}
                    onPress={onToggleFilters}
                >
                    <Ionicons
                        name="funnel-outline"
                        size={22}
                        color={(showFilters || hasFilters) ? 'white' : theme.text}
                    />
                    {hasFilters && (
                        <View style={styles.filterBadge}>
                            <Text style={styles.filterBadgeText}>{selectedCategories.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* 下段：ファセット絞り込み（トグルで表示/非表示） */}
            {showFilters && (
                <View style={[
                    styles.filtersWrapper,
                    isMobile && { maxHeight: SCREEN_HEIGHT * 0.6 }
                ]}>
                    <ScrollView 
                        style={styles.filtersScrollView}
                        contentContainerStyle={styles.filtersContainer}
                        nestedScrollEnabled={true}
                    >
                        {/* クリアボタン */}
                        {hasFilters && (
                            <TouchableOpacity
                                style={[styles.clearAllBtn, { borderColor: theme.border, borderRadius: theme.borderRadius }]}
                                onPress={() => {
                                    onClearCategories();
                                    onAreaChange(AREA_ALL);
                                    onBuildingChange('すべて');
                                    onStallLetterChange('すべて');
                                    setShowBuildingFilter(false);
                                }}
                            >
                                <Ionicons name="close" size={14} color={theme.textSecondary} />
                                <Text style={[styles.clearAllText, { color: theme.textSecondary }]}>絞り込み解除</Text>
                            </TouchableOpacity>
                        )}

                        {/* 企画カテゴリ */}
                        {eventCategories.length > 0 && (
                            <View style={styles.categorySection}>
                                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                    企画カテゴリ
                                </Text>
                                <View style={styles.chipRow}>
                                    {eventCategories.map(renderCategoryChip)}
                                </View>
                            </View>
                        )}

                        {/* 屋台カテゴリ */}
                        {stallCategories.length > 0 && (
                            <View style={styles.categorySection}>
                                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                    屋台カテゴリ
                                </Text>
                                <View style={styles.chipRow}>
                                    {stallCategories.map(renderCategoryChip)}
                                </View>
                            </View>
                        )}

                        {/* エリア絞り込み */}
                        {areas && areas.length > 0 && (
                            <View style={[styles.categorySection, { marginTop: 4 }]}>
                                <View style={styles.sectionHeaderRow}>
                                    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                        エリア（大まかな場所）
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.moreDetailBtn}
                                        onPress={() => setShowBuildingFilter(prev => !prev)}
                                    >
                                        <Text style={[styles.moreDetailText, { color: theme.primary }]}>
                                            {showBuildingFilter ? '詳細を閉じる' : 'さらに詳しく'}
                                        </Text>
                                        <Ionicons
                                            name={showBuildingFilter ? "chevron-up" : "chevron-down"}
                                            size={14}
                                            color={theme.primary}
                                        />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.chipRow}>
                                    {renderAreaChip(AREA_ALL, AREA_ALL)}
                                    {areas.map(area => renderAreaChip(area.id, area.name))}
                                </View>
                            </View>
                        )}

                        {/* 建物・屋台エリア絞り込み（詳細） */}
                        {showBuildingFilter && (
                            <View style={[styles.filtersContainer, { marginTop: 0, gap: 8 }]}>
                                {/* 建物 */}
                                {buildings && buildings.length > 0 && (
                                    <View style={[styles.categorySection, { marginTop: 0, paddingLeft: 8 }]}>
                                        <Text style={[styles.sectionLabel, { color: theme.textSecondary, fontSize: 10 }]}>
                                            建物で絞り込む
                                        </Text>
                                        <View style={styles.chipRow}>
                                            {renderBuildingChip({ id: 'すべて', name: 'すべて' })}
                                            {buildings
                                                .filter(b => selectedArea === AREA_ALL || b.area_id === selectedArea)
                                                .map(renderBuildingChip)
                                            }
                                        </View>
                                    </View>
                                )}

                                {/* 屋台エリア記号 */}
                                {stallAreaLetters && stallAreaLetters.length > 0 && (
                                    <View style={[styles.categorySection, { marginTop: 4, paddingLeft: 8 }]}>
                                        <Text style={[styles.sectionLabel, { color: theme.textSecondary, fontSize: 10 }]}>
                                            屋台エリアで絞り込む
                                        </Text>
                                        <View style={styles.chipRow}>
                                            {renderLetterChip({ id: 'all_letters', area_letter: 'すべて' })}
                                            {(() => {
                                                const seenLetters = new Set();
                                                return stallAreaLetters
                                                    .filter(l => selectedArea === AREA_ALL || l.area_id === selectedArea)
                                                    .filter(l => {
                                                        if (seenLetters.has(l.area_letter)) return false;
                                                        seenLetters.add(l.area_letter);
                                                        return true;
                                                    })
                                                    .map(renderLetterChip);
                                            })()}
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 12,
        borderBottomWidth: 1,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 44,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: '100%',
        fontSize: 16,
        ...Platform.select({
            web: { outlineStyle: 'none' }
        }),
    },
    clearButton: {
        padding: 4,
    },
    filterToggleBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    filterBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#ef4444',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    filterBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    filtersWrapper: {
        marginTop: 12,
        overflow: 'hidden',
    },
    filtersScrollView: {
        flexGrow: 0,
    },
    filtersContainer: {
        gap: 12,
        paddingBottom: 8, // 下部に少し余白を設ける
    },
    clearAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
    },
    clearAllText: {
        fontSize: 12,
    },
    categorySection: {
        gap: 6,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        marginLeft: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '500',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginRight: 4,
    },
    moreDetailBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    moreDetailText: {
        fontSize: 12,
        fontWeight: '600',
    },
});

export default FilterBar;
