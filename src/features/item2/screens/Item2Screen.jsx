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
import { useTheme } from '../../../shared/hooks/useTheme';
import { ThemedHeader } from '../../../shared/components/ThemedHeader';
import { useAuth } from '../../../shared/contexts/AuthContext';
import GoResponderModal from '../components/GoResponderModal';
import { useAssignees } from '../hooks/useAssignees';
import { useCalls } from '../hooks/useCalls';
import CallListScreen from './CallListScreen';
import {
  ITEM2_CALL_STATUSES,
  ITEM2_CALL_TYPES,
  ITEM2_TITLES,
  ITEM2_VIEW_MODES,
} from '../constants';
import {
  insertItem2Call,
  selectItem2StaffUsers,
  updateItem2CallAssignees,
  updateItem2CallStatus,
} from '../services/item2CallService';
import { notifyItem2CallCreated, notifyItem2ResponderAssigned } from '../services/item2NotificationService';

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
const ITEM2_SELF_COMMUNICATION_OPTIONS = [
  { label: '可能', value: 'yes' },
  { label: '不可能', value: 'no' },
];
const ITEM2_SELF_COMMUNICATION_DISPLAY = {
  yes: '可能',
  no: '不可能',
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
  callType: '',
  requesterRelation: '',
  selfCanUseText: '',
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

const buildSummaryText = (answers) => {
  const summaryLines = [];
  const pushSummaryLine = (label, value) => {
    if (!value) {
      return;
    }
    summaryLines.push(`${label}: ${value}`);
  };

  pushSummaryLine('傷病者', ITEM2_REQUESTER_RELATION_DISPLAY[answers.requesterRelation] ?? '');

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER) {
    pushSummaryLine('意識', ITEM2_OTHER_PERSON_CONSCIOUSNESS_DISPLAY[answers.consciousness] ?? '');
    pushSummaryLine('呼吸', ITEM2_OTHER_PERSON_BREATHING_DISPLAY[answers.breathing] ?? '');
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF) {
    pushSummaryLine('文字入力・選択', ITEM2_SELF_COMMUNICATION_DISPLAY[answers.selfCanUseText] ?? '');
  }

  pushSummaryLine('必要なもの', answers.suppliesNeeded.trim());

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF && answers.selfCanUseText === 'no') {
    return summaryLines.join('\n');
  }

  if (
    answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER
    && ['weak', 'none'].includes(answers.consciousness)
  ) {
    return summaryLines.join('\n');
  }

  const conditionLabel = findOptionLabel(ITEM2_CONDITION_OPTIONS, answers.conditionCategory);

  switch (answers.conditionCategory) {
    case 'injury_light':
    case 'injury_medium':
    case 'injury_severe': {
      pushSummaryLine('状態', conditionLabel);
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
      pushSummaryLine('状態', conditionLabel);
      pushSummaryLine('症状', symptomLabels.join('、'));
      return summaryLines.join('\n');
    }
    case 'other':
      pushSummaryLine('状態', conditionLabel);
      pushSummaryLine('詳細', answers.conditionOtherText.trim());
      return summaryLines.join('\n');
    default:
      pushSummaryLine('状態', conditionLabel);
      return summaryLines.join('\n');
  }
};

