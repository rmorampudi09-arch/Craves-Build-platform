import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {useChefEditProfileDraft} from '../../chefProfile/state/ChefEditProfileDraftProvider';
import type {ChefBusinessProofDocument} from '../api/chefBusinessInformationApi';
import {
  chefBusinessDocumentTypeLabel,
  chefKitchenStatusLabel,
  formatChefBusinessAddress,
  formatChefBusinessDate,
  formatChefBusinessFileSize,
  getChefBusinessVerificationPresentation,
  verificationStatusLabel,
  type ChefBusinessInformationTone,
} from '../domain/chefBusinessInformationPresentation';
import {useChefBusinessInformationModel} from '../state/useChefBusinessInformationModel';

type BusinessNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefBusinessInformation'
>;

const DOCUMENT_MAINTENANCE_MESSAGE =
  'Craves cannot upload, replace, or resubmit sensitive business proofs from this screen yet. The current backend proof-file route belongs to onboarding and does not support approved-Chef document maintenance. No file is selected or transmitted.';
const DOCUMENT_CONTENT_MESSAGE =
  'The current Chef verification response exposes safe proof metadata only. It does not provide a Chef-facing document-content read contract, so Craves will not construct or expose a storage URL.';
const SERVICE_AREA_MESSAGE =
  'Your kitchen profile can show its current area label, but the backend does not expose an approved Chef service-area list, radius, polygon, lookup, or update contract yet.';
const CUISINE_MESSAGE =
  'The current backend does not expose an approved Chef cuisine or specialty taxonomy/read-write contract for this screen.';
const PAYOUT_MESSAGE =
  'Payout setup is not available here because the current backend exposes earnings history, not a Chef payout-configuration or payout-setup-status contract.';

function toneColors(tone: ChefBusinessInformationTone) {
  switch (tone) {
    case 'success':
      return {
        backgroundColor: colors.successSoft,
        borderColor: colors.success,
        foregroundColor: colors.success,
      };
    case 'warning':
      return {
        backgroundColor: colors.warningSoft,
        borderColor: colors.warning,
        foregroundColor: colors.warning,
      };
    case 'error':
      return {
        backgroundColor: colors.errorSoft,
        borderColor: colors.error,
        foregroundColor: colors.error,
      };
    case 'neutral':
      return {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.borderStrong,
        foregroundColor: colors.textSecondary,
      };
  }
}

function BusinessInformationSkeleton() {
  return (
    <View
      accessibilityLabel="Loading Chef business information"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonBanner} />
      <View style={styles.skeletonMetricRow}>
        <View style={styles.skeletonMetric} />
        <View style={styles.skeletonMetric} />
        <View style={styles.skeletonMetric} />
      </View>
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCardTall} />
    </View>
  );
}

