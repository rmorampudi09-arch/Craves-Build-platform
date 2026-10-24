import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {borderWidth, colors, fontWeight, iconSize, spacing, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ConfirmDialog,
  ListGroup,
  ListRow,
  SectionHeader,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {documentsSummary} from '../../chefBusinessInformation/domain/documentRows';
import {chefBankOnboardingApi} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {chefReviewsApi} from '../../reviews/api/chefReviewsApi';
import {switchChefToCustomerRole} from '../state/chefProfileRoleSwitch';
import {useChefOnboardingState} from '../state/useChefOnboardingState';
import {useChefRead} from '../state/useChefRead';
import {useKitchenOpenState, type KitchenOpenState} from '../state/useKitchenOpenState';

// shortcut: written here, not read from the app, so it must be bumped with versionName in android/app/build.gradle.
export const CHEF_APP_VERSION = '1.35.6';

/** The line under Opening hours: where the kitchen is right now, with today's hours. */
function hoursLine(status: KitchenOpenState['status'], hoursToday: string | null): string | undefined {
  switch (status) {
    case 'open':
      return hoursToday ? `Open now · ${hoursToday}` : 'Open now';
    case 'closed':
      return hoursToday ? `Closed · ${hoursToday}` : 'Closed';
    case 'paused':
      return 'Paused';
    case 'suspended':
      return 'Paused by Craves';
    default:
      return undefined;
  }
}

type Dialog = 'switch' | 'logout' | null;

/** The Profile tab: who the kitchen is, then Kitchen, Money and More, with switch-to-customer and log out. */
export function ChefProfileScreen() {
  const navigation = useNavigation<NavigationProp<ChefProfileStackParamList>>();
  const dispatch = useAppDispatch();
  const toast = useChefToast();
  const identity = useAppSelector(state => state.auth.identity);
  const accountResolution = useAppSelector(state => state.auth.accountResolution);
  const kitchenState = useKitchenOpenState();
  const {kitchen} = kitchenState;
  // The reviews screen reads the same entry, so opening it afterwards needs no second wait.
  const summary = useChefRead('chef-review-summary', signal => chefReviewsApi.summary(kitchen?.id as string, signal), {
    entityId: kitchen?.id,
    enabled: Boolean(kitchen),
  });
  const rating = summary.query.data?.overallAverage;
  const reviewCount = summary.query.data?.reviewCount ?? 0;
  const hasRating = typeof rating === 'number' && reviewCount > 0;

  // Both lines are extras: when a read fails or finds nothing, the row simply has no second line.
  const onboarding = useChefOnboardingState().query.data;
  // Documents are view-only: a chef with nothing from the application (joined on the old form) gets no Documents page.
  const hasDocuments = Boolean(onboarding?.documents.length);
  const bank = useChefRead('chef-bank-status', signal => chefBankOnboardingApi.getStatus(signal)).query.data;
  const bankLine = bank?.lastFour ? [bank.bankName, `••${bank.lastFour}`].filter(Boolean).join(' ') : undefined;

  const suspended = kitchenState.status === 'suspended' || identity?.status === 'SUSPENDED';
  const approved = !suspended && accountResolution?.flow === 'CHEF' && accountResolution.onboardingStatus === 'APPROVED';
  const name = kitchen?.kitchenName ?? (identity?.displayName?.trim() || 'Chef account');
  const place = [kitchen?.areaName, kitchen?.city].filter((part, index, all) => part && all.indexOf(part) === index).join(', ');
  const who = [kitchen?.displayName ? `Chef ${kitchen.displayName}` : null, place || null].filter(Boolean).join(' · ');

  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [working, setWorking] = React.useState(false);
  const busy = React.useRef(false);
  /** Switching and logging out replace the whole signed-in screen, so a second press must do nothing. */
  const run = async (action: () => Promise<void>, failed: string) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      await action();
    } catch {
      setDialog(null);
      toast.show(failed);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const open = (route: Exclude<keyof ChefProfileStackParamList, 'ChefProfileHome'>) => () => navigation.navigate(route);

  return (
    <ChefScreen
      header={<ChefTopBar title="Profile" />}
      onRefresh={() => {
        Promise.allSettled([kitchenState.refresh(), summary.query.refetch()]).catch(() => undefined);
      }}
      withTabBar>
      <ChefCard style={styles.identity}>
        <View style={styles.avatarWrap}>
          {kitchen?.chefPhotoUrl ? (
            <Image accessibilityIgnoresInvertColors source={{uri: kitchen.chefPhotoUrl}} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarLetter]}>
              <Text allowFontScaling={false} style={styles.avatarText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityLabel="Change your photo"
            accessibilityRole="button"
            onPress={open('ChefEditProfile')}
            style={styles.cameraTap}>
            <View style={styles.camera}>
              <Icon color={colors.textPrimary} name="camera" size={iconSize.sm} surface={false} />
            </View>
          </Pressable>
        </View>
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.name}>
          {name}
        </Text>
        {who ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
            {who}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {suspended ? (
            <View style={styles.chipTap}>
              <StatusChip label="Paused by Craves" tone="new" />
            </View>
          ) : null}
          {approved && !hasDocuments ? (
            <View style={styles.chipTap}>
              <StatusChip label="Approved" tone="ready" />
            </View>
          ) : null}
          {approved && hasDocuments ? (
            <Pressable
              accessibilityLabel="Approved. Open documents"
              accessibilityRole="button"
              onPress={open('ChefBusinessInformation')}
              style={styles.chipTap}>
              <StatusChip label="Approved" tone="ready" />
            </Pressable>
          ) : null}
          {hasRating ? (
            <Pressable
              accessibilityLabel={`${rating.toFixed(1)} stars, ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}. Open reviews`}
              accessibilityRole="button"
              onPress={open('ChefReviews')}
              style={styles.chipTap}>
              <StatusChip label={`★ ${rating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`} tone="info" />
            </Pressable>
          ) : null}
        </View>
      </ChefCard>

      <SectionHeader title="Kitchen" />
      <ListGroup dividers={false}>
        <ListRow icon="store" iconTone="red" onPress={open('ChefEditProfile')} subtitle="Name, about, address, photos" title="Kitchen details" />
        <ListRow
          icon="clock"
          iconTone="red"
          onPress={open('ChefKitchenSchedule')}
          subtitle={hoursLine(kitchenState.status, kitchenState.hoursToday)}
          title="Opening hours"
        />
        {onboarding && hasDocuments ? (
          <ListRow
            icon="shield"
            iconTone="red"
            onPress={open('ChefBusinessInformation')}
            subtitle={approved ? ['Verified', documentsSummary(onboarding)].filter(Boolean).join(' · ') : 'See your documents'}
            title="Documents & verification"
          />
        ) : null}
        <ListRow
          icon="star"
          iconTone="red"
          onPress={open('ChefReviews')}
          subtitle={hasRating ? `${rating.toFixed(1)} average · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'What customers say'}
          title="Reviews"
        />
      </ListGroup>

      <SectionHeader title="Money" />
      <ListGroup dividers={false}>
        <ListRow icon="bank" onPress={open('ChefBankAccount')} subtitle={bankLine} title="Bank account" />
        <ListRow icon="receipt" onPress={open('ChefPayoutHistory')} title="Payout history" />
      </ListGroup>

      <SectionHeader title="More" />
      <ListGroup dividers={false}>
        <ListRow icon="gift" onPress={open('ChefReferral')} subtitle="Earn when chefs you invite start cooking" title="Refer a chef" />
        <ListRow icon="filter" onPress={open('ChefAppPreferences')} subtitle="Notifications, orders, language" title="Preferences" />
        <ListRow icon="headset" onPress={open('ChefSupport')} title="Help & support" />
        <ListRow icon="lock" onPress={open('ChefSecurity')} title="Login & security" />
      </ListGroup>

      <ListGroup dividers={false}>
        <ListRow
          icon="renew"
          onPress={() => {
            if (identity?.roles.includes('CUSTOMER')) {
              setDialog('switch');
            } else {
              toast.show("Customer mode isn't set up for this account.");
            }
          }}
          subtitle="Order food as a customer"
          title="Switch to customer mode"
        />
        <ListRow destructive icon="arrow-left" onPress={() => setDialog('logout')} title="Log out" />
      </ListGroup>

      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.version}>
        {`Craves for Chefs · version ${CHEF_APP_VERSION}`}
      </Text>

      <ConfirmDialog
        busy={working}
        confirmLabel="Switch"
        message="Your kitchen stays open, but you won't see new orders while you are in customer mode."
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          run(() => switchChefToCustomerRole(dispatch), "We couldn't switch just now. Please try again.").catch(() => undefined);
        }}
        title="Switch to customer mode?"
        visible={dialog === 'switch'}
      />
      <ConfirmDialog
        busy={working}
        confirmLabel="Log out"
        message="You will need to log in again with a one-time code."
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          run(() => completeLogout(dispatch), "We couldn't log you out. Please try again.").catch(() => undefined);
        }}
        title="Log out of Craves?"
        tone="danger"
        visible={dialog === 'logout'}
      />
    </ChefScreen>
  );
}

const AVATAR = 76;
const BADGE = 28;
const TAP = touchTarget.minimum;
// React Native clips hitSlop to the parent, so the camera and the chips are 48 dp themselves.
// The camera's badge sits on the avatar's lower right (centre BADGE_CENTER from the top-left); its 48 dp square
// reaches OVERFLOW past the avatar there, so the avatar box is widened and lengthened by that and the extra
// height is pulled back with a negative margin: nothing below moves.
const BADGE_CENTER = AVATAR - 2 - BADGE / 2;
const OVERFLOW = BADGE_CENTER + TAP / 2 - AVATAR;
const CHIP_SHIFT = (TAP - BADGE) / 2;

const styles = StyleSheet.create({
  identity: {alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.lg},
  avatarWrap: {width: AVATAR + 2 * OVERFLOW, height: AVATAR + OVERFLOW, marginBottom: spacing.xs - OVERFLOW},
  avatar: {position: 'absolute', top: 0, left: OVERFLOW, width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2},
  avatarLetter: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flameRedAccessible},
  avatarText: {color: colors.white, fontSize: typography.title, fontWeight: fontWeight.bold},
  cameraTap: {
    position: 'absolute',
    top: BADGE_CENTER - TAP / 2,
    left: OVERFLOW + BADGE_CENTER - TAP / 2,
    width: TAP,
    height: TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  name: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  muted: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs - CHIP_SHIFT,
    marginBottom: -CHIP_SHIFT,
  },
  chipTap: {minWidth: TAP, minHeight: TAP, alignItems: 'center', justifyContent: 'center'},
  version: {color: colors.textSecondary, fontSize: typography.tiny, textAlign: 'center'},
});
