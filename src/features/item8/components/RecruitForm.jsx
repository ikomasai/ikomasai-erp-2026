/**
 * 臨時ヘルプ募集の作成・編集フォーム。
 * 必須入力の検証、日付/時刻ピッカー、送信 payload の組み立てを担当する。
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Button, ScrollView, Pressable } from 'react-native';
import { OPTIONAL_FIELD_DEFAULTS } from '../constants.js';
import { useTheme } from '../../../shared/hooks/useTheme';

const TITLE_SEPARATOR = '\n\n---\n\n';
const IMMEDIATE_TIME_LABEL = '現在時刻';
const LEGACY_IMMEDIATE_TIME_LABEL = 'いますぐ';
const META_SEPARATOR = '\n\n::META::\n\n';
const LATE_JOIN_ALLOW = 'allow';
const LATE_JOIN_DENY = 'deny';
const TIME_DROPDOWN_MIN_WIDTH = 280;
const TIME_DROPDOWN_MAX_HEIGHT = 360;
const TOGGLE_ACTIVE_COLOR = '#2563EB';

/**
 * フォームの空状態。
 */
const emptyForm = {
  headcount: '',
  work_date: '',
  work_time: '',
  location: '',
  meet_time: '',
  meet_place: '',
  title: '',
  description: '',
  reward: '',
  belongings: '',
  department_id: '',
};

/**
 * 16進カラーにアルファ値を付与する。
 *
 * @param {string} hexColor
 * @param {string} alpha
 * @returns {string}
 */
const withAlpha = (hexColor, alpha) => {
  if (typeof hexColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return `${hexColor}${alpha}`;
  }
  return hexColor;
};

/**
 * 募集フォーム本体。
 *
 * @param {{
 *   initialValues?: Record<string, any>,
 *   submitLabel?: string,
 *   onSubmit?: (payload: Record<string, any>) => void,
 *   disabled?: boolean,
 *   resetDraftToken?: number
 * }} props
 * @returns {JSX.Element}
 */
