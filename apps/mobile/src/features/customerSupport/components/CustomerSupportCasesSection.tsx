import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {
  CUSTOMER_SUPPORT_CASES_AVAILABLE,
  buildAddSupportCaseMessageRequest,
  buildCreateCustomerSupportCaseRequest,
  customerSupportCasesApi,
  type SupportCaseDetail,
  type SupportCaseSummary,
  type SupportCaseStatus,
} from '../api/customerSupportCasesApi';

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

export function CustomerSupportCasesSection({
  createRequestToken,
}: {
  createRequestToken: number;
}) {
  const [cases, setCases] = React.useState<SupportCaseSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<SupportCaseDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState('');
  const [replying, setReplying] = React.useState(false);

  const loadCases = React.useCallback(async () => {
    if (!CUSTOMER_SUPPORT_CASES_AVAILABLE) return;
    setLoading(true);
    setListError(null);
    try {
      const page = await customerSupportCasesApi.list({limit: 20});
      setCases(page.cases);
    } catch (error) {
      setListError(toAppApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCases();
  }, [loadCases]);

  React.useEffect(() => {
    if (CUSTOMER_SUPPORT_CASES_AVAILABLE && createRequestToken > 0) {
      setShowCreate(true);
      setActionError(null);
    }
  }, [createRequestToken]);

  if (!CUSTOMER_SUPPORT_CASES_AVAILABLE) {
    return null;
  }

  const submitCase = async () => {
    setActionError(null);
    try {
      const request = buildCreateCustomerSupportCaseRequest({subject, message});
      setCreating(true);
      const created = await customerSupportCasesApi.create(request);
      setCases(current => [
        created.supportCase,
        ...current.filter(entry => entry.id !== created.supportCase.id),
      ]);
      setDetail(created);
      setSubject('');
      setMessage('');
      setShowCreate(false);
    } catch (error) {
      setActionError(toAppApiError(error).message);
    } finally {
      setCreating(false);
    }
  };

  const openCase = async (supportCase: SupportCaseSummary) => {
    if (detail?.supportCase.id === supportCase.id) {
      setDetail(null);
      setReply('');
      return;
    }

    setActionError(null);
    setDetailLoadingId(supportCase.id);
    try {
      const loaded = await customerSupportCasesApi.get(supportCase.id);
      setDetail(loaded);
      setReply('');
    } catch (error) {
      setActionError(toAppApiError(error).message);
    } finally {
      setDetailLoadingId(null);
    }
  };

  const sendReply = async () => {
    if (!detail || detail.supportCase.status === 'CLOSED') return;

    setActionError(null);
    try {
      const request = buildAddSupportCaseMessageRequest(reply);
      setReplying(true);
      const updated = await customerSupportCasesApi.addMessage(
        detail.supportCase.id,
        request,
      );
      setDetail(updated);
      setCases(current =>
        current.map(entry =>
          entry.id === updated.supportCase.id ? updated.supportCase : entry,
        ),
      );
      setReply('');
    } catch (error) {
      setActionError(toAppApiError(error).message);
    } finally {
      setReplying(false);
    }
  };

  return (
    <View style={styles.root} testID="customer-support-cases">
      <View style={styles.headingRow}>
        <View style={styles.flex}>
          <Text style={styles.title}>My support cases</Text>
          <Text style={styles.caption}>
            Track replies and continue conversations with Craves Support.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create support case"
          onPress={() => {
            setShowCreate(value => !value);
            setActionError(null);
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
            accessibilityLabel="Support case subject"
            maxLength={160}
            onChangeText={setSubject}
            placeholder="What do you need help with?"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={subject}
          />

          <Text style={styles.inputLabel}>Message</Text>
          <TextInput
            accessibilityLabel="Support case message"
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
            accessibilityRole="button"
            accessibilityLabel="Submit support case"
            disabled={creating}
            onPress={() => { submitCase().catch(() => undefined); }}
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

      {actionError ? (
        <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
          {actionError}
        </Text>
      ) : null}

      {loading && cases.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.stateText}>Loading support cases…</Text>
        </View>
      ) : listError && cases.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{listError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { loadCases().catch(() => undefined); }}
            style={({pressed}) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : cases.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>No support cases yet</Text>
          <Text style={styles.stateText}>
            Create a case when you need help with an order, payment, account or delivery.
          </Text>
        </View>
      ) : (
        <View style={styles.caseList}>
          {cases.map(entry => {
            const selected = detail?.supportCase.id === entry.id;
            const loadingDetail = detailLoadingId === entry.id;
            return (
              <View key={entry.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open support case ${entry.caseNumber}`}
                  onPress={() => { openCase(entry).catch(() => undefined); }}
                  style={({pressed}) => [
                    styles.caseCard,
                    selected && styles.caseCardSelected,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.caseTopRow}>
                    <Text style={styles.caseNumber}>{entry.caseNumber}</Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{statusLabel(entry.status)}</Text>
                    </View>
                  </View>
                  <Text numberOfLines={2} style={styles.caseSubject}>
                    {entry.subject}
                  </Text>
                  <Text style={styles.caseUpdated}>
                    Updated {dateLabel(entry.updatedAt)}
                  </Text>
                  {loadingDetail ? (
                    <ActivityIndicator
                      color={colors.flameRed}
                      size="small"
                      style={styles.detailSpinner}
                    />
                  ) : null}
                </Pressable>

                {selected && detail ? (
                  <View style={styles.detailCard}>
                    <View style={styles.messageList}>
                      {detail.messages.map(caseMessage => (
                        <View
                          key={caseMessage.id}
                          style={[
                            styles.messageBubble,
                            caseMessage.senderRole === 'SUPPORT'
                              ? styles.supportMessage
                              : styles.customerMessage,
                          ]}>
                          <Text style={styles.messageSender}>
                            {caseMessage.senderRole === 'SUPPORT'
                              ? 'Craves Support'
                              : 'You'}
                          </Text>
                          <Text style={styles.messageBody}>{caseMessage.body}</Text>
                          <Text style={styles.messageDate}>
                            {dateLabel(caseMessage.createdAt)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {detail.supportCase.status === 'CLOSED' ? (
                      <Text style={styles.closedText}>
                        This case is closed and no longer accepts replies.
                      </Text>
                    ) : (
                      <>
                        <TextInput
                          accessibilityLabel="Reply to support case"
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
                          accessibilityRole="button"
                          accessibilityLabel="Send support case reply"
                          disabled={replying}
                          onPress={() => { sendReply().catch(() => undefined); }}
                          style={({pressed}) => [
                            styles.secondaryButton,
                            (pressed || replying) && styles.pressed,
                          ]}>
                          {replying ? (
                            <ActivityIndicator color={colors.flameRed} />
                          ) : (
                            <Text style={styles.secondaryButtonText}>Send reply</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.xl,
  },
  flex: {flex: 1},
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  caption: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 17,
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
    paddingHorizontal: spacing.md,
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
  centerState: {
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
  caseList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  caseCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  caseCardSelected: {
    borderColor: colors.flameRed,
  },
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
  customerMessage: {
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
  pressed: {opacity: 0.68},
});