function BusinessMetric({label, value}: {label: string; value: string}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.metricTile}>
      <Text numberOfLines={2} style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({title, subtitle}: {title: string; subtitle?: string}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ActionRow({
  icon,
  label,
  value,
  onPress,
  accessibilityHint,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress: () => void;
  accessibilityHint: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. ${value}`}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <Icon name={icon} size={iconSize.sm} color={colors.flameRed} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionValue}>{value}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
    </Pressable>
  );
}

function DocumentRow({
  document,
  expanded,
  onToggle,
  onOpen,
  onUpdate,
}: {
  document: ChefBusinessProofDocument;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onUpdate: () => void;
}) {
  return (
    <View style={styles.documentRow}>
      <Pressable
        accessibilityLabel={`${chefBusinessDocumentTypeLabel(document.documentType)}, on file`}
        accessibilityHint={expanded ? 'Collapse document details' : 'Expand document details'}
        accessibilityRole="button"
        accessibilityState={{expanded}}
        onPress={onToggle}
        style={({pressed}) => [styles.documentSummary, pressed && styles.pressed]}>
        <View style={styles.documentIcon}>
          <Icon name="shield" size={iconSize.sm} color={colors.flameRed} />
        </View>
        <View style={styles.documentCopy}>
          <Text style={styles.documentTitle}>
            {chefBusinessDocumentTypeLabel(document.documentType)}
          </Text>
          <Text numberOfLines={1} style={styles.documentMeta}>
            {document.originalFileName}
          </Text>
        </View>
        <View style={styles.documentStatusPill}>
          <Text style={styles.documentStatusText}>On file</Text>
        </View>
        <Icon
          name="chevron-right"
          size={iconSize.xs}
          color={colors.placeholder}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.documentDetails}>
          <Text style={styles.documentDetailText}>
            {document.contentType} · {formatChefBusinessFileSize(document.fileSizeBytes)}
          </Text>
          <Text style={styles.documentDetailText}>
            Uploaded {formatChefBusinessDate(document.createdAt)} · updated {formatChefBusinessDate(document.updatedAt)}
          </Text>
          <Text style={styles.documentBoundaryText}>
            The backend reports only UPLOADED metadata. Craves does not label this proof as individually verified, valid, expired, or rejected without a document-level backend state.
          </Text>
          <View style={styles.documentActions}>
            <Pressable
              accessibilityLabel={`Open ${chefBusinessDocumentTypeLabel(document.documentType)}`}
              accessibilityHint="Explains why sensitive document content cannot be opened from the current contract"
              accessibilityRole="button"
              onPress={onOpen}
              style={({pressed}) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.textButtonText}>Open file</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Update ${chefBusinessDocumentTypeLabel(document.documentType)}`}
              accessibilityHint="Explains the current approved-Chef document maintenance limitation"
              accessibilityRole="button"
              onPress={onUpdate}
              style={({pressed}) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.textButtonText}>Update</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SourceUnavailable({
  title,
  message,
  retrying,
  onRetry,
}: {
  title: string;
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.sourceErrorCard}>
      <Text style={styles.sourceErrorTitle}>{title}</Text>
      <Text style={styles.sourceErrorText}>{message}</Text>
      <Pressable
        accessibilityLabel={`Retry ${title}`}
        accessibilityRole="button"
        accessibilityState={{disabled: retrying}}
        disabled={retrying}
        onPress={onRetry}
        style={({pressed}) => [
          styles.retryButton,
          (pressed || retrying) && styles.pressed,
        ]}>
        {retrying ? <ActivityIndicator color={colors.flameRed} size="small" /> : null}
        <Text style={styles.retryText}>{retrying ? 'Refreshing…' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}

function SourceLoading({label}: {label: string}) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={styles.sourceLoadingCard}>
      <ActivityIndicator color={colors.flameRed} size="small" />
      <Text style={styles.sourceLoadingText}>{label}</Text>
    </View>
  );
}

export function ChefBusinessInformationScreen() {
  const navigation = useNavigation<BusinessNavigation>();
  const model = useChefBusinessInformationModel();
  const editDraft = useChefEditProfileDraft();
  const [expandedDocumentId, setExpandedDocumentId] = React.useState<string | null>(null);

  const showMessage = React.useCallback((title: string, message: string) => {
    Alert.alert(title, message, [{text: 'OK'}]);
  }, []);

  const openEditBusiness = React.useCallback(() => {
    if (!model.kitchen) {
      showMessage(
        'Business details unavailable',
        'Kitchen details must load before the editor can preserve a complete replacement draft safely.',
      );
      return;
    }
    editDraft.begin(model.kitchen);
    navigation.navigate('ChefEditProfile');
  }, [editDraft, model.kitchen, navigation, showMessage]);

  const retry = React.useCallback(() => {
    model.refresh().catch(() => undefined);
  }, [model]);

  const isEmptyInitialState = !model.kitchen && !model.verification;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Business information" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={model.isRefreshing && !model.isInitialLoading}
            tintColor={colors.flameRed}
            colors={[colors.flameRed]}
            onRefresh={retry}
          />
        }
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={iconSize.sm} color={colors.espressoBrown} />
          <Text style={styles.backButtonText}>Profile</Text>
        </Pressable>

        {isEmptyInitialState && model.isInitialLoading ? (
          <BusinessInformationSkeleton />
        ) : isEmptyInitialState && model.hasInitialError ? (
          <SourceUnavailable
            title="Business information unavailable"
            message="Craves could not load the current kitchen and verification records. Check your connection and retry; no local business state was substituted."
            retrying={model.isRefreshing}
            onRetry={retry}
          />
        ) : (
          <>
            {model.verification ? (
              (() => {
                const presentation = getChefBusinessVerificationPresentation(
                  model.verification,
                );
                const tone = toneColors(presentation.tone);
                return (
                  <View
                    accessibilityRole="summary"
                    style={[
                      styles.verificationBanner,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}>
                    <View style={styles.verificationIcon}>
                      <Icon
                        name="shield"
                        size={iconSize.lg}
                        color={tone.foregroundColor}
                      />
                    </View>
                    <View style={styles.verificationCopy}>
                      <View style={styles.verificationTitleRow}>
                        <Text style={styles.verificationTitle}>{presentation.title}</Text>
                        <View
                          style={[
                            styles.verificationPill,
                            {borderColor: tone.borderColor},
                          ]}>
                          <Text
                            style={[
                              styles.verificationPillText,
                              {color: tone.foregroundColor},
                            ]}>
                            {presentation.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.verificationSummary}>{presentation.summary}</Text>
                      {model.verification.reviewedAt ? (
                        <Text style={styles.verificationMeta}>
                          Last review {formatChefBusinessDate(model.verification.reviewedAt)}
                        </Text>
                      ) : model.verification.submittedAt ? (
                        <Text style={styles.verificationMeta}>
                          Submitted {formatChefBusinessDate(model.verification.submittedAt)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })()
            ) : model.verificationStatus === 'pending' ? (
              <SourceLoading label="Loading verification status…" />
            ) : (
              <SourceUnavailable
                title="Verification status unavailable"
                message="The Chef application verification record could not be loaded. Craves will not infer verification from kitchen status or uploaded file metadata."
                retrying={model.isRefreshing}
                onRetry={retry}
              />
            )}

            <View style={styles.overviewCard}>
              <SectionHeader
                title="Business overview"
                subtitle="Derived only from the current kitchen and verification responses"
              />
              <View style={styles.metricRow}>
                <BusinessMetric
                  label="Verification"
                  value={
                    model.verification
                      ? verificationStatusLabel(model.verification.status)
                      : 'Unavailable'
                  }
                />
                <BusinessMetric
                  label="Documents"
                  value={
                    model.verification
                      ? String(model.verification.documents.length)
                      : '—'
                  }
                />
                <BusinessMetric
                  label="Kitchen"
                  value={
                    model.kitchen
                      ? chefKitchenStatusLabel(model.kitchen.status)
                      : 'Unavailable'
                  }
                />
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <SectionHeader
                title="Business documents"
                subtitle="Sensitive document content is never logged or reconstructed from storage metadata"
              />
              <View style={styles.sectionCard}>
                {model.verification ? (
                  model.verification.documents.length > 0 ? (
                    model.verification.documents.map((document, index) => (
                      <React.Fragment key={document.id}>
                        {index > 0 ? <View style={styles.divider} /> : null}
                        <DocumentRow
                          document={document}
                          expanded={expandedDocumentId === document.id}
                          onToggle={() =>
                            setExpandedDocumentId(current =>
                              current === document.id ? null : document.id,
                            )
                          }
                          onOpen={() =>
                            showMessage('Document content unavailable', DOCUMENT_CONTENT_MESSAGE)
                          }
                          onUpdate={() =>
                            showMessage(
                              'Document maintenance unavailable',
                              DOCUMENT_MAINTENANCE_MESSAGE,
                            )
                          }
                        />
                      </React.Fragment>
                    ))
                  ) : (
                    <View style={styles.emptyDocuments}>
                      <Icon name="shield" size={iconSize.xl} color={colors.placeholder} />
                      <Text style={styles.emptyDocumentsTitle}>No proof files on record</Text>
                      <Text style={styles.emptyDocumentsText}>
                        The verification service returned no Aadhaar or PAN proof metadata for this application.
                      </Text>
                    </View>
                  )
                ) : model.verificationStatus === 'pending' ? (
                  <View style={styles.emptyDocuments}>
                    <ActivityIndicator color={colors.flameRed} size="small" />
                    <Text style={styles.emptyDocumentsTitle}>Loading document list…</Text>
                    <Text style={styles.emptyDocumentsText}>
                      Craves is waiting for the current verification record before showing proof metadata.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptyDocuments}>
                    <Text style={styles.emptyDocumentsTitle}>Document list unavailable</Text>
                    <Text style={styles.emptyDocumentsText}>
                      Craves will not display cached or invented proof status while the verification source is unavailable.
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                accessibilityLabel="Upload new business document"
                accessibilityHint="Explains why approved-Chef document upload is currently unavailable"
                accessibilityRole="button"
                onPress={() =>
                  showMessage(
                    'Document maintenance unavailable',
                    DOCUMENT_MAINTENANCE_MESSAGE,
                  )
                }
                style={({pressed}) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.secondaryButtonText}>Upload New Document</Text>
              </Pressable>
            </View>

            <View style={styles.sectionWrap}>
              <SectionHeader
                title="Business details"
                subtitle="Edit only fields backed by the existing kitchen profile contract"
              />
              <View style={styles.sectionCard}>
                {model.kitchen ? (
                  <>
                    <ActionRow
                      icon="chef"
                      label="Kitchen"
                      value={model.kitchen.kitchenName}
                      accessibilityHint="Open the Chef business profile editor"
                      onPress={openEditBusiness}
                    />
                    <View style={styles.divider} />
                    <ActionRow
                      icon="location"
                      label="Business address"
                      value={formatChefBusinessAddress(model.kitchen)}
                      accessibilityHint="Open the existing Chef profile editor for address fields"
                      onPress={openEditBusiness}
                    />
                    <View style={styles.divider} />
                    <ActionRow
                      icon="location"
                      label="Service areas"
                      value={
                        model.kitchen.areaName
                          ? `${model.kitchen.areaName} · profile area only`
                          : 'No service-area contract available'
                      }
                      accessibilityHint="Explains the current service-area contract limitation"
                      onPress={() =>
                        showMessage('Service areas unavailable', SERVICE_AREA_MESSAGE)
                      }
                    />
                  </>
                ) : model.kitchenStatus === 'pending' ? (
                  <SourceLoading label="Loading kitchen details…" />
                ) : (
                  <SourceUnavailable
                    title="Kitchen details unavailable"
                    message="The Chef-owned kitchen profile could not be loaded. Verification data remains independent and visible when available."
                    retrying={model.isRefreshing}
                    onRetry={retry}
                  />
                )}
                <View style={styles.divider} />
                <ActionRow
                  icon="chef"
                  label="Cuisine & specialties"
                  value="Backend contract unavailable"
                  accessibilityHint="Explains the current cuisine and specialties contract limitation"
                  onPress={() =>
                    showMessage('Cuisine & specialties unavailable', CUISINE_MESSAGE)
                  }
                />
                <View style={styles.divider} />
                <ActionRow
                  icon="analytics"
                  label="Payout setup"
                  value="Backend contract unavailable"
                  accessibilityHint="Explains the current payout setup contract limitation"
                  onPress={() => showMessage('Payout setup unavailable', PAYOUT_MESSAGE)}
                />
              </View>
            </View>

            <View style={styles.guidanceCard}>
              <Icon name="shield" size={iconSize.lg} color={colors.flameRed} />
              <View style={styles.guidanceCopy}>
                <Text style={styles.guidanceTitle}>Your verification data stays authoritative</Text>
                <Text style={styles.guidanceText}>
                  Application status comes from the Chef verification service. Kitchen status, uploaded proof metadata, earnings, or local UI state never promote a verification result on their own.
                </Text>
                <Pressable
                  accessibilityLabel="Learn more about Chef business verification"
                  accessibilityRole="button"
                  onPress={() =>
                    showMessage(
                      'About business verification',
                      'Craves reads your current Chef application and kitchen profile through protected signed-in APIs. Sensitive proof storage locations are intentionally not exposed to this screen. Document validity, service areas, cuisines, and payout setup remain unavailable until exact backend contracts exist.',
                    )
                  }
                  style={({pressed}) => [styles.learnMoreButton, pressed && styles.pressed]}>
                  <Text style={styles.learnMoreText}>Learn more</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Edit business information"
              accessibilityHint="Opens the existing Chef profile editor for supported kitchen fields"
              accessibilityRole="button"
              accessibilityState={{disabled: !model.kitchen}}
              disabled={!model.kitchen}
              onPress={openEditBusiness}
              style={({pressed}) => [
                styles.primaryButton,
                pressed && styles.pressed,
                !model.kitchen && styles.disabled,
              ]}>
              <Text style={styles.primaryButtonText}>Edit Business Information</Text>
            </Pressable>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  backButtonText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  verificationBanner: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    ...elevation.card,
  },
  verificationIcon: {paddingTop: spacing.xxs},
  verificationCopy: {flex: 1, minWidth: 0},
  verificationTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  verificationTitle: {
    flex: 1,
    minWidth: 180,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  verificationPill: {
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  verificationPillText: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  verificationSummary: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  verificationMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  overviewCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  sectionHeader: {gap: spacing.xxs},
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  metricTile: {
    flex: 1,
    minHeight: 88,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  metricValue: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  sectionWrap: {gap: spacing.xs},
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  documentRow: {backgroundColor: colors.white},
  documentSummary: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  documentCopy: {flex: 1, minWidth: 0},
  documentTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  documentMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  documentStatusPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  documentStatusText: {
    color: colors.info,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  documentDetails: {
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  documentDetailText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  documentBoundaryText: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  documentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  textButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
  },
  textButtonText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  emptyDocuments: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyDocumentsTitle: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  emptyDocumentsText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: touchTarget.minimum,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.flameRed,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  actionRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  actionCopy: {flex: 1, minWidth: 0},
  actionLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  actionValue: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  divider: {
    height: borderWidth.standard,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
  sourceErrorCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  sourceErrorTitle: {
    color: colors.error,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  sourceErrorText: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingRight: spacing.sm,
  },
  retryText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  sourceLoadingCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  sourceLoadingText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  guidanceCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  guidanceCopy: {flex: 1},
  guidanceTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  guidanceText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  learnMoreButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingRight: spacing.sm,
  },
  learnMoreText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  primaryButton: {
    minHeight: touchTarget.comfortable,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.lg,
    ...elevation.primaryAction,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.62},
  disabled: {opacity: 0.45},
  skeletonWrap: {gap: spacing.md},
  skeletonBanner: {
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonMetricRow: {flexDirection: 'row', gap: spacing.xs},
  skeletonMetric: {
    flex: 1,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 170,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCardTall: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
