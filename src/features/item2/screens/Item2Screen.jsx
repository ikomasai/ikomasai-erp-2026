/**
 * item2 メイン画面
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import AssigneeModal from '../components/AssigneeModal';
import AssigneeSettingModal from '../components/AssigneeSettingModal';
import GoResponderModal from '../components/GoResponderModal';
import { useAssignees } from '../hooks/useAssignees';
import { useCalls } from '../hooks/useCalls';
import CallListScreen from './CallListScreen';
import EmergencyDispatchScreen from './EmergencyDispatchScreen';
import ChatScreen from './ChatScreen';
import {
  ITEM2_CALL_TYPES,
  ITEM2_NON_URGENT_PURPOSES,
  ITEM2_TITLES,
  ITEM2_VIEW_MODES,
} from '../constants';
import {
  insertItem2Call,
  selectItem2StaffUsers,
  updateItem2CallAssignees,
  updateItem2ChatAssignees,
} from '../services/item2CallService';
import { bootstrapItem2Chat, insertItem2SystemMessage } from '../services/item2ChatService';

/** 厚生部ロール名 */
const ITEM2_STAFF_ROLE_NAME = '厚生部';

/** 管理者ロール名 */
const ITEM2_ADMIN_ROLE_NAME = '管理者';

/** item2 テーブル未作成エラー文言 */
const ITEM2_TABLE_NOT_FOUND_MESSAGE = '厚生部呼び出し用のテーブルが未作成です。`db/migrations/20260308_create_item2_kouseibu_call_tables.sql` を Supabase に適用してください。';

/** item2 テーブル名 */
const ITEM2_CALLS_TABLE_NAME = 'public.item2_calls';

/** item2 テーブル未作成かどうかを判定する文字列 */
const ITEM2_TABLE_NOT_FOUND_KEYWORD = `Could not find the table '${ITEM2_CALLS_TABLE_NAME}' in the schema cache`;

/**
 * item2 テーブル未作成エラーかどうかを判定する
 * @param {unknown} error - 判定対象
 * @returns {boolean} 判定結果
 */
const isItem2TableMissingError = (error) => {
  /** エラーメッセージ */
  const errorMessage = error?.message ?? error?.details ?? '';
  return typeof errorMessage === 'string' && errorMessage.includes(ITEM2_TABLE_NOT_FOUND_KEYWORD);
};

/**
 * item2 用エラーメッセージを整形する
 * @param {unknown} error - 整形対象
 * @param {string} fallbackMessage - 既定文言
 * @returns {string} 表示用メッセージ
 */
const buildItem2ErrorMessage = (error, fallbackMessage) => {
  if (isItem2TableMissingError(error)) {
    return ITEM2_TABLE_NOT_FOUND_MESSAGE;
  }

  return error?.message ?? fallbackMessage;
};

/**
 * item2 メイン画面
 * @param {Object} props - プロパティ
 * @param {Object} props.navigation - ナビゲーション
 * @returns {JSX.Element} 画面
 */
