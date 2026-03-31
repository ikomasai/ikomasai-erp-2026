import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { getSupabaseClient } from '../../../services/supabase/client';
import { TABS, SORT_OPTIONS } from '../constants';

const katakanaToHiragana = (value) => {
    // ァ(30A1)からン(30F3)、ヴ(30F4)、ヵヶ(30F5, 30F6)までをカバー
    return (value || '').replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
};

const normalizeSearchText = (value) => {
    if (!value) return '';
    const normalized = value
        .normalize('NFKC') // 半角カタカナを全角に、全角英数を半角にする
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

    return katakanaToHiragana(normalized);
};

const getEventDisplaySchedule = (eventItem) => {
    const scheduleDates = Array.isArray(eventItem.schedule_dates) ? eventItem.schedule_dates : [];
    const scheduleStartTimes = Array.isArray(eventItem.schedule_start_times) ? eventItem.schedule_start_times : [];
    const scheduleEndTimes = Array.isArray(eventItem.schedule_end_times) ? eventItem.schedule_end_times : [];
    const slotCount = Math.min(scheduleDates.length, scheduleStartTimes.length, scheduleEndTimes.length);

    if (slotCount <= 0) {
        return {
            startTime: null,
            endTime: null,
            scheduleCount: 0,
        };
    }

    return {
        startTime: scheduleStartTimes[0] || null,
        endTime: scheduleEndTimes[0] || null,
        scheduleCount: slotCount,
    };
};

const calculatePrefixPriorityScore = (item, tokens) => {
    const fields = ['displayName', 'displayNameKana', 'groupName', 'groupNameKana', 'categoryName', 'areaName', 'areaNameKana', 'buildingName', 'buildingNameKana', 'locationName'];
    const FIELD_WEIGHTS = {
        displayName: 60,
        displayNameKana: 56,
        groupName: 28,
        groupNameKana: 26,
        categoryName: 18,
        areaName: 18,
        areaNameKana: 18,
        buildingName: 18,
        buildingNameKana: 18,
        locationName: 14,
    };

    return tokens.reduce((total, token) => {
        const tokenScore = fields.reduce((maxFieldScore, field) => {
            const value = item._search[field] || '';
            if (!value.includes(token)) return maxFieldScore;

            const baseWeight = FIELD_WEIGHTS[field] || 0;
            if (value.startsWith(token)) {
                return Math.max(maxFieldScore, baseWeight + 20);
            }

            return Math.max(maxFieldScore, baseWeight);
        }, 0);

        return total + tokenScore;
    }, 0);
};

/**
 * Supabaseから提供されるItem1データ（屋台・企画）を取得し、フィルタリング・ソートを行うフック
 *
 * @param {string} tabInfo 現在選択中のタブ (TABS.ALL | TABS.STALLS | TABS.EVENTS)
 * @param {string} searchQuery 検索キーワード（企画名/屋台名または団体名）
 * @param {string[]} selectedCategories 選択中のカテゴリIDの配列（空配列 = すべて表示）
 * @param {string} sortOrder ソート順オプション
 * @returns {Object} データ、カテゴリ一覧、読み込み状態、エラー情報
 */
