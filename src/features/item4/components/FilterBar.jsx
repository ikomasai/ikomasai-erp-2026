/**
 * フィルタバーコンポーネント
 * 場所・日付の2つのプルダウンを横並びで表示する
 * 各プルダウンはFilterDropdownコンポーネントを再利用する
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import FilterDropdown from './FilterDropdown';
import {
  LOCATION_FILTER_ALL,
  DATE_FILTER_ALL,
} from '../constants';

/**
 * フィルタバーコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {string} props.locationFilter - 場所フィルタの現在値
 * @param {Function} props.onLocationChange - 場所フィルタ変更コールバック
 * @param {string} props.dateFilter - 日付フィルタの現在値
 * @param {Function} props.onDateChange - 日付フィルタ変更コールバック
 * @param {string[]} props.availableLocations - 選択可能な場所の一覧
 * @param {string[]} props.availableDates - 選択可能な日付の一覧（新しい順）
 * @returns {JSX.Element} フィルタバーUI
 */
const FilterBar = ({
  locationFilter,
  onLocationChange,
  dateFilter,
  onDateChange,
  availableLocations,
  availableDates,
}) => {
  /**
   * 場所フィルタの選択肢
   * 先頭に「すべての場所」を追加し、以降は現在のタブデータから抽出した場所を列挙する
   */
  const locationOptions = useMemo(
    () => [
      { value: LOCATION_FILTER_ALL, label: 'すべての場所' },
      ...availableLocations.map((loc) => ({ value: loc, label: loc })),
    ],
    [availableLocations],
  );

  /**
   * 日付フィルタの選択肢
   * 先頭に「すべての日付」を追加し、以降は現在のタブデータから抽出した日付を列挙する
   */
  const dateOptions = useMemo(
    () => [
      { value: DATE_FILTER_ALL, label: 'すべての日付' },
      ...availableDates.map((date) => ({ value: date, label: date })),
    ],
    [availableDates],
  );

  return (
    <View style={styles.container}>
      {/* 場所フィルタ（タブ内データから動的生成） */}
      <FilterDropdown
        value={locationFilter}
        options={locationOptions}
        onChange={onLocationChange}
      />

      {/* 日付フィルタ（タブ内データから動的生成、新しい順） */}
      <FilterDropdown
        value={dateFilter}
        options={dateOptions}
        onChange={onDateChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  /** 3つのプルダウンを横並びにするコンテナ */
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
});

export default FilterBar;
