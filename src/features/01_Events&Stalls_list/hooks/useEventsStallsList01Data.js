import { useState, useEffect } from 'react';
import Fuse from 'fuse.js';
import { getSupabaseClient } from '../../../services/supabase/client';
import { TABS, SORT_OPTIONS } from '../constants';

const katakanaToHiragana = (value) => {
    return (value || '').replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
};

const normalizeSearchText = (value) => {
    return katakanaToHiragana(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
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
    const [data, setData] = useState([]);
    const [stallCategories, setStallCategories] = useState([]);
    const [eventCategories, setEventCategories] = useState([]);
    const [areas, setAreas] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [stallAreaLetters, setStallAreaLetters] = useState([]); // 新規追加: 屋台エリア記号 (A, B, C...)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                const supabase = getSupabaseClient();

                // --- 1. 取得するテーブルの決定 ---
                let fetchStalls = false;
                let fetchEvents = false;

                if (tabInfo === TABS.ALL) {
                    fetchStalls = true;
                    fetchEvents = true;
                } else if (tabInfo === TABS.STALLS) {
                    fetchStalls = true;
                } else if (tabInfo === TABS.EVENTS) {
                    fetchEvents = true;
                }

                // 並行してデータフェッチ
                const promises = [];
                if (fetchStalls) {
                    promises.push(
                        supabase.from('stalls')
                            .select(`
                                id, name, name_kana, description, image_path, category_id, updated_at, location_id, stall_organization_id, 
                                stall_locations(
                                    name, 
                                    stall_number,
                                    area_letter_id,
                                    stall_area_letters(
                                        id,
                                        area_id, 
                                        building_id,
                                        area_letter,
                                        building_locations(id, name, name_kana, display_order)
                                    )
                                ), 
                                stall_organizations(name, name_kana)
                            `)
                            .eq('is_published', true)
                            .then(res => ({ ...res, type: TABS.STALLS }))
                    );
                }
                if (fetchEvents) {
                    promises.push(
                        supabase.from('events')
                            .select('id, name, name_kana, description, start_time, end_time, image_path, category_id, updated_at, location_id, event_organization_id, event_locations(id, name, building_id, building_locations(id, name, name_kana, area_id, display_order)), event_organizations(name, name_kana)')
                            .eq('is_published', true)
                            .then(res => ({ ...res, type: TABS.EVENTS }))
                    );
                }

                // カテゴリ・エリアマスタの取得
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
                        .select('id, name, name_kana, area_id')
                        .order('display_order', { ascending: true })
                        .then(res => ({ ...res, type: 'BUILDING_LOCATIONS' }))
                );
                // 屋台エリア記号マスタの取得 (新規追加)
                promises.push(
                    supabase.from('stall_area_letters')
                        .select('id, area_letter, area_id')
                        .order('area_letter', { ascending: true })
                        .then(res => ({ ...res, type: 'STALL_AREA_LETTERS' }))
                );

                const results = await Promise.all(promises);

                // エラーチェック
                for (const result of results) {
                    if (result.error) {
                        console.error(`Supabase error fetching ${result.type}:`, result.error);
                        throw new Error(result.error.message);
                    }
                }

                // --- 2. カテゴリマスタの処理 ---
                let categoryMap = {};        // id -> name
                let categoryOrderMap = {};   // id -> display_order
                let stallCatsList = [];
                let eventCatsList = [];

                const stallCatsResult = results.find(r => r.type === 'STALL_CATEGORIES');
                if (stallCatsResult && stallCatsResult.data) {
                    stallCatsList = stallCatsResult.data;
                    stallCatsResult.data.forEach(cat => {
                        categoryMap[cat.id] = cat.name;
                        categoryOrderMap[cat.id] = cat.display_order;
                    });
                }

                const eventCatsResult = results.find(r => r.type === 'EVENT_CATEGORIES');
                if (eventCatsResult && eventCatsResult.data) {
                    eventCatsList = eventCatsResult.data;
                    eventCatsResult.data.forEach(cat => {
                        categoryMap[cat.id] = cat.name;
                        categoryOrderMap[cat.id] = cat.display_order;
                    });
                }

                // --- 2.5 エリア・建物マスタの処理 ---
                let areasList = [];
                const areasResult = results.find(r => r.type === 'AREA_LOCATIONS');
                if (areasResult && areasResult.data) {
                    areasList = areasResult.data;
                }

                let buildingsList = [];
                const buildingsResult = results.find(r => r.type === 'BUILDING_LOCATIONS');
                if (buildingsResult && buildingsResult.data) {
                    buildingsList = buildingsResult.data;
                }

                let stallAreaLettersList = [];
                const stallAreaLettersResult = results.find(r => r.type === 'STALL_AREA_LETTERS');
                if (stallAreaLettersResult && stallAreaLettersResult.data) {
                    stallAreaLettersList = stallAreaLettersResult.data;
                }

                // --- 2.6 エリアIDから名前へのマップ作成 ---
                let areaNameMap = {};
                let areaNameKanaMap = {};
                areasList.forEach(a => {
                    areaNameMap[a.id] = a.name;
                    areaNameKanaMap[a.id] = a.name_kana || '';
                });

                // 建物IDから名前へのマップ作成
                let buildingNameMap = {};
                let buildingNameKanaMap = {};
                buildingsList.forEach(b => {
                    buildingNameMap[b.id] = b.name;
                    buildingNameKanaMap[b.id] = b.name_kana || '';
                });

                // --- 3. データの結合と正規化 ---
                let combinedData = [];

                results.forEach(result => {
                    if ((result.type === TABS.STALLS || result.type === TABS.EVENTS) && result.data) {
                        const mappedData = result.data.map(item => {
                            let locationName = '';
                            let listLocationName = '';
                            let areaId = null;
                            let buildingId = null;
                            let buildingLocationOrder = 9999;
                            let itemNameKana = item.name_kana || '';
                            let groupNameKana = '';
                            let areaNameKana = '';
                            let buildingNameKana = '';

                            if (result.type === TABS.STALLS && item.stall_locations) {
                                const lName = item.stall_locations.name || '';
                                // 配列で返ってくる可能性も考慮
                                const alInfo = item.stall_locations.stall_area_letters;
                                const areaLetterInfo = Array.isArray(alInfo) ? alInfo[0] : alInfo;

                                locationName = lName;
                                listLocationName = lName;

                                areaId = areaLetterInfo?.area_id;
                                buildingId = areaLetterInfo?.building_id;
                                buildingLocationOrder = areaLetterInfo?.building_locations?.display_order ?? 9999;
                                item.areaLetter = areaLetterInfo?.area_letter || ''; // エリア記号を追加

                                const areaName = areaNameMap[areaId] || '';
                                const buildingName = areaLetterInfo?.building_locations?.name || buildingNameMap[buildingId] || '';
                                areaNameKana = areaNameKanaMap[areaId] || '';
                                buildingNameKana = areaLetterInfo?.building_locations?.name_kana || buildingNameKanaMap[buildingId] || '';
                                locationName = [areaName, buildingName, lName].filter(Boolean).join(' ');
                                listLocationName = lName;
                                item.areaName = areaName;
                                item.buildingName = buildingName;
                            } else if (result.type === TABS.EVENTS && item.event_locations) {
                                const lName = item.event_locations.name || '';
                                locationName = lName;

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
                            }

                            let groupName = '';
                            if (result.type === TABS.STALLS) {
                                groupName = item.stall_organizations?.name || '';
                                groupNameKana = item.stall_organizations?.name_kana || '';
                            } else {
                                groupName = item.event_organizations?.name || '';
                                groupNameKana = item.event_organizations?.name_kana || '';
                            }

                            return {
                                ...item,
                                itemType: result.type,
                                displayName: item.name,
                                displayNameKana: itemNameKana,
                                locationName: locationName,
                                listLocationName: listLocationName,
                                buildingLocationOrder,
                                groupName: groupName,
                                groupNameKana,
                                categoryName: categoryMap[item.category_id] || item.category_id,
                                categoryDisplayOrder: categoryOrderMap[item.category_id] ?? 9999,
                                areaId: areaId,
                                buildingId: buildingId,
                                areaName: item.areaName || '',
                                areaNameKana,
                                buildingName: item.buildingName || '',
                                buildingNameKana,
                                areaLetter: item.areaLetter || '',
                            };
                        });
                        combinedData = [...combinedData, ...mappedData];
                    }
                });

                // --- 4. フィルタリング処理 ---
                let filteredData = combinedData;

                // エリアで絞り込み
                if (selectedArea && selectedArea !== 'すべて') {
                    filteredData = filteredData.filter(item => item.areaId === selectedArea);
                }

                // 建物で絞り込み
                if (selectedBuilding && selectedBuilding !== 'すべて') {
                    filteredData = filteredData.filter(item => item.buildingId === selectedBuilding);
                }

                // 屋台エリア記号で絞り込み (新規追加)
                if (selectedStallLetter && selectedStallLetter !== 'すべて') {
                    filteredData = filteredData.filter(item => {
                        if (item.itemType === TABS.STALLS) {
                            return item.areaLetter === selectedStallLetter;
                        }
                        return false; // 企画はエリア記号を持たないので除外
                    });
                }

                // カテゴリで絞り込み（複数選択対応）
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
                                if (aScore !== bScore) {
                                    return bScore - aScore;
                                }
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

                // --- 5. 並べ替え処理 ---
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

                if (isMounted) {
                    setData(filteredData);
                    setStallCategories(stallCatsList);
                    setEventCategories(eventCatsList);
                    setAreas(areasList);
                    setBuildings(buildingsList);
                    setStallAreaLetters(stallAreaLettersList);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'データの取得に失敗しました');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [tabInfo, searchQuery, selectedCategories, sortOrder, selectedArea, selectedBuilding, selectedStallLetter]);

    return { data, stallCategories, eventCategories, areas, buildings, stallAreaLetters, loading, error };
};