export const useEventsStallsList01Data = (tabInfo, searchQuery, selectedCategories, sortOrder, selectedArea, selectedBuilding, selectedStallLetter) => {
    const [rawItems, setRawItems] = useState([]); // 初回に取得した全企画・屋台の正規化済みデータ
    const [stallCategories, setStallCategories] = useState([]);
    const [eventCategories, setEventCategories] = useState([]);
    const [areas, setAreas] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [stallAreaLetters, setStallAreaLetters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- 1. 初回マウント時にのみすべてのマスタとデータを取得する ---
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                const supabase = getSupabaseClient();

                // 並行して全データをフェッチ（すべてのロールが見るため、tabInfoによらず全取得）
                const promises = [];
                // 屋台データ
                promises.push(
                    supabase.from('stalls')
                        .select(`
                            id, name, name_kana, description, category_id, updated_at, location_id, stall_organization_id, 
                            stall_locations(
                                name, 
                                stall_number,
                                area_letter_id,
                                stall_area_letters(
                                    id,
                                    area_id, 
                                    building_id,
                                    area_letter
                                )
                            ), 
                            stall_organizations(name, name_kana)
                        `)
                        .eq('is_published', true)
                        .then(res => ({ ...res, type: TABS.STALLS }))
                );
                // 企画データ
                promises.push(
                    supabase.from('events')
                        .select('id, name, name_kana, description, schedule_dates, schedule_start_times, schedule_end_times, schedule_entry_labels, schedule_entry_start_times, schedule_exit_labels, schedule_exit_end_times, category_id, updated_at, location_id, event_organization_id, event_locations(id, name, building_id, building_locations(id, name, name_kana, area_id, display_order)), event_organizations(name, name_kana)')
                        .eq('is_published', true)
                        .then(res => ({ ...res, type: TABS.EVENTS }))
                );
                // カテゴリ・エリアマスタ
                promises.push(
                    supabase.from('area_locations')
                        .select('id, name, name_kana')
                        .then(res => ({ ...res, type: 'AREA_LOCATIONS' }))
                );
                promises.push(
                    supabase.from('stall_categorys')
                        .select('id, name, display_order')
                        .order('display_order', { ascending: true })
                        .then(res => ({ ...res, type: 'STALL_CATEGORIES' }))
                );
                promises.push(
                    supabase.from('event_categorys')
                        .select('id, name, display_order')
                        .order('display_order', { ascending: true })
                        .then(res => ({ ...res, type: 'EVENT_CATEGORIES' }))
                );
                promises.push(
                    supabase.from('building_locations')
                        .select('id, name, name_kana, area_id, display_order')
                        .order('display_order', { ascending: true })
                        .then(res => ({ ...res, type: 'BUILDING_LOCATIONS' }))
                );
                promises.push(
                    supabase.from('stall_area_letters')
                        .select('id, area_letter, area_id')
                        .order('area_letter', { ascending: true })
                        .then(res => ({ ...res, type: 'STALL_AREA_LETTERS' }))
                );

                const results = await Promise.all(promises);

                if (!isMounted) return;

                // エラーチェック
                for (const result of results) {
                    if (result.error) {
                        console.error(`Supabase error fetching ${result.type}:`, result.error);
                        throw new Error(result.error.message);
                    }
                }

                // --- カテゴリマスタの処理 ---
                let categoryMap = {};
                let categoryOrderMap = {};
                const scat = results.find(r => r.type === 'STALL_CATEGORIES')?.data || [];
                const ecat = results.find(r => r.type === 'EVENT_CATEGORIES')?.data || [];
                
                [...scat, ...ecat].forEach(cat => {
                    categoryMap[cat.id] = cat.name;
                    categoryOrderMap[cat.id] = cat.display_order;
                });

                // --- エリア・建物マスタの処理 ---
                const areasList = results.find(r => r.type === 'AREA_LOCATIONS')?.data || [];
                const buildingsList = results.find(r => r.type === 'BUILDING_LOCATIONS')?.data || [];
                const areaNameMap = Object.fromEntries(areasList.map(a => [a.id, a.name]));
                const areaNameKanaMap = Object.fromEntries(areasList.map(a => [a.id, a.name_kana || '']));
                const buildingNameMap = Object.fromEntries(buildingsList.map(b => [b.id, b.name]));
                const buildingNameKanaMap = Object.fromEntries(buildingsList.map(b => [b.id, b.name_kana || '']));
                const buildingDisplayOrderMap = Object.fromEntries(buildingsList.map(b => [b.id, b.display_order ?? 9999]));

                // --- データの結合と正規化 ---
                let combinedData = [];
                [TABS.STALLS, TABS.EVENTS].forEach(type => {
                    const typeResult = results.find(r => r.type === type);
                    if (typeResult && typeResult.data) {
                        const mappedData = typeResult.data.map(item => {
                            let locationName = '';
                            let listLocationName = '';
                            let areaId = null, buildingId = null, buildingLocationOrder = 9999;
                            let groupName = '', groupNameKana = '', areaNameKana = '', buildingNameKana = '';

                            if (type === TABS.STALLS && item.stall_locations) {
                                const lName = item.stall_locations.name || '';
                                const alInfo = item.stall_locations.stall_area_letters;
                                const areaLetterInfo = Array.isArray(alInfo) ? alInfo[0] : alInfo;
                                areaId = areaLetterInfo?.area_id;
                                buildingId = areaLetterInfo?.building_id;
                                buildingLocationOrder = buildingDisplayOrderMap[buildingId] ?? 9999;
                                item.areaLetter = areaLetterInfo?.area_letter || '';
                                const areaName = areaNameMap[areaId] || '';
                                const buildingName = buildingNameMap[buildingId] || '';
                                areaNameKana = areaNameKanaMap[areaId] || '';
                                buildingNameKana = buildingNameKanaMap[buildingId] || '';
                                locationName = [areaName, buildingName, lName].filter(Boolean).join(' ');
                                listLocationName = lName;
                                item.areaName = areaName;
                                item.buildingName = buildingName;
                                groupName = item.stall_organizations?.name || '';
                                groupNameKana = item.stall_organizations?.name_kana || '';
                            } else if (type === TABS.EVENTS && item.event_locations) {
                                const scheduleInfo = getEventDisplaySchedule(item);
                                item.start_time = scheduleInfo.startTime;
                                item.end_time = scheduleInfo.endTime;
                                item.scheduleCount = scheduleInfo.scheduleCount;
                                const lName = item.event_locations.name || '';
                                areaId = item.event_locations.building_locations?.area_id || item.event_locations.area_id || null;
                                buildingId = item.event_locations.building_locations?.id || item.event_locations.building_id || null;
                                buildingLocationOrder = item.event_locations.building_locations?.display_order ?? 9999;
                                const areaName = areaNameMap[areaId] || '';
                                const buildingName = item.event_locations.building_locations?.name || buildingNameMap[buildingId] || '';
                                areaNameKana = areaNameKanaMap[areaId] || '';
                                buildingNameKana = item.event_locations.building_locations?.name_kana || buildingNameKanaMap[buildingId] || '';
                                locationName = [areaName, buildingName, lName].filter(Boolean).join(' ');
                                listLocationName = buildingName || lName;
                                item.areaName = areaName;
                                item.buildingName = buildingName;
                                groupName = item.event_organizations?.name || '';
                                groupNameKana = item.event_organizations?.name_kana || '';
                            }

                            return {
                                ...item,
                                itemType: type,
                                displayName: item.name,
                                displayNameKana: item.name_kana || '',
                                locationName,
                                listLocationName,
                                buildingLocationOrder,
                                groupName,
                                groupNameKana,
                                categoryName: categoryMap[item.category_id] || item.category_id,
                                categoryDisplayOrder: categoryOrderMap[item.category_id] ?? 9999,
                                areaId,
                                buildingId,
                                areaNameKana,
                                buildingNameKana,
                            };
                        });
                        combinedData = [...combinedData, ...mappedData];
                    }
                });

                if (isMounted) {
                    setRawItems(combinedData);
                    setStallCategories(scat);
                    setEventCategories(ecat);
                    setAreas(areasList);
                    setBuildings(buildingsList);
                    setStallAreaLetters(results.find(r => r.type === 'STALL_AREA_LETTERS')?.data || []);
                }
            } catch (err) {
                if (isMounted) setError(err.message || 'データの取得に失敗しました');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, []); // マウント時のみ1回実行

    // --- 2. フィルタリングとソート（クライアントサイド） ---
    const data = useMemo(() => {
        if (!rawItems || rawItems.length === 0) return [];

        let filteredData = [...rawItems];

        // タブでの絞り込み
        if (tabInfo === TABS.STALLS) {
            filteredData = filteredData.filter(item => item.itemType === TABS.STALLS);
        } else if (tabInfo === TABS.EVENTS) {
            filteredData = filteredData.filter(item => item.itemType === TABS.EVENTS);
        }

        // エリアで絞り込み
        if (selectedArea && selectedArea !== 'すべて') {
            filteredData = filteredData.filter(item => item.areaId === selectedArea);
        }

        // 建物で絞り込み
        if (selectedBuilding && selectedBuilding !== 'すべて') {
            filteredData = filteredData.filter(item => item.buildingId === selectedBuilding);
        }

        // 屋台エリア記号で絞り込み
        if (selectedStallLetter && selectedStallLetter !== 'すべて') {
            filteredData = filteredData.filter(item => {
                if (item.itemType === TABS.STALLS) {
                    return item.areaLetter === selectedStallLetter;
                }
                return false;
            });
        }

        // カテゴリで絞り込み
        if (selectedCategories && selectedCategories.length > 0) {
            filteredData = filteredData.filter(item =>
                selectedCategories.includes(item.category_id)
            );
        }

        // キーワードで絞り込み（あいまい検索）
        if (searchQuery) {
            const normalizedQuery = normalizeSearchText(searchQuery);
            const queryTokens = normalizedQuery.split(' ').filter(Boolean);

            const searchableItems = filteredData.map(item => ({
                ...item,
                _search: {
                    displayName: normalizeSearchText(item.displayName || ''),
                    displayNameKana: normalizeSearchText(item.displayNameKana || ''),
                    groupName: normalizeSearchText(item.groupName || ''),
                    groupNameKana: normalizeSearchText(item.groupNameKana || ''),
                    categoryName: normalizeSearchText(item.categoryName || ''),
                    areaName: normalizeSearchText(item.areaName || ''),
                    areaNameKana: normalizeSearchText(item.areaNameKana || ''),
                    buildingName: normalizeSearchText(item.buildingName || ''),
                    buildingNameKana: normalizeSearchText(item.buildingNameKana || ''),
                    locationName: normalizeSearchText(item.locationName || ''),
                }
            }));

            const partialMatchedItems = searchableItems.filter(item => {
                const searchFields = [
                    item._search.displayName,
                    item._search.displayNameKana,
                    item._search.groupName,
                    item._search.groupNameKana,
                    item._search.categoryName,
                    item._search.areaName,
                    item._search.areaNameKana,
                    item._search.buildingName,
                    item._search.buildingNameKana,
                    item._search.locationName,
                ];
                return queryTokens.every(token => searchFields.some(field => field.includes(token)));
            });

            if (partialMatchedItems.length > 0) {
                filteredData = partialMatchedItems
                    .sort((a, b) => {
                        const aScore = calculatePrefixPriorityScore(a, queryTokens);
                        const bScore = calculatePrefixPriorityScore(b, queryTokens);
                        if (aScore !== bScore) return bScore - aScore;
                        // スコアが同じなら「ふりがな」順、次に「名前」順で安定させる
                        const aKana = a.displayNameKana || '';
                        const bKana = b.displayNameKana || '';
                        if (aKana !== bKana) return aKana.localeCompare(bKana, 'ja', { numeric: true });
                        return (a.displayName || '').localeCompare(b.displayName || '', 'ja', { numeric: true });
                    })
                    .map(({ _search, ...rest }) => rest);
            } else {
                const fuse = new Fuse(searchableItems, {
                    includeScore: false,
                    threshold: 0.35,
                    ignoreLocation: true,
                    minMatchCharLength: 1,
                    keys: [
                        { name: '_search.displayName', weight: 0.5 },
                        { name: '_search.displayNameKana', weight: 0.46 },
                        { name: '_search.groupName', weight: 0.2 },
                        { name: '_search.groupNameKana', weight: 0.22 },
                        { name: '_search.categoryName', weight: 0.14 },
                        { name: '_search.areaName', weight: 0.12 },
                        { name: '_search.areaNameKana', weight: 0.12 },
                        { name: '_search.buildingName', weight: 0.12 },
                        { name: '_search.buildingNameKana', weight: 0.12 },
                        { name: '_search.locationName', weight: 0.1 },
                    ],
                });

                filteredData = fuse.search(normalizedQuery).map(result => {
                    const { _search, ...rest } = result.item;
                    return rest;
                });
            }
        }

        // 並べ替え処理
        filteredData.sort((a, b) => {
            switch (sortOrder) {
                case SORT_OPTIONS.NAME_ASC:
                    return (a.displayName || '').localeCompare(b.displayName || '', 'ja', { numeric: true });
                case SORT_OPTIONS.CATEGORY_ASC: {
                    const orderDiff = (a.categoryDisplayOrder ?? 9999) - (b.categoryDisplayOrder ?? 9999);
                    if (orderDiff !== 0) return orderDiff;
                    if (a.itemType !== b.itemType) {
                        return a.itemType === TABS.EVENTS ? -1 : 1;
                    }
                    return 0;
                }
                case SORT_OPTIONS.LOCATION_ASC: {
                    const diff = (a.buildingLocationOrder ?? 9999) - (b.buildingLocationOrder ?? 9999);
                    if (diff !== 0) return diff;
                    return (a.listLocationName || '').localeCompare(b.listLocationName || '', 'ja', { numeric: true });
                }
                case SORT_OPTIONS.GROUP_ASC:
                    return (a.groupName || '').localeCompare(b.groupName || '', 'ja', { numeric: true });
                default:
                    return 0;
            }
        });

        return filteredData;
    }, [rawItems, tabInfo, searchQuery, selectedCategories, sortOrder, selectedArea, selectedBuilding, selectedStallLetter]);

    return { data, stallCategories, eventCategories, areas, buildings, stallAreaLetters, loading, error };
};
