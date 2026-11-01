import React, {useState} from 'react';
import {Linking, Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, ClipPath, Defs, Ellipse, G} from 'react-native-svg';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Icon, LoadingIndicator} from '../../../shared/components';
import {colors, fontWeight, iconSize, spacing, touchTarget, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
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

/** Where to put your face: a dashed oval with a head-and-shoulders shape (white tints of the espresso ground). */
function FaceGuide() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.guide}>
      <Svg width="100%" height="100%" viewBox="0 0 246 311">
        <Defs>
          <ClipPath id="face">
            <Ellipse cx="123" cy="155.5" rx="121.5" ry="154" />
          </ClipPath>
        </Defs>
        <Ellipse cx="123" cy="155.5" rx="121.5" ry="154" fill={colors.white} fillOpacity={0.09} />
        <G clipPath="url(#face)" fill={colors.white} fillOpacity={0.17}>
          <Circle cx="123" cy="177" r="52" />
          <Circle cx="123" cy="330" r="101" />
        </G>
        <Ellipse
          cx="123"
          cy="155.5"
          rx="121.5"
          ry="154"
          fill="none"
          stroke={colors.white}
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
  const g = strings.goOnline;
  const queryClient = useQueryClient();
  const supportPhone = useRiderMe().data?.supportPhone;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{text: string; action?: 'settings' | 'setup' | 'support'} | null>(null);

  async function takeSelfie() {
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
      const shot = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ['images'],
        quality: 0.5,
      });
      const photo = shot.canceled ? undefined : shot.assets[0];
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
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="rider-go-online-screen">
      <StatusBar barStyle="light-content" backgroundColor={colors.espresso} />
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g.close}
          onPress={() => navigation.goBack()}
          style={styles.close}
          testID="rider-go-online-close">
          <Icon name="close" size={iconSize.lg} color={colors.white} surface={false} />
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
            <LoadingIndicator accessible={false} color={colors.white} />
            <Text style={styles.why}>{g.goingOnline}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g.shutter}
            onPress={takeSelfie}
            style={({pressed}) => [styles.shutter, pressed && styles.pressed]}
            testID="rider-selfie-shutter">
            <View style={styles.shutterDisc} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.espresso},
  top: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xxs, paddingTop: spacing.xs},
  close: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  title: {flex: 1, fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.white},
  // The oval keeps its 246 × 311 shape and shrinks on short screens and at large font sizes.
  middle: {flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md},
  guide: {height: '100%', maxHeight: 311, aspectRatio: 246 / 311},
  copy: {gap: spacing.xs, paddingHorizontal: spacing.xl},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.white, textAlign: 'center'},
  why: {fontSize: typography.body, color: colors.border, textAlign: 'center'},
  problem: {gap: spacing.xs, marginTop: spacing.xs},
  bottom: {minHeight: 112, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md},
  busy: {alignItems: 'center', gap: spacing.xs},
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisc: {width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white},
  pressed: {opacity: 0.8},
});