const Item2Screen = ({ navigation }) => {
  /** テーマ */
  const { theme } = useTheme();
  /** 認証情報 */
  const { user, userInfo } = useAuth();
  /** 呼び出し一覧 */
  const { calls, isLoading, refreshCalls, setCalls } = useCalls();
  /** 内部表示モード */
  const [viewMode, setViewMode] = useState(ITEM2_VIEW_MODES.CREATE);
  /** 選択中呼び出し */
  const [selectedCall, setSelectedCall] = useState(null);
  /** 厚生部ユーザー一覧 */
  const [staffUsers, setStaffUsers] = useState([]);
  /** 画面エラー */
  const [screenError, setScreenError] = useState('');
  /** 呼び出し種別 */
  const [callType, setCallType] = useState(null);
  /** 場所 */
  const [locationText, setLocationText] = useState('');
  /** 詳細 */
  const [detailText, setDetailText] = useState('');
  /** 不急時の目的 */
  const [purpose, setPurpose] = useState('');
  /** 作成中状態 */
  const [isCreating, setIsCreating] = useState(false);
  /** 対応一覧の担当者設定モーダル表示状態 */
  const [isAssigneeSettingVisible, setIsAssigneeSettingVisible] = useState(false);
  /** 担当者設定対象呼び出し */
  const [assigneeSettingCall, setAssigneeSettingCall] = useState(null);
  /** 担当者設定保存中状態 */
  const [isSavingAssigneeSetting, setIsSavingAssigneeSetting] = useState(false);
  /** チャット対応者モーダル */
  const chatAssigneeModal = useAssignees();
  /** 向かう人モーダル */
  const responderModal = useAssignees();
  /** 一覧画面へアクセス可能かどうか */
  const canAccessStaffViews = Boolean(
    userInfo?.roles?.some((role) => {
      return [role?.name, role?.display_name].includes(ITEM2_STAFF_ROLE_NAME)
        || [role?.name, role?.display_name].includes(ITEM2_ADMIN_ROLE_NAME);
    })
  );

  useEffect(() => {
    /**
     * 厚生部ユーザー一覧を取得する
     * @returns {Promise<void>} 完了 Promise
     */
    const loadStaffUsers = async () => {
      /** 取得結果 */
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
    if (!canAccessStaffViews && [ITEM2_VIEW_MODES.LIST, ITEM2_VIEW_MODES.EMERGENCY].includes(viewMode)) {
      setViewMode(ITEM2_VIEW_MODES.CREATE);
    }
  }, [canAccessStaffViews, viewMode]);

  /**
   * ユーザーID配列をラベルへ変換する
   * @param {Array<string>} userIds - ユーザーID一覧
   * @returns {string} 表示ラベル
   */
  const buildUserLabel = (userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return '未決定';
    }

    /** 表示名一覧 */
    const names = userIds.map((userId) => {
      /** 一致ユーザー */
      const matchedUser = staffUsers.find((userItem) => userItem.id === userId);
      return matchedUser?.name ?? '名称未設定';
    });

    return names.join('、');
  };

  /**
   * 呼び出し情報を一覧・選択状態へ反映する
   * @param {Object} nextCall - 更新内容
   */
  const patchCall = (nextCall) => {
    setCalls((previousCalls) => {
      return previousCalls.map((callItem) => {
        return callItem.id === nextCall.id ? { ...callItem, ...nextCall } : callItem;
      });
    });

    setSelectedCall((previousCall) => {
      if (!previousCall || previousCall.id !== nextCall.id) {
        return previousCall;
      }
      return { ...previousCall, ...nextCall };
    });
  };

  /**
   * チャットを開く
   * @param {Object} callData - 呼び出しデータ
   * @returns {Promise<void>} 完了 Promise
   */
  const openChat = async (callData) => {
    try {
      setScreenError('');

      /** チャット初期化結果 */
      const bootstrapResult = await bootstrapItem2Chat({
        callId: callData.id,
        authorId: user?.id,
        authorName: userInfo?.name ?? user?.email ?? 'ユーザー',
        shouldInsertOtherPurposeMessage: false,
      });

      /** 次の呼び出しデータ */
      const nextCall = {
        ...callData,
        room: bootstrapResult.room ?? callData.room,
      };

      if (canAccessStaffViews && user?.id && nextCall.room?.id) {
        /** 現在のチャット対応者 */
        const currentAssignees = Array.isArray(nextCall.room.assigned_to) ? nextCall.room.assigned_to : [];
        if (!currentAssignees.includes(user.id)) {
          /** 更新結果 */
          const updateResult = await updateItem2ChatAssignees(nextCall.room.id, [...currentAssignees, user.id]);
          if (!updateResult.error && updateResult.room) {
            nextCall.room = updateResult.room;
          }
        }
      }

      patchCall(nextCall);
      setSelectedCall(nextCall);
    } catch (error) {
      setScreenError(buildItem2ErrorMessage(error, 'チャットを開けませんでした。'));
    }
  };

  /**
   * チャット対応者設定モーダルを開く
   * @param {Object} callData - 対象呼び出し
   */
  const openChatAssigneeModal = (callData) => {
    chatAssigneeModal.openModal({
      initialUserIds: callData.room?.assigned_to ?? [],
      modalTitle: 'チャット対応者を選択',
      onConfirm: async (selectedUserIds) => {
        if (!callData.room?.id) {
          return;
        }

        /** 更新結果 */
        const result = await updateItem2ChatAssignees(callData.room.id, selectedUserIds);
        if (result.error) {
          Alert.alert('エラー', buildItem2ErrorMessage(result.error, 'チャット対応者の更新に失敗しました。'));
          return;
        }

        patchCall({ ...callData, room: result.room });
      },
    });
  };

  /**
   * 救護者設定モーダルを開く
   * @param {Object} callData - 対象呼び出し
   */
  const openResponderModal = (callData) => {
    responderModal.openModal({
      initialUserIds: callData.assigned_to ?? [],
      modalTitle: '救護者を選択',
      onConfirm: async (selectedUserIds) => {
        /** 更新結果 */
        const result = await updateItem2CallAssignees({
          callId: callData.id,
          assignedTo: selectedUserIds,
          actorId: user?.id ?? null,
        });

        if (result.error) {
          Alert.alert('エラー', buildItem2ErrorMessage(result.error, '救護者の更新に失敗しました。'));
          return;
        }

        /** 追加された担当者 */
        const addedUserIds = selectedUserIds.filter((userId) => !(callData.assigned_to ?? []).includes(userId));
        for (const addedUserId of addedUserIds) {
          /** 対象ユーザー */
          const matchedUser = staffUsers.find((userItem) => userItem.id === addedUserId);
          /** 役職表示 */
          const roleLabel = matchedUser?.roles?.some((role) => {
            return [role?.name, role?.display_name].includes(ITEM2_STAFF_ROLE_NAME);
          })
            ? ITEM2_STAFF_ROLE_NAME
            : (matchedUser?.roles ?? []).map((role) => role?.display_name || role?.name).filter(Boolean).join('・');
          /** 自動メッセージ本文 */
          const body = `${roleLabel || '担当'}の${matchedUser?.name ?? '名称未設定'}さんが向かっています。`;

          if (callData.room?.id) {
            await insertItem2SystemMessage({
              roomId: callData.room.id,
              authorId: user?.id ?? null,
              authorName: userInfo?.name ?? user?.email ?? 'ユーザー',
              body,
            });
          }
        }

        patchCall({ ...callData, ...result.call });
      },
    });
  };

  /**
   * 対応一覧向け担当者設定モーダルを開く
   * @param {Object} callData - 対象呼び出し
   */
  const openListAssigneeSettingModal = (callData) => {
    setAssigneeSettingCall(callData);
    setIsAssigneeSettingVisible(true);
  };

  /**
   * 対応一覧向け担当者設定モーダルを閉じる
   */
  const closeListAssigneeSettingModal = () => {
    if (isSavingAssigneeSetting) {
      return;
    }
    setIsAssigneeSettingVisible(false);
    setAssigneeSettingCall(null);
  };

  /**
   * 対応一覧向け担当者設定を保存する
   * @param {Object} params - 保存内容
   * @returns {Promise<void>} 完了 Promise
   */
  const saveListAssigneeSetting = async ({ responderIds, chatAssigneeIds }) => {
    if (!assigneeSettingCall?.id) {
      return;
    }

    try {
      setIsSavingAssigneeSetting(true);

      /** 次の呼び出しデータ */
      let nextCall = { ...assigneeSettingCall };

      if (!nextCall.room?.id) {
        /** ルーム初期化結果 */
        const bootstrapResult = await bootstrapItem2Chat({
          callId: nextCall.id,
          authorId: user?.id,
          authorName: userInfo?.name ?? user?.email ?? 'ユーザー',
          shouldInsertOtherPurposeMessage: false,
        });

        if (bootstrapResult.error) {
          Alert.alert('エラー', buildItem2ErrorMessage(bootstrapResult.error, 'チャットルームの初期化に失敗しました。'));
          return;
        }

        nextCall = {
          ...nextCall,
          room: bootstrapResult.room ?? nextCall.room,
        };
      }

      if (nextCall.room?.id) {
        /** チャット担当者更新結果 */
        const chatAssigneeResult = await updateItem2ChatAssignees(nextCall.room.id, chatAssigneeIds);
        if (chatAssigneeResult.error) {
          Alert.alert('エラー', buildItem2ErrorMessage(chatAssigneeResult.error, 'チャット担当者の更新に失敗しました。'));
          return;
        }
        nextCall = {
          ...nextCall,
          room: chatAssigneeResult.room ?? nextCall.room,
        };
      }

      /** 救護者更新結果 */
      const responderResult = await updateItem2CallAssignees({
        callId: nextCall.id,
        assignedTo: responderIds,
        actorId: user?.id ?? null,
      });

      if (responderResult.error) {
        Alert.alert('エラー', buildItem2ErrorMessage(responderResult.error, '救護者の更新に失敗しました。'));
        return;
      }

      /** 追加された救護者 */
      const addedResponderIds = responderIds.filter((userId) => !(assigneeSettingCall.assigned_to ?? []).includes(userId));
      for (const addedResponderId of addedResponderIds) {
        /** 対象ユーザー */
        const matchedUser = staffUsers.find((userItem) => userItem.id === addedResponderId);
        /** 役職表示 */
        const roleLabel = matchedUser?.roles?.some((role) => {
          return [role?.name, role?.display_name].includes(ITEM2_STAFF_ROLE_NAME);
        })
          ? ITEM2_STAFF_ROLE_NAME
          : (matchedUser?.roles ?? []).map((role) => role?.display_name || role?.name).filter(Boolean).join('・');
        /** 自動メッセージ本文 */
        const body = `${roleLabel || '担当'}の${matchedUser?.name ?? '名称未設定'}さんが向かっています。`;

        if (nextCall.room?.id) {
          await insertItem2SystemMessage({
            roomId: nextCall.room.id,
            authorId: user?.id ?? null,
            authorName: userInfo?.name ?? user?.email ?? 'ユーザー',
            body,
          });
        }
      }

      nextCall = {
        ...nextCall,
        ...(responderResult.call ?? {}),
      };

      patchCall(nextCall);
      await refreshCalls();
      setIsAssigneeSettingVisible(false);
      setAssigneeSettingCall(null);
    } catch (error) {
      Alert.alert('エラー', buildItem2ErrorMessage(error, '担当者設定の保存に失敗しました。'));
    } finally {
      setIsSavingAssigneeSetting(false);
    }
  };

  /**
   * 呼び出しを作成する
   * @returns {Promise<void>} 完了 Promise
   */
  const handleCreateCall = async () => {
    if (!user?.id) {
      setScreenError('ログイン状態を確認できません。');
      return;
    }

    if (!callType) {
      setScreenError('呼び出し種別を選択してください。');
      return;
    }

    if (!locationText.trim()) {
      setScreenError('場所を入力してください。');
      return;
    }

    if (callType === ITEM2_CALL_TYPES.NON_URGENT && !purpose) {
      setScreenError('何をしてほしいかを選択してください。');
      return;
    }

    if (callType === ITEM2_CALL_TYPES.NON_URGENT && purpose === 'その他' && !detailText.trim()) {
      setScreenError('その他の場合は詳細を入力してください。');
      return;
    }

    try {
      setIsCreating(true);
      setScreenError('');

      /** 作成結果 */
      const result = await insertItem2Call({
        requester_user_id: user.id,
        requester_name: userInfo?.name ?? user.email ?? 'ユーザー',
        call_type: callType,
        purpose: callType === ITEM2_CALL_TYPES.NON_URGENT ? purpose : null,
        detail: detailText.trim() || null,
        location_text: locationText.trim(),
      });

      if (!result.call) {
        setScreenError(buildItem2ErrorMessage(result.error, '呼び出し作成に失敗しました。'));
        return;
      }

      /** チャット初期化結果 */
      const bootstrapResult = await bootstrapItem2Chat({
        callId: result.call.id,
        authorId: user.id,
        authorName: userInfo?.name ?? user.email ?? 'ユーザー',
        shouldInsertOtherPurposeMessage: callType === ITEM2_CALL_TYPES.NON_URGENT && purpose === 'その他',
        shouldInsertEmergencyPromptMessage: callType === ITEM2_CALL_TYPES.EMERGENCY && !detailText.trim(),
      });

      if (bootstrapResult.error) {
        setScreenError(buildItem2ErrorMessage(bootstrapResult.error, 'チャット初期化に失敗しました。もう一度お試しください。'));
        return;
      }

      await refreshCalls();
      setLocationText('');
      setDetailText('');
      setCallType(null);
      setPurpose('');
      setSelectedCall({
        ...result.call,
        room: bootstrapResult.room ?? result.room,
      });
    } catch (error) {
      setScreenError(buildItem2ErrorMessage(error, '呼び出し作成に失敗しました。'));
    } finally {
      setIsCreating(false);
    }
  };

  /** 緊急呼び出し一覧 */
  const emergencyCalls = useMemo(() => {
    return calls.filter((callItem) => callItem.call_type === ITEM2_CALL_TYPES.EMERGENCY);
  }, [calls]);

  /** 不急呼び出し一覧 */
  const nonUrgentCalls = useMemo(() => {
    return calls.filter((callItem) => callItem.call_type === ITEM2_CALL_TYPES.NON_URGENT);
  }, [calls]);

  /** 通報者向けチャット一覧 */
  const reporterCalls = useMemo(() => {
    if (!user?.id) {
      return [];
    }

    return calls.filter((callItem) => callItem.requester_user_id === user.id);
  }, [calls, user?.id]);

  /**
   * 呼び出し種別を変更する
   * @param {string} nextCallType - 次の種別
   */
  const handleChangeCallType = (nextCallType) => {
    setCallType(nextCallType);
    if (nextCallType !== ITEM2_CALL_TYPES.NON_URGENT) {
      setPurpose('');
    }
  };

  /**
   * ラジオボタン項目を描画する
   * @param {Object} params - 描画パラメータ
   * @param {string} params.label - 表示ラベル
   * @param {string} params.value - 値
   * @param {string} params.selectedValue - 選択中値
   * @param {(value: string) => void} params.onChange - 選択時コールバック
   * @returns {JSX.Element} ラジオ項目
   */
  const renderRadioOption = ({ label, value, selectedValue, onChange }) => {
    const isSelected = selectedValue === value;

    return (
      <TouchableOpacity
        key={value}
        style={[
          styles.radioOption,
          { borderColor: isSelected ? theme.primaryVariant : theme.border, backgroundColor: theme.surface },
        ]}
        onPress={() => onChange(value)}
      >
        <View style={[styles.radioOuter, { borderColor: isSelected ? theme.primaryVariant : theme.border }]}>
          {isSelected ? <View style={[styles.radioInner, { backgroundColor: theme.primaryVariant }]} /> : null}
        </View>
        <Text style={[styles.radioLabel, { color: theme.text }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  if (selectedCall) {
    return (
      <ChatScreen
        callData={selectedCall}
        currentUser={user}
        currentUserInfo={userInfo}
        staffUsers={staffUsers}
        canResolveCall={canAccessStaffViews}
        onBack={() => setSelectedCall(null)}
        onResolved={(resolvedCall) => {
          patchCall({
            ...selectedCall,
            ...resolvedCall,
          });
          refreshCalls();
        }}
        onCallUpdated={patchCall}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}> 
      <ThemedHeader title={ITEM2_TITLES.HOME} navigation={navigation} />
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
        {!canAccessStaffViews ? (
          <>
            <TouchableOpacity
              style={[
                styles.modeButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
                viewMode === ITEM2_VIEW_MODES.CHAT ? [styles.modeButtonActive, { backgroundColor: theme.primaryVariant }] : null,
              ]}
              onPress={() => setViewMode(ITEM2_VIEW_MODES.CHAT)}
            >
              <Text style={[styles.modeButtonText, { color: theme.textSecondary }, viewMode === ITEM2_VIEW_MODES.CHAT ? styles.modeButtonTextActive : null]}>チャット</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.modeButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
                viewMode === ITEM2_VIEW_MODES.LIST ? [styles.modeButtonActive, { backgroundColor: theme.primaryVariant }] : null,
              ]}
              onPress={() => setViewMode(ITEM2_VIEW_MODES.LIST)}
            >
              <Text style={[styles.modeButtonText, { color: theme.textSecondary }, viewMode === ITEM2_VIEW_MODES.LIST ? styles.modeButtonTextActive : null]}>不急対応</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
                viewMode === ITEM2_VIEW_MODES.EMERGENCY ? [styles.modeButtonActive, { backgroundColor: theme.primaryVariant }] : null,
              ]}
              onPress={() => setViewMode(ITEM2_VIEW_MODES.EMERGENCY)}
            >
              <Text style={[styles.modeButtonText, { color: theme.textSecondary }, viewMode === ITEM2_VIEW_MODES.EMERGENCY ? styles.modeButtonTextActive : null]}>緊急対応</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {screenError ? <Text style={[styles.errorText, { color: theme.error }]}>{screenError}</Text> : null}

      {viewMode === ITEM2_VIEW_MODES.CREATE ? (
        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>呼び出し作成</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]}>呼び出し種別</Text>
          <View style={[styles.formField, styles.radioGroup]}>
            {renderRadioOption({
              label: '不急',
              value: ITEM2_CALL_TYPES.NON_URGENT,
              selectedValue: callType,
              onChange: handleChangeCallType,
            })}
            {renderRadioOption({
              label: '緊急',
              value: ITEM2_CALL_TYPES.EMERGENCY,
              selectedValue: callType,
              onChange: handleChangeCallType,
            })}
          </View>
          <Text style={[styles.label, { color: theme.textSecondary }]}>場所</Text>
          <TextInput
            value={locationText}
            onChangeText={setLocationText}
            style={[styles.formField, styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
            placeholder="例: 本部前"
            placeholderTextColor={theme.textSecondary}
          />
          {callType === ITEM2_CALL_TYPES.NON_URGENT ? (
            <>
              <Text style={[styles.label, { color: theme.textSecondary }]}>何をしてほしいか</Text>
              <View style={[styles.formField, styles.radioGroup]}>
                {ITEM2_NON_URGENT_PURPOSES.map((item) => {
                  return renderRadioOption({
                    label: item,
                    value: item,
                    selectedValue: purpose,
                    onChange: setPurpose,
                  });
                })}
              </View>
            </>
          ) : null}
          {callType ? (
            <>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{callType === ITEM2_CALL_TYPES.EMERGENCY ? '状況' : '詳細'}</Text>
              <TextInput
                value={detailText}
                onChangeText={setDetailText}
                style={[styles.formField, styles.input, styles.multilineInput, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
                placeholder={callType === ITEM2_CALL_TYPES.EMERGENCY ? '未入力でも作成できます' : '必要に応じて詳細を入力してください'}
                placeholderTextColor={theme.textSecondary}
                multiline
              />
            </>
          ) : null}
          <TouchableOpacity style={[styles.submitButton, { backgroundColor: theme.primaryVariant }]} onPress={handleCreateCall} disabled={isCreating}>
            <Text style={styles.submitButtonText}>{isCreating ? '作成中...' : '呼び出しを作成'}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {!canAccessStaffViews && viewMode === ITEM2_VIEW_MODES.CHAT ? (
        <CallListScreen
          calls={reporterCalls}
          isRefreshing={isLoading}
          onRefresh={refreshCalls}
          getChatAssigneeLabel={(callData) => buildUserLabel(callData.room?.assigned_to ?? [])}
          getResponderLabel={(callData) => buildUserLabel(callData.assigned_to ?? [])}
          onOpenChat={openChat}
        />
      ) : null}

      {canAccessStaffViews && viewMode === ITEM2_VIEW_MODES.LIST ? (
        <CallListScreen
          calls={nonUrgentCalls}
          isRefreshing={isLoading}
          onRefresh={refreshCalls}
          getChatAssigneeLabel={(callData) => buildUserLabel(callData.room?.assigned_to ?? [])}
          getResponderLabel={(callData) => buildUserLabel(callData.assigned_to ?? [])}
          onOpenChat={openChat}
          onOpenAssigneeSettingModal={openListAssigneeSettingModal}
        />
      ) : null}

      {canAccessStaffViews && viewMode === ITEM2_VIEW_MODES.EMERGENCY ? (
        <EmergencyDispatchScreen
          calls={emergencyCalls}
          isRefreshing={isLoading}
          onRefresh={refreshCalls}
          getResponderLabel={(callData) => buildUserLabel(callData.assigned_to ?? [])}
          onOpenChat={openChat}
          onOpenResponderModal={openResponderModal}
        />
      ) : null}

      <AssigneeModal
        visible={chatAssigneeModal.isVisible}
        title={chatAssigneeModal.title}
        users={staffUsers}
        selectedUserIds={chatAssigneeModal.selectedUserIds}
        onToggleUser={chatAssigneeModal.toggleUser}
        onClose={chatAssigneeModal.closeModal}
        onConfirm={chatAssigneeModal.confirm}
      />

      <GoResponderModal
        visible={responderModal.isVisible}
        title={responderModal.title}
        users={staffUsers}
        selectedUserIds={responderModal.selectedUserIds}
        onToggleUser={responderModal.toggleUser}
        onClose={responderModal.closeModal}
        onConfirm={responderModal.confirm}
      />

      <AssigneeSettingModal
        visible={isAssigneeSettingVisible}
        users={staffUsers}
        initialResponderIds={assigneeSettingCall?.assigned_to ?? []}
        initialChatAssigneeIds={assigneeSettingCall?.room?.assigned_to ?? []}
        onClose={closeListAssigneeSettingModal}
        onConfirm={saveListAssigneeSetting}
        isSubmitting={isSavingAssigneeSetting}
      />
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#455a64',
    marginBottom: 6,
    marginTop: 10,
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
    color: '#212121',
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
});

export default Item2Screen;
