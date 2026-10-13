import React from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {AppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {FieldError} from '../../chefMenu/components/DishFormField';
import {chefOnboardingApi, UPLOAD_ERRORS} from '../../chefOnboarding/api/chefOnboardingApi';
import {pickPhoto} from '../../chefOnboarding/components/ChefOnboardingUpload';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefActionButton,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ListGroup,
  ListRow,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {documentRows, uploadChoices, verificationBanner, type VerificationBanner} from '../domain/documentRows';

const BANNER: Record<VerificationBanner['tone'], {icon: IconName; background: string; foreground: string}> = {
  ok: {icon: 'shield', background: colors.successSoft, foreground: colors.successText},
  wait: {icon: 'clock', background: colors.warningSoft, foreground: colors.warningText},
  problem: {icon: 'alert', background: colors.errorSoft, foreground: colors.error},
};

/** Plain words for a refused upload; a code we have no words for gets a general line. */
function uploadMessage(error: unknown): string {
  if (error instanceof AppApiError) {
    return UPLOAD_ERRORS[error.code] ?? 'We could not upload that. Please try again.';
  }
  // The photo picker's own problems (a file over 10 MB) are already written for the chef.
  return error instanceof Error && error.message ? error.message : 'We could not upload that. Please try again.';
}

/** Documents & verification: the status in words, each document with its own chip, and the ways to change one. */
export function ChefBusinessInformationScreen() {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const toast = useChefToast();
  const {query} = useChefRead('chef-documents', () => chefOnboardingApi.load());
  const application = query.data;

  const openDocument = async (id: string) => {
    try {
      await Linking.openURL(await chefOnboardingApi.preview(id));
    } catch {
      toast.show("We couldn't open that file. Please try again.");
    }
  };

  const [sheet, setSheet] = React.useState(false);
  const [chosen, setChosen] = React.useState<{type: string; title: string} | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const busy = React.useRef(false);
  const closeSheet = () => {
    setSheet(false);
    setChosen(null);
    setUploadError(null);
  };
  const upload = async (type: string, source: 'camera' | 'library') => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setUploading(true);
    setUploadError(null);
    try {
      const file = await pickPhoto(source);
      if (!file) {
        return;
      }
      await chefOnboardingApi.upload(type, file);
      closeSheet();
      toast.show('Document uploaded. Craves will check it.');
      await query.refetch();
    } catch (error) {
      setUploadError(uploadMessage(error));
    } finally {
      busy.current = false;
      setUploading(false);
    }
  };

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Documents & verification" />}
      onRefresh={() => {
        query.refetch().catch(() => undefined);
      }}
      refreshing={query.isRefetching}
      withTabBar>
      <ReadState
        comingSoon={{title: 'Documents are on their way', message: 'Your verification status and documents will be shown here soon.'}}
        query={query}>
        {() => {
          if (!application) {
            return null;
          }
          const banner = verificationBanner(application);
          const tone = BANNER[banner.tone];
          const rows = documentRows(application);
          return (
            <>
              <View style={[styles.banner, {backgroundColor: tone.background}]}>
                <Icon color={tone.foreground} name={tone.icon} size={iconSize.lg} surface={false} />
                <View style={styles.bannerText}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerTitle, {color: tone.foreground}]}>
                    {banner.title}
                  </Text>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerMessage, {color: tone.foreground}]}>
                    {banner.message}
                  </Text>
                </View>
              </View>

              {rows.length > 0 ? (
                <ListGroup>
                  {rows.map(row => (
                    <ListRow
                      icon={row.icon}
                      iconTone="blue"
                      key={row.title}
                      onPress={row.previewId ? () => {
                        openDocument(row.previewId as string).catch(() => undefined);
                      } : undefined}
                      right={<StatusChip label={row.chip.label} tone={row.chip.tone} />}
                      subtitle={row.subtitle}
                      title={row.title}
                    />
                  ))}
                </ListGroup>
              ) : null}
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
                Tap a document to view it. To change an approved document, contact support. Craves checks it again before the change goes live.
              </Text>
              <ChefActionButton icon="upload" label="Upload another document" onPress={() => setSheet(true)} tone="neutral" />
              <ChefActionButton
                icon="headset"
                label="Ask to update a document"
                onPress={() => navigation.navigate('ChefSupportTicket', {topic: 'Update a document'})}
                tone="ghost"
              />

              <ChefSheet onClose={closeSheet} title={chosen ? chosen.title : 'Upload a document'} visible={sheet}>
                {chosen ? (
                  <View style={styles.sheet}>
                    <ListGroup>
                      <ListRow icon="camera" onPress={() => { upload(chosen.type, 'camera').catch(() => undefined); }} title="Take a photo" />
                      <ListRow icon="image" onPress={() => { upload(chosen.type, 'library').catch(() => undefined); }} title="Choose from gallery" />
                    </ListGroup>
                    {uploading ? <Text style={styles.note}>Uploading…</Text> : null}
                    {uploadError ? <FieldError message={uploadError} /> : null}
                    <ChefActionButton disabled={uploading} label="Back" onPress={() => { setChosen(null); setUploadError(null); }} tone="neutral" />
                  </View>
                ) : (
                  <View style={styles.sheet}>
                    <ListGroup>
                      {uploadChoices(application).map(choice => (
                        <ListRow key={choice.type} onPress={() => setChosen(choice)} title={choice.title} />
                      ))}
                    </ListGroup>
                  </View>
                )}
              </ChefSheet>
            </>
          );
        }}
      </ReadState>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  banner: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md},
  bannerText: {flex: 1, minWidth: 0},
  bannerTitle: {fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerMessage: {fontSize: typography.small},
  note: {color: colors.textSecondary, fontSize: typography.small},
  sheet: {gap: spacing.sm, paddingBottom: spacing.sm},
});
