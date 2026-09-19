import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {
  CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES,
  chefBusinessInformationApi,
  type ChefBusinessProofDocument,
  type ChefProofUploadFile,
  type ChefRequiredApplicationDocumentType,
} from '../api/chefBusinessInformationApi';
import {
  chefBusinessDocumentTypeLabel,
  formatChefBusinessDate,
  formatChefBusinessFileSize,
} from '../domain/chefBusinessInformationPresentation';

type EditableApplicationStatus = 'PENDING' | 'REJECTED';

const MAX_SERVER_DOCUMENT_BYTES = 10 * 1024 * 1024;

function inferImageType(
  asset: ImagePicker.ImagePickerAsset,
): ChefProofUploadFile['type'] | null {
  if (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png') {
    return asset.mimeType;
  }
  const source = (asset.fileName ?? asset.uri).toLowerCase();
  if (/\.png(?:$|[?#])/.test(source)) return 'image/png';
  if (/\.jpe?g(?:$|[?#])/.test(source)) return 'image/jpeg';
  return null;
}

function fallbackName(
  documentType: ChefRequiredApplicationDocumentType,
  type: ChefProofUploadFile['type'],
): string {
  const extension = type === 'image/png' ? 'png' : 'jpg';
  return `craves-${documentType.toLowerCase().replace(/_/g, '-') }.${extension}`;
}

function documentStatusCopy(document: ChefBusinessProofDocument | undefined): string {
  if (!document) return 'Required · not uploaded';
  if (document.status === 'APPROVED') return 'Approved';
  if (document.status === 'REJECTED') {
    return document.reviewReason
      ? `Needs update · ${document.reviewReason}`
      : 'Needs update';
  }
  return 'Uploaded · awaiting document review';
}

function DocumentSlot({
  documentType,
  document,
  uploading,
  disabled,
  onPick,
}: {
  documentType: ChefRequiredApplicationDocumentType;
  document?: ChefBusinessProofDocument;
  uploading: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const approved = document?.status === 'APPROVED';
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentIcon}>
        <Icon
          name={documentType === 'APPLICANT_PHOTO' ? 'account' : 'shield'}
          size={iconSize.sm}
          color={approved ? colors.success : colors.flameRedAccessible}
        />
      </View>
      <View style={styles.documentCopy}>
        <Text style={styles.documentTitle}>
          {chefBusinessDocumentTypeLabel(documentType)}
          {documentType === 'TAX_ID_CARD' ? ' (PAN)' : ''}
        </Text>
        <Text
          style={[
            styles.documentStatus,
            document?.status === 'REJECTED' && styles.documentRejected,
            approved && styles.documentApproved,
          ]}>
          {documentStatusCopy(document)}
        </Text>
        {document ? (
          <Text style={styles.documentMeta}>
            {document.originalFileName} · {formatChefBusinessFileSize(document.fileSizeBytes)}
            {' · '}
            {formatChefBusinessDate(document.updatedAt)}
          </Text>
        ) : null}
      </View>
      {uploading ? (
        <ActivityIndicator color={colors.flameRedAccessible} size="small" />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${document ? 'Replace' : 'Upload'} ${chefBusinessDocumentTypeLabel(documentType)}`}
          accessibilityState={{disabled: disabled || approved}}
          disabled={disabled || approved}
          onPress={onPick}
          style={({pressed}) => [
            styles.uploadButton,
            (disabled || approved) && styles.disabled,
            pressed && !disabled && !approved && styles.pressed,
          ]}>
          <Text style={styles.uploadButtonText}>
            {approved ? 'Locked' : document ? 'Replace' : 'Upload'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChefKycEvidencePanel({
  applicationStatus,
}: {
  applicationStatus: EditableApplicationStatus;
}) {
  const [documents, setDocuments] = React.useState<ChefBusinessProofDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploadingType, setUploadingType] =
    React.useState<ChefRequiredApplicationDocumentType | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await chefBusinessInformationApi.listApplicationEvidence());
      setMessage(null);
    } catch (caught) {
      const error = toAppApiError(caught);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const pickAndUpload = React.useCallback(
    async (documentType: ChefRequiredApplicationDocumentType) => {
      if (uploadingType) return;
      setMessage(null);

      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Photo access required',
            'Allow photo-library access to select your Chef verification document.',
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: documentType === 'APPLICANT_PHOTO',
          aspect: documentType === 'APPLICANT_PHOTO' ? [1, 1] : undefined,
          quality: 1,
        });
        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        const type = inferImageType(asset);
        if (!type) {
          setMessage('Choose an original JPG or PNG image.');
          return;
        }
        if (
          typeof asset.fileSize === 'number' &&
          asset.fileSize > MAX_SERVER_DOCUMENT_BYTES
        ) {
          setMessage('Choose an image smaller than 10 MB.');
          return;
        }

        const file: ChefProofUploadFile = {
          uri: asset.uri,
          name:
            asset.fileName?.trim() ||
            fallbackName(documentType, type),
          type,
        };

        setUploadingType(documentType);
        const uploaded = await chefBusinessInformationApi.uploadProofFile(
          documentType,
          file,
        );
        setDocuments(current => [
          ...current.filter(item => item.documentType !== documentType),
          uploaded,
        ]);
        setMessage(
          `${chefBusinessDocumentTypeLabel(documentType)} uploaded securely and is awaiting review.`,
        );
      } catch (caught) {
        setMessage(toAppApiError(caught).message);
      } finally {
        setUploadingType(null);
      }
    },
    [uploadingType],
  );

  const uploadedTypes = new Set(documents.map(document => document.documentType));
  const complete = CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES.every(type =>
    uploadedTypes.has(type),
  );
  const approved = CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES.every(type =>
    documents.some(
      document =>
        document.documentType === type && document.status === 'APPROVED',
    ),
  );

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Icon name="shield" size={iconSize.md} color={colors.flameRedAccessible} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>Chef KYC</Text>
          <Text style={styles.title}>Verification documents</Text>
          <Text style={styles.subtitle}>
            All four documents are required before the Chef application can be approved.
          </Text>
        </View>
      </View>

      {applicationStatus === 'REJECTED' ? (
        <Text style={styles.applicationNotice}>
          Your application needs attention. You can replace any non-approved
          proof here before resubmitting the application.
        </Text>
      ) : null}

      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {loading && documents.length === 0 ? (
        <View accessibilityRole="progressbar" style={styles.loading}>
          <ActivityIndicator color={colors.flameRedAccessible} />
          <Text style={styles.loadingText}>Loading KYC evidence…</Text>
        </View>
      ) : (
        <View style={styles.documents}>
          {CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES.map(documentType => (
            <DocumentSlot
              key={documentType}
              documentType={documentType}
              document={documents.find(
                item => item.documentType === documentType,
              )}
              uploading={uploadingType === documentType}
              disabled={Boolean(uploadingType)}
              onPick={() => {
                pickAndUpload(documentType).catch(() => undefined);
              }}
            />
          ))}
        </View>
      )}

      <View
        accessibilityRole="summary"
        style={[
          styles.completion,
          complete && styles.completionReady,
          approved && styles.completionApproved,
        ]}>
        <Icon
          name={approved ? 'check' : 'shield'}
          size={iconSize.sm}
          color={approved ? colors.success : colors.textSecondary}
        />
        <Text style={styles.completionText}>
          {approved
            ? 'All required KYC documents are approved.'
            : complete
              ? 'All required documents are uploaded. Individual review is still required before Chef approval.'
              : `${CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES.length - uploadedTypes.size} required document${CHEF_REQUIRED_APPLICATION_DOCUMENT_TYPES.length - uploadedTypes.size === 1 ? '' : 's'} remaining.`}
        </Text>
      </View>

      <Button
        label={loading ? 'Refreshing…' : 'Refresh document status'}
        variant="outline"
        loading={loading}
        disabled={Boolean(uploadingType)}
        onPress={() => {
          refresh().catch(() => undefined);
        }}
      />

      <Text style={styles.privacy}>
        Mobile accepts JPG or PNG for this flow. Files go directly to the
        authenticated Chef evidence endpoint; the app does not retain a local
        document copy after selection. Approved documents cannot be replaced
        through this onboarding route.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  heading: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  headingIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.iconSurface,
  },
  headingCopy: {flex: 1, minWidth: 0},
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  applicationNotice: {
    color: colors.warningText,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: typography.small,
    lineHeight: 20,
  },
  message: {
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: typography.small,
    lineHeight: 20,
  },
  loading: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  documents: {
    overflow: 'hidden',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  documentRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  documentIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.iconSurface,
  },
  documentCopy: {flex: 1, minWidth: 0},
  documentTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  documentStatus: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  documentRejected: {color: colors.error},
  documentApproved: {color: colors.successText},
  documentMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  uploadButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  uploadButtonText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  completion: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  completionReady: {backgroundColor: colors.warningSoft},
  completionApproved: {backgroundColor: colors.successSoft},
  completionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  privacy: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.45},
});
