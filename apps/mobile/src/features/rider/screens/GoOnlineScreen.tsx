import React, {useRef, useState} from 'react';
import {Linking, Pressable, StatusBar, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, ClipPath, Defs, Ellipse, G} from 'react-native-svg';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Icon, LoadingIndicator} from '../../../shared/components';
import {colors, font, iconSize, spacing, themedStyles, touchTarget, typography, useRiderTheme} from '../theme';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {selfieShot} from '../components/DocumentPhoto';
import {registerPhone} from '../components/RiderRuntime';
import {riderMessage} from '../domain/problem';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {riderApiMode} from '../riderConfig';
import {riderKeys, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** The server takes a selfie of at most 5 MB (FleetShiftService); a bigger one would only be refused after the upload. */
const SELFIE_MAX_BYTES = 5_000_000;

/** Where to put your face: the camera window, an oval with a head-and-shoulders shape and a dashed edge. */
function FaceGuide() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.guide}>
      <Svg width="100%" height="100%" viewBox="0 0 246 311">
        <Defs>
          <ClipPath id="face">
            <Ellipse cx="123" cy="155.5" rx="121.5" ry="154" />
          </ClipPath>
        </Defs>
        <Ellipse cx="123" cy="155.5" rx="121.5" ry="154" fill={colors.camera} />
        <G clipPath="url(#face)" fill={colors.textPrimary} fillOpacity={0.12}>
          <Circle cx="123" cy="177" r="52" />
          <Circle cx="123" cy="330" r="101" />
        </G>
        <Ellipse
          cx="123"
          cy="155.5"
          rx="121.5"
          ry="154"
          fill="none"
          stroke={colors.textSecondary}
          strokeWidth={3}
          strokeDasharray="8 5"
        />
      </Svg>
    </View>
  );
}

/**
 * Before going online (06-GoOnline.png): why the selfie, then the system front camera.
 * The selfie starts the shift; the shift credential goes straight to the online service and is never kept in JS.
 */