const validateFormAnswers = (answers) => {
  if (!answers.callType) {
    return '呼び出し種別を選択してください。';
  }

  if (!answers.requesterRelation) {
    return '傷病者本人かどうかを選択してください。';
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER && !answers.consciousness) {
    return '傷病者の意識を選択してください。';
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER && !answers.breathing) {
    return '傷病者の呼吸を選択してください。';
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF && !answers.selfCanUseText) {
    return '文字の入力や選択が可能かどうかを選択してください。';
  }

  if (
    answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF
    && answers.selfCanUseText === 'yes'
    && !answers.mobility
  ) {
    return '立つ/歩くことができるかを選択してください。';
  }

  if (!answers.locationText.trim()) {
    return '場所を入力してください。';
  }

  if (answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF && answers.selfCanUseText === 'no') {
    return '';
  }

  if (
    answers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER
    && ['weak', 'none'].includes(answers.consciousness)
  ) {
    return '';
  }

  if (!answers.conditionCategory) {
    return '傷病者の状態を選択してください。';
  }

  if (['injury_light', 'injury_medium', 'injury_severe'].includes(answers.conditionCategory) && !answers.bleedingPresence) {
    return '出血の有無を選択してください。';
  }

  if (['injury_light', 'injury_medium', 'injury_severe'].includes(answers.conditionCategory) && answers.bleedingPresence === 'no') {
    if (!answers.swellingStatus) {
      return '腫れや内出血等の状態を選択してください。';
    }
  }

  if (answers.conditionCategory === 'physical_condition') {
    if (answers.symptoms.length === 0) {
      return '体調不良の症状を1つ以上選択してください。';
    }
  }

  return '';
};

