import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {chefOnboardingApi, type ChefEvidence, type UploadFile} from '../api/chefOnboardingApi';
import {DoneTick, FieldError, LinkButton, StatusChip} from './OnboardingUi';

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short-lived private preview of a saved upload. Failures keep the icon. */
export function useSavedPreview(evidence: ChefEvidence | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const id = evidence?.id;
  const image = Boolean(evidence && IMAGE_NAME.test(evidence.originalFileName));
  useEffect(() => {
    setUrl(null);
    if (!id || !enabled || !image) return;
    let live = true;
    chefOnboardingApi.preview(id).then(
      next => live && setUrl(next),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [id, enabled, image, evidence?.status]);
  return url;
}

/**
 * Picks a photo (gallery or camera) and turns it into a JPEG/PNG the server accepts.
 * shortcut: no PDF picker is installed, so documents are photos only; add a document picker
 * if chefs ask to upload PDFs from the phone.
 */
async function pickPhoto(source: 'camera' | 'library'): Promise<UploadFile | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      source === 'camera' ? 'Camera access needed' : 'Photo access needed',
      source === 'camera'
        ? 'Allow camera access for Craves in your phone settings to take this photo.'
        : 'Allow photo access for Craves in your phone settings to choose this photo.',
      [{text: 'Not now', style: 'cancel'}, {text: 'Open settings', onPress: () => Linking.openSettings()}],
    );
    return null;
  }
  // quality < 1 makes the picker re-encode, so HEIC/WebP arrive as JPEG (the server takes JPEG, PNG, PDF).
  const options: ImagePicker.ImagePickerOptions = {mediaTypes: ['images'], quality: 0.9};
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (typeof asset.fileSize === 'number' && (asset.fileSize === 0 || asset.fileSize > MAX_BYTES))
    throw new Error('Choose a photo up to 10 MB.');
  const png = asset.mimeType === 'image/png' || /\.png$/i.test(asset.fileName ?? asset.uri);
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return {uri: asset.uri, name: `${base}.${png ? 'png' : 'jpg'}`, type: png ? 'image/png' : 'image/jpeg'};
}

type Props = {
  type: string;
  label: string;
  helper?: string;
  emptyTitle?: string;
  photo?: boolean;
  evidence?: ChefEvidence;
  disabled: boolean;
  fieldError?: string | null;
  onUpload: (type: string, file: UploadFile) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Returning false stops the picker (the kitchen address must be complete before photos). */
  beforePick?: () => boolean;
};

