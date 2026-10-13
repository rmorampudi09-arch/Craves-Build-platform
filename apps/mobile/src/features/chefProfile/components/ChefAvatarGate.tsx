import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../design/tokens';
import {ChefActionButton, ChefScreen} from '../../chefShell/components/ui';
import {chefProfileApi} from '../api/chefProfileApi';
import {chefAvatarGateStep} from '../domain/chefAvatarGate';
import {synchronizeChefProfileAfterSave} from '../state/chefProfileSynchronization';
import {useChefKitchen} from '../state/useChefKitchen';
import {ChefAvatarGrid} from './ChefAvatarGrid';

/**
 * Holds the chef workspace back until the chef has picked a profile picture (one of the 18 drawn
 * faces). It never traps a chef: see chefAvatarGateStep for every case that goes straight in, and
 * "Not now" after a failed save does too. Once the workspace has shown it stays for this mount, whatever
 * the kitchen read does next (a retry, a late answer): the picker is for the next time chef mode opens.
 */
export function ChefAvatarGate({children}: {children: React.ReactNode}) {
  const queryClient = useQueryClient();
  const {kitchen, query, identityId} = useChefKitchen();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const opened = React.useRef(false);

  const step = chefAvatarGateStep({
    // A loaded kitchen stays loaded when a later background read fails: the picker must not vanish mid-pick.
    // A read that is not actually running (no identity yet, or paused while offline) is an error here, so nobody waits on it forever.
    status: kitchen ? 'success' : query.status === 'pending' && query.fetchStatus !== 'fetching' ? 'error' : query.status,
    kitchen,
    dismissed,
  });

  if (step === 'open') opened.current = true;
  if (opened.current) return <>{children}</>;

  if (step === 'wait') {
    return (
      <SafeAreaView style={styles.waitScreen}>
        <View style={styles.waitContent}>
          <Text accessibilityRole="header" style={styles.waitTitle}>
            Preparing Chef workspace
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const save = async () => {
    if (!selectedId || !identityId || saving) return;
    setSaving(true);
    try {
      void synchronizeChefProfileAfterSave(queryClient, identityId, await chefProfileApi.setAvatar(selectedId));
      // Saved: let the chef in even if the kitchen comes back without a usable picture address (non-https, too long).
      setDismissed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChefScreen
      footer={
        <>
          {failed ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.error}>
              We couldn't save your picture. Please try again.
            </Text>
          ) : null}
          <ChefActionButton
            busy={saving}
            disabled={!selectedId}
            label={failed ? 'Try again' : 'Continue'}
            onPress={save}
          />
          {failed ? <ChefActionButton disabled={saving} label="Not now" onPress={() => setDismissed(true)} tone="neutral" /> : null}
        </>
      }>
      <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        Choose your profile picture
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
        Customers see this picture with your name on your kitchen page. You can change it any time.
      </Text>
      <ChefAvatarGrid disabled={saving} onSelect={setSelectedId} selectedId={selectedId} />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  // Same look as the "Preparing Chef workspace" screen of ChefRootNavigator, which this gate follows.
  waitScreen: {flex: 1, backgroundColor: colors.surfaceBase},
  waitContent: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  waitTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  title: {color: colors.textPrimary, fontSize: typography.hero, fontWeight: fontWeight.bold},
  body: {color: colors.textSecondary, fontSize: typography.body},
  error: {color: colors.error, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
});
