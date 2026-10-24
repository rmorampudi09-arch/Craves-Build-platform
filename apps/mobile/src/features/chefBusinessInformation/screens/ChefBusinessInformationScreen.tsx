import React from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {chefOnboardingApi} from '../../chefOnboarding/api/chefOnboardingApi';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefOnboardingState} from '../../chefProfile/state/useChefOnboardingState';
import {
  ChefActionButton,
  ChefScreen,
  ChefTopBar,
  ListGroup,
  ListRow,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {NOT_FINISHED_BANNER, documentRows, verificationBanner, type VerificationBanner} from '../domain/documentRows';

const BANNER: Record<VerificationBanner['tone'], {icon: IconName; background: string; foreground: string}> = {
  ok: {icon: 'shield', background: colors.successSoft, foreground: colors.successText},
  wait: {icon: 'clock', background: colors.warningSoft, foreground: colors.warningText},
  problem: {icon: 'alert', background: colors.errorSoft, foreground: colors.error},
};

function StatusBanner({banner}: {banner: VerificationBanner}) {
  const tone = BANNER[banner.tone];
  return (
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
  );
}

const NO_APPLICATION = 'Your documents were checked when you joined. To update them, contact support.';
const UPDATE_TOPIC = 'Update my documents';

/** Documents & verification: the status in words and the documents from the application, to view only. */
export function ChefBusinessInformationScreen() {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const toast = useChefToast();
  const {query} = useChefOnboardingState();
  const application = query.data;
  const accountApproved = useAppSelector(state => state.auth.accountResolution?.flow === 'CHEF' && state.auth.accountResolution.onboardingStatus === 'APPROVED');
  // A chef approved before the new application has none: the server answers 404 on a route that is published.
  // For a chef who is not approved, no application means it was never started.
  const missing =
    (query.isError && toAppApiError(query.error).status === 404) ||
    (application?.application.status === 'NOT_SUBMITTED' && application.documents.length === 0);
  const noApplication = accountApproved && missing;
  const notStarted = !accountApproved && query.isError && toAppApiError(query.error).status === 404;
  const askSupport = () => navigation.navigate('ChefSupportTicket', {topic: UPDATE_TOPIC});

  const openDocument = async (id: string) => {
    try {
      await Linking.openURL(await chefOnboardingApi.preview(id));
    } catch {
      toast.show("We couldn't open that file. Please try again.");
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
      {notStarted ? (
        <StatusBanner banner={NOT_FINISHED_BANNER} />
      ) : noApplication ? (
        <>
          <View style={[styles.banner, {backgroundColor: BANNER.ok.background}]}>
            <Icon color={BANNER.ok.foreground} name="shield" size={iconSize.lg} surface={false} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerMessage, {color: BANNER.ok.foreground}]}>
              {NO_APPLICATION}
            </Text>
          </View>
          <ChefActionButton icon="headset" label="Contact support" onPress={askSupport} />
        </>
      ) : (
        <ReadState
          alwaysPublished
          comingSoon={{title: 'Documents are on their way', message: 'Your verification status and documents will be shown here soon.'}}
          query={query}>
          {() => {
            if (!application) {
              return null;
            }
            const banner = verificationBanner(application);
            const rows = documentRows(application);
            return (
              <>
                <StatusBanner banner={banner} />

                {rows.length > 0 ? (
                  <ListGroup>
                    {rows.map(row => (
                      <ListRow
                        icon={row.icon}
                        iconTone="red"
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
                  {rows.length > 0
                    ? 'Tap a document to view it. To change an approved document, contact support. Craves checks it again before the change goes live.'
                    : 'Your documents were checked when you joined Craves.'}
                </Text>
                <ChefActionButton
                  icon="headset"
                  label="Ask to update a document"
                  onPress={() => navigation.navigate('ChefSupportTicket', {topic: 'Update a document'})}
                  tone="ghost"
                />
              </>
            );
          }}
        </ReadState>
      )}
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  banner: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md},
  bannerText: {flex: 1, minWidth: 0},
  bannerTitle: {fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerMessage: {fontSize: typography.small},
  note: {color: colors.textSecondary, fontSize: typography.small},
});
