/**
 * 厚生部場所管理画面
 * 厚生部の場所マスタ、現在地登録、履歴確認をまとめて提供する。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  MAP_INTERACTION_MODES,
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
} from '../services/shiftLocationService.js';

const MOBILE_BREAKPOINT = 768;
const ITEM6_TABS = {
  location: 'location',
  self: 'self',
  current: 'current',
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
  const { width } = useWindowDimensions();
  const isCompact = width < MOBILE_BREAKPOINT;
  const { user, userInfo, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [locations, setLocations] = useState([]);
  const [currentLocations, setCurrentLocations] = useState([]);
  const [selectedCurrentLocationId, setSelectedCurrentLocationId] = useState('');
  const [currentLocationDraftId, setCurrentLocationDraftId] = useState('');
  const [currentLocationSearchQuery, setCurrentLocationSearchQuery] = useState('');
  const [currentLocationFilterId, setCurrentLocationFilterId] = useState('');
  const [activeTab, setActiveTab] = useState(ITEM6_TABS.location);
  const [editingLocationId, setEditingLocationId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCoordinate, setDraftCoordinate] = useState(DEFAULT_MAP_REGION);
  const [mapInteractionMode, setMapInteractionMode] = useState(MAP_INTERACTION_MODES.pin);
  const selectionInitializedRef = useRef(false);

  const canView = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare) || isAdmin(roles);
  }, [userInfo?.roles]);

  const canRegisterLocations = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare) || isAdmin(roles);
  }, [userInfo?.roles]);

  const canManageLocations = useMemo(() => {
    const roles = userInfo?.roles || [];
    return isAdmin(roles) || (hasRole(roles, ROLE_NAMES.welfare) && hasRole(roles, ROLE_NAMES.manager));
  }, [userInfo?.roles]);

  const canRegisterSelf = useMemo(() => {
    const roles = userInfo?.roles || [];
    return hasRole(roles, ROLE_NAMES.welfare);
  }, [userInfo?.roles]);

  const canEditLocation = useCallback(
    (location) => {
      if (!location) {
        return false;
      }

      if (canManageLocations) {
        return true;
      }

      return canRegisterLocations && location.created_by === user?.id;
    },
    [canManageLocations, canRegisterLocations, user?.id]
  );

  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations]);

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

  const selectedCurrentLocation = useMemo(() => {
    return locations.find((location) => location.id === selectedCurrentLocationId) ?? null;
  }, [locations, selectedCurrentLocationId]);

  const editingLocation = useMemo(() => {
    return locations.find((location) => location.id === editingLocationId) ?? null;
  }, [editingLocationId, locations]);

  const focusLocation = useMemo(() => {
    return editingLocation || selectedCurrentLocation;
  }, [editingLocation, selectedCurrentLocation]);

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
    const options = new Map();

    activeLocations.forEach((location) => {
      const value = location.id || '';
      const label = location.name || '名称未設定';

      if (!value || options.has(value)) {
        return;
      }

      options.set(value, label);
    });

    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) =>
        left.label.localeCompare(right.label, 'ja', {
          numeric: true,
          sensitivity: 'base',
        })
      );
  }, [activeLocations]);

  const filteredCurrentLocations = useMemo(() => {
    const query = currentLocationSearchQuery.trim().toLocaleLowerCase('ja');

    return sortedCurrentLocations.filter((record) => {
      const matchesName =
        query === '' || (record.user_name || '').toLocaleLowerCase('ja').includes(query);
      const matchesLocation =
        currentLocationFilterId === '' || record.location_id === currentLocationFilterId;

      return matchesName && matchesLocation;
    });
  }, [currentLocationFilterId, currentLocationSearchQuery, sortedCurrentLocations]);

  const tabItems = useMemo(() => {
    return [
      {
        key: ITEM6_TABS.location,
        label: '場所を登録する',
        description: 'マップと場所マスタ',
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
  }, [canManageLocations, canRegisterLocations, canRegisterSelf, canView]);

  const visibleTabItems = useMemo(() => tabItems.filter((item) => item.available), [tabItems]);

  useEffect(() => {
    if (visibleTabItems.length === 0) {
      return;
    }

    if (!visibleTabItems.some((item) => item.key === activeTab)) {
      setActiveTab(visibleTabItems[0].key);
    }
  }, [activeTab, visibleTabItems]);

  const mapModeLabel =
    mapInteractionMode === MAP_INTERACTION_MODES.move ? '地図移動モード' : 'ピン指定モード';

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
    const reload = () => {
      refreshOverview();
    };

    const channel = supabase
      .channel('item6_koseibu_shift_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'koseibu_shift_locations' },
        reload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'koseibu_shift_current_locations' },
        reload
      )
      .subscribe();

    return () => {
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
    if (currentLocationDraftId && !locations.some((location) => location.id === currentLocationDraftId)) {
      setCurrentLocationDraftId(myCurrentLocation?.location_id || activeLocations[0]?.id || '');
      return;
    }

    if (!currentLocationDraftId) {
      setCurrentLocationDraftId(myCurrentLocation?.location_id || activeLocations[0]?.id || '');
    }
  }, [activeLocations, currentLocationDraftId, locations, myCurrentLocation?.location_id]);

  useEffect(() => {
    if (!editingLocation) {
      return;
    }

    setDraftName(editingLocation.name || '');
    setDraftDescription(editingLocation.description || '');
    setDraftCoordinate({
      latitude: Number(editingLocation.latitude),
      longitude: Number(editingLocation.longitude),
    });
  }, [editingLocation]);

  const resetManagerForm = useCallback(() => {
    setEditingLocationId('');
    setDraftName('');
    setDraftDescription('');
    setDraftCoordinate(DEFAULT_MAP_REGION);
  }, []);

  const handleLocationPress = (location) => {
    if (canEditLocation(location)) {
      setMapInteractionMode(MAP_INTERACTION_MODES.pin);
      setEditingLocationId(location.id);
      setDraftName(location.name || '');
      setDraftDescription(location.description || '');
      setDraftCoordinate({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      });
      return;
    }

    if (location.is_active) {
      setSelectedCurrentLocationId(location.id);
    }
  };

  const handleMapBoardPress = (coordinate) => {
    if (!canManageLocations) {
      return;
    }

    setDraftCoordinate(coordinate);
  };

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

    setSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        name,
        latitude: Number(draftCoordinate.latitude),
        longitude: Number(draftCoordinate.longitude),
        description: draftDescription.trim() || null,
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

  const handleRegisterCurrentLocation = async () => {
    if (!canRegisterSelf || !user?.id) {
      return;
    }

    if (!currentLocationDraftId) {
      setErrorMessage('現在地に登録する場所を選択してください');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const result = await registerKoseibuShiftCurrentLocation(user.id, currentLocationDraftId, user.id);
      if (result.error) {
        setErrorMessage(result.error.message || '現在地登録に失敗しました');
        return;
      }

      await refreshOverview();
    } catch (error) {
      setErrorMessage(error.message || '現在地登録に失敗しました');
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
            {currentLocationSearchQuery.trim() || currentLocationFilterId
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
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{record.location_name_snapshot}</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderRow}>
            <MaterialCommunityIcons name="map-marker-radius" size={24} color={theme.primary} />
            <Text style={[styles.pageHeaderTitle, { color: theme.text }]}>厚生部の現在地を見える化する</Text>
          </View>
          <Text style={[styles.pageHeaderDescription, { color: theme.textSecondary }]}>
            厚生部員の場所登録と厚生部長の配置確認を、マップと一覧の両方から行えます。
          </Text>
        </View>

        {!canView ? (
          renderAccessDenied()
        ) : (
          <>
            <View style={[styles.summaryGrid, isCompact && styles.summaryGridCompact]}>
              <SectionCard title="概要" subtitle="現在の状態" theme={theme}>
                <View style={styles.infoRow}>
                  <InfoValue label="有効場所" value={summaryCounts.activeLocations} theme={theme} />
                  <InfoValue label="現在地登録" value={summaryCounts.currentRegistrations} theme={theme} />
                </View>
              </SectionCard>

              <SectionCard title="現在の選択" subtitle="選択中の場所" theme={theme}>
                {focusLocation ? (
                  <>
                    <Text style={[styles.focusTitle, { color: theme.text }]} numberOfLines={1}>
                      {focusLocation.name}
                    </Text>
                    <Text style={[styles.focusMeta, { color: theme.textSecondary }]}>
                      {focusLocation.description || '補足情報なし'}
                    </Text>
                    {myCurrentLocation ? (
                      <Text style={[styles.focusMeta, { color: theme.textSecondary }]}>
                        あなたの登録: {myCurrentLocation.location_name_snapshot}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.focusMeta, { color: theme.textSecondary }]}>
                    選択中の場所はありません
                  </Text>
                )}
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
                    onPress={() => !isDisabled && setActiveTab(tab.key)}
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
                <SectionCard title="マップ" subtitle="モードを切り替えて操作" theme={theme}>
                  <View style={styles.mapModeRow}>
                    {[
                      { key: MAP_INTERACTION_MODES.move, label: '地図移動' },
                      { key: MAP_INTERACTION_MODES.pin, label: 'ピン指定' },
                    ].map((mode) => {
                      const isSelected = mapInteractionMode === mode.key;
                      return (
                        <TouchableOpacity
                          key={mode.key}
                          style={[
                            styles.mapModeButton,
                            {
                              backgroundColor: isSelected ? theme.primary : theme.surface,
                              borderColor: isSelected ? theme.primary : theme.border,
                            },
                          ]}
                          onPress={() => setMapInteractionMode(mode.key)}
                        >
                          <Text style={{ color: isSelected ? '#fff' : theme.text }}>{mode.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.mapModeHint, { color: theme.textSecondary }]}>
                    現在: {mapModeLabel}
                  </Text>
                  <ShiftLocationMap
                    theme={theme}
                    compact={isCompact}
                    height={isCompact ? 360 : 520}
                    locations={locations}
                    draftCoordinate={draftCoordinate}
                    onDraftCoordinateChange={setDraftCoordinate}
                    interactionMode={mapInteractionMode}
                    selectedLocationId={editingLocationId}
                    highlightedLocationId={currentLocationDraftId}
                    canEdit={canRegisterLocations}
                    onLocationPress={handleLocationPress}
                    onBoardPress={handleMapBoardPress}
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
                      placeholderTextColor={theme.textSecondary}
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
                      placeholderTextColor={theme.textSecondary}
                      multiline
                    />
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
                  title="場所マスタ一覧"
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
                      activeLocations.map((location) => {
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
                                backgroundColor: theme.background,
                              },
                            ]}
                          >
                            <View style={styles.rowMain}>
                              <Text style={[styles.rowTitle, { color: theme.text }]}>{location.name}</Text>
                              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                                {location.description || '補足情報なし'}
                              </Text>
                              <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                                登録者: {location.created_by_name || '不明'}
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
                        場所の新規登録は {ROLE_NAMES.welfare} が行えます。編集は登録者本人、削除は {ROLE_NAMES.manager} を含む厚生部長のみです。
                      </Text>
                    ) : null}
                </SectionCard>
              </View>
            ) : null}

            {activeTab === ITEM6_TABS.self ? (
              <View style={styles.tabPanel}>
                {canRegisterSelf ? (
                  <SectionCard title="自分の場所登録" subtitle="一覧から選択して登録" theme={theme}>
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
                              onPress={() => setCurrentLocationDraftId(option.value)}
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
                      interactionMode={MAP_INTERACTION_MODES.move}
                      selectedLocationId={currentLocationDraftId}
                      highlightedLocationId={currentLocationDraftId}
                      focusLocationId={currentLocationDraftId}
                      canEdit={false}
                    />

                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      選択した場所はマップ上でも強調表示されます。
                    </Text>

                    <ActionButton
                      label={saving ? '登録中...' : '現在地を登録'}
                      onPress={handleRegisterCurrentLocation}
                      theme={theme}
                      disabled={saving || currentLocationOptions.length === 0}
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
                  <View style={styles.filterPanel}>
                    <TextInput
                      style={[styles.searchInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={currentLocationSearchQuery}
                      onChangeText={setCurrentLocationSearchQuery}
                      placeholder="名前で検索"
                      placeholderTextColor={theme.textSecondary}
                    />
                    <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>場所で絞り込み</Text>
                    <View style={styles.filterChipRow}>
                      <TouchableOpacity
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: currentLocationFilterId === '' ? theme.primary : theme.surface,
                            borderColor: currentLocationFilterId === '' ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => setCurrentLocationFilterId('')}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: currentLocationFilterId === '' ? '#fff' : theme.text }}>全て</Text>
                      </TouchableOpacity>
                      {currentLocationFilterOptions.map((option) => {
                        const selected = currentLocationFilterId === option.value;
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
                            onPress={() => setCurrentLocationFilterId(option.value)}
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
                  {renderCurrentLocationList()}
                </SectionCard>
              </View>
            ) : null}
          </>
        )}

        {errorMessage ? (
          <View style={[styles.errorBanner, { borderColor: theme.error, backgroundColor: `${theme.error}12` }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.error} />
            <Text style={[styles.errorBannerText, { color: theme.error }]}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 12,
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
    flexDirection: 'row',
    gap: 12,
  },
  summaryGridCompact: {
    flexDirection: 'column',
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
  focusTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  focusMeta: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
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
  layoutGrid: {
    flexDirection: 'column',
    gap: 12,
    alignItems: 'stretch',
  },
  layoutGridCompact: {
    flexDirection: 'column',
  },
  mapModeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  mapModeButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapModeHint: {
    fontSize: 12,
    marginTop: -2,
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
    padding: 12,
    borderWidth: 1,
    gap: 12,
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
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
    gap: 10,
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
    flexWrap: 'wrap',
    gap: 8,
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
});

export default Item6LocationScreen;