export function GoOnlineScreen({navigation}: RiderScreenProps<'GoOnline'>) {
  const {strings, language} = useStrings();
  const theme = useRiderTheme();
  const g = strings.goOnline;
  const queryClient = useQueryClient();
  const supportPhone = useRiderMe().data?.supportPhone;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{text: string; action?: 'settings' | 'setup' | 'support'} | null>(null);
  // One selfie at a time: a second tap while the phone checks the face would open another camera.
  const taking = useRef(false);

  async function takeSelfie() {
    if (taking.current) {
      return;
    }
    taking.current = true;
    setProblem(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setProblem({text: g.cameraDenied, action: 'settings'});
        return;
      }
      // A shift needs this phone bound, and binding needs its push token: register first, so a phone that can't get
      // offers says why here instead of a misleading "not approved" after the selfie (mock builds bind nothing).
      if (riderApiMode === 'live' && !(await registerPhone())) {
        setProblem({text: g.noAlerts, action: 'setup'});
        return;
      }
      const photo = await selfieShot({...g, cancel: strings.common.cancel});
      if (!photo?.uri) {
        return;
      }
      if (photo.fileSize && photo.fileSize > SELFIE_MAX_BYTES) {
        setProblem({text: g.photoTooBig});
        return;
      }
      setBusy(true);
      const shift = await riderApi.startShift(photo.uri, await riderDevice.installationId());
      await riderOnlineService.start(shift).catch(error => {
        // The server's shift is open now: close it, or ops sees a rider online whose phone sends nothing.
        riderApi.endShift().catch(() => undefined);
        throw error;
      });
      // Home says online at once, not "Offline" until its refetch lands; the refetch brings the shift's details.
      queryClient.setQueryData<HomeSummary>(riderKeys.home, home => (home ? {...home, online: true} : home));
      queryClient.invalidateQueries({queryKey: riderKeys.all});
      navigation.goBack();
    } catch (error) {
      // A phone ops hasn't approved, a bad selfie, an expired document: in the rider's language, with the way out. The
      // online service's own refusals (no location, shift over) arrive already in the rider's language (RiderText.kt).
      const unbound = error instanceof AppApiError && error.code === 'DEVICE_NOT_BOUND';
      const nativeCode = error instanceof Error ? (error as Error & {code?: unknown}).code : undefined;
      const native = nativeCode === 'LOCATION_PERMISSION' || nativeCode === 'NO_SHIFT' ? (error as Error).message : undefined;
      setProblem({
        text: native || riderMessage(error, strings, language),
        action: nativeCode === 'LOCATION_PERMISSION' ? 'setup' : unbound && supportPhone ? 'support' : undefined,
      });
      setBusy(false);
      // A refusal may mean the account changed; /me decides where the rider lands.
      queryClient.invalidateQueries({queryKey: riderKeys.all});
    } finally {
      taking.current = false;
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="rider-go-online-screen">
      <StatusBar barStyle={theme === 'night' ? 'light-content' : 'dark-content'} backgroundColor={colors.ground} />
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g.close}
          onPress={() => navigation.goBack()}
          style={styles.close}
          testID="rider-go-online-close">
          <Icon name="close" size={iconSize.lg} color={colors.textPrimary} surface={false} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {g.title}
        </Text>
      </View>
      <View style={styles.middle}>
        <FaceGuide />
      </View>
      <View style={styles.copy}>
        <Text style={styles.heading}>{g.heading}</Text>
        <Text style={styles.why}>{g.why}</Text>
        {problem ? (
          <View style={styles.problem}>
            <Banner tone="warning" text={problem.text} testID="rider-go-online-problem" />
            {problem.action === 'settings' ? (
              <BottomAction
                label={g.openSettings}
                variant="outline"
                size="compact"
                onPress={() => Linking.openSettings().catch(() => undefined)}
              />
            ) : problem.action === 'setup' ? (
              <BottomAction
                label={strings.home.openSetup}
                variant="outline"
                size="compact"
                onPress={() => navigation.replace('PhoneSetup')}
                testID="rider-go-online-setup"
              />
            ) : problem.action === 'support' && supportPhone ? (
              <BottomAction
                label={strings.common.callSupport}
                variant="outline"
                size="compact"
                leftIcon="phone-outline"
                onPress={() => Linking.openURL(`tel:${supportPhone}`).catch(() => undefined)}
                testID="rider-go-online-support"
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.bottom}>
        {busy ? (
          <View accessibilityLiveRegion="polite" style={styles.busy}>
            <LoadingIndicator accessible={false} color={colors.textPrimary} />
            <Text style={styles.why}>{g.goingOnline}</Text>
          </View>
        ) : (
          <>
            <BottomAction label={g.shutter} leftIcon="camera-outline" onPress={takeSelfie} style={styles.wide} testID="rider-selfie-shutter" />
            <BottomAction label={g.notNow} variant="neutral" onPress={() => navigation.goBack()} testID="rider-go-online-not-now" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// Light by day, like every other screen: the old espresso camera screen read as a dead end in the sun.
const styles = themedStyles(c => ({
  screen: {flex: 1, backgroundColor: c.ground},
  top: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xxs, paddingTop: spacing.xs},
  close: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  title: {flex: 1, fontSize: typography.headerTitle, fontFamily: font.bold, color: c.textPrimary},
  // The oval keeps its 246 × 311 shape and shrinks on short screens and at large font sizes.
  middle: {flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md},
  guide: {height: '100%', maxHeight: 311, aspectRatio: 246 / 311},
  copy: {gap: spacing.xs, paddingHorizontal: spacing.xl},
  heading: {fontSize: typography.heading, fontFamily: font.bold, color: c.textPrimary, textAlign: 'center'},
  why: {fontFamily: font.regular, fontSize: typography.body, color: c.textSecondary, textAlign: 'center'},
  problem: {gap: spacing.xs, marginTop: spacing.xs},
  bottom: {alignItems: 'center', justifyContent: 'center', padding: spacing.md, gap: spacing.xxs},
  wide: {alignSelf: 'stretch'},
  busy: {minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: spacing.xs},
}));
