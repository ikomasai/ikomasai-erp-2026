/**
 * シフトグリッドコンポーネント
 * 団体全メンバーのシフトをグリッド形式で表示し、
 * セル選択によるシフト変更操作を提供します
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

/**
 * 指定セルが属するブロックを計算する
 *
 * sourceColIndicesが指定されている場合（宛先選択モード）:
 *   自然なブロック展開は行わず、移動元と同じcolIndices範囲を強制的に使用する。
 *   これにより「1コマ→1コマ」が自動補完される。
 *
 * sourceColIndicesが指定されていない場合（移動元選択モード）:
 *   タップしたセルのみを単一ブロックとして返す（自動展開なし）。
 *
 * @param {Object} member - メンバーデータ { name, cells }
 * @param {number} tappedColIndex - タップされたセルの列インデックス
 * @param {number[]|null} sourceColIndices - 移動元のcolIndices（宛先選択時に指定）
 * @returns {Object} ブロック情報 { memberName, colIndices, timeSlots, areaName }
 */
const getBlockForCell = (member, tappedColIndex, sourceColIndices = null) => {
  const tappedCell = member.cells.find((c) => c.colIndex === tappedColIndex);

  // 宛先選択モード: 移動元と同じcolIndices範囲に強制補完する
  if (sourceColIndices !== null) {
    /** 移動元のcolIndicesに対応する宛先メンバーのセル一覧 */
    const blockCells = sourceColIndices
      .map((idx) => member.cells.find((c) => c.colIndex === idx))
      .filter(Boolean)
      .sort((a, b) => a.colIndex - b.colIndex);
    return {
      memberName: member.name,
      colIndices: blockCells.map((c) => c.colIndex),
      timeSlots: blockCells.map((c) => c.timeSlot),
      /** タップしたセルのエリア名を代表として使用（null = 移動） */
      areaName: tappedCell?.areaName ?? null,
    };
  }

  // 移動元選択モード: タップしたセルのみを返す（自動展開なし）
  return {
    memberName: member.name,
    colIndices: [tappedColIndex],
    timeSlots: [tappedCell?.timeSlot ?? ''],
    areaName: tappedCell?.areaName ?? null,
  };
};

/** セルの幅 */
const CELL_WIDTH = 90;
/** セルの高さ */
const CELL_HEIGHT = 44;
/** 名前列の幅 */
const NAME_COLUMN_WIDTH = 80;

/** シフトありセルの背景色 */
const SHIFT_CELL_COLOR = '#4FC3F7';
/** 選択中セルの背景色 */
const SELECTED_CELL_COLOR = '#1976D2';
/** 空きセルの背景色 */
const EMPTY_CELL_COLOR = 'transparent';
/** 拡張可能セルの背景色（移動元に隣接する同エリアのコマ） */
const EXPANDABLE_CELL_COLOR = '#B3E5FC';

/**
 * シフトグリッドコンポーネント
 * @param {Object} props - コンポーネントプロパティ
 * @param {Object} props.gridData - グリッドデータ { organizationName, timeSlots, members }
 * @param {Object|null} props.selectedSource - 選択中の移動元 { memberName, colIndices, timeSlots, areaName }
 * @param {Object|null} props.selectedDestination - 選択中の移動先
 * @param {Function} props.onCellPress - セルタップ時のコールバック (block: { memberName, colIndices, timeSlots, areaName })
 * @param {Object} props.theme - テーマオブジェクト
 * @returns {JSX.Element} シフトグリッド
 */