export const RecruitForm = ({
  initialValues = {},
  submitLabel = '作成',
  onSubmit,
  disabled = false,
  resetDraftToken = 0,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isEditing = Boolean(initialValues?.id);

  const [form, setForm] = useState({ ...emptyForm, ...initialValues });
  const [errors, setErrors] = useState({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateLayout, setDateLayout] = useState(null);
  const [startHour, setStartHour] = useState('');
  const [startMinute, setStartMinute] = useState('');
  const [isImmediateTime, setIsImmediateTime] = useState(false);
  const [lateJoin, setLateJoin] = useState(LATE_JOIN_ALLOW);
  const [durationMinutes, setDurationMinutes] = useState('未定');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timeLayout, setTimeLayout] = useState(null);
  const [meetTimePickerOpen, setMeetTimePickerOpen] = useState(false);
  const [meetTimeLayout, setMeetTimeLayout] = useState(null);
  const [meetHour, setMeetHour] = useState('');
  const [meetMinute, setMeetMinute] = useState('');
  const [isImmediateMeetTime, setIsImmediateMeetTime] = useState(false);
  const [containerLayout, setContainerLayout] = useState(null);
  const [notifyAllOnCreate, setNotifyAllOnCreate] = useState(true);
  const [notifyApplicantsOnUpdate, setNotifyApplicantsOnUpdate] = useState(true);

  const dateOptions = [
    { label: '2026/11/1', value: '2026-11-01' },
    { label: '2026/11/2', value: '2026-11-02' },
    { label: '2026/11/3', value: '2026-11-03' },
    { label: '2026/11/4', value: '2026-11-04' },
    { label: '2026/11/5', value: '2026-11-05' },
  ];
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    label: `${i}`.padStart(2, '0'),
    value: `${i}`.padStart(2, '0'),
  }));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => {
    const value = `${i}`.padStart(2, '0');
    return { label: value, value };
  });

  useEffect(() => {
    const parseTitleAndDescription = (value) => {
      if (!value || typeof value !== 'string') {
        return { title: '', description: '', lateJoin: LATE_JOIN_ALLOW };
      }
      const metaIdx = value.indexOf(META_SEPARATOR);
      const plain = metaIdx === -1 ? value : value.slice(0, metaIdx);
      const metaRaw = metaIdx === -1 ? '' : value.slice(metaIdx + META_SEPARATOR.length).trim();
      const parsedLateJoin = metaRaw === LATE_JOIN_ALLOW ? LATE_JOIN_ALLOW : LATE_JOIN_DENY;
      const idx = plain.indexOf(TITLE_SEPARATOR);
      if (idx === -1) {
        return { title: '', description: plain, lateJoin: parsedLateJoin };
      }
      return {
        title: plain.slice(0, idx),
        description: plain.slice(idx + TITLE_SEPARATOR.length),
        lateJoin: parsedLateJoin,
      };
    };

    const parsedText = parseTitleAndDescription(initialValues.description);
    setForm({
      ...emptyForm,
      ...initialValues,
      title: parsedText.title,
      description: parsedText.description,
    });
    setLateJoin(parsedText.lateJoin);

    // work_time 形式 "HH:MM〜HH:MM" or "HH:MM〜終了時刻未定" or "現在時刻"
    const parseFromWorkTime = (value) => {
      if (!value || typeof value !== 'string') return null;
      if (
        value === IMMEDIATE_TIME_LABEL ||
        value.startsWith(`${IMMEDIATE_TIME_LABEL}〜`) ||
        value === LEGACY_IMMEDIATE_TIME_LABEL ||
        value.startsWith(`${LEGACY_IMMEDIATE_TIME_LABEL}〜`)
      ) {
        return { immediate: true };
      }
      const m = value.match(/(?<sh>\d{2}):(?<sm>\d{2})〜(?:(?<eh>\d{2}):(?<em>\d{2})|終了時刻未定)/);
      if (!m || !m.groups) return null;
      const { sh, sm, eh, em } = m.groups;
      const parsed = { startH: sh, startM: sm, immediate: false };
      if (eh && em) {
        const startTotal = Number(sh) * 60 + Number(sm);
        const endTotal = Number(eh) * 60 + Number(em);
        const diff = ((endTotal - startTotal) + 24 * 60) % (24 * 60);
        parsed.duration = diff || '未定';
      }
      return parsed;
    };

    const parseMeetTime = (value) => {
      if (!value || typeof value !== 'string') return null;
      if (value === IMMEDIATE_TIME_LABEL || value === LEGACY_IMMEDIATE_TIME_LABEL) {
        return { immediate: true };
      }
      const m = value.match(/^(?<hh>\d{2}):(?<mm>\d{2})$/);
      if (!m || !m.groups) return null;
      return { hour: m.groups.hh, minute: m.groups.mm, immediate: false };
    };

    const parsed = parseFromWorkTime(initialValues.work_time);
    const parsedMeet = parseMeetTime(initialValues.meet_time);
    setIsImmediateTime(Boolean(parsed?.immediate));
    setStartHour(parsed?.startH || '');
    setStartMinute(parsed?.startM || '');
    setDurationMinutes(parsed?.duration ?? '未定');
    setIsImmediateMeetTime(Boolean(parsedMeet?.immediate));
    setMeetHour(parsedMeet?.hour || '');
    setMeetMinute(parsedMeet?.minute || '');
    setNotifyAllOnCreate(
      initialValues?.notify_all_on_create === undefined
        ? true
        : Boolean(initialValues?.notify_all_on_create)
    );
    setNotifyApplicantsOnUpdate(
      initialValues?.notify_applicants_on_update === undefined
        ? Boolean(initialValues?.id)
        : Boolean(initialValues?.notify_applicants_on_update)
    );
  }, [
    initialValues?.id,
    initialValues?.headcount,
    initialValues?.work_date,
    initialValues?.work_time,
    initialValues?.location,
    initialValues?.meet_time,
    initialValues?.meet_place,
    initialValues?.description,
    initialValues?.reward,
    initialValues?.belongings,
    initialValues?.department_id,
    initialValues?.notify_all_on_create,
    initialValues?.notify_applicants_on_update,
  ]);

  useEffect(() => {
    if (isEditing) return;
    setForm({ ...emptyForm });
    setErrors({});
    setDatePickerOpen(false);
    setTimePickerOpen(false);
    setMeetTimePickerOpen(false);
    setStartHour('');
    setStartMinute('');
    setIsImmediateTime(false);
    setMeetHour('');
    setMeetMinute('');
    setIsImmediateMeetTime(false);
    setDurationMinutes('未定');
    setLateJoin(LATE_JOIN_ALLOW);
    setNotifyAllOnCreate(true);
    setNotifyApplicantsOnUpdate(false);
  }, [isEditing, resetDraftToken]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * 必須項目を検証し、エラー状態を更新する。
   *
   * @returns {boolean}
   */
  const validate = () => {
    const newErrors = {};
    if (!form.headcount) newErrors.headcount = '募集人数は必須です';
    if (!form.location) newErrors.location = '場所は必須です';
    if (!form.work_date) newErrors.work_date = '募集日を入力してください';
    if (!isImmediateTime && (!startHour || !startMinute)) {
      newErrors.work_time = '開始時刻を選択してください';
    }
    if (!form.title) newErrors.title = '募集タイトルは必須です';
    if (!form.description) newErrors.description = '業務内容は必須です';
    if (!form.reward) newErrors.reward = '報酬は必須です';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 開始時刻と所要時間から work_time 文字列を生成する。
   *
   * @returns {string}
   */
  const buildWorkTime = () => {
    if (isImmediateTime) return IMMEDIATE_TIME_LABEL;
    const start = `${startHour}:${startMinute}`;
    const dur = durationMinutes?.toString().trim();
    const toMinutes = (hh, mm) => Number(hh) * 60 + Number(mm);
    const pad = (n) => `${n}`.padStart(2, '0');
    if (dur && dur !== '未定' && !Number.isNaN(Number(dur))) {
      const total = toMinutes(startHour, startMinute) + Number(dur);
      const endH = Math.floor((total % (24 * 60)) / 60);
      const endM = total % 60;
      const end = `${pad(endH)}:${pad(endM)}`;
      return `${start}〜${end}`;
    }
    return `${start}〜終了時刻未定`;
  };

  /**
   * 「現在時刻」選択時に開始時刻を現在時刻へセットする。
   */
  const selectImmediateNow = () => {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    setIsImmediateTime(false);
    setStartHour(hh);
    setStartMinute(mm);
    setTimePickerOpen(false);
  };

  /**
   * 「現在時刻」選択時に集合時刻を現在時刻へセットする。
   */
  const selectMeetImmediateNow = () => {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    setIsImmediateMeetTime(false);
    setMeetHour(hh);
    setMeetMinute(mm);
    setMeetTimePickerOpen(false);
  };

  /**
   * バリデーション後に submit 用 payload を構築して親へ通知する。
   */
  const handleSubmit = () => {
    if (!validate()) return;
    const { title, ...restForm } = form;
    const mergedDescription = `${form.title}${TITLE_SEPARATOR}${form.description}${META_SEPARATOR}${lateJoin}`;
    const selectedMeetTime = isImmediateMeetTime
      ? IMMEDIATE_TIME_LABEL
      : meetHour && meetMinute
        ? `${meetHour}:${meetMinute}`
        : '';
    const payload = {
      ...restForm,
      work_time: buildWorkTime(),
      description: mergedDescription,
      headcount: Number(form.headcount),
      department_id: form.department_id || null,
      meet_place:
        form.meet_place || OPTIONAL_FIELD_DEFAULTS.meet_place(form.location),
      meet_time:
        selectedMeetTime ||
        form.meet_time ||
        (isImmediateTime ? IMMEDIATE_TIME_LABEL : `${startHour}:${startMinute}`),
      belongings: form.belongings || OPTIONAL_FIELD_DEFAULTS.belongings,
      notify_all_on_create: notifyAllOnCreate,
      notify_applicants_on_update: notifyApplicantsOnUpdate,
    };
    onSubmit?.(payload);
  };

  /**
   * テキスト入力フィールドを描画する。
   *
   * @param {string} label
   * @param {string} key
   * @param {Record<string, any>} props
   * @returns {JSX.Element}
   */
  const renderInput = (label, key, props = {}) => (
    <View style={[styles.field, props.containerStyle]} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          props.inputStyle,
        ]}
        value={form[key]}
        onChangeText={(text) => {
          const normalized = key === 'headcount' ? text.replace(/[^0-9]/g, '') : text;
          updateField(key, normalized);
        }}
        editable={!disabled}
        placeholderTextColor={props.placeholderTextColor || theme.textSecondary}
        {...props}
      />
      {errors[key] ? <Text style={styles.error}>{errors[key]}</Text> : null}
    </View>
  );

  /**
   * 入力フィールドを横並び行として描画する。
   *
   * @param {Array<{label: string, key: string, props?: Record<string, any>}>} fields
   * @param {any} itemStyle
   * @returns {JSX.Element}
   */
  const renderRow = (fields, itemStyle = styles.half) => (
    <View style={styles.row}>
      {fields.map((f) =>
        renderInput(f.label, f.key, { ...f.props, containerStyle: itemStyle })
      )}
    </View>
  );

  /**
   * 募集日のドロップダウン付き入力を描画する。
   *
   * @param {any} containerStyle
   * @returns {JSX.Element}
   */
  const renderDatePicker = (containerStyle = styles.half) => {
    const selected = dateOptions.find((o) => o.value === form.work_date);
    return (
      <View
        style={[styles.field, containerStyle, datePickerOpen && styles.fieldRaised]}
        onLayout={(e) => setDateLayout(e.nativeEvent.layout)}
      >
        <Text style={styles.label}>募集日</Text>
        <Button
          title={selected ? selected.label : '選択してください'}
          onPress={() => {
            setTimePickerOpen(false);
            setMeetTimePickerOpen(false);
            setDatePickerOpen((v) => !v);
          }}
          disabled={disabled}
          color={selected ? theme.primary : theme.textSecondary}
        />
        {errors.work_date ? <Text style={styles.error}>{errors.work_date}</Text> : null}
      </View>
    );
  };

  /**
   * 時刻ドロップダウンの表示位置を算出する。
   *
   * @param {{x?: number, y?: number, width?: number, height?: number} | null} anchorLayout
   * @returns {{top: number, left: number, width: number} | null}
   */
  const getTimeDropdownPlacement = (anchorLayout) => {
    if (!anchorLayout) return null;
    const baseWidth = anchorLayout.width || 0;
    const widthCandidate = Math.max(baseWidth, TIME_DROPDOWN_MIN_WIDTH);
    const containerWidth = containerLayout?.width || widthCandidate;
    const containerHeight = containerLayout?.height || 0;
    const width = Math.min(widthCandidate, containerWidth);
    const maxLeft = Math.max(0, containerWidth - width);
    const left = Math.max(0, Math.min(anchorLayout.x || 0, maxLeft));
    const belowTop = (anchorLayout.y || 0) + (anchorLayout.height || 0) + 4;
    const canPlaceBelow =
      containerHeight === 0 || belowTop + TIME_DROPDOWN_MAX_HEIGHT <= containerHeight;
    const top = canPlaceBelow
      ? belowTop
      : Math.max(0, (anchorLayout.y || 0) - TIME_DROPDOWN_MAX_HEIGHT - 4);
    return {
      top,
      left,
      width,
    };
  };

  const timeDropdownPlacement = getTimeDropdownPlacement(timeLayout);
  const meetTimeDropdownPlacement = getTimeDropdownPlacement(meetTimeLayout);
  const canConfirmTime = isImmediateTime || (Boolean(startHour) && Boolean(startMinute));
  const canConfirmMeetTime = isImmediateMeetTime || (Boolean(meetHour) && Boolean(meetMinute));

  return (
    <View style={styles.container} onLayout={(e) => setContainerLayout(e.nativeEvent.layout)}>
      <Text style={styles.sectionTitle}>募集情報</Text>
      {/* 行1: 募集人数 / 場所 / 集合場所 */}
      {renderRow(
        [
          { label: '募集人数', key: 'headcount', props: { keyboardType: 'numeric' } },
          { label: '場所', key: 'location', props: { placeholder: 'A棟 2F' } },
          { label: '集合場所（任意）', key: 'meet_place', props: { placeholder: 'A棟 1F ロビー' } },
        ],
        styles.third
      )}

      {/* 行2: 募集日 / 開始時刻 / 所要時間目安 */}
      <View style={styles.row}>
        {renderDatePicker(styles.third)}
        <View
          style={[styles.field, styles.third, timePickerOpen && styles.fieldRaised]}
          onLayout={(e) => setTimeLayout(e.nativeEvent.layout)}
        >
          <Text style={styles.label}>開始時刻</Text>
          <Button
            title={
              isImmediateTime
                ? IMMEDIATE_TIME_LABEL
                : startHour && startMinute
                  ? `${startHour}:${startMinute}`
                  : '開始時刻を選択'
            }
            onPress={() => {
              setDatePickerOpen(false);
              setMeetTimePickerOpen(false);
              setTimePickerOpen((v) => !v);
            }}
            color={theme.primary}
          />
          {errors.work_time ? <Text style={styles.error}>{errors.work_time}</Text> : null}
        </View>
        <View style={[styles.field, styles.third]}>
          <Text style={styles.label}>所要時間目安（分）</Text>
          <TextInput
            style={styles.input}
            value={durationMinutes === '未定' ? '' : durationMinutes}
            onChangeText={(text) => {
              const onlyNumber = text.replace(/[^0-9]/g, '');
              setDurationMinutes(onlyNumber || '未定');
            }}
            placeholder="未定"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      </View>

      {/* 行3: 報酬 / 集合時間 / 持ち物 */}
      <View style={styles.row}>
        {renderInput('報酬', 'reward', {
          placeholder: 'カントリーマアム1個',
          containerStyle: styles.third,
        })}
        <View
          style={[styles.field, styles.third, meetTimePickerOpen && styles.fieldRaised]}
          onLayout={(e) => setMeetTimeLayout(e.nativeEvent.layout)}
        >
          <Text style={styles.label}>集合時間（任意）</Text>
          <Button
            title={
              isImmediateMeetTime
                ? IMMEDIATE_TIME_LABEL
                : meetHour && meetMinute
                  ? `${meetHour}:${meetMinute}`
                  : '集合時間を選択'
            }
            onPress={() => {
              setDatePickerOpen(false);
              setTimePickerOpen(false);
              setMeetTimePickerOpen((v) => !v);
            }}
            color={theme.primary}
          />
        </View>
        {renderInput('持ち物（任意）', 'belongings', {
          placeholder: 'なし',
          containerStyle: styles.third,
        })}
      </View>

      {/* 行4: 募集タイトル */}
      <View style={styles.row}>
        {renderInput('募集タイトル', 'title', {
          placeholder: '例: 受付前の案内サポート募集',
          containerStyle: styles.twoThird,
        })}
        <View style={[styles.field, styles.third]}>
          <Text style={styles.label}>途中参加の可否</Text>
          <View style={styles.checkboxRow}>
            <Pressable
              style={styles.checkboxOption}
              onPress={() => setLateJoin(LATE_JOIN_ALLOW)}
              disabled={disabled}
            >
              <View style={[styles.radioOuter, lateJoin === LATE_JOIN_ALLOW && styles.radioOuterChecked]}>
                {lateJoin === LATE_JOIN_ALLOW ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.checkboxLabel}>可</Text>
            </Pressable>
            <Pressable
              style={styles.checkboxOption}
              onPress={() => setLateJoin(LATE_JOIN_DENY)}
              disabled={disabled}
            >
              <View style={[styles.radioOuter, lateJoin === LATE_JOIN_DENY && styles.radioOuterChecked]}>
                {lateJoin === LATE_JOIN_DENY ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.checkboxLabel}>不可</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 行5: 業務内容 */}
      {renderInput('業務内容', 'description', { multiline: true, inputStyle: styles.textarea })}
      {!isEditing ? (
        <View style={styles.notifyToggleRow}>
          <Text style={styles.notifyToggleLabel}>作成時に全員への通知を行う</Text>
          <Pressable
            style={[
              styles.customToggleTrack,
              { backgroundColor: notifyAllOnCreate ? withAlpha(TOGGLE_ACTIVE_COLOR, '55') : withAlpha(theme.textSecondary, '55') },
              disabled && styles.customToggleDisabled,
            ]}
            onPress={() => setNotifyAllOnCreate((prev) => !prev)}
            disabled={disabled}
          >
            <View
              style={[
                styles.customToggleThumb,
                {
                  backgroundColor: notifyAllOnCreate ? TOGGLE_ACTIVE_COLOR : theme.surface,
                  borderColor: notifyAllOnCreate ? TOGGLE_ACTIVE_COLOR : withAlpha(theme.textSecondary, '88'),
                  transform: [{ translateX: notifyAllOnCreate ? 18 : 0 }],
                },
              ]}
            />
          </Pressable>
        </View>
      ) : (
        <View style={styles.notifyToggleRow}>
          <Text style={styles.notifyToggleLabel}>変更時に応募済みの人へ通知する</Text>
          <Pressable
            style={[
              styles.customToggleTrack,
              { backgroundColor: notifyApplicantsOnUpdate ? withAlpha(TOGGLE_ACTIVE_COLOR, '55') : withAlpha(theme.textSecondary, '55') },
              disabled && styles.customToggleDisabled,
            ]}
            onPress={() => setNotifyApplicantsOnUpdate((prev) => !prev)}
            disabled={disabled}
          >
            <View
              style={[
                styles.customToggleThumb,
                {
                  backgroundColor: notifyApplicantsOnUpdate ? TOGGLE_ACTIVE_COLOR : theme.surface,
                  borderColor: notifyApplicantsOnUpdate ? TOGGLE_ACTIVE_COLOR : withAlpha(theme.textSecondary, '88'),
                  transform: [{ translateX: notifyApplicantsOnUpdate ? 18 : 0 }],
                },
              ]}
            />
          </Pressable>
        </View>
      )}
      <Button title={submitLabel} onPress={handleSubmit} disabled={disabled} color={theme.primary} />
      {datePickerOpen && (
        <>
          <Pressable style={styles.portalOverlay} onPress={() => setDatePickerOpen(false)} />
          <View
            style={[
              styles.portalDropdown,
              dateLayout && {
                top: (dateLayout.y || 0) + (dateLayout.height || 0) + 4,
                left: dateLayout.x || 0,
                width: dateLayout.width || '100%',
              },
            ]}
          >
            {dateOptions.map((opt) => (
              <Text
                key={opt.value}
                style={styles.dropdownItem}
                onPress={() => {
                  updateField('work_date', opt.value);
                  setDatePickerOpen(false);
                }}
              >
                {opt.label}
              </Text>
            ))}
          </View>
        </>
      )}

      {timePickerOpen && (
        <>
          <Pressable style={styles.portalOverlay} onPress={() => setTimePickerOpen(false)} />
          <View
            style={[
              styles.timeDropdown,
              timeDropdownPlacement || {},
            ]}
          >
            <Pressable style={styles.timeQuickOption} onPress={selectImmediateNow}>
              <Text style={styles.timeQuickText}>{IMMEDIATE_TIME_LABEL}</Text>
            </Pressable>
            <View style={styles.timeGrid}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeHeader}>時</Text>
                <ScrollView style={styles.timeScroll} nestedScrollEnabled>
                  {hourOptions.map((opt) => (
                    <Text
                      key={opt.value}
                      style={[
                        styles.dropdownItem,
                        !isImmediateTime && opt.value === startHour && styles.timeSelected,
                      ]}
                      onPress={() => {
                        setIsImmediateTime(false);
                        setStartHour(opt.value);
                      }}
                    >
                      {opt.label}
                    </Text>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.timeColumn}>
                <Text style={styles.timeHeader}>分</Text>
                <ScrollView style={styles.timeScroll} nestedScrollEnabled>
                  {minuteOptions.map((opt) => (
                    <Text
                      key={opt.value}
                      style={[
                        styles.dropdownItem,
                        !isImmediateTime && opt.value === startMinute && styles.timeSelected,
                      ]}
                      onPress={() => {
                        setIsImmediateTime(false);
                        setStartMinute(opt.value);
                      }}
                    >
                      {opt.label}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Pressable
              style={[
                styles.timeConfirmButton,
                !canConfirmTime && styles.timeConfirmButtonDisabled,
              ]}
              onPress={() => {
                if (canConfirmTime) {
                  setTimePickerOpen(false);
                }
              }}
              disabled={!canConfirmTime}
            >
              <Text
                style={[
                  styles.timeConfirmText,
                  !canConfirmTime && styles.timeConfirmTextDisabled,
                ]}
              >
                決定
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {meetTimePickerOpen && (
        <>
          <Pressable style={styles.portalOverlay} onPress={() => setMeetTimePickerOpen(false)} />
          <View
            style={[
              styles.timeDropdown,
              meetTimeDropdownPlacement || {},
            ]}
          >
            <Pressable style={styles.timeQuickOption} onPress={selectMeetImmediateNow}>
              <Text style={styles.timeQuickText}>{IMMEDIATE_TIME_LABEL}</Text>
            </Pressable>
            <View style={styles.timeGrid}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeHeader}>時</Text>
                <ScrollView style={styles.timeScroll} nestedScrollEnabled>
                  {hourOptions.map((opt) => (
                    <Text
                      key={`meet-hour-${opt.value}`}
                      style={[
                        styles.dropdownItem,
                        !isImmediateMeetTime && opt.value === meetHour && styles.timeSelected,
                      ]}
                      onPress={() => {
                        setIsImmediateMeetTime(false);
                        setMeetHour(opt.value);
                      }}
                    >
                      {opt.label}
                    </Text>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.timeColumn}>
                <Text style={styles.timeHeader}>分</Text>
                <ScrollView style={styles.timeScroll} nestedScrollEnabled>
                  {minuteOptions.map((opt) => (
                    <Text
                      key={`meet-minute-${opt.value}`}
                      style={[
                        styles.dropdownItem,
                        !isImmediateMeetTime && opt.value === meetMinute && styles.timeSelected,
                      ]}
                      onPress={() => {
                        setIsImmediateMeetTime(false);
                        setMeetMinute(opt.value);
                      }}
                    >
                      {opt.label}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Pressable
              style={[
                styles.timeConfirmButton,
                !canConfirmMeetTime && styles.timeConfirmButtonDisabled,
              ]}
              onPress={() => {
                if (canConfirmMeetTime) {
                  setMeetTimePickerOpen(false);
                }
              }}
              disabled={!canConfirmMeetTime}
            >
              <Text
                style={[
                  styles.timeConfirmText,
                  !canConfirmMeetTime && styles.timeConfirmTextDisabled,
                ]}
              >
                決定
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
};

/**
 * テーマ依存スタイルを生成する。
 *
 * @param {Record<string, any>} theme
 * @returns {ReturnType<typeof StyleSheet.create>}
 */
const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      padding: 12,
      gap: 8,
      position: 'relative',
    },
    sectionTitle: {
      fontSize: 16,
      color: theme.text,
      fontWeight: theme.fontWeight,
      marginBottom: 4,
    },
    field: {
      marginBottom: 8,
      position: 'relative',
    },
    label: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 4,
    },
    fieldRaised: {
      zIndex: 2000,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.borderRadius,
      padding: 8,
      color: theme.text,
      backgroundColor: theme.background,
    },
    error: {
      color: theme.error,
      fontSize: 12,
      marginTop: 2,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    half: {
      flex: 1,
    },
    third: {
      flex: 1,
    },
    twoThird: {
      flex: 2,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    textarea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    notifyToggleRow: {
      marginTop: 2,
      marginBottom: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.border, 'BB'),
    },
    notifyToggleLabel: {
      fontSize: 13,
      color: theme.text,
    },
    customToggleTrack: {
      width: 44,
      height: 26,
      borderRadius: 999,
      paddingHorizontal: 3,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.border, 'BB'),
    },
    customToggleThumb: {
      width: 18,
      height: 18,
      borderRadius: 999,
      borderWidth: 1,
    },
    customToggleDisabled: {
      opacity: 0.6,
    },
    dropdownItem: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      fontSize: 14,
      backgroundColor: theme.surface,
      color: theme.text,
    },
    timeDropdown: {
      position: 'absolute',
      minWidth: TIME_DROPDOWN_MIN_WIDTH,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.borderRadius,
      zIndex: 4200,
      padding: 8,
      gap: 8,
      maxHeight: TIME_DROPDOWN_MAX_HEIGHT,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 14,
      overflow: 'hidden',
    },
    timeGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    timeQuickOption: {
      width: '100%',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
      marginBottom: 8,
    },
    timeQuickText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    timeColumn: {
      flex: 1,
    },
    timeHeader: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 4,
    },
    timeScroll: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.borderRadius,
      maxHeight: 210,
      backgroundColor: theme.surface,
    },
    timeSelected: {
      backgroundColor: withAlpha(theme.primary, '22'),
      color: theme.primary,
      fontWeight: '700',
    },
    timeConfirmButton: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primary,
      borderRadius: theme.borderRadius,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    timeConfirmButtonDisabled: {
      borderColor: theme.border,
      backgroundColor: theme.border,
    },
    timeConfirmText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    timeConfirmTextDisabled: {
      color: theme.textSecondary,
    },
    checkboxRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      minHeight: 40,
    },
    checkboxOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderWidth: 1,
      borderColor: theme.textSecondary,
      borderRadius: 999,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterChecked: {
      borderColor: theme.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    checkboxLabel: {
      fontSize: 13,
      color: theme.text,
    },
    portalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha('#000000', '40'),
      zIndex: 3900,
    },
    portalDropdown: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.borderRadius,
      backgroundColor: theme.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 12,
      overflow: 'hidden',
      zIndex: 4100,
    },
  });

export default RecruitForm;
