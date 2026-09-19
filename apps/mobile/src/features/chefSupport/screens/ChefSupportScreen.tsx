import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import type {
  SupportCaseDetail,
  SupportCaseStatus,
  SupportCaseSummary,
} from '../../customerSupport/api/customerSupportCasesApi';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {
  CHEF_SUPPORT_CASES_AVAILABLE,
  buildChefSupportMessageRequest,
  buildCreateChefSupportCaseRequest,
  chefSupportCasesApi,
} from '../api/chefSupportCasesApi';

type ChefSupportNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefSupport'
>;

function statusLabel(status: SupportCaseStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function ChefSupportScreen() {
  const navigation = useNavigation<ChefSupportNavigation>();
  const [cases, setCases] = React.useState<SupportCaseSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [selected, setSelected] = React.useState<SupportCaseDetail | null>(null);
  const [loadingCaseId, setLoadingCaseId] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState('');
  const [replying, setReplying] = React.useState(false);

  const loadCases = React.useCallback(async () => {
    if (!CHEF_SUPPORT_CASES_AVAILABLE) return;
    setLoading(true);
    setError(null);
    try {
      const page = await chefSupportCasesApi.list({limit: 20});
      setCases(page.cases);
    } catch (cause) {
      setError(toAppApiError(cause).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const submitCase = React.useCallback(async () => {
    if (!CHEF_SUPPORT_CASES_AVAILABLE) return;
    setError(null);
    try {
      const request = buildCreateChefSupportCaseRequest({subject, message});
      setCreating(true);
      const created = await chefSupportCasesApi.create(request);
      setCases(current => [
        created.supportCase,
        ...current.filter(entry => entry.id !== created.supportCase.id),
      ]);
      setSelected(created);
      setSubject('');
      setMessage('');
      setShowCreate(false);
    } catch (cause) {
      setError(toAppApiError(cause).message);
    } finally {
      setCreating(false);
    }
  }, [message, subject]);

  const openCase = React.useCallback(
    async (entry: SupportCaseSummary) => {
      if (!CHEF_SUPPORT_CASES_AVAILABLE) return;
      if (selected?.supportCase.id === entry.id) {
        setSelected(null);
        setReply('');
        return;
      }

      setError(null);
      setLoadingCaseId(entry.id);
      try {
        const detail = await chefSupportCasesApi.get(entry.id);
        setSelected(detail);
        setReply('');
      } catch (cause) {
        setError(toAppApiError(cause).message);
      } finally {
        setLoadingCaseId(null);
      }
    },
    [selected?.supportCase.id],
  );

  const sendReply = React.useCallback(async () => {
    if (
      !CHEF_SUPPORT_CASES_AVAILABLE ||
      !selected ||
      selected.supportCase.status === 'CLOSED'
    ) {
      return;
    }

    setError(null);
    try {
      const request = buildChefSupportMessageRequest(reply);
      setReplying(true);
      const updated = await chefSupportCasesApi.addMessage(
        selected.supportCase.id,
        request,
      );
      setSelected(updated);
      setCases(current =>
        current.map(entry =>
          entry.id === updated.supportCase.id ? updated.supportCase : entry,
        ),
      );
      setReply('');
    } catch (cause) {
      setError(toAppApiError(cause).message);
    } finally {
      setReplying(false);
    }
  }, [reply, selected]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Help & support" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={iconSize.sm} color={colors.espressoBrown} />
          <Text style={styles.backText}>Profile</Text>
        </Pressable>

        {!CHEF_SUPPORT_CASES_AVAILABLE ? (
          <View accessibilityRole="alert" style={styles.contractBanner}>
            <View style={styles.contractIcon}>
              <Icon name="shield" size={iconSize.lg} color={colors.warning} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.contractTitle}>Support cases are not live yet</Text>
              <Text style={styles.contractText}>
                The Chef support-case backend is implemented, but its APIM routes are not published on main. Craves keeps case creation and messaging disabled until that gateway rollout is complete.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.headingRow}>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>My support cases</Text>
                <Text style={styles.sectionCaption}>
                  Get help with payouts, orders, kitchen operations or your Chef account.
                </Text>
              </View>
              <Pressable
                accessibilityLabel={showCreate ? 'Cancel new support case' : 'Create support case'}
                accessibilityRole="button"
                onPress={() => {
                  setShowCreate(value => !value);
                  setError(null);
                }}
                style={({pressed}) => [
                  styles.primarySmallButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.primarySmallButtonText}>
                  {showCreate ? 'Cancel' : 'New case'}
                </Text>
              </Pressable>
            </View>

            {showCreate ? (
              <View style={styles.formCard}>
                <Text style={styles.inputLabel}>Subject</Text>
                <TextInput
                  accessibilityLabel="Chef support case subject"
                  maxLength={160}
                  onChangeText={setSubject}
                  placeholder="What do you need help with?"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                  value={subject}
                />

                <Text style={styles.inputLabel}>Message</Text>
                <TextInput
                  accessibilityLabel="Chef support case message"
                  maxLength={5000}
                  multiline
                  onChangeText={setMessage}
                  placeholder="Describe the issue"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, styles.messageInput]}
                  textAlignVertical="top"
                  value={message}
                />

                <Pressable
                  accessibilityLabel="Submit Chef support case"
                  accessibilityRole="button"
                  disabled={creating}
                  onPress={() => void submitCase()}
                  style={({pressed}) => [
                    styles.primaryButton,
                    (pressed || creating) && styles.pressed,
                  ]}>
                  {creating ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Submit case</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {error ? (
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
                {error}
              </Text>
            ) : null}

            {loading && cases.length === 0 ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.flameRed} />
                <Text style={styles.stateText}>Loading support cases…</Text>
              </View>
            ) : cases.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No support cases yet</Text>
                <Text style={styles.stateText}>
                  Create a case when you need help from Craves Support.
                </Text>
              </View>
            ) : (
              <View style={styles.caseList}>
                {cases.map(entry => {
                  const isSelected = selected?.supportCase.id === entry.id;
                  const detailLoading = loadingCaseId === entry.id;
                  return (
                    <View key={entry.id}>
                      <Pressable
                        accessibilityLabel={`Open support case ${entry.caseNumber}`}
                        accessibilityRole="button"
                        onPress={() => void openCase(entry)}
                        style={({pressed}) => [
                          styles.caseCard,
                          isSelected && styles.caseCardSelected,
                          pressed && styles.pressed,
                        ]}>
                        <View style={styles.caseTopRow}>
                          <Text style={styles.caseNumber}>{entry.caseNumber}</Text>
                          <View style={styles.statusPill}>
                            <Text style={styles.statusText}>
                              {statusLabel(entry.status)}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={2} style={styles.caseSubject}>
                          {entry.subject}
                        </Text>
                        <Text style={styles.caseUpdated}>
                          Updated {dateLabel(entry.updatedAt)}
                        </Text>
                        {detailLoading ? (
                          <ActivityIndicator
                            color={colors.flameRed}
                            size="small"
                            style={styles.detailSpinner}
                          />
                        ) : null}
                      </Pressable>

                      {isSelected && selected ? (
                        <View style={styles.detailCard}>
                          <View style={styles.messageList}>
                            {selected.messages.map(caseMessage => (
                              <View
                                key={caseMessage.id}
                                style={[
                                  styles.messageBubble,
                                  caseMessage.senderRole === 'SUPPORT'
                                    ? styles.supportMessage
                                    : styles.chefMessage,
                                ]}>
                                <Text style={styles.messageSender}>
                                  {caseMessage.senderRole === 'SUPPORT'
                                    ? 'Craves Support'
                                    : 'You'}
                                </Text>
                                <Text style={styles.messageBody}>
                                  {caseMessage.body}
                                </Text>
                                <Text style={styles.messageDate}>
                                  {dateLabel(caseMessage.createdAt)}
                                </Text>
                              </View>
                            ))}
                          </View>

                          {selected.supportCase.status === 'CLOSED' ? (
                            <Text style={styles.closedText}>
                              This case is closed and no longer accepts replies.
                            </Text>
                          ) : (
                            <>
                              <TextInput
                                accessibilityLabel="Reply to Chef support case"
                                maxLength={5000}
                                multiline
                                onChangeText={setReply}
                                placeholder="Add more information"
                                placeholderTextColor={colors.placeholder}
                                style={[styles.input, styles.replyInput]}
                                textAlignVertical="top"
                                value={reply}
                              />
                              <Pressable
                                accessibilityLabel="Send Chef support reply"
                                accessibilityRole="button"
                                disabled={replying}
                                onPress={() => void sendReply()}
                                style={({pressed}) => [
                                  styles.secondaryButton,
                                  (pressed || replying) && styles.pressed,
                                ]}>
                                {replying ? (
                                  <ActivityIndicator color={colors.flameRed} />
                                ) : (
                                  <Text style={styles.secondaryButtonText}>
                                    Send reply
                                  </Text>
                                )}
                              </Pressable>
                            </>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.white},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  flex: {flex: 1},
  pressed: {opacity: 0.65},
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: touchTarget.minimum,
  },
  backText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  contractBanner: {
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  contractIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  contractTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  contractText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.xxs,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  primarySmallButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
  },
  primarySmallButtonText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  formCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  inputLabel: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.body,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  messageInput: {minHeight: 112},
  replyInput: {minHeight: 88, marginTop: spacing.md},
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.md,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: touchTarget.comfortable,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.flameRed,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: touchTarget.minimum,
  },
  secondaryButtonText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  stateTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  caseList: {gap: spacing.sm, marginTop: spacing.md},
  caseCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  caseCardSelected: {borderColor: colors.flameRed},
  caseTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  caseNumber: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  statusPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  statusText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  caseSubject: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
  },
  caseUpdated: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  detailSpinner: {marginTop: spacing.sm},
  detailCard: {
    backgroundColor: colors.surfaceWarm,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    marginHorizontal: spacing.xs,
    padding: spacing.md,
  },
  messageList: {gap: spacing.sm},
  messageBubble: {
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  supportMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
  },
  chefMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.iconSurface,
  },
  messageSender: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  messageBody: {
    color: colors.textPrimary,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.xxs,
  },
  messageDate: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  closedText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.md,
  },
});
