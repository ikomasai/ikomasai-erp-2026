/**
 * 厚生部場所管理画面
 * 厚生部の場所情報、現在地登録、履歴確認をまとめて提供する。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { MaterialCommunityIcons } from '../../../shared/components/icons';
import { getSupabaseClient } from '../../../services/supabase/client.js';
import { hasRole, isAdmin } from '../../../services/supabase/permissionService';
import {
  DEFAULT_MAP_REGION,
  MEMBER_STATUS,
  MEMBER_STATUS_LABELS,
  ROLE_NAMES,
  SCREEN_NAME,
} from '../constants.js';
import ShiftLocationMap from '../components/ShiftLocationMap.jsx';
import {
  deleteKoseibuShiftLocation,
  insertKoseibuShiftLocation,
  registerKoseibuShiftCurrentLocation,
  selectKoseibuShiftOverview,
  updateKoseibuShiftLocation,
  updateKoseibuShiftMemberStatus,
} from '../services/shiftLocationService.js';

const MOBILE_BREAKPOINT = 768;
const ITEM6_TABS = {
  location: 'location',
  self: 'self',
  current: 'current',
};

const FULLSCREEN_MAP_SOURCES = {
  location: 'location',
  self: 'self',
  current: 'current',
};

const toAlphaColor = (colorText, alpha) => {
  if (typeof colorText !== 'string') {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  if (colorText.startsWith('rgba(')) {
    return colorText.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
  }

  const hex = colorText.replace('#', '').trim();
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return `rgba(0, 0, 0, ${alpha})`;
};

const formatDateTime = (value) => {
  if (!value) {
    return '未設定';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未設定';
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const confirmDestructiveAction = async (title, message) => {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
      { text: '削除', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

const SectionCard = ({ title, subtitle, children, theme, rightSlot = null }) => {
  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {rightSlot}
      </View>
      {children}
    </View>
  );
};

const ActionButton = ({ label, onPress, theme, variant = 'primary', disabled = false }) => {
  const backgroundColor =
    variant === 'danger'
      ? theme.error
      : variant === 'secondary'
        ? theme.surface
        : theme.primary;

  const textColor = variant === 'secondary' ? theme.text : '#FFFFFF';

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        {
          backgroundColor,
          borderColor: variant === 'secondary' ? theme.border : backgroundColor,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={disabled}
    >
      <Text style={[styles.actionButtonText, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const Badge = ({ label, color, backgroundColor }) => {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
};

const InfoValue = ({ label, value, theme }) => {
  return (
    <View style={styles.infoValue}>
      <Text style={[styles.infoValueNumber, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.infoValueLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
};

const Item6LocationScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const { width, height: windowHeight } = useWindowDimensions();
  const isCompact = width < MOBILE_BREAKPOINT;
  const { user, userInfo, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [locations, setLocations] = useState([]);
  const [currentLocations, setCurrentLocations] = useState([]);
  const [selectedCurrentLocationId, setSelectedCurrentLocationId] = useState('');
  const [currentLocationDraftId, setCurrentLocationDraftId] = useState('');
  /** @type {string} 現在選択中のステータス */
  const [statusDraft, setStatusDraft] = useState(MEMBER_STATUS.stationed);
  const [currentLocationSearchQuery, setCurrentLocationSearchQuery] = useState('');
  const [currentLocationStatusFilterId, setCurrentLocationStatusFilterId] = useState('');
  const [currentLocationLocationFilterId, setCurrentLocationLocationFilterId] = useState('');
  const [activeTab, setActiveTab] = useState(ITEM6_TABS.location);
  const [editingLocationId, setEditingLocationId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCoordinate, setDraftCoordinate] = useState(DEFAULT_MAP_REGION);
  const [draftDisplayMemberCount, setDraftDisplayMemberCount] = useState('2');
  const [fullscreenMapSource, setFullscreenMapSource] = useState('');
  const [isCurrentLocationMapInteractionActive, setIsCurrentLocationMapInteractionActive] = useState(false);
  const selectionInitializedRef = useRef(false);
  const currentLocationDraftInitializedRef = useRef(false);
  const scrollViewRef = useRef(null);
  const [currentLocationControlsOffsetY, setCurrentLocationControlsOffsetY] = useState(0);

  const canView = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare) || isAdmin(roles);
  }, [userInfo?.roles]);

  const canRegisterLocations = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare);
  }, [userInfo?.roles]);

  const canManageLocations = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare) && hasRole(roles, ROLE_NAMES.manager);
  }, [userInfo?.roles]);

  const canRegisterSelf = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare);
  }, [userInfo?.roles]);

  const canEditLocation = useCallback(() => canManageLocations, [canManageLocations]);

  const openFullscreenMap = useCallback((source) => {
    setFullscreenMapSource(source);
  }, []);

  const closeFullscreenMap = useCallback(() => {
    setFullscreenMapSource('');
  }, []);

  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations]);

  const currentLocationNameComparator = useMemo(() => {
    return (left = '', right = '') =>
      left.toString().localeCompare(right.toString(), 'ja', {
        numeric: true,
        sensitivity: 'base',
      });
  }, []);

  const locationsWithRegisteredMembers = useMemo(() => {
    const membersByLocationId = new Map();

    currentLocations.forEach((record) => {
      if (record.status !== MEMBER_STATUS.stationed || !record.location_id) {
        return;
      }

      const list = membersByLocationId.get(record.location_id) || [];
      list.push({
        name: record.user_name || '（名前なし）',
        updatedAt: record.updated_at || '',
      });
      membersByLocationId.set(record.location_id, list);
    });

    return activeLocations.map((location) => {
      const members = (membersByLocationId.get(location.id) || []).sort((left, right) => {
        const primary = currentLocationNameComparator(left.name, right.name);
        if (primary !== 0) {
          return primary;
        }

        return currentLocationNameComparator(right.updatedAt, left.updatedAt);
      });

      const displayCount = Math.max(0, Number(location.display_member_count ?? 2));
      const visibleMembers = members.slice(0, displayCount);
      const hiddenCount = Math.max(0, members.length - visibleMembers.length);
      let summary = '登録者なし';
      if (members.length > 0) {
        if (displayCount === 0) {
          summary = '表示なし';
        } else {
          summary = `${visibleMembers.map((member) => member.name).join('、')}${hiddenCount > 0 ? ` ほか${hiddenCount}名` : ''}`;
        }
      }

      return {
        ...location,
        registeredMemberCount: members.length,
        registeredMemberNames: members.map((member) => member.name),
        registeredMemberSummary: summary,
      };
    });
  }, [activeLocations, currentLocations, currentLocationNameComparator]);

  const currentLocationOptions = useMemo(() => {
    return activeLocations.map((location) => ({
      value: location.id,
      label: location.name,
    }));
  }, [activeLocations]);

  const myCurrentLocation = useMemo(() => {
    if (!user?.id) {
      return null;
    }
    return currentLocations.find((record) => record.user_id === user.id) ?? null;
  }, [currentLocations, user?.id]);

  /** myCurrentLocationのステータスでstatusDraftを初期化する */
  useEffect(() => {
    if (myCurrentLocation?.status) {
      setStatusDraft(myCurrentLocation.status);
    }
  }, [myCurrentLocation?.status]);

  useEffect(() => {
    if (statusDraft !== MEMBER_STATUS.stationed && currentLocationDraftId) {
      setCurrentLocationDraftId('');
    }
  }, [currentLocationDraftId, statusDraft]);

  const editingLocation = useMemo(() => {
    return locations.find((location) => location.id === editingLocationId) ?? null;
  }, [editingLocationId, locations]);

  const sortedCurrentLocations = useMemo(() => {
    const normalize = (value) => (value || '').toString();
    const compare = (left, right) =>
      normalize(left).localeCompare(normalize(right), 'ja', {
        numeric: true,
        sensitivity: 'base',
      });

    return [...currentLocations].sort((left, right) => {
      const primary = compare(left.location_name_snapshot, right.location_name_snapshot);
      if (primary !== 0) {
        return primary;
      }

      const secondary = compare(left.user_name, right.user_name);
      if (secondary !== 0) {
        return secondary;
      }

      return compare(left.updated_at, right.updated_at) * -1;
    });
  }, [currentLocations]);

  const currentLocationFilterOptions = useMemo(() => {
    const options = activeLocations
      .map((location) => ({
        value: location.id || '',
        label: location.name || '名称未設定',
      }))
      .filter((option) => option.value);

    return options.sort((left, right) =>
      left.label.localeCompare(right.label, 'ja', {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [activeLocations]);

  const currentLocationStatusFilterOptions = useMemo(() => {
    return [
      { value: '', label: '全て' },
      { value: MEMBER_STATUS.stationed, label: 'シフト' },
      { value: MEMBER_STATUS.patrolling, label: '巡回中' },
      { value: MEMBER_STATUS.away, label: '離席中' },
    ];
  }, []);

  const filteredCurrentLocations = useMemo(() => {
    const query = currentLocationSearchQuery.trim().toLocaleLowerCase('ja');

    return sortedCurrentLocations.filter((record) => {
      const matchesName =
        query === '' || (record.user_name || '').toLocaleLowerCase('ja').includes(query);
      const matchesStatus =
        currentLocationStatusFilterId === '' || record.status === currentLocationStatusFilterId;
      const matchesLocation =
        currentLocationLocationFilterId === '' || record.location_id === currentLocationLocationFilterId;

      return matchesName && matchesStatus && matchesLocation;
    });
  }, [
    currentLocationLocationFilterId,
    currentLocationSearchQuery,
    currentLocationStatusFilterId,
    sortedCurrentLocations,
  ]);

  const tabItems = useMemo(() => {
    return [
      {
        key: ITEM6_TABS.location,
        label: '場所を登録する',
        description: 'マップと場所一覧',
        available: canRegisterLocations,
      },
      {
        key: ITEM6_TABS.self,
        label: '自分の場所登録',
        description: '自分の現在地を登録',
        available: canRegisterSelf,
      },
      {
        key: ITEM6_TABS.current,
        label: '現在地一覧',
        description: '登録状況を確認',
        available: canView,
      },
    ];
  }, [canRegisterLocations, canRegisterSelf, canView]);

  const visibleTabItems = useMemo(() => tabItems.filter((item) => item.available), [tabItems]);

  useEffect(() => {
    if (visibleTabItems.length === 0) {
      return;
    }

    if (!visibleTabItems.some((item) => item.key === activeTab)) {
      setActiveTab(visibleTabItems[0].key);
    }
  }, [activeTab, visibleTabItems]);

  const summaryCounts = useMemo(() => {
    return {
      activeLocations: activeLocations.length,
      currentRegistrations: currentLocations.length,
    };
  }, [activeLocations.length, currentLocations.length]);

  const isInitialLoading = loading && locations.length === 0 && currentLocations.length === 0;

  const refreshOverview = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const { locations: fetchedLocations, currentLocations: fetchedCurrentLocations, error } =
        await selectKoseibuShiftOverview({ includeLogs: false });

      if (error) {
        setErrorMessage(error.message || '厚生部場所情報の取得に失敗しました');
        return;
      }

      setLocations(fetchedLocations);
      setCurrentLocations(fetchedCurrentLocations);
    } catch (error) {
      setErrorMessage(error.message || '厚生部場所情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (canView) {
      refreshOverview();
    } else {
      setLoading(false);
    }
  }, [authLoading, canView, refreshOverview]);

  useEffect(() => {
    if (!canView || authLoading) {
      return () => {};
    }

    const supabase = getSupabaseClient();

    /** デバウンス用タイマー。連続的な変更通知を500msにまとめる */
    let debounceTimer = null;
    const debouncedReload = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        refreshOverview();
      }, 500);
    };

    const channel = supabase
      .channel('item6_koseibu_shift_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'koseibu_shift_locations' },
        debouncedReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'koseibu_shift_current_locations' },
        debouncedReload
      )
      .subscribe();

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      supabase.removeChannel(channel);
    };
  }, [authLoading, canView, refreshOverview]);

  useEffect(() => {
    if (!locations.length) {
      return;
    }

    const currentSelection = locations.find((location) => location.id === selectedCurrentLocationId) ?? null;
    const fallbackId = myCurrentLocation?.location_id || activeLocations[0]?.id || '';

    if (!selectionInitializedRef.current) {
      setSelectedCurrentLocationId(fallbackId);
      selectionInitializedRef.current = true;
      return;
    }

    if (selectedCurrentLocationId && !currentSelection) {
      setSelectedCurrentLocationId(fallbackId);
    }
  }, [activeLocations, locations, myCurrentLocation?.location_id, selectedCurrentLocationId]);

  useEffect(() => {
    if (!currentLocationDraftInitializedRef.current) {
      setCurrentLocationDraftId(myCurrentLocation?.location_id || activeLocations[0]?.id || '');
      currentLocationDraftInitializedRef.current = true;
      return;
    }

    if (
      currentLocationDraftId &&
      !locations.some((location) => location.id === currentLocationDraftId)
    ) {
      setCurrentLocationDraftId(myCurrentLocation?.location_id || activeLocations[0]?.id || '');
    }
  }, [activeLocations, currentLocationDraftId, locations, myCurrentLocation?.location_id]);

  useEffect(() => {
    if (!editingLocation) {
      return;
    }

    setDraftName(editingLocation.name || '');
    setDraftDescription(editingLocation.description || '');
    setDraftDisplayMemberCount(String(editingLocation.display_member_count ?? 2));
    setDraftCoordinate({
      latitude: Number(editingLocation.latitude),
      longitude: Number(editingLocation.longitude),
    });
  }, [editingLocation]);

  const resetManagerForm = useCallback(() => {
    setEditingLocationId('');
    setDraftName('');
    setDraftDescription('');
    setDraftDisplayMemberCount('2');
    setDraftCoordinate(DEFAULT_MAP_REGION);
  }, []);

  const handleClearLocationSelection = useCallback(() => {
    resetManagerForm();
    setSelectedCurrentLocationId('');
    setCurrentLocationDraftId('');
  }, [resetManagerForm]);

  const handleClearSelfSelection = useCallback(() => {
    setCurrentLocationDraftId('');
  }, []);

  const handleLocationPress = (location) => {
    if (canEditLocation(location)) {
      setEditingLocationId(location.id);
      setSelectedCurrentLocationId(location.id);
      setDraftName(location.name || '');
      setDraftDescription(location.description || '');
      setDraftDisplayMemberCount(String(location.display_member_count ?? 2));
      setDraftCoordinate({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      });
      setActiveTab(ITEM6_TABS.location);
      return;
    }

    if (location.is_active) {
      setSelectedCurrentLocationId(location.id);
    }
  };

  /**
   * マップタップ時のピン配置ハンドラ
   * 厚生部員（登録権限あり）がマップをタップして座標を指定する
   * @param {Object} coordinate - タップされた座標 { latitude, longitude }
   */
  const handleMapBoardPress = (coordinate) => {
    if (!canRegisterLocations) {
      return;
    }

    setDraftCoordinate(coordinate);
  };

  const handleCurrentLocationMapPress = useCallback((location) => {
    if (!location?.id) {
      return;
    }

    setCurrentLocationLocationFilterId(location.id);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo?.({
        y: Math.max(0, currentLocationControlsOffsetY - 16),
        animated: true,
      });
    });
  }, [currentLocationControlsOffsetY]);

  const handleCurrentLocationMapInteractionStart = useCallback(() => {
    setIsCurrentLocationMapInteractionActive(true);
  }, []);

  const handleCurrentLocationMapInteractionEnd = useCallback(() => {
    setIsCurrentLocationMapInteractionActive(false);
  }, []);

  const fullscreenMapHeight = useMemo(() => {
    return Math.max(360, windowHeight - 220);
  }, [windowHeight]);

  const fullscreenMapConfig = useMemo(() => {
    if (fullscreenMapSource === FULLSCREEN_MAP_SOURCES.location) {
      return {
        title: '場所マップ',
        subtitle: '場所の登録・編集で使う全画面表示です',
        locations,
        draftCoordinate,
        onDraftCoordinateChange: setDraftCoordinate,
        selectedLocationId: editingLocationId,
        highlightedLocationId: currentLocationDraftId,
        focusLocationId: null,
        canEdit: canRegisterLocations,
        onLocationPress: handleLocationPress,
        onBoardPress: handleMapBoardPress,
        onClearSelection: handleClearLocationSelection,
        showClearSelectionButton: Boolean(editingLocationId || currentLocationDraftId),
        showMemberNames: false,
      };
    }

    if (fullscreenMapSource === FULLSCREEN_MAP_SOURCES.self) {
      return {
        title: '自分の場所マップ',
        subtitle: '選択中の場所を全画面で確認できます',
        locations: activeLocations,
        draftCoordinate: null,
        onDraftCoordinateChange: null,
        selectedLocationId: currentLocationDraftId,
        highlightedLocationId: currentLocationDraftId,
        focusLocationId: currentLocationDraftId || null,
        canEdit: false,
        onLocationPress: null,
        onBoardPress: null,
        onClearSelection: handleClearSelfSelection,
        showClearSelectionButton: Boolean(currentLocationDraftId),
        showMemberNames: false,
      };
    }

    if (fullscreenMapSource === FULLSCREEN_MAP_SOURCES.current) {
      return {
        title: '現在地マップ',
        subtitle: '厚生部メンバーの現在地を全画面で確認できます',
        locations: locationsWithRegisteredMembers,
        draftCoordinate: null,
        onDraftCoordinateChange: null,
        selectedLocationId: '',
        highlightedLocationId: '',
        focusLocationId: null,
        canEdit: false,
        onLocationPress: null,
        onBoardPress: null,
        onClearSelection: null,
        showClearSelectionButton: false,
        showMemberNames: true,
      };
    }

    return null;
  }, [
    activeLocations,
    canRegisterLocations,
    currentLocationDraftId,
    draftCoordinate,
    editingLocationId,
    fullscreenMapSource,
    handleClearLocationSelection,
    handleClearSelfSelection,
    handleLocationPress,
    handleMapBoardPress,
    locations,
    locationsWithRegisteredMembers,
  ]);

  const handleSaveLocation = async () => {
    if (!canRegisterLocations) {
      return;
    }

    const name = draftName.trim();
    if (!name) {
      setErrorMessage('場所名を入力してください');
      return;
    }

    if (
      draftCoordinate.latitude === null ||
      draftCoordinate.latitude === undefined ||
      draftCoordinate.longitude === null ||
      draftCoordinate.longitude === undefined
    ) {
      setErrorMessage('マップ上で座標を指定してください');
      return;
    }

    const displayMemberCount = Number.parseInt(draftDisplayMemberCount, 10);
    if (!Number.isInteger(displayMemberCount) || displayMemberCount < 0 || displayMemberCount > 10) {
      setErrorMessage('名前を表示する人数は0〜10で指定してください');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        name,
        latitude: Number(draftCoordinate.latitude),
        longitude: Number(draftCoordinate.longitude),
        description: draftDescription.trim() || null,
        displayMemberCount,
      };

      const result = editingLocationId
        ? await updateKoseibuShiftLocation(editingLocationId, payload, user?.id)
        : await insertKoseibuShiftLocation({
            ...payload,
            createdBy: user?.id,
          });

      if (result.error) {
        setErrorMessage(result.error.message || '場所の保存に失敗しました');
        return;
      }

      resetManagerForm();
      await refreshOverview();
    } catch (error) {
      setErrorMessage(error.message || '場所の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocation = async (location) => {
    if (!canManageLocations) {
      return;
    }

    const confirmed = await confirmDestructiveAction(
      '場所を削除',
      `${location.name} を削除しますか？\n過去の履歴は保持されます。`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const result = await deleteKoseibuShiftLocation(location.id, user?.id);
      if (result.error) {
        setErrorMessage(result.error.message || '場所の削除に失敗しました');
        return;
      }

      if (editingLocationId === location.id) {
        resetManagerForm();
      }

      await refreshOverview();
    } catch (error) {
      setErrorMessage(error.message || '場所の削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 現在地・ステータスを登録するハンドラ
   * ステータスに応じて適切なサービス関数を呼び出す
   */
  const handleRegisterCurrentLocation = async () => {
    if (!canRegisterSelf || !user?.id) {
      return;
    }

    /** 配置中の場合は場所の選択が必須 */
    if (statusDraft === MEMBER_STATUS.stationed && !currentLocationDraftId) {
      setErrorMessage('配置中は場所を選択してください');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const result = await updateKoseibuShiftMemberStatus(
        user.id,
        statusDraft,
        statusDraft === MEMBER_STATUS.stationed ? currentLocationDraftId : null,
        user.id
      );
      if (result.error) {
        setErrorMessage(result.error.message || 'ステータス登録に失敗しました');
        return;
      }

      await refreshOverview();
    } catch (error) {
      setErrorMessage(error.message || 'ステータス登録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const renderCurrentLocationList = () => {
    if (filteredCurrentLocations.length === 0) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="map-marker-off" size={28} color={theme.textSecondary} />
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            {currentLocationSearchQuery.trim() || currentLocationStatusFilterId || currentLocationLocationFilterId
              ? '条件に一致する現在地がありません'
              : 'まだ現在地の登録はありません'}
          </Text>
        </View>
      );
    }

    return filteredCurrentLocations.map((record) => {
      const isMine = record.user_id === user?.id;

      return (
        <View
          key={record.id}
          style={[
            styles.rowItem,
            {
              backgroundColor: isMine ? `${theme.primary}10` : theme.background,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.rowMain}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              {record.user_name}
              {isMine ? '（自分）' : ''}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
              {record.status === 'patrolling' ? '🔄 巡回中' : record.status === 'away' ? '⏸ 離席中' : record.location_name_snapshot || '未設定'}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{formatDateTime(record.updated_at)}</Text>
          </View>
          <Badge label={isMine ? '自分' : '登録済み'} color={isMine ? theme.primary : theme.success} backgroundColor={isMine ? `${theme.primary}18` : `${theme.success}20`} />
        </View>
      );
    });
  };

  const renderAccessDenied = () => {
    return (
      <View style={styles.accessDenied}>
        <MaterialCommunityIcons name="lock-outline" size={42} color={theme.textSecondary} />
        <Text style={[styles.accessDeniedTitle, { color: theme.text }]}>厚生部場所管理は利用できません</Text>
        <Text style={[styles.accessDeniedText, { color: theme.textSecondary }]}>
          {ROLE_NAMES.welfare} または {ROLE_NAMES.admin} ロールが必要です。
        </Text>
      </View>
    );
  };

  if (authLoading || isInitialLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedHeader title={SCREEN_NAME} navigation={navigation} />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>データを読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedHeader title={SCREEN_NAME} navigation={navigation} />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!isCurrentLocationMapInteractionActive}
        disableScrollViewPanResponder={isCurrentLocationMapInteractionActive}
      >
        {/* エラーバナーはスクロール最上部に表示して見逃しを防ぐ */}
        {errorMessage ? (
          <View style={[styles.errorBanner, { borderColor: theme.error, backgroundColor: `${theme.error}12` }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.error} />
            <Text style={[styles.errorBannerText, { color: theme.error }]}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage('')} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color={theme.error} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderRow}>
            <MaterialCommunityIcons name="map-marker-radius" size={24} color={theme.primary} />
            <Text style={[styles.pageHeaderTitle, { color: theme.text }]}>厚生部の現在地を見える化する</Text>
          </View>
          <Text style={[styles.pageHeaderDescription, { color: theme.textSecondary }]}>
            厚生部員の場所登録と厚生部の配置確認を、マップと一覧の両方から行えます。
          </Text>
        </View>

        {!canView ? (
          renderAccessDenied()
        ) : (
          <>
            <View style={styles.summaryGrid}>
              <SectionCard title="概要" subtitle="現在の状態" theme={theme}>
                <View style={styles.infoRow}>
                  <InfoValue label="有効場所" value={summaryCounts.activeLocations} theme={theme} />
                  <InfoValue label="現在地登録" value={summaryCounts.currentRegistrations} theme={theme} />
                </View>
              </SectionCard>
            </View>

            <View style={styles.tabBar}>
              {tabItems.map((tab) => {
                const isSelected = activeTab === tab.key;
                const isDisabled = !tab.available;

                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.tabButton,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        opacity: isDisabled ? 0.45 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (isDisabled) return;
                      setActiveTab(tab.key);
                      setErrorMessage('');
                    }}
                    disabled={isDisabled}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabButtonLabel, { color: isSelected ? '#fff' : theme.text }]}>
                      {tab.label}
                    </Text>
                    <Text
                      style={[
                        styles.tabButtonSub,
                        { color: isSelected ? 'rgba(255,255,255,0.82)' : theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === ITEM6_TABS.location ? (
              <View style={styles.tabPanel}>
                <SectionCard title="マップ" subtitle="場所をタップして登録位置を指定" theme={theme}>
                  <ShiftLocationMap
                    theme={theme}
                    compact={isCompact}
                    height={isCompact ? 360 : 520}
                    locations={locations}
                    draftCoordinate={draftCoordinate}
                    onDraftCoordinateChange={setDraftCoordinate}
                    selectedLocationId={editingLocationId}
                    highlightedLocationId={currentLocationDraftId}
                    canEdit={canRegisterLocations}
                    onLocationPress={handleLocationPress}
                    onBoardPress={handleMapBoardPress}
                    onClearSelection={handleClearLocationSelection}
                    showClearSelectionButton={Boolean(editingLocationId || currentLocationDraftId)}
                    showFullscreenButton
                    onFullscreenPress={() => openFullscreenMap(FULLSCREEN_MAP_SOURCES.location)}
                    embedded
                    showLegend
                  />
                </SectionCard>

                <SectionCard
                  title={editingLocationId ? '場所を更新' : '場所を登録'}
                  subtitle="マップをタップして位置を指定"
                  theme={theme}
                  rightSlot={
                    editingLocationId ? (
                      <Badge label="編集中" color={theme.warning} backgroundColor={`${theme.warning}20`} />
                    ) : (
                      <Badge label="新規" color={theme.primary} backgroundColor={`${theme.primary}18`} />
                    )
                  }
                >
                  <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>場所名</Text>
                    <TextInput
                      style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={draftName}
                      onChangeText={setDraftName}
                      placeholder="例: 厚生部本部前"
                      placeholderTextColor={toAlphaColor(theme.textSecondary, 0.35)}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>補足情報</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        styles.textArea,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      value={draftDescription}
                      onChangeText={setDraftDescription}
                      placeholder="任意"
                      placeholderTextColor={toAlphaColor(theme.textSecondary, 0.35)}
                      multiline
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>名前を表示する人数</Text>
                    <TextInput
                      style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={draftDisplayMemberCount}
                      onChangeText={setDraftDisplayMemberCount}
                      placeholder="例: 2"
                      placeholderTextColor={toAlphaColor(theme.textSecondary, 0.35)}
                      keyboardType="number-pad"
                    />
                    <Text style={[styles.formHint, { color: theme.textSecondary }]}>
                      登録者名を場所一覧やマップで表示する人数を指定します（0〜10、0で非表示）
                    </Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <ActionButton
                      label={saving ? '保存中...' : editingLocationId ? '更新する' : '登録する'}
                      onPress={handleSaveLocation}
                      theme={theme}
                      disabled={saving}
                    />
                    <ActionButton
                      label="フォームをクリア"
                      onPress={resetManagerForm}
                      theme={theme}
                      variant="secondary"
                      disabled={saving}
                    />
                  </View>
                </SectionCard>

                <SectionCard
                  title="場所一覧"
                  subtitle={canManageLocations ? '編集・削除' : '登録内容の確認'}
                  theme={theme}
                >
                    {activeLocations.length === 0 ? (
                      <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="map-marker-plus" size={28} color={theme.textSecondary} />
                        <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                          まだ場所が登録されていません
                        </Text>
                      </View>
                      ) : (
                      locationsWithRegisteredMembers.map((location) => {
                        const isEditing = editingLocationId === location.id;
                        const editable = canEditLocation(location);
                        const deletable = canManageLocations;
                        return (
                          <View
                            key={location.id}
                            style={[
                              styles.rowItem,
                              {
                                borderColor: isEditing ? theme.warning : theme.border,
                                borderLeftWidth: isEditing ? 6 : 1,
                                borderLeftColor: isEditing ? theme.warning : theme.border,
                                backgroundColor: isEditing ? `${theme.warning}28` : theme.background,
                                shadowColor: isEditing ? theme.warning : 'transparent',
                              },
                              isEditing && styles.rowItemSelected,
                            ]}
                          >
                            <View style={styles.rowMain}>
                              <View style={styles.rowTitleLine}>
                                <Text style={[styles.rowTitle, { color: theme.text }]}>
                                  {location.name}
                                </Text>
                                {isEditing ? (
                                  <Badge
                                    label="選択中"
                                    color={theme.warning}
                                    backgroundColor={`${theme.warning}20`}
                                  />
                                ) : null}
                              </View>
                              <Text style={[styles.rowMeta, { color: isEditing ? theme.text : theme.textSecondary }]}>
                                {location.description || '補足情報なし'}
                              </Text>
                              <Text style={[styles.rowMeta, { color: isEditing ? theme.text : theme.textSecondary }]}>
                                登録者: {location.registeredMemberSummary || '登録者なし'}
                              </Text>
                              <Text style={[styles.rowMeta, { color: isEditing ? theme.text : theme.textSecondary }]}>
                                作成者: {location.created_by_name || '不明'}
                              </Text>
                            </View>
                            <View style={styles.rowActions}>
                              <Badge label="有効" color={theme.success} backgroundColor={`${theme.success}20`} />
                              {editable || deletable ? (
                                <View style={styles.rowButtons}>
                                  {editable ? (
                                    <ActionButton
                                      label="編集"
                                      onPress={() => handleLocationPress(location)}
                                      theme={theme}
                                      variant="secondary"
                                      disabled={saving}
                                    />
                                  ) : null}
                                  {deletable ? (
                                    <ActionButton
                                      label="削除"
                                      onPress={() => handleDeleteLocation(location)}
                                      theme={theme}
                                      variant="danger"
                                      disabled={saving}
                                    />
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })
                    )}
                    {!canManageLocations ? (
                      <Text style={[styles.helperText, { color: theme.textSecondary, marginTop: 12 }]}>
                        場所の新規登録は {ROLE_NAMES.welfare} が行えます。編集・削除は 厚生部長 が行えます。
                      </Text>
                    ) : null}
                </SectionCard>
              </View>
            ) : null}

            {activeTab === ITEM6_TABS.self ? (
              <View style={styles.tabPanel}>
                {canRegisterSelf ? (
                  <SectionCard title="自分の場所登録" subtitle="一覧から選択して登録" theme={theme}>
                    {currentLocationDraftId ? (
                      <View
                        style={[
                          styles.selectionBanner,
                          {
                            backgroundColor: `${theme.primary}28`,
                            borderColor: theme.primary,
                            borderLeftWidth: 6,
                            borderLeftColor: theme.primary,
                          },
                        ]}
                      >
                        <Badge
                          label="選択中"
                          color={theme.primary}
                          backgroundColor={`${theme.primary}18`}
                        />
                        <Text style={[styles.selectionBannerText, { color: theme.text }]}>
                          {currentLocationOptions.find((option) => option.value === currentLocationDraftId)?.label || '場所'} を選択中
                        </Text>
                      </View>
                    ) : null}
                    {/* ステータス切替ボタン */}
                    <View style={styles.statusRow}>
                      {Object.entries(MEMBER_STATUS_LABELS).map(([key, label]) => {
                        const isActive = statusDraft === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.statusButton,
                              {
                                backgroundColor: isActive ? theme.primary : theme.background,
                                borderColor: isActive ? theme.primary : theme.border,
                              },
                            ]}
                            onPress={() => {
                              setStatusDraft(key);
                              if (key !== MEMBER_STATUS.stationed) {
                                setCurrentLocationDraftId('');
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.statusButtonText, { color: isActive ? '#fff' : theme.text }]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {statusDraft === MEMBER_STATUS.stationed ? (
                      <>
                        <View style={styles.choiceGroup}>
                          {currentLocationOptions.length === 0 ? (
                            <View style={styles.emptyState}>
                              <MaterialCommunityIcons name="map-marker-off" size={28} color={theme.textSecondary} />
                              <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                                選択できる場所がありません
                              </Text>
                            </View>
                          ) : (
                            currentLocationOptions.map((option) => {
                              const selected = currentLocationDraftId === option.value;

                              return (
                                <TouchableOpacity
                                  key={option.value}
                                  style={[
                                    styles.choiceCard,
                                    {
                                      backgroundColor: selected ? theme.primary : theme.background,
                                      borderColor: selected ? theme.primary : theme.border,
                                    },
                                  ]}
                                  onPress={() => {
                                    setCurrentLocationDraftId(option.value);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <View style={styles.choiceTextWrap}>
                                    <Text style={[styles.choiceTitle, { color: selected ? '#fff' : theme.text }]}>
                                      {option.label}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.choiceSubtitle,
                                        { color: selected ? 'rgba(255,255,255,0.82)' : theme.textSecondary },
                                      ]}
                                    >
                                      タップして選択
                                    </Text>
                                  </View>
                                  {selected ? <MaterialCommunityIcons name="check" size={18} color="#fff" /> : null}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>

                        <ShiftLocationMap
                          theme={theme}
                          compact={isCompact}
                          height={isCompact ? 280 : 340}
                          locations={activeLocations}
                          selectedLocationId={currentLocationDraftId}
                          highlightedLocationId={currentLocationDraftId}
                          focusLocationId={currentLocationDraftId}
                          canEdit={false}
                          onClearSelection={handleClearSelfSelection}
                          showClearSelectionButton={Boolean(currentLocationDraftId)}
                          showFullscreenButton
                          onFullscreenPress={() => openFullscreenMap(FULLSCREEN_MAP_SOURCES.self)}
                          embedded
                        />

                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          選択した場所はマップ上でも強調表示されます。
                        </Text>
                      </>
                    ) : null}

                    {statusDraft !== MEMBER_STATUS.stationed ? (
                      <View style={styles.emptyState}>
                        <MaterialCommunityIcons
                          name={statusDraft === MEMBER_STATUS.patrolling ? 'walk' : 'account-clock'}
                          size={28}
                          color={theme.textSecondary}
                        />
                        <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                          {statusDraft === MEMBER_STATUS.patrolling
                            ? '巡回中として登録されます。特定の場所には紐づきません。'
                            : '離席中として登録されます。一時的に持ち場を離れていることが記録されます。'}
                        </Text>
                      </View>
                    ) : null}

                    <ActionButton
                      label={saving ? '登録中...' : `${MEMBER_STATUS_LABELS[statusDraft]}を登録`}
                      onPress={handleRegisterCurrentLocation}
                      theme={theme}
                      disabled={saving || (statusDraft === MEMBER_STATUS.stationed && currentLocationOptions.length === 0)}
                    />
                  </SectionCard>
                ) : (
                  <SectionCard title="注意" subtitle="利用条件" theme={theme}>
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      自分の場所登録は {ROLE_NAMES.welfare} ロールが必要です。
                    </Text>
                  </SectionCard>
                )}
              </View>
            ) : null}

            {activeTab === ITEM6_TABS.current ? (
              <View style={styles.tabPanel}>
                <SectionCard title="現在地一覧" subtitle="厚生部メンバーの最新状態" theme={theme}>
                  <View style={styles.currentMapSection}>
                    <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>現在地マップ</Text>
                    <Text style={[styles.inlineSectionSubtitle, { color: theme.textSecondary }]}>
                      場所ごとの登録者名を表示
                    </Text>
                    <View
                      onMouseEnter={handleCurrentLocationMapInteractionStart}
                      onMouseLeave={handleCurrentLocationMapInteractionEnd}
                      onTouchStart={handleCurrentLocationMapInteractionStart}
                      onTouchEnd={handleCurrentLocationMapInteractionEnd}
                      onTouchCancel={handleCurrentLocationMapInteractionEnd}
                    >
                      <ShiftLocationMap
                        theme={theme}
                        compact={isCompact}
                        height={isCompact ? 360 : 520}
                        locations={locationsWithRegisteredMembers}
                        canEdit={false}
                        selectedLocationId={currentLocationLocationFilterId}
                        highlightedLocationId={currentLocationLocationFilterId}
                        onLocationPress={handleCurrentLocationMapPress}
                        showMemberNames
                        showFullscreenButton
                        onFullscreenPress={() => openFullscreenMap(FULLSCREEN_MAP_SOURCES.current)}
                        embedded
                      />
                    </View>
                  </View>
                  <View
                    onLayout={(event) => {
                      setCurrentLocationControlsOffsetY(event.nativeEvent.layout.y);
                    }}
                  >
                      <View style={styles.filterPanel}>
                      <TextInput
                        style={[styles.searchInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        value={currentLocationSearchQuery}
                        onChangeText={setCurrentLocationSearchQuery}
                        placeholder="例: 山田"
                        placeholderTextColor={toAlphaColor(theme.textSecondary, 0.35)}
                      />
                      <View style={styles.filterSection}>
                        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>状態で絞り込み</Text>
                        <View style={styles.statusFilterGroup}>
                          {currentLocationStatusFilterOptions.map((option) => {
                            const selected = currentLocationStatusFilterId === option.value;
                            return (
                              <TouchableOpacity
                                key={option.value || 'all-status'}
                                style={[
                                  styles.filterChip,
                                  styles.statusFilterChip,
                                  {
                                    backgroundColor: selected ? theme.primary : theme.surface,
                                    borderColor: selected ? theme.primary : theme.border,
                                  },
                                ]}
                                onPress={() => setCurrentLocationStatusFilterId(option.value)}
                                activeOpacity={0.8}
                              >
                                <Text style={{ color: selected ? '#fff' : theme.text }} numberOfLines={1}>
                                  {option.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      <View style={styles.filterSection}>
                        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>場所で絞り込み</Text>
                        <View style={styles.locationFilterGroup}>
                          <TouchableOpacity
                            style={[
                              styles.filterChip,
                              {
                                backgroundColor: currentLocationLocationFilterId === '' ? theme.primary : theme.surface,
                                borderColor: currentLocationLocationFilterId === '' ? theme.primary : theme.border,
                              },
                            ]}
                            onPress={() => setCurrentLocationLocationFilterId('')}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: currentLocationLocationFilterId === '' ? '#fff' : theme.text }}>全て</Text>
                          </TouchableOpacity>
                          {currentLocationFilterOptions.map((option) => {
                            const selected = currentLocationLocationFilterId === option.value;
                            return (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  styles.filterChip,
                                  {
                                    backgroundColor: selected ? theme.primary : theme.surface,
                                    borderColor: selected ? theme.primary : theme.border,
                                  },
                                ]}
                                onPress={() => setCurrentLocationLocationFilterId(option.value)}
                                activeOpacity={0.8}
                              >
                                <Text style={{ color: selected ? '#fff' : theme.text }} numberOfLines={1}>
                                  {option.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      </View>
                    <View style={styles.currentLocationList}>
                      {renderCurrentLocationList()}
                    </View>
                  </View>
                </SectionCard>
              </View>
            ) : null}
          </>
        )}

      </ScrollView>

      <Modal
        visible={Boolean(fullscreenMapConfig)}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeFullscreenMap}
      >
        <SafeAreaView style={[styles.fullscreenModalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.fullscreenModalHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.fullscreenModalHeaderText}>
              <Text style={[styles.fullscreenModalTitle, { color: theme.text }]}>
                {fullscreenMapConfig?.title || 'マップ'}
              </Text>
              <Text style={[styles.fullscreenModalSubtitle, { color: theme.textSecondary }]}>
                {fullscreenMapConfig?.subtitle || '全画面表示'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.fullscreenCloseButton, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={closeFullscreenMap}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.fullscreenModalBody}>
            {fullscreenMapConfig ? (
              <ShiftLocationMap
                theme={theme}
                compact={false}
                height={fullscreenMapHeight}
                locations={fullscreenMapConfig.locations}
                draftCoordinate={fullscreenMapConfig.draftCoordinate}
                onDraftCoordinateChange={fullscreenMapConfig.onDraftCoordinateChange}
                selectedLocationId={fullscreenMapConfig.selectedLocationId}
                highlightedLocationId={fullscreenMapConfig.highlightedLocationId}
                focusLocationId={fullscreenMapConfig.focusLocationId}
                canEdit={fullscreenMapConfig.canEdit}
                onLocationPress={fullscreenMapConfig.onLocationPress}
                onBoardPress={fullscreenMapConfig.onBoardPress}
                onClearSelection={fullscreenMapConfig.onClearSelection}
                showClearSelectionButton={fullscreenMapConfig.showClearSelectionButton}
                showMemberNames={fullscreenMapConfig.showMemberNames}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  pageHeader: {
    gap: 8,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  pageHeaderDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  loadingState: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  accessDenied: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  accessDeniedTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  accessDeniedText: {
    fontSize: 14,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  infoValue: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    gap: 4,
  },
  infoValueNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  infoValueLabel: {
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabButton: {
    flexGrow: 1,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  tabButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  tabButtonSub: {
    fontSize: 11,
  },
  tabPanel: {
    gap: 12,
  },
  fullscreenModalRoot: {
    flex: 1,
  },
  fullscreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  fullscreenModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  fullscreenModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  fullscreenModalSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  fullscreenCloseButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenModalBody: {
    flex: 1,
    padding: 12,
  },
  layoutGrid: {
    flexDirection: 'column',
    gap: 12,
    alignItems: 'stretch',
  },
  layoutGridCompact: {
    flexDirection: 'column',
  },
  leftColumn: {
    width: '100%',
    gap: 12,
  },
  rightColumn: {
    width: '100%',
    gap: 12,
  },
  sectionCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 13,
  },
  rowItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowItemSelected: {
    borderWidth: 2,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  rowMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  formGroup: {
    gap: 6,
  },
  formHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  choiceGroup: {
    gap: 10,
  },
  choiceCard: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  choiceTextWrap: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  choiceSubtitle: {
    fontSize: 11,
  },
  filterPanel: {
    gap: 14,
  },
  filterSection: {
    gap: 10,
  },
  currentMapSection: {
    gap: 10,
  },
  inlineSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  inlineSectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  searchInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    width: '100%',
  },
  locationFilterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-start',
    flexShrink: 1,
  },
  filterChip: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusFilterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-start',
    marginLeft: 8,
  },
  currentLocationList: {
    marginTop: 12,
  },
  statusFilterChip: {
    minWidth: 88,
  },
  /** ステータス切替行 */
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  /** ステータスボタン */
  statusButton: {
    flex: 1,
    minWidth: 80,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  /** ステータスボタンテキスト */
  statusButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
  },
  selectionBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  selectionBannerText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
});

export default Item6LocationScreen;