const ShiftGrid = ({
  gridData,
  selectedSource,
  selectedDestination,
  onCellPress,
  theme,
}) => {
  if (!gridData || !gridData.timeSlots || gridData.timeSlots.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          シフトデータがありません
        </Text>
      </View>
    );
  }

  /**
   * セルが選択中かどうかを判定
   * ブロック選択対応：selectedSource/Destinationの colIndices 配列で判定する
   * @param {string} memberName - メンバー名
   * @param {number} colIndex - 列インデックス
   * @returns {string|null} 選択種別（'source' / 'destination' / null）
   */
  const getSelectionType = (memberName, colIndex) => {
    if (
      selectedSource &&
      selectedSource.memberName === memberName &&
      selectedSource.colIndices.includes(colIndex)
    ) {
      return 'source';
    }
    if (
      selectedDestination &&
      selectedDestination.memberName === memberName &&
      selectedDestination.colIndices.includes(colIndex)
    ) {
      return 'destination';
    }
    return null;
  };

  /**
   * 移動元と連続する拡張可能な列インデックスを全て取得
   * 移動元メンバーの左右に向かって、同エリアが続く限り全てのcolIndexを返す
   * @returns {number[]} 拡張可能な列インデックスの配列
   */
  const getExpandableColIndices = () => {
    if (!selectedSource) {
      return [];
    }
    /** 移動元メンバーのデータ */
    const sourceMember = gridData.members.find((m) => m.name === selectedSource.memberName);
    if (!sourceMember) {
      return [];
    }
    /** 移動元の最小列インデックス */
    const minCol = Math.min(...selectedSource.colIndices);
    /** 移動元の最大列インデックス */
    const maxCol = Math.max(...selectedSource.colIndices);
    /** 拡張可能な列インデックスの一覧 */
    const result = [];
    /** 左方向: 連続する同エリアのセルを全て収集 */
    for (let col = minCol - 1; ; col--) {
      const cell = sourceMember.cells.find((c) => c.colIndex === col);
      if (!cell || cell.areaName !== selectedSource.areaName) {
        break;
      }
      result.push(col);
    }
    /** 右方向: 連続する同エリアのセルを全て収集 */
    for (let col = maxCol + 1; ; col++) {
      const cell = sourceMember.cells.find((c) => c.colIndex === col);
      if (!cell || cell.areaName !== selectedSource.areaName) {
        break;
      }
      result.push(col);
    }
    return result;
  };

  /** 拡張可能な列インデックス（連続する全コマ） */
  const expandableColIndices = getExpandableColIndices();

  /**
   * 拡張可能セルタップ時に渡すブロックを計算する
   * ソース境界からタップしたセルまでの全コマをまとめて返すことで、
   * 間に挟まったコマも一括でソースに追加できる
   * @param {Object} memberObj - メンバーデータ
   * @param {number} colIndex - タップした列インデックス
   * @returns {Object} 拡張ブロック { memberName, colIndices, timeSlots, areaName }
   */
  const getExpandableBlock = (memberObj, colIndex) => {
    /** 移動元の最小列インデックス */
    const minSourceCol = Math.min(...selectedSource.colIndices);
    /** 移動元の最大列インデックス */
    const maxSourceCol = Math.max(...selectedSource.colIndices);
    /** 左方向への拡張かどうか */
    const isLeftExpansion = colIndex < minSourceCol;
    /** 収集開始列インデックス */
    const rangeStart = isLeftExpansion ? colIndex : maxSourceCol + 1;
    /** 収集終了列インデックス */
    const rangeEnd = isLeftExpansion ? minSourceCol - 1 : colIndex;
    /** ソースと接続する方向のコマを収集（途中でエリアが変わったら停止） */
    const rangeCells = [];
    for (let col = rangeStart; col <= rangeEnd; col++) {
      const c = memberObj.cells.find((mc) => mc.colIndex === col);
      if (c && c.areaName === selectedSource.areaName) {
        rangeCells.push(c);
      } else {
        break;
      }
    }
    return {
      memberName: memberObj.name,
      colIndices: rangeCells.map((c) => c.colIndex),
      timeSlots: rangeCells.map((c) => c.timeSlot),
      areaName: selectedSource.areaName,
    };
  };

  /**
   * セルの背景色を取得
   * @param {string|null} areaName - エリア名
   * @param {string|null} selectionType - 選択種別
   * @param {boolean} isExpandable - 拡張可能セルかどうか
   * @returns {string} 背景色
   */
  const getCellBackgroundColor = (areaName, selectionType, isExpandable) => {
    if (selectionType === 'source') {
      return SELECTED_CELL_COLOR;
    }
    if (selectionType === 'destination') {
      return '#FF9800';
    }
    if (isExpandable) {
      return EXPANDABLE_CELL_COLOR;
    }
    if (areaName) {
      return SHIFT_CELL_COLOR;
    }
    return EMPTY_CELL_COLOR;
  };

  /**
   * セルのテキスト色を取得
   * @param {string|null} selectionType - 選択種別
   * @param {boolean} isExpandable - 拡張可能セルかどうか
   * @returns {string} テキスト色
   */
  const getCellTextColor = (selectionType, isExpandable) => {
    if (selectionType === 'source' || selectionType === 'destination') {
      return '#FFFFFF';
    }
    if (isExpandable) {
      return SELECTED_CELL_COLOR;
    }
    return theme.text;
  };

  /**
   * セルが選択不可かどうかを判定
   * 移動元メンバーの拡張可能なセルは許可、それ以外は移動元colIndices範囲外を不可とする
   * @param {string} memberName - メンバー名
   * @param {number} colIndex - 列インデックス
   * @returns {boolean} 選択不可の場合true
   */
  const isCellDisabled = (memberName, colIndex) => {
    if (!selectedSource) {
      return false;
    }
    // 移動元メンバーの拡張可能なセルは選択可能
    if (memberName === selectedSource.memberName && expandableColIndices.includes(colIndex)) {
      return false;
    }
    return !selectedSource.colIndices.includes(colIndex);
  };

  return (
    <View style={styles.container}>
      {/* 団体名 */}
      <Text style={[styles.organizationName, { color: theme.text }]}>
        {gridData.organizationName}
      </Text>

      <View style={styles.gridWrapper}>
        {/* 固定名前列 */}
        <View>
          {/* 名前ヘッダー */}
          <View style={[styles.nameHeaderCell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.nameHeaderText, { color: theme.textSecondary }]}>名前</Text>
          </View>
          {/* 名前セル */}
          {gridData.members.map((member) => (
            <View key={member.name} style={[styles.nameCell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.nameText, { color: theme.text }]} numberOfLines={1}>
                {member.name}
              </Text>
            </View>
          ))}
        </View>

        {/* スクロール可能なデータ列 */}
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* 時間帯ヘッダー行 */}
            <View style={styles.headerRow}>
              {gridData.timeSlots.map((timeSlot, index) => (
                <View
                  key={`header-${index}`}
                  style={[styles.headerCell, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <Text style={[styles.headerText, { color: theme.text }]} numberOfLines={1}>
                    {timeSlot}
                  </Text>
                </View>
              ))}
            </View>

            {/* メンバーデータ行 */}
            {gridData.members.map((member) => (
              <View key={member.name} style={styles.memberRow}>
                {/* データセル */}
                {member.cells.map((cell) => {
                  /** セルの選択種別 */
                  const selectionType = getSelectionType(member.name, cell.colIndex);
                  /** 拡張可能セルかどうか（移動元メンバーの隣接同エリアコマ） */
                  const isExpandable = member.name === selectedSource?.memberName &&
                    expandableColIndices.includes(cell.colIndex);
                  /** セルの背景色 */
                  const backgroundColor = getCellBackgroundColor(cell.areaName, selectionType, isExpandable);
                  /** セルのテキスト色 */
                  const textColor = getCellTextColor(selectionType, isExpandable);
                  /** 選択不可かどうか */
                  const disabled = isCellDisabled(member.name, cell.colIndex);

                  return (
                    <TouchableOpacity
                      key={`${member.name}-${cell.colIndex}`}
                      style={[
                        styles.dataCell,
                        {
                          backgroundColor,
                          borderColor: (selectionType || isExpandable) ? SELECTED_CELL_COLOR : theme.border,
                          opacity: disabled ? 0.25 : 1,
                        },
                      ]}
                      onPress={() => {
                        if (isExpandable) {
                          /** 拡張可能セルタップ: ソース境界からタップセルまでの全コマを拡張ブロックとして渡す */
                          onCellPress(getExpandableBlock(member, cell.colIndex));
                        } else {
                          onCellPress(getBlockForCell(member, cell.colIndex, selectedSource?.colIndices ?? null));
                        }
                      }}
                      activeOpacity={disabled ? 1 : 0.7}
                    >
                      <Text style={[styles.dataCellText, { color: textColor }]} numberOfLines={2}>
                        {cell.areaName || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

/**
 * スタイル定義
 */
const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  gridWrapper: {
    flexDirection: 'row',
  },
  organizationName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
  },
  headerRow: {
    flexDirection: 'row',
  },
  nameHeaderCell: {
    width: NAME_COLUMN_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  nameHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerCell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerText: {
    fontSize: 10,
    fontWeight: '600',
  },
  memberRow: {
    flexDirection: 'row',
  },
  nameCell: {
    width: NAME_COLUMN_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  nameText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dataCell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  dataCellText: {
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ShiftGrid;
