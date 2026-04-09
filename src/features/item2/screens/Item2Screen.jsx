/**
 * item2 メイン画面
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { getSupabaseClient } from '../../../services/supabase/client';
import GoResponderModal from '../components/GoResponderModal';
import { useAssignees } from '../hooks/useAssignees';
import { useCalls } from '../hooks/useCalls';
import CallListScreen from './CallListScreen';
import {
  ITEM2_CALL_STATUSES,
  ITEM2_CALL_TYPES,
  ITEM2_TITLES,
  ITEM2_VIEW_MODES,
  ITEM2_DETAIL_STATUSES,
} from '../constants';
import {
  insertItem2Call,
  selectItem2StaffUsers,
  updateItem2CallAdditionalInfo,
  updateItem2CallAssignees,
  updateItem2CallStatus,
} from '../services/item2CallService';
import { notifyItem2CallCreated } from '../services/item2NotificationService';

const ITEM2_STAFF_ROLE_NAME = '厚生部';
const ITEM2_ADMIN_ROLE_NAME = '管理者';
const ITEM2_TABLE_NOT_FOUND_MESSAGE = '厚生部呼び出し用のテーブルが未作成です。`db/migrations/20260308_create_item2_kouseibu_call_tables.sql` を Supabase に適用してください。';
const ITEM2_CALLS_TABLE_NAME = 'public.item2_calls';
const ITEM2_TABLE_NOT_FOUND_KEYWORD = `Could not find the table '${ITEM2_CALLS_TABLE_NAME}' in the schema cache`;
const ITEM2_REQUESTER_RELATIONS = {
  SELF: 'self',
  OTHER: 'other',
};
const ITEM2_REQUESTER_RELATION_DISPLAY = {
  [ITEM2_REQUESTER_RELATIONS.SELF]: '本人',
  [ITEM2_REQUESTER_RELATIONS.OTHER]: '本人ではない',
};
const ITEM2_CONDITION_OPTIONS = [
  { label: '軽い怪我(擦り傷や打撲など)', value: 'injury_light' },
  { label: '中程度の怪我(切り傷や捻挫など)', value: 'injury_medium' },
  { label: '重度の怪我(転落や骨折など)', value: 'injury_severe' },
  { label: '体調不良', value: 'physical_condition' },
  { label: 'その他(様子がおかしい/震えているなど)', value: 'other' },
];
const ITEM2_BLEEDING_PRESENCE_OPTIONS = [
  { label: 'ある', value: 'yes' },
  { label: 'ない', value: 'no' },
];
const ITEM2_BLEEDING_PRESENCE_DISPLAY = {
  yes: 'あり',
  no: 'なし',
};
const ITEM2_OTHER_PERSON_CONSCIOUSNESS_OPTIONS = [
  { label: 'ある', value: 'alert' },
  { label: '反応が弱い', value: 'weak' },
  { label: 'ない', value: 'none' },
];
const ITEM2_OTHER_PERSON_CONSCIOUSNESS_DISPLAY = {
  alert: 'あり',
  weak: '反応が弱い',
  none: 'なし',
};
const ITEM2_OTHER_PERSON_BREATHING_OPTIONS = [
  { label: 'している', value: 'yes' },
  { label: 'していない', value: 'no' },
  { label: 'わからない', value: 'unknown' },
];
const ITEM2_OTHER_PERSON_BREATHING_DISPLAY = {
  yes: 'あり',
  no: 'なし',
  unknown: 'わからない',
};
const ITEM2_SELF_MOBILITY_OPTIONS = [
  { label: 'どちらもできる', value: 'walkable' },
  { label: '立つことはできるが歩くことは厳しい', value: 'can_stand_only' },
  { label: 'どちらもできない', value: 'cannot_stand_or_walk' },
];
const ITEM2_SWELLING_STATUS_OPTIONS = [
  { label: '腫れている', value: 'swollen' },
  { label: '内出血がある', value: 'bruised' },
  { label: 'ない', value: 'none' },
  { label: 'わからない', value: 'unknown' },
  { label: 'その他', value: 'other' },
];
const ITEM2_CURRENT_STATE_OPTIONS = [
  { label: '倒れ込んでいる', value: 'lying_down' },
  { label: '座り込んでいる', value: 'sitting' },
  { label: '普段と変わらない', value: 'normal' },
  { label: 'その他', value: 'other' },
];
const ITEM2_SYMPTOM_OPTIONS = [
  { label: '発熱', value: 'fever' },
  { label: '倦怠感', value: 'fatigue' },
  { label: 'めまい', value: 'dizziness' },
  { label: '頭痛', value: 'headache' },
  { label: '吐き気', value: 'nausea' },
  { label: '腹痛', value: 'stomachache' },
  { label: '手足のしびれ', value: 'numbness' },
  { label: '吐血', value: 'hematemesis' },
  { label: 'その他', value: 'other' },
];
const STAFF_STATUS_ORDER = {
  [ITEM2_CALL_STATUSES.UNHANDLED]: 0,
  [ITEM2_CALL_STATUSES.IN_PROGRESS]: 1,
  [ITEM2_CALL_STATUSES.RESOLVED]: 2,
};
const INITIAL_FORM_ANSWERS = {
  callType: ITEM2_CALL_TYPES.NON_URGENT,
  requesterRelation: '',
  consciousness: '',
  breathing: '',
  mobility: '',
  locationText: '',
  conditionCategory: '',
  bleedingPresence: '',
  painLocation: '',
  swellingStatus: '',
  swellingStatusOther: '',
  bleedingLocation: '',
  bleedingAmount: '',
  currentState: '',
  currentStateOther: '',
  symptoms: [],
  symptomsOther: '',
  conditionOtherText: '',
  suppliesNeeded: '',
};

const buildInitialFormAnswers = (overrides = {}) => {
  return {
    ...INITIAL_FORM_ANSWERS,
    ...overrides,
    symptoms: Array.isArray(overrides.symptoms) ? overrides.symptoms : INITIAL_FORM_ANSWERS.symptoms,
  };
};

const isItem2TableMissingError = (error) => {
  const errorMessage = error?.message ?? error?.details ?? '';
  return typeof errorMessage === 'string' && errorMessage.includes(ITEM2_TABLE_NOT_FOUND_KEYWORD);
};

const buildItem2ErrorMessage = (error, fallbackMessage) => {
  if (isItem2TableMissingError(error)) {
    return ITEM2_TABLE_NOT_FOUND_MESSAGE;
  }

  return error?.message ?? fallbackMessage;
};

const findOptionLabel = (options, value) => {
  return options.find((option) => option.value === value)?.label ?? '';
};

const applyAnswerUpdate = (previousAnswers, key, value) => {
  const nextAnswers = {
    ...previousAnswers,
    [key]: value,
  };

  if (key === 'requesterRelation') {
    if (value === ITEM2_REQUESTER_RELATIONS.SELF) {
      nextAnswers.consciousness = '';
      nextAnswers.breathing = '';
    }
    if (value === ITEM2_REQUESTER_RELATIONS.OTHER) {
      nextAnswers.mobility = '';
    }
  }

  if (key === 'conditionCategory') {
    nextAnswers.bleedingPresence = '';
    nextAnswers.painLocation = '';
    nextAnswers.swellingStatus = '';
    nextAnswers.swellingStatusOther = '';
    nextAnswers.bleedingLocation = '';
    nextAnswers.bleedingAmount = '';
    nextAnswers.currentState = '';
    nextAnswers.currentStateOther = '';
    nextAnswers.symptoms = [];
    nextAnswers.symptomsOther = '';
    nextAnswers.conditionOtherText = '';
  }

  if (key === 'bleedingPresence') {
    if (value !== 'yes') {
      nextAnswers.bleedingLocation = '';
      nextAnswers.bleedingAmount = '';
    }

    if (value !== 'no') {
      nextAnswers.painLocation = '';
      nextAnswers.swellingStatus = '';
      nextAnswers.swellingStatusOther = '';
    }
  }

  if (key === 'swellingStatus' && value !== 'other') {
    nextAnswers.swellingStatusOther = '';
  }

  if (key === 'currentState' && value !== 'other') {
    nextAnswers.currentStateOther = '';
  }

  return nextAnswers;
};

const toggleSymptomSelection = (previousAnswers, symptomValue) => {
  const hasSelected = previousAnswers.symptoms.includes(symptomValue);
  const nextSymptoms = hasSelected
    ? previousAnswers.symptoms.filter((item) => item !== symptomValue)
    : [...previousAnswers.symptoms, symptomValue];

  return {
    ...previousAnswers,
    symptoms: nextSymptoms,
    symptomsOther: nextSymptoms.includes('other') ? previousAnswers.symptomsOther : '',
  };
};

const buildAnswersFromCall = (callData) => {
  const rawAnswers = callData?.assessment_answers;
  const assessmentAnswers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
    ? rawAnswers
    : {};

  return buildInitialFormAnswers({
    ...assessmentAnswers,
    callType: callData?.call_type ?? ITEM2_CALL_TYPES.NON_URGENT,
    requesterRelation: assessmentAnswers.requesterRelation ?? callData?.requester_relation ?? '',
    locationText: assessmentAnswers.locationText ?? callData?.location_text ?? '',
    conditionCategory: assessmentAnswers.conditionCategory ?? '',
    suppliesNeeded: assessmentAnswers.suppliesNeeded ?? '',
  });
};

const buildSummaryText = (answers) => {
  const summaryLines = [];
  const pushSummaryLine = (label, value) => {
    if (!value) {
      return;
    }
    summaryLines.push(`${label}: ${value}`);
  };

  pushSummaryLine('場所', answers.locationText?.trim() ?? '');
  pushSummaryLine('必要なもの', answers.suppliesNeeded?.trim() ?? '');
  pushSummaryLine('傷病者', ITEM2_REQUESTER_RELATION_DISPLAY[answers.requesterRelation] ?? '');
  const conditionLabel = findOptionLabel(ITEM2_CONDITION_OPTIONS, answers.conditionCategory);
  pushSummaryLine('状態', conditionLabel);

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER) {
    pushSummaryLine('意識', ITEM2_OTHER_PERSON_CONSCIOUSNESS_DISPLAY[answers.consciousness] ?? '');
    pushSummaryLine('呼吸', ITEM2_OTHER_PERSON_BREATHING_DISPLAY[answers.breathing] ?? '');
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF) {
    pushSummaryLine('移動', findOptionLabel(ITEM2_SELF_MOBILITY_OPTIONS, answers.mobility));
  }

  switch (answers.conditionCategory) {
    case 'injury_light':
    case 'injury_medium':
    case 'injury_severe': {
      pushSummaryLine('出血', ITEM2_BLEEDING_PRESENCE_DISPLAY[answers.bleedingPresence] ?? '');

      if (answers.bleedingPresence === 'yes') {
        pushSummaryLine('出血部位', answers.bleedingLocation.trim());
        pushSummaryLine('出血量', answers.bleedingAmount.trim());
        return summaryLines.join('\n');
      }

      const swellingLabel = answers.swellingStatus === 'other'
        ? answers.swellingStatusOther.trim()
        : findOptionLabel(ITEM2_SWELLING_STATUS_OPTIONS, answers.swellingStatus);
      pushSummaryLine('痛みの部位', answers.painLocation.trim());
      pushSummaryLine('腫れ・内出血', swellingLabel);
      return summaryLines.join('\n');
    }
    case 'physical_condition': {
      const symptomLabels = answers.symptoms.map((symptom) => {
        return symptom === 'other' ? answers.symptomsOther.trim() : findOptionLabel(ITEM2_SYMPTOM_OPTIONS, symptom);
      }).filter(Boolean);
      pushSummaryLine('症状', symptomLabels.join('、'));
      return summaryLines.join('\n');
    }
    case 'other':
      pushSummaryLine('詳細', answers.conditionOtherText.trim());
      return summaryLines.join('\n');
    default:
      return summaryLines.join('\n');
  }
};

const validateFormAnswers = (answers) => {
  if (!answers.locationText.trim()) {
    return '場所を入力してください。';
  }

  return '';
};

const Item2Screen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();
  const isScreenFocused = useIsFocused();
  const { calls, isLoading, refreshCalls, setCalls } = useCalls();
  const [viewMode, setViewMode] = useState(ITEM2_VIEW_MODES.CREATE);
  const [staffUsers, setStaffUsers] = useState([]);
  const [screenError, setScreenError] = useState('');
  const [createFeedback, setCreateFeedback] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formAnswers, setFormAnswers] = useState(buildInitialFormAnswers());
  const [responderProfiles, setResponderProfiles] = useState([]);
  const [additionalInfoCall, setAdditionalInfoCall] = useState(null);
  const [additionalInfoAnswers, setAdditionalInfoAnswers] = useState(buildInitialFormAnswers());
  const [additionalInfoErrorMessage, setAdditionalInfoErrorMessage] = useState('');
  const [isAdditionalInfoSubmitting, setIsAdditionalInfoSubmitting] = useState(false);
  const [resolveConfirmCall, setResolveConfirmCall] = useState(null);
  const [isResolveSubmitting, setIsResolveSubmitting] = useState(false);
  const isCreateSubmittingRef = useRef(false);
  const createAttemptIdRef = useRef(0);
  const settledCreateAttemptIdRef = useRef(0);
  const detailSnoozedCallIdsRef = useRef(new Set());
  const responderModal = useAssignees();
  const canAccessStaffViews = Boolean(
    userInfo?.roles?.some((role) => {
      return [role?.name, role?.display_name].includes(ITEM2_STAFF_ROLE_NAME)
        || [role?.name, role?.display_name].includes(ITEM2_ADMIN_ROLE_NAME);
    })
  );

  const pendingDetailCall = (() => {
    if (!user?.id) {
      return null;
    }

    const pendingCalls = calls.filter((callItem) => {
      return callItem.requester_user_id === user.id
        && callItem.status !== ITEM2_CALL_STATUSES.RESOLVED
        && callItem.detail_status !== ITEM2_DETAIL_STATUSES.COMPLETED
        && !detailSnoozedCallIdsRef.current.has(callItem.id);
    });

    if (pendingCalls.length === 0) {
      return null;
    }

    return [...pendingCalls].sort((left, right) => {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })[0] ?? null;
  })();

  useEffect(() => {
    const requestedTab = route?.params?.initialTab;
    if (canAccessStaffViews) {
      setViewMode(ITEM2_VIEW_MODES.LIST);
      return;
    }

    if ([ITEM2_VIEW_MODES.CREATE, ITEM2_VIEW_MODES.LIST].includes(requestedTab)) {
      setViewMode(requestedTab);
    }
  }, [canAccessStaffViews, route?.params?.initialTab]);

  useEffect(() => {
    const loadStaffUsers = async () => {
      const result = await selectItem2StaffUsers();

      if (result.error) {
        setScreenError(buildItem2ErrorMessage(result.error, '厚生部ユーザー取得に失敗しました。'));
        setStaffUsers([]);
        return;
      }

      setStaffUsers(result.users);
    };

    if (!canAccessStaffViews) {
      setStaffUsers([]);
      return;
    }

    loadStaffUsers();
  }, [canAccessStaffViews]);

  useEffect(() => {
    const loadResponderProfiles = async () => {
      const assignedUserIds = Array.from(new Set(
        calls.flatMap((callItem) => {
          return Array.isArray(callItem.assigned_to) ? callItem.assigned_to : [];
        }).filter(Boolean)
      ));

      if (assignedUserIds.length === 0) {
        setResponderProfiles([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, name')
        .in('user_id', assignedUserIds);

      if (error) {
        setResponderProfiles([]);
        return;
      }

      setResponderProfiles(Array.isArray(data) ? data : []);
    };

    loadResponderProfiles();
  }, [calls]);

  useEffect(() => {
    if (isScreenFocused) {
      return;
    }

    detailSnoozedCallIdsRef.current.clear();
  }, [isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused || canAccessStaffViews || additionalInfoCall || !pendingDetailCall) {
      return;
    }

    openAdditionalInfoModal(pendingDetailCall);
  }, [additionalInfoCall, canAccessStaffViews, isScreenFocused, pendingDetailCall]);

  const buildResponderLabel = (callData) => {
    const storedResponderNames = Array.isArray(callData?.assessment_answers?.responderNames)
      ? callData.assessment_answers.responderNames.filter(Boolean)
      : [];

    if (storedResponderNames.length > 0) {
      return storedResponderNames.join('、');
    }

    const userIds = Array.isArray(callData?.assigned_to) ? callData.assigned_to : [];
    if (userIds.length === 0) {
      return '未決定';
    }

    const names = userIds.map((userId) => {
      const matchedResponder = responderProfiles.find((profile) => profile.user_id === userId);
      const matchedUser = matchedResponder ?? staffUsers.find((userItem) => userItem.id === userId);
      return matchedUser?.name ?? '設定済み';
    });

    return names.join('、');
  };

  const patchCall = (nextCall) => {
    setCalls((previousCalls) => {
      return previousCalls.map((callItem) => {
        return callItem.id === nextCall.id ? { ...callItem, ...nextCall } : callItem;
      });
    });
  };

  const updateFormAnswer = (key, value) => {
    setFormAnswers((previousAnswers) => ({
      ...previousAnswers,
      [key]: value,
    }));
  };

  const updateAdditionalInfoAnswer = (key, value) => {
    setAdditionalInfoErrorMessage('');
    setAdditionalInfoAnswers((previousAnswers) => applyAnswerUpdate(previousAnswers, key, value));
  };

  const toggleAdditionalInfoSymptom = (symptomValue) => {
    setAdditionalInfoErrorMessage('');
    setAdditionalInfoAnswers((previousAnswers) => toggleSymptomSelection(previousAnswers, symptomValue));
  };

  const openAdditionalInfoModal = (callData, { shouldFocusDetail = true } = {}) => {
    if (!callData?.id) {
      return;
    }

    detailSnoozedCallIdsRef.current.delete(callData.id);
    setAdditionalInfoErrorMessage('');
    setAdditionalInfoAnswers(buildAnswersFromCall(callData));
    setAdditionalInfoCall(callData);

    if (shouldFocusDetail) {
      setViewMode(ITEM2_VIEW_MODES.LIST);
    }
  };

  const closeAdditionalInfoModal = () => {
    if (isAdditionalInfoSubmitting) {
      return;
    }

    const currentCallId = additionalInfoCall?.id;
    if (currentCallId) {
      detailSnoozedCallIdsRef.current.add(currentCallId);
    }

    setAdditionalInfoErrorMessage('');
    clearAdditionalInfoModal();
  };

  const clearAdditionalInfoModal = () => {
    setAdditionalInfoCall(null);
    setAdditionalInfoAnswers(buildAnswersFromCall({}));
    setAdditionalInfoErrorMessage('');
  };

  const validateAdditionalInfoAnswers = (answers) => {
    if (!answers.requesterRelation) {
      return '傷病者があなた自身かどうかを入力してください。';
    }

    if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF) {
      if (!answers.mobility) {
        return 'あなたは立つ/歩くことができるかを入力してください。';
      }
    }

    if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER) {
      if (!answers.consciousness) {
        return '傷病者の意識を入力してください。';
      }

      if (!answers.breathing) {
        return '傷病者の呼吸を入力してください。';
      }
    }

    if (!answers.conditionCategory) {
      return '状態カテゴリを入力してください。';
    }

    if (['injury_light', 'injury_medium', 'injury_severe'].includes(answers.conditionCategory) && !answers.bleedingPresence) {
      return '出血の有無を入力してください。';
    }

    if (['injury_light', 'injury_medium', 'injury_severe'].includes(answers.conditionCategory) && answers.bleedingPresence === 'yes') {
      if (!answers.bleedingLocation.trim()) {
        return '出血している場所を入力してください。';
      }

      if (!answers.bleedingAmount.trim()) {
        return '出血量を入力してください。';
      }
    }

    if (['injury_light', 'injury_medium', 'injury_severe'].includes(answers.conditionCategory) && answers.bleedingPresence === 'no') {
      if (!answers.painLocation.trim()) {
        return answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF
          ? 'どこが痛いかを入力してください。'
          : '傷病者のどこが痛いかを入力してください。';
      }

      if (!answers.swellingStatus) {
        return '腫れや内出血等の状態を入力してください。';
      }

      if (answers.swellingStatus === 'other' && !answers.swellingStatusOther.trim()) {
        return 'その他の状態を入力してください。';
      }
    }

    if (answers.conditionCategory === 'physical_condition') {
      if (!Array.isArray(answers.symptoms) || answers.symptoms.length === 0) {
        return '症状を入力してください。';
      }

      if (answers.symptoms.includes('other') && !answers.symptomsOther.trim()) {
        return 'その他の症状を入力してください。';
      }
    }

    if (answers.conditionCategory === 'other' && !answers.conditionOtherText.trim()) {
      return 'その他の状態を入力してください。';
    }

    return '';
  };

  const saveAdditionalInfo = async ({ detailStatus, shouldClose = false }) => {
    if (!additionalInfoCall?.id) {
      if (shouldClose) {
        clearAdditionalInfoModal();
      }
      return;
    }

    if (detailStatus === ITEM2_DETAIL_STATUSES.COMPLETED) {
      const validationError = validateAdditionalInfoAnswers(additionalInfoAnswers);
      if (validationError) {
        setAdditionalInfoErrorMessage(validationError);
        return;
      }
    }

    try {
      setIsAdditionalInfoSubmitting(true);
      const summaryText = buildSummaryText(additionalInfoAnswers);
      const result = await updateItem2CallAdditionalInfo({
        callId: additionalInfoCall.id,
        purpose: findOptionLabel(ITEM2_CONDITION_OPTIONS, additionalInfoAnswers.conditionCategory) || null,
        detail: summaryText || null,
        requesterRelation: additionalInfoAnswers.requesterRelation || null,
        assessmentAnswers: {
          ...additionalInfoAnswers,
          locationText: additionalInfoAnswers.locationText.trim(),
          painLocation: additionalInfoAnswers.painLocation.trim(),
          swellingStatusOther: additionalInfoAnswers.swellingStatusOther.trim(),
          bleedingLocation: additionalInfoAnswers.bleedingLocation.trim(),
          bleedingAmount: additionalInfoAnswers.bleedingAmount.trim(),
          currentStateOther: additionalInfoAnswers.currentStateOther.trim(),
          symptomsOther: additionalInfoAnswers.symptomsOther.trim(),
          conditionOtherText: additionalInfoAnswers.conditionOtherText.trim(),
          suppliesNeeded: additionalInfoAnswers.suppliesNeeded.trim(),
          summaryText,
        },
        detailStatus,
        detailCompletedAt: detailStatus === ITEM2_DETAIL_STATUSES.COMPLETED ? new Date().toISOString() : null,
      });

      if (result.error || !result.call) {
        setAdditionalInfoErrorMessage(buildItem2ErrorMessage(result.error, '追加情報の保存に失敗しました。'));
        return;
      }

      patchCall(result.call);
      setCalls((previousCalls) => {
        return previousCalls.map((callItem) => (callItem.id === result.call.id ? { ...callItem, ...result.call } : callItem));
      });
      if (result.call.detail_status === ITEM2_DETAIL_STATUSES.COMPLETED) {
        detailSnoozedCallIdsRef.current.delete(result.call.id);
      }

      await refreshCalls();

      if (shouldClose) {
        clearAdditionalInfoModal();
        return;
      }

      setAdditionalInfoCall(result.call);
      setAdditionalInfoAnswers(buildAnswersFromCall(result.call));
    } finally {
      setIsAdditionalInfoSubmitting(false);
    }
  };

  const handleSaveAdditionalInfo = async () => {
    await saveAdditionalInfo({
      detailStatus: ITEM2_DETAIL_STATUSES.COMPLETED,
      shouldClose: true,
    });
  };

  const openResponderModal = (callData) => {
    responderModal.openModal({
      initialUserIds: callData.assigned_to ?? [],
      modalTitle: '救護者を選択',
      onConfirm: async (selectedUserIds) => {
        const result = await updateItem2CallAssignees({
          callId: callData.id,
          assignedTo: selectedUserIds,
          actorId: user?.id ?? null,
        });

        if (result.error) {
          Alert.alert('エラー', buildItem2ErrorMessage(result.error, '救護者の更新に失敗しました。'));
          return;
        }

        patchCall({ ...callData, ...result.call });
        await refreshCalls();
      },
    });
  };

  const handleResolveCall = async (callData) => {
    if (!canAccessStaffViews || !user?.id) {
      Alert.alert('エラー', '対応終了は厚生部側のみ実行できます。');
      return;
    }

    setResolveConfirmCall(callData);
  };

  const executeResolveCall = async () => {
    if (!resolveConfirmCall?.id || !user?.id) {
      setResolveConfirmCall(null);
      return;
    }

    try {
      setIsResolveSubmitting(true);
      const targetCall = resolveConfirmCall;
      setResolveConfirmCall(null);

      const result = await updateItem2CallStatus({
        callId: targetCall.id,
        status: ITEM2_CALL_STATUSES.RESOLVED,
        resolvedBy: user.id,
      });

      if (result.error || !result.call) {
        Alert.alert('エラー', buildItem2ErrorMessage(result.error, '対応終了の更新に失敗しました。'));
        return;
      }

      patchCall({ ...targetCall, ...result.call });
      await refreshCalls();
    } finally {
      setIsResolveSubmitting(false);
    }
  };

  const closeResolveConfirmModal = () => {
    if (isResolveSubmitting) {
      return;
    }
    setResolveConfirmCall(null);
  };

  const handleCreateCall = async () => {
    if (isCreateSubmittingRef.current) {
      return;
    }

    isCreateSubmittingRef.current = true;
    const attemptId = createAttemptIdRef.current + 1;
    createAttemptIdRef.current = attemptId;

    const setCreateFeedbackForAttempt = (nextFeedback, { settle = false } = {}) => {
      if (createAttemptIdRef.current !== attemptId) {
        return;
      }

      if (
        nextFeedback?.type === 'error'
        && settledCreateAttemptIdRef.current === attemptId
      ) {
        return;
      }

      if (settle) {
        settledCreateAttemptIdRef.current = attemptId;
      }

      setCreateFeedback(nextFeedback);
    };

    try {
      if (!user?.id) {
        setCreateFeedbackForAttempt({ type: 'error', message: 'ログイン状態を確認できません。' }, { settle: true });
        return;
      }

      const validationError = validateFormAnswers(formAnswers);
      if (validationError) {
        setCreateFeedbackForAttempt({ type: 'error', message: validationError }, { settle: true });
        return;
      }

      setIsCreating(true);
      settledCreateAttemptIdRef.current = 0;
      setCreateFeedback(null);

      const summaryText = buildSummaryText(formAnswers);
      const payload = {
        requester_user_id: user.id,
        requester_name: userInfo?.name ?? user.email ?? 'ユーザー',
        requester_relation: null,
        call_type: ITEM2_CALL_TYPES.NON_URGENT,
        purpose: null,
        detail: summaryText || null,
        location_text: formAnswers.locationText.trim(),
        detail_status: ITEM2_DETAIL_STATUSES.PENDING,
        detail_completed_at: null,
        assessment_answers: {
          locationText: formAnswers.locationText.trim(),
          suppliesNeeded: formAnswers.suppliesNeeded.trim(),
          summaryText,
        },
      };

      const result = await insertItem2Call(payload);

      if (!result.call) {
        const errorMessage = buildItem2ErrorMessage(result.error, '呼び出し作成に失敗しました。');
        setCreateFeedbackForAttempt({ type: 'error', message: errorMessage }, { settle: true });
        return;
      }

      const notificationResult = await notifyItem2CallCreated({
        callData: result.call,
        senderUserId: user.id,
      });
      if (notificationResult.error) {
        console.error('厚生部呼び出し通知の送信に失敗しました:', notificationResult.error);
      }

      await refreshCalls();
      setFormAnswers(buildInitialFormAnswers());
      setScreenError('');
      openAdditionalInfoModal(result.call, { shouldFocusDetail: true });
    } catch (error) {
      const errorMessage = buildItem2ErrorMessage(error, '呼び出し作成に失敗しました。');
      setCreateFeedbackForAttempt({ type: 'error', message: errorMessage }, { settle: true });
    } finally {
      isCreateSubmittingRef.current = false;
      setIsCreating(false);
    }
  };

  const closeCreateFeedback = () => {
    setCreateFeedback(null);
  };


  const staffCalls = useMemo(() => {
    return [...calls]
      .filter((callItem) => {
        if (statusFilter !== 'all' && callItem.status !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const leftOrder = STAFF_STATUS_ORDER[left.status] ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = STAFF_STATUS_ORDER[right.status] ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }, [calls, statusFilter]);

  const reporterCalls = useMemo(() => {
    if (!user?.id) {
      return [];
    }

    return calls.filter((callItem) => callItem.requester_user_id === user.id);
  }, [calls, user?.id]);

  const renderChoiceQuestion = ({ title, value, onChange, options }) => {
    return (
      <View style={styles.questionBlock}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{title}</Text>
        <View style={styles.radioGroup}>
          {options.map((option) => {
            const isSelected = value === option.value;

            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.radioOption,
                  { borderColor: isSelected ? theme.primaryVariant : theme.border, backgroundColor: theme.surface },
                ]}
                onPress={() => onChange(option.value)}
              >
                <View style={[styles.radioOuter, { borderColor: isSelected ? theme.primaryVariant : theme.border }]}>
                  {isSelected ? <View style={[styles.radioInner, { backgroundColor: theme.primaryVariant }]} /> : null}
                </View>
                <Text style={[styles.radioLabel, { color: theme.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderTextQuestion = ({ title, value, onChange, placeholder, multiline = false }) => {
    return (
      <View style={styles.questionBlock}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{title}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          style={[
            styles.formField,
            styles.input,
            multiline ? styles.multilineInput : null,
            { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
        />
      </View>
    );
  };

  const renderSymptomsQuestion = ({ answers, onToggleSymptom, onUpdateAnswer }) => {
    const symptomSubjectLabel = answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF ? 'あなたは' : '傷病者は';

    return (
      <View style={styles.questionBlock}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{`${symptomSubjectLabel}どういう状態ですか？(複数選択可)`}</Text>
        <View style={styles.checkboxGroup}>
          {ITEM2_SYMPTOM_OPTIONS.map((option) => {
            const isSelected = answers.symptoms.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.checkboxRow,
                  {
                    borderColor: isSelected ? theme.primaryVariant : theme.border,
                    backgroundColor: isSelected ? `${theme.primaryVariant}14` : theme.surface,
                  },
                ]}
                onPress={() => onToggleSymptom(option.value)}
              >
                <View style={[styles.checkbox, { borderColor: isSelected ? theme.primaryVariant : theme.textSecondary }]}>
                  {isSelected ? <Text style={[styles.checkboxCheck, { color: theme.primaryVariant }]}>✓</Text> : null}
                </View>
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {answers.symptoms.includes('other') ? renderTextQuestion({
          title: 'その他の症状を入力してください',
          value: answers.symptomsOther,
          onChange: (value) => onUpdateAnswer('symptomsOther', value),
          placeholder: '例: 震えがある',
        }) : null}
      </View>
    );
  };

  const detailShouldAskOtherPersonQuestions = additionalInfoAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER;
  const detailShouldAskSelfMobilityQuestion = additionalInfoAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}> 
      <ThemedHeader title={ITEM2_TITLES.HOME} navigation={navigation} />
      {!canAccessStaffViews ? (
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              viewMode === ITEM2_VIEW_MODES.CREATE ? [styles.modeButtonActive, { backgroundColor: theme.primaryVariant }] : null,
            ]}
            onPress={() => setViewMode(ITEM2_VIEW_MODES.CREATE)}
          >
            <Text style={[styles.modeButtonText, { color: theme.textSecondary }, viewMode === ITEM2_VIEW_MODES.CREATE ? styles.modeButtonTextActive : null]}>呼び出し</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              viewMode === ITEM2_VIEW_MODES.LIST ? [styles.modeButtonActive, { backgroundColor: theme.primaryVariant }] : null,
            ]}
            onPress={() => setViewMode(ITEM2_VIEW_MODES.LIST)}
          >
            <Text style={[styles.modeButtonText, { color: theme.textSecondary }, viewMode === ITEM2_VIEW_MODES.LIST ? styles.modeButtonTextActive : null]}>
              履歴
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {screenError ? <Text style={[styles.errorText, { color: theme.error }]}>{screenError}</Text> : null}

      {!canAccessStaffViews && viewMode === ITEM2_VIEW_MODES.CREATE ? (
        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>呼び出し作成</Text>
          {pendingDetailCall ? (
            <View style={[styles.pendingBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.pendingBannerTitle, { color: theme.text }]}>未完了の詳細入力があります</Text>
              <Text style={[styles.pendingBannerText, { color: theme.textSecondary }]}>
                呼び出し後の詳細を先に入力してください。閉じると入力内容は破棄されます。
              </Text>
              <TouchableOpacity
                style={[styles.pendingBannerButton, { backgroundColor: theme.primaryVariant }]}
                onPress={() => openAdditionalInfoModal(pendingDetailCall)}
              >
                <Text style={styles.pendingBannerButtonText}>詳細入力を開く</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {renderTextQuestion({
            title: '1. 場所を入力してください',
            value: formAnswers.locationText,
            onChange: (value) => updateFormAnswer('locationText', value),
            placeholder: '例: 11月ホール 2階 学友会連合会室前',
          })}

          {renderTextQuestion({
            title: '2. 必要なもの（任意）',
            value: formAnswers.suppliesNeeded,
            onChange: (value) => updateFormAnswer('suppliesNeeded', value),
            placeholder: '例: 絆創膏、体温計。なければ空欄で大丈夫です',
          })}

          <TouchableOpacity style={[styles.submitButton, { backgroundColor: theme.primaryVariant }]} onPress={handleCreateCall} disabled={isCreating || Boolean(pendingDetailCall)}>
            <Text style={styles.submitButtonText}>
              {isCreating ? '作成中...' : pendingDetailCall ? '詳細入力を完了してください' : '厚生部を呼び出す'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {viewMode === ITEM2_VIEW_MODES.LIST ? (
        <CallListScreen
          calls={canAccessStaffViews ? staffCalls : reporterCalls}
          isRefreshing={isLoading}
          onRefresh={refreshCalls}
          getResponderLabel={(callData) => buildResponderLabel(callData)}
          onOpenResponderModal={canAccessStaffViews ? openResponderModal : undefined}
          onOpenAdditionalInfoModal={openAdditionalInfoModal}
          onResolveCall={canAccessStaffViews ? handleResolveCall : undefined}
          statusFilter={canAccessStaffViews ? statusFilter : 'all'}
          onChangeStatusFilter={canAccessStaffViews ? setStatusFilter : undefined}
          headerActionLabel={canAccessStaffViews ? (isLoading ? '更新中...' : '更新') : ''}
          onPressHeaderAction={canAccessStaffViews ? refreshCalls : undefined}
          isHeaderActionDisabled={isLoading}
        />
      ) : null}

      <GoResponderModal
        visible={responderModal.isVisible}
        title={responderModal.title}
        users={staffUsers}
        selectedUserIds={responderModal.selectedUserIds}
        onToggleUser={responderModal.toggleUser}
        onClose={responderModal.closeModal}
        onConfirm={responderModal.confirm}
      />

      <Modal
        visible={Boolean(additionalInfoCall)}
        transparent
        animationType="slide"
        onRequestClose={closeAdditionalInfoModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.additionalInfoModalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>詳細入力</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              必要な情報を入力してください。閉じると入力内容は破棄されます。
            </Text>
            {additionalInfoErrorMessage ? (
              <View style={[styles.additionalInfoErrorBox, { backgroundColor: `${theme.error}14`, borderColor: theme.error }]}>
                <Text style={[styles.additionalInfoErrorText, { color: theme.error }]}>
                  {additionalInfoErrorMessage}
                </Text>
              </View>
            ) : null}
            <View style={[styles.detailContextBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.detailContextLabel, { color: theme.textSecondary }]}>場所</Text>
              <Text style={[styles.detailContextValue, { color: theme.text }]}>{additionalInfoCall?.location_text || '未入力'}</Text>
              <Text style={[styles.detailContextLabel, { color: theme.textSecondary }]}>必要なもの</Text>
              <Text style={[styles.detailContextValue, { color: theme.text }]}>{additionalInfoAnswers.suppliesNeeded?.trim() || additionalInfoCall?.assessment_answers?.suppliesNeeded || '特になし'}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.additionalInfoContent}>
              {renderChoiceQuestion({
                title: '傷病者はあなた自身ですか？',
                value: additionalInfoAnswers.requesterRelation,
                onChange: (value) => updateAdditionalInfoAnswer('requesterRelation', value),
                options: [
                  { label: 'はい', value: ITEM2_REQUESTER_RELATIONS.SELF },
                  { label: 'いいえ', value: ITEM2_REQUESTER_RELATIONS.OTHER },
                ],
              })}

              {detailShouldAskOtherPersonQuestions ? renderChoiceQuestion({
                title: '傷病者の意識はありますか',
                value: additionalInfoAnswers.consciousness,
                onChange: (value) => updateAdditionalInfoAnswer('consciousness', value),
                options: ITEM2_OTHER_PERSON_CONSCIOUSNESS_OPTIONS,
              }) : null}
              {detailShouldAskOtherPersonQuestions ? renderChoiceQuestion({
                title: '傷病者は呼吸していますか',
                value: additionalInfoAnswers.breathing,
                onChange: (value) => updateAdditionalInfoAnswer('breathing', value),
                options: ITEM2_OTHER_PERSON_BREATHING_OPTIONS,
              }) : null}
              {detailShouldAskSelfMobilityQuestion ? renderChoiceQuestion({
                title: 'あなたは立つ/歩くことができますか',
                value: additionalInfoAnswers.mobility,
                onChange: (value) => updateAdditionalInfoAnswer('mobility', value),
                options: ITEM2_SELF_MOBILITY_OPTIONS,
              }) : null}

              {renderChoiceQuestion({
                title: '状態カテゴリを選択してください',
                value: additionalInfoAnswers.conditionCategory,
                onChange: (value) => updateAdditionalInfoAnswer('conditionCategory', value),
                options: ITEM2_CONDITION_OPTIONS,
              })}

              {['injury_light', 'injury_medium', 'injury_severe'].includes(additionalInfoAnswers.conditionCategory) ? renderChoiceQuestion({
                title: '出血はありますか？',
                value: additionalInfoAnswers.bleedingPresence,
                onChange: (value) => updateAdditionalInfoAnswer('bleedingPresence', value),
                options: ITEM2_BLEEDING_PRESENCE_OPTIONS,
              }) : null}

              {['injury_light', 'injury_medium', 'injury_severe'].includes(additionalInfoAnswers.conditionCategory) && additionalInfoAnswers.bleedingPresence === 'no' ? (
                <>
                  {renderTextQuestion({
                    title: additionalInfoAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF
                      ? 'どこが痛いですか？'
                      : '傷病者のどこが痛いですか？',
                    value: additionalInfoAnswers.painLocation,
                    onChange: (value) => updateAdditionalInfoAnswer('painLocation', value),
                    placeholder: '例: 右足首',
                  })}
                  {renderChoiceQuestion({
                    title: '腫れや内出血等はありますか？',
                    value: additionalInfoAnswers.swellingStatus,
                    onChange: (value) => updateAdditionalInfoAnswer('swellingStatus', value),
                    options: ITEM2_SWELLING_STATUS_OPTIONS,
                  })}
                  {additionalInfoAnswers.swellingStatus === 'other' ? renderTextQuestion({
                    title: 'その他の状態を入力してください',
                    value: additionalInfoAnswers.swellingStatusOther,
                    onChange: (value) => updateAdditionalInfoAnswer('swellingStatusOther', value),
                    placeholder: '例: 赤みが強い',
                  }) : null}
                </>
              ) : null}

              {['injury_light', 'injury_medium', 'injury_severe'].includes(additionalInfoAnswers.conditionCategory) && additionalInfoAnswers.bleedingPresence === 'yes' ? (
                <>
                  {renderTextQuestion({
                    title: 'どこから出血していますか？',
                    value: additionalInfoAnswers.bleedingLocation,
                    onChange: (value) => updateAdditionalInfoAnswer('bleedingLocation', value),
                    placeholder: '例: 左ひじ',
                  })}
                  {renderTextQuestion({
                    title: 'どのくらい出血していますか？',
                    value: additionalInfoAnswers.bleedingAmount,
                    onChange: (value) => updateAdditionalInfoAnswer('bleedingAmount', value),
                    placeholder: '例: ティッシュ数枚分',
                  })}
                </>
              ) : null}

              {additionalInfoAnswers.conditionCategory === 'physical_condition' ? renderSymptomsQuestion({
                answers: additionalInfoAnswers,
                onToggleSymptom: toggleAdditionalInfoSymptom,
                onUpdateAnswer: updateAdditionalInfoAnswer,
              }) : null}

              {additionalInfoAnswers.conditionCategory === 'other' ? renderTextQuestion({
                title: 'その他の状態を入力してください',
                value: additionalInfoAnswers.conditionOtherText,
                onChange: (value) => updateAdditionalInfoAnswer('conditionOtherText', value),
                placeholder: '例: 様子がおかしい、震えている',
                multiline: true,
              }) : null}
            </ScrollView>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={closeAdditionalInfoModal}
                disabled={isAdditionalInfoSubmitting}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>閉じる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, { backgroundColor: theme.primaryVariant }]}
                onPress={handleSaveAdditionalInfo}
                disabled={isAdditionalInfoSubmitting}
              >
                <Text style={styles.modalConfirmText}>{isAdditionalInfoSubmitting ? '保存中...' : '完了'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(resolveConfirmCall)}
        transparent
        animationType="fade"
        onRequestClose={closeResolveConfirmModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>確認</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>対応を終了しますか？</Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={closeResolveConfirmModal}
                disabled={isResolveSubmitting}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>いいえ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, { backgroundColor: theme.primaryVariant }]}
                onPress={executeResolveCall}
                disabled={isResolveSubmitting}
              >
                <Text style={styles.modalConfirmText}>{isResolveSubmitting ? '更新中...' : 'はい'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {createFeedback ? (
        <View style={styles.feedbackOverlay}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.error }]}>呼び出し失敗</Text>
              <Text style={[styles.modalMessage, { color: theme.text }]}>
                {createFeedback.message}
              </Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton, { backgroundColor: theme.primaryVariant }]}
                  onPress={closeCreateFeedback}
                >
                  <Text style={styles.modalConfirmText}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#1565c0',
  },
  modeButtonText: {
    color: '#455a64',
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  errorText: {
    color: '#c62828',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  formContent: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  pendingBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  pendingBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  pendingBannerText: {
    fontSize: 13,
    lineHeight: 18,
  },
  pendingBannerButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  pendingBannerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  questionBlock: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#455a64',
    marginBottom: 6,
  },
  formField: {
    width: '100%',
  },
  radioGroup: {
    gap: 8,
  },
  radioOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  checkboxGroup: {
    gap: 8,
  },
  checkboxRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxCheck: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 12,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: '#1565c0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  additionalInfoModalCard: {
    maxHeight: '85%',
  },
  additionalInfoErrorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  additionalInfoErrorText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  detailContextBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 6,
    marginBottom: 10,
  },
  detailContextLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2,
  },
  detailContextValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  additionalInfoContent: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  modalCancelButton: {
    borderWidth: 1,
  },
  modalConfirmButton: {
    backgroundColor: '#1565c0',
  },
  modalCancelText: {
    fontWeight: '700',
  },
  modalConfirmText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default Item2Screen;