const Item2Screen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { user, userInfo } = useAuth();
  const { calls, isLoading, refreshCalls, setCalls } = useCalls();
  const [viewMode, setViewMode] = useState(ITEM2_VIEW_MODES.CREATE);
  const [staffUsers, setStaffUsers] = useState([]);
  const [screenError, setScreenError] = useState('');
  const [createFeedback, setCreateFeedback] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [callTypeFilter, setCallTypeFilter] = useState('all');
  const [formAnswers, setFormAnswers] = useState(INITIAL_FORM_ANSWERS);
  const [resolveConfirmCall, setResolveConfirmCall] = useState(null);
  const [isResolveSubmitting, setIsResolveSubmitting] = useState(false);
  const isCreateSubmittingRef = useRef(false);
  const createAttemptIdRef = useRef(0);
  const settledCreateAttemptIdRef = useRef(0);
  const responderModal = useAssignees();
  const canAccessStaffViews = Boolean(
    userInfo?.roles?.some((role) => {
      return [role?.name, role?.display_name].includes(ITEM2_STAFF_ROLE_NAME)
        || [role?.name, role?.display_name].includes(ITEM2_ADMIN_ROLE_NAME);
    })
  );

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

  const buildUserLabel = (userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return '未決定';
    }

    const names = userIds.map((userId) => {
      const matchedUser = staffUsers.find((userItem) => userItem.id === userId);
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
    setFormAnswers((previousAnswers) => {
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
          nextAnswers.selfCanUseText = '';
          nextAnswers.mobility = '';
        }
      }

      if (key === 'selfCanUseText' && value !== 'yes') {
        nextAnswers.mobility = '';
        nextAnswers.conditionCategory = '';
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
    });
  };

  const toggleSymptom = (symptomValue) => {
    setFormAnswers((previousAnswers) => {
      const hasSelected = previousAnswers.symptoms.includes(symptomValue);
      const nextSymptoms = hasSelected
        ? previousAnswers.symptoms.filter((item) => item !== symptomValue)
        : [...previousAnswers.symptoms, symptomValue];

      return {
        ...previousAnswers,
        symptoms: nextSymptoms,
        symptomsOther: nextSymptoms.includes('other') ? previousAnswers.symptomsOther : '',
      };
    });
  };

  const openResponderModal = (callData) => {
    responderModal.openModal({
      initialUserIds: callData.assigned_to ?? [],
      modalTitle: callData.call_type === ITEM2_CALL_TYPES.EMERGENCY ? '救護者を選択' : '担当者を選択',
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

        const previousAssignedTo = Array.isArray(callData.assigned_to) ? callData.assigned_to : [];
        const nextAssignedTo = Array.isArray(result.call?.assigned_to) ? result.call.assigned_to : [];
        const hasResponderChanged = (
          previousAssignedTo.length !== nextAssignedTo.length
          || previousAssignedTo.some((userId) => !nextAssignedTo.includes(userId))
        );
        if (hasResponderChanged && nextAssignedTo.length > 0) {
          const responderNames = nextAssignedTo.map((userId) => {
            const matchedUser = staffUsers.find((userItem) => userItem.id === userId);
            return matchedUser?.name ?? '設定済み';
          });
          const notificationResult = await notifyItem2ResponderAssigned({
            callData: result.call,
            responderNames,
            senderUserId: user?.id ?? null,
          });
          if (notificationResult.error) {
            console.error('厚生部呼び出しの対応者通知の送信に失敗しました:', notificationResult.error);
          }
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
        requester_relation: formAnswers.requesterRelation,
        call_type: formAnswers.callType,
        purpose: findOptionLabel(ITEM2_CONDITION_OPTIONS, formAnswers.conditionCategory) || null,
        detail: summaryText || null,
        location_text: formAnswers.locationText.trim(),
        assessment_answers: {
          ...formAnswers,
          locationText: formAnswers.locationText.trim(),
          painLocation: formAnswers.painLocation.trim(),
          swellingStatusOther: formAnswers.swellingStatusOther.trim(),
          bleedingLocation: formAnswers.bleedingLocation.trim(),
          bleedingAmount: formAnswers.bleedingAmount.trim(),
          currentStateOther: formAnswers.currentStateOther.trim(),
          symptomsOther: formAnswers.symptomsOther.trim(),
          conditionOtherText: formAnswers.conditionOtherText.trim(),
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
      setFormAnswers(INITIAL_FORM_ANSWERS);
      setScreenError('');
      setCreateFeedbackForAttempt({ type: 'success', message: '呼び出しを作成しました。' }, { settle: true });
    } catch (error) {
      const errorMessage = buildItem2ErrorMessage(error, '呼び出し作成に失敗しました。');
      setCreateFeedbackForAttempt({ type: 'error', message: errorMessage }, { settle: true });
    } finally {
      isCreateSubmittingRef.current = false;
      setIsCreating(false);
    }
  };

  const closeCreateFeedback = () => {
    const currentFeedback = createFeedback;
    setCreateFeedback(null);

    if (currentFeedback?.type === 'success') {
      setViewMode(ITEM2_VIEW_MODES.LIST);
    }
  };


  const staffCalls = useMemo(() => {
    return [...calls]
      .filter((callItem) => {
        if (statusFilter !== 'all' && callItem.status !== statusFilter) {
          return false;
        }

        if (callTypeFilter !== 'all' && callItem.call_type !== callTypeFilter) {
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
  }, [calls, callTypeFilter, statusFilter]);

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

  const renderSymptomsQuestion = () => {
    const symptomSubjectLabel = formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF ? 'あなたは' : '傷病者は';

    return (
      <View style={styles.questionBlock}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{`${symptomSubjectLabel}どういう状態ですか？(複数選択可)`}</Text>
        <View style={styles.checkboxGroup}>
          {ITEM2_SYMPTOM_OPTIONS.map((option) => {
            const isSelected = formAnswers.symptoms.includes(option.value);
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
                onPress={() => toggleSymptom(option.value)}
              >
                <View style={[styles.checkbox, { borderColor: isSelected ? theme.primaryVariant : theme.textSecondary }]}>
                  {isSelected ? <Text style={[styles.checkboxCheck, { color: theme.primaryVariant }]}>✓</Text> : null}
                </View>
                <Text style={[styles.checkboxLabel, { color: theme.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {formAnswers.symptoms.includes('other') ? renderTextQuestion({
          title: 'その他の症状を入力してください',
          value: formAnswers.symptomsOther,
          onChange: (value) => updateFormAnswer('symptomsOther', value),
          placeholder: '例: 震えがある',
        }) : null}
      </View>
    );
  };

  const shouldAskOtherPersonQuestions = formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER;
  const shouldAskSelfCommunicationQuestion = formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF;
  const canSelfCommunicateByText = formAnswers.selfCanUseText === 'yes';
  const shouldAskSelfMobilityQuestion = shouldAskSelfCommunicationQuestion && canSelfCommunicateByText;
  const conditionSubjectLabel = formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.SELF ? 'あなたは' : '傷病者は';
  const shouldSkipConditionQuestionForConsciousness = (
    formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER
    && ['weak', 'none'].includes(formAnswers.consciousness)
  );
  const shouldAskConditionQuestions = Boolean(
    formAnswers.callType
      && formAnswers.requesterRelation
      && (
        formAnswers.requesterRelation === ITEM2_REQUESTER_RELATIONS.OTHER
        || canSelfCommunicateByText
      )
      && !shouldSkipConditionQuestionForConsciousness
  );

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
          {renderChoiceQuestion({
            title: '1. 緊急度を選択してください',
            value: formAnswers.callType,
            onChange: (value) => updateFormAnswer('callType', value),
            options: [
              { label: '不急', value: ITEM2_CALL_TYPES.NON_URGENT },
              { label: '緊急', value: ITEM2_CALL_TYPES.EMERGENCY },
            ],
          })}
          {formAnswers.callType ? renderChoiceQuestion({
            title: '2. あなたは傷病者本人ですか？',
            value: formAnswers.requesterRelation,
            onChange: (value) => updateFormAnswer('requesterRelation', value),
            options: [
              { label: 'はい', value: ITEM2_REQUESTER_RELATIONS.SELF },
              { label: 'いいえ', value: ITEM2_REQUESTER_RELATIONS.OTHER },
            ],
          }) : null}
          {shouldAskOtherPersonQuestions ? renderChoiceQuestion({
            title: '3. 傷病者の意識はありますか',
            value: formAnswers.consciousness,
            onChange: (value) => updateFormAnswer('consciousness', value),
            options: ITEM2_OTHER_PERSON_CONSCIOUSNESS_OPTIONS,
          }) : null}
          {shouldAskOtherPersonQuestions ? renderChoiceQuestion({
            title: '4. 傷病者は呼吸していますか',
            value: formAnswers.breathing,
            onChange: (value) => updateFormAnswer('breathing', value),
            options: ITEM2_OTHER_PERSON_BREATHING_OPTIONS,
          }) : null}
          {shouldAskSelfCommunicationQuestion ? renderChoiceQuestion({
            title: '3. 文字の入力や選択は可能ですか？',
            value: formAnswers.selfCanUseText,
            onChange: (value) => updateFormAnswer('selfCanUseText', value),
            options: ITEM2_SELF_COMMUNICATION_OPTIONS,
          }) : null}
          {shouldAskSelfMobilityQuestion ? renderChoiceQuestion({
            title: '4. あなたは立つ/歩くことができますか',
            value: formAnswers.mobility,
            onChange: (value) => updateFormAnswer('mobility', value),
            options: ITEM2_SELF_MOBILITY_OPTIONS,
          }) : null}
          {shouldAskConditionQuestions ? renderChoiceQuestion({
            title: shouldAskSelfMobilityQuestion
              ? `5. ${conditionSubjectLabel}どういった状態ですか？`
              : `5. ${conditionSubjectLabel}どういった状態ですか？`,
            value: formAnswers.conditionCategory,
            onChange: (value) => updateFormAnswer('conditionCategory', value),
            options: ITEM2_CONDITION_OPTIONS,
          }) : null}

          {['injury_light', 'injury_medium', 'injury_severe'].includes(formAnswers.conditionCategory) ? renderChoiceQuestion({
            title: '出血はありますか？',
            value: formAnswers.bleedingPresence,
            onChange: (value) => updateFormAnswer('bleedingPresence', value),
            options: ITEM2_BLEEDING_PRESENCE_OPTIONS,
          }) : null}

          {['injury_light', 'injury_medium', 'injury_severe'].includes(formAnswers.conditionCategory) && formAnswers.bleedingPresence === 'no' ? (
            <>
              {renderTextQuestion({
                title: `${conditionSubjectLabel}どこを痛がっていますか？`,
                value: formAnswers.painLocation,
                onChange: (value) => updateFormAnswer('painLocation', value),
                placeholder: '例: 右足首',
              })}
              {renderChoiceQuestion({
                title: '腫れや内出血等はありますか？',
                value: formAnswers.swellingStatus,
                onChange: (value) => updateFormAnswer('swellingStatus', value),
                options: ITEM2_SWELLING_STATUS_OPTIONS,
              })}
              {formAnswers.swellingStatus === 'other' ? renderTextQuestion({
                title: 'その他の状態を入力してください',
                value: formAnswers.swellingStatusOther,
                onChange: (value) => updateFormAnswer('swellingStatusOther', value),
                placeholder: '例: 赤みが強い',
              }) : null}
            </>
          ) : null}

          {['injury_light', 'injury_medium', 'injury_severe'].includes(formAnswers.conditionCategory) && formAnswers.bleedingPresence === 'yes' ? (
            <>
              {renderTextQuestion({
                title: 'どこから出血していますか？',
                value: formAnswers.bleedingLocation,
                onChange: (value) => updateFormAnswer('bleedingLocation', value),
                placeholder: '例: 左ひじ',
              })}
              {renderTextQuestion({
                title: 'どのくらい出血していますか？',
                value: formAnswers.bleedingAmount,
                onChange: (value) => updateFormAnswer('bleedingAmount', value),
                placeholder: '例: ティッシュ数枚分',
              })}
            </>
          ) : null}

          {formAnswers.conditionCategory === 'physical_condition' ? renderSymptomsQuestion() : null}

          {formAnswers.conditionCategory === 'other' ? renderTextQuestion({
            title: 'その他の状態を入力してください',
            value: formAnswers.conditionOtherText,
            onChange: (value) => updateFormAnswer('conditionOtherText', value),
            placeholder: '例: 様子がおかしい、震えている',
            multiline: true,
          }) : null}

          {formAnswers.requesterRelation ? renderTextQuestion({
            title: 'なにか必要なものはありますか？',
            value: formAnswers.suppliesNeeded,
            onChange: (value) => updateFormAnswer('suppliesNeeded', value),
            placeholder: '例: 水、タオル、椅子',
          }) : null}

          {formAnswers.requesterRelation ? renderTextQuestion({
            title: '場所を入力してください',
            value: formAnswers.locationText,
            onChange: (value) => updateFormAnswer('locationText', value),
            placeholder: '例: 11月ホール 2階 学友会連合会室前',
          }) : null}

          <TouchableOpacity style={[styles.submitButton, { backgroundColor: theme.primaryVariant }]} onPress={handleCreateCall} disabled={isCreating}>
            <Text style={styles.submitButtonText}>{isCreating ? '作成中...' : '呼び出しを作成'}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {viewMode === ITEM2_VIEW_MODES.LIST ? (
        <CallListScreen
          calls={canAccessStaffViews ? staffCalls : reporterCalls}
          isRefreshing={isLoading}
          onRefresh={refreshCalls}
          getResponderLabel={(callData) => buildUserLabel(callData.assigned_to ?? [])}
          onOpenResponderModal={canAccessStaffViews ? openResponderModal : undefined}
          onResolveCall={canAccessStaffViews ? handleResolveCall : undefined}
          statusFilter={canAccessStaffViews ? statusFilter : 'all'}
          callTypeFilter={canAccessStaffViews ? callTypeFilter : 'all'}
          onChangeStatusFilter={canAccessStaffViews ? setStatusFilter : undefined}
          onChangeCallTypeFilter={canAccessStaffViews ? setCallTypeFilter : undefined}
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
              <Text
                style={[
                  styles.modalTitle,
                  { color: createFeedback.type === 'success' ? theme.primaryVariant : theme.error },
                ]}
              >
                {createFeedback.type === 'success' ? '呼び出し成功' : '呼び出し失敗'}
              </Text>
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