export function ChefOnboardingUpload({
  type,
  label,
  helper,
  emptyTitle,
  photo = false,
  evidence,
  disabled,
  fieldError,
  onUpload,
  onRemove,
  beforePick,
}: Props) {
  const [file, setFile] = useState<UploadFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadedUri, setUploadedUri] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const locked = evidence?.status === 'APPROVED';
  const rejected = evidence?.status === 'REJECTED';
  const savedPreview = useSavedPreview(evidence, !uploadedUri);

  async function upload(next: UploadFile) {
    setBusy(true);
    setError('');
    try {
      await onUpload(type, next);
      if (mounted.current) setUploadedUri(next.uri);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Upload failed. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function choose(source: 'camera' | 'library') {
    if (disabled || busy || locked || (beforePick && !beforePick())) return;
    setError('');
    try {
      const picked = await pickPhoto(source);
      if (!picked || !mounted.current) return;
      setFile(picked);
      setUploadedUri(null);
      await upload(picked);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Choose another photo.');
    }
  }
  async function removeSaved() {
    if (!evidence || locked || busy) return;
    setBusy(true);
    setError('');
    try {
      await onRemove(evidence.id);
      if (mounted.current) {
        setFile(null);
        setUploadedUri(null);
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Removal failed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const uploading = busy && file !== null && !error;
  const failed = Boolean(error && file && !busy);
  const thumbUri = uploading || failed || uploadedUri ? file?.uri ?? null : savedPreview;
  const thumb = (
    <View style={styles.thumb}>
      {thumbUri ? (
        <Image accessibilityIgnoresInvertColors source={{uri: thumbUri}} style={styles.thumbImage} />
      ) : (
        <Icon color={colors.textSecondary} name={photo || !evidence || IMAGE_NAME.test(evidence.originalFileName) ? 'image' : 'document'} size={22} surface={false} />
      )}
    </View>
  );

  let body: React.ReactNode;
  if (uploading) {
    body = (
      <View style={styles.file}>
        {thumb}
        <View style={styles.fileText}>
          <Text numberOfLines={1} style={styles.fileName}>{file?.name}</Text>
          <Text style={styles.meta}>Uploading…</Text>
        </View>
        <ActivityIndicator color={colors.flameRedAccessible} />
      </View>
    );
  } else if (failed) {
    body = (
      <>
        <View accessibilityRole="alert" style={[styles.file, styles.fileError]}>
          <View style={styles.thumb}>
            <Icon color={colors.error} name="alert" size={24} surface={false} />
          </View>
          <View style={styles.fileText}>
            <Text style={styles.fileName}>Upload failed</Text>
            <Text style={styles.meta}>{error}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <LinkButton disabled={disabled} icon="renew" label="Retry" onPress={() => file && (!beforePick || beforePick()) && upload(file)} />
          <LinkButton disabled={disabled} label="Choose another photo" onPress={() => choose('library')} />
        </View>
      </>
    );
  } else if (evidence) {
    body = (
      <>
        <View style={styles.file}>
          {thumb}
          <View style={styles.fileText}>
            <Text numberOfLines={1} style={styles.fileName}>{evidence.originalFileName}</Text>
            <Text style={styles.meta}>{formatBytes(evidence.fileSizeBytes)}</Text>
          </View>
          {locked ? (
            <StatusChip tone="complete">Approved</StatusChip>
          ) : rejected ? (
            <StatusChip tone="attention">Update</StatusChip>
          ) : (
            <DoneTick label="Uploaded" />
          )}
        </View>
        {rejected && evidence.reviewReason ? <FieldError>{evidence.reviewReason}</FieldError> : null}
        {locked ? (
          <Text style={styles.meta}>Reviewed by Craves. Contact support to change it.</Text>
        ) : (
          <View style={styles.actions}>
            <LinkButton disabled={disabled || busy} icon="renew" label="Replace" onPress={() => choose('library')} />
            {!rejected ? (
              <LinkButton disabled={disabled || busy} icon="trash" label="Remove" onPress={() => removeSaved()} />
            ) : null}
            {busy ? <ActivityIndicator color={colors.flameRedAccessible} /> : null}
          </View>
        )}
        {error ? <FieldError>{error}</FieldError> : null}
      </>
    );
  } else {
    body = (
      <>
        <Pressable
          accessibilityLabel={`${emptyTitle ?? (photo ? 'Add photo' : 'Add file')}: ${label}`}
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => choose('library')}
          style={({pressed}) => [styles.dropzone, (pressed || disabled) && styles.pressed]}>
          {busy ? <ActivityIndicator color={colors.flameRedAccessible} /> : <Icon color={colors.flameRedAccessible} name="upload" size={36} />}
          <Text style={styles.dropTitle}>{emptyTitle ?? (photo ? 'Add photo' : 'Add file')}</Text>
          <Text style={styles.meta}>Take a photo or choose one</Text>
        </Pressable>
        <LinkButton disabled={disabled || busy} icon="camera" label="Use camera" onPress={() => choose('camera')} />
        {error ? <FieldError>{error}</FieldError> : fieldError ? <FieldError>{fieldError}</FieldError> : null}
      </>
    );
  }

  return (
    <View style={styles.upload}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        {helper ? <Text style={styles.meta}>{helper}</Text> : null}
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  upload: {gap: spacing.xs},
  head: {gap: 2},
  label: {color: colors.textPrimary, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  meta: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 18},
  dropzone: {
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  dropTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  pressed: {opacity: 0.7},
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  fileError: {borderColor: colors.error},
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  thumbImage: {width: '100%', height: '100%'},
  fileText: {flex: 1, minWidth: 0, gap: 2},
  fileName: {color: colors.textPrimary, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  actions: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
});
